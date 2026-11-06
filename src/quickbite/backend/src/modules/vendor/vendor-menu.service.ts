import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { env } from '../../config/env.js';

/**
 * Ảnh hợp lệ:
 * - ảnh tự tải lên: /uploads/menu|stalls/<tên file>
 * - ảnh có sẵn trong giao diện: /images/<thư mục>/<tên file>.webp|jpg|png (frontend/public/images)
 * - https từ tên miền trong IMAGE_HOSTS
 */
function isAllowedImageUrl(value: string): boolean {
  if (/^\/uploads\/(menu|stalls)\/[\w.-]+$/.test(value) && !value.includes('..')) return true;
  if (/^\/images\/[\w-]+(\/[\w-]+)*\.(webp|jpe?g|png)$/.test(value)) return true;
  try {
    const url = new URL(value);
    // Chặn ảnh từ máy chủ lạ (có thể dùng làm "pixel theo dõi" IP của sinh viên)
    return url.protocol === 'https:' && env.IMAGE_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isAllowedImageUrl, `Ảnh phải là ảnh đã tải lên, hoặc đường dẫn https từ: ${env.IMAGE_HOSTS.join(', ') || '(không có)'}`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .transform((v) => (v === '' ? null : v))
    .nullish();

const price = z.coerce
  .number({ error: 'Giá không hợp lệ' })
  .int('Giá phải là số nguyên (VND)')
  .min(1000, 'Giá tối thiểu 1.000đ')
  .max(10_000_000, 'Giá tối đa 10.000.000đ');

export const createMenuItemSchema = z.object({
  name: z.string({ error: 'Vui lòng nhập tên món' }).trim().min(2, 'Tên món phải có ít nhất 2 ký tự').max(150, 'Tên món tối đa 150 ký tự'),
  description: optionalText(2000, 'Mô tả'),
  /** Định lượng một phần, vd "1 tô · 450g", "6 viên" */
  portion: optionalText(60, 'Định lượng'),
  price,
  categoryId: z.coerce.number({ error: 'Vui lòng chọn danh mục' }).int().positive('Vui lòng chọn danh mục'),
  imageUrl: imageUrlSchema.or(z.literal('').transform(() => null)).nullish(),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export const updateMenuItemSchema = createMenuItemSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  // Bỏ default khi cập nhật một phần: không gửi = không đổi
  .transform((d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));

export const listMenuQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});

const include = { category: { select: { id: true, name: true, slug: true } } } satisfies Prisma.MenuItemInclude;

const toDto = (item: Prisma.MenuItemGetPayload<{ include: typeof include }>) => ({ ...item, price: item.price.toFixed(0) });

async function assertCategory(categoryId: number) {
  const category = await prisma.foodCategory.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } });
  if (!category) throw AppError.badRequest('Danh mục không hợp lệ', [{ field: 'categoryId', message: 'Danh mục không hợp lệ' }]);
}

/** Món phải thuộc đúng quầy; món quầy khác trả 404 */
async function findOwnItem(stallId: number, itemId: number) {
  const item = await prisma.menuItem.findFirst({ where: { id: itemId, stallId } });
  if (!item) throw AppError.notFound('Không tìm thấy món');
  return item;
}

export const vendorMenuService = {
  async list(stallId: number, query: z.infer<typeof listMenuQuery>) {
    const items = await prisma.menuItem.findMany({
      where: {
        stallId,
        categoryId: query.categoryId,
        ...(query.status !== 'all' && { isActive: query.status === 'active' }),
        ...(query.q && { name: { contains: query.q } }),
      },
      include,
      orderBy: [{ isActive: 'desc' }, { category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    return items.map(toDto);
  },

  async create(stallId: number, input: z.infer<typeof createMenuItemSchema>) {
    await assertCategory(input.categoryId);
    const item = await prisma.menuItem.create({
      data: { ...input, stallId, price: new Prisma.Decimal(input.price), imageUrl: input.imageUrl ?? null, description: input.description ?? null },
      include,
    });
    return toDto(item);
  },

  async update(stallId: number, itemId: number, input: Record<string, unknown>) {
    await findOwnItem(stallId, itemId);
    if (typeof input.categoryId === 'number') await assertCategory(input.categoryId);
    const data: Prisma.MenuItemUncheckedUpdateInput = { ...input };
    if (typeof input.price === 'number') data.price = new Prisma.Decimal(input.price);
    const item = await prisma.menuItem.update({ where: { id: itemId }, data, include });
    return toDto(item);
  },

  /**
   * "Xoá" món = ngừng kinh doanh (xoá mềm). Món vẫn còn trong DB để giữ lịch sử đơn hàng,
   * và được gỡ khỏi giỏ hàng của sinh viên.
   */
  async deactivate(stallId: number, itemId: number) {
    await findOwnItem(stallId, itemId);
    const [item] = await prisma.$transaction([
      prisma.menuItem.update({ where: { id: itemId }, data: { isActive: false, isFeatured: false }, include }),
      prisma.cartItem.deleteMany({ where: { menuItemId: itemId } }),
    ]);
    return toDto(item);
  },
};
