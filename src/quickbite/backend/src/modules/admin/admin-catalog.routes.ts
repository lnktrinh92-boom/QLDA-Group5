import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { sendSuccess } from '../../utils/response.js';
import { slugify } from '../../utils/slugify.js';
import { idParamSchema } from '../../utils/validation.js';
import { audit } from './audit.js';

/** Danh mục món ăn & điểm nhận món */
export const adminCatalogRouter = Router();

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

const ICONS = ['utensils', 'soup', 'sandwich', 'cup-soda', 'cookie', 'salad'] as const;

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Tên danh mục phải có ít nhất 2 ký tự').max(80, 'Tên danh mục tối đa 80 ký tự'),
  description: nullableText(255),
  icon: z.enum(ICONS).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const pickupSchema = z.object({
  name: z.string().trim().min(2, 'Tên điểm nhận phải có ít nhất 2 ký tự').max(120),
  building: nullableText(120),
  description: nullableText(255),
  isActive: z.boolean().default(true),
});

/** Lỗi trùng tên → báo ngay dưới ô "Tên" */
const duplicateName = (label: string) => AppError.conflict(`${label} đã tồn tại`, [{ field: 'name', message: `${label} đã tồn tại` }]);

// ─────────── Danh mục ───────────
adminCatalogRouter.get('/categories', async (_req, res) => {
  const categories = await prisma.foodCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { menuItems: true } } },
  });
  sendSuccess(res, categories.map(({ _count, ...c }) => ({ ...c, itemCount: _count.menuItems })));
});

adminCatalogRouter.post('/categories', async (req, res) => {
  const input = categorySchema.parse(req.body);
  const slug = slugify(input.name);
  if (await prisma.foodCategory.findFirst({ where: { OR: [{ name: input.name }, { slug }] } })) throw duplicateName('Danh mục');
  const category = await prisma.foodCategory.create({ data: { ...input, slug } });
  await audit({ req, action: 'CATEGORY_CREATE', entityType: 'FoodCategory', entityId: category.id, metadata: { name: category.name } });
  sendSuccess(res, { category: { ...category, itemCount: 0 } }, 201);
});

adminCatalogRouter.patch('/categories/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = categorySchema.partial().parse(req.body);
  // Bỏ các giá trị mặc định khi cập nhật một phần
  const data = Object.fromEntries(Object.entries(input).filter(([k]) => k in (req.body ?? {})));
  if (!(await prisma.foodCategory.findUnique({ where: { id } }))) throw AppError.notFound('Không tìm thấy danh mục');
  if (input.name) {
    const slug = slugify(input.name);
    if (await prisma.foodCategory.findFirst({ where: { OR: [{ name: input.name }, { slug }], id: { not: id } } })) throw duplicateName('Danh mục');
    Object.assign(data, { slug });
  }
  const category = await prisma.foodCategory.update({ where: { id }, data, include: { _count: { select: { menuItems: true } } } });
  await audit({ req, action: 'CATEGORY_UPDATE', entityType: 'FoodCategory', entityId: id, metadata: { changed: Object.keys(data) } });
  const { _count, ...rest } = category;
  sendSuccess(res, { category: { ...rest, itemCount: _count.menuItems } });
});

// Chỉ xoá được danh mục chưa có món nào; danh mục đã có món thì tắt (isActive = false)
adminCatalogRouter.delete('/categories/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const category = await prisma.foodCategory.findUnique({ where: { id }, include: { _count: { select: { menuItems: true } } } });
  if (!category) throw AppError.notFound('Không tìm thấy danh mục');
  if (category._count.menuItems > 0) {
    throw AppError.unprocessable(`Danh mục đang có ${category._count.menuItems} món. Hãy tắt danh mục thay vì xoá để giữ lịch sử.`);
  }
  await prisma.foodCategory.delete({ where: { id } });
  await audit({ req, action: 'CATEGORY_DELETE', entityType: 'FoodCategory', entityId: id, metadata: { name: category.name } });
  sendSuccess(res, { id });
});

// ─────────── Điểm nhận món ───────────
adminCatalogRouter.get('/pickup-locations', async (_req, res) => {
  const locations = await prisma.campusPickupLocation.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { orders: true } } },
  });
  sendSuccess(res, locations.map(({ _count, ...l }) => ({ ...l, orderCount: _count.orders })));
});

adminCatalogRouter.post('/pickup-locations', async (req, res) => {
  const input = pickupSchema.parse(req.body);
  if (await prisma.campusPickupLocation.findUnique({ where: { name: input.name } })) throw duplicateName('Điểm nhận');
  const location = await prisma.campusPickupLocation.create({ data: input });
  await audit({ req, action: 'PICKUP_LOCATION_CREATE', entityType: 'CampusPickupLocation', entityId: location.id, metadata: { name: location.name } });
  sendSuccess(res, { location: { ...location, orderCount: 0 } }, 201);
});

adminCatalogRouter.patch('/pickup-locations/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = pickupSchema.partial().parse(req.body);
  const data = Object.fromEntries(Object.entries(input).filter(([k]) => k in (req.body ?? {})));
  if (!(await prisma.campusPickupLocation.findUnique({ where: { id } }))) throw AppError.notFound('Không tìm thấy điểm nhận');
  if (input.name && (await prisma.campusPickupLocation.findFirst({ where: { name: input.name, id: { not: id } } }))) throw duplicateName('Điểm nhận');
  const location = await prisma.campusPickupLocation.update({ where: { id }, data, include: { _count: { select: { orders: true } } } });
  await audit({ req, action: 'PICKUP_LOCATION_UPDATE', entityType: 'CampusPickupLocation', entityId: id, metadata: { changed: Object.keys(data) } });
  const { _count, ...rest } = location;
  sendSuccess(res, { location: { ...rest, orderCount: _count.orders } });
});

// Chỉ xoá được điểm nhận chưa có đơn nào; điểm nhận đã có đơn thì tắt (isActive = false) để giữ lịch sử
adminCatalogRouter.delete('/pickup-locations/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const location = await prisma.campusPickupLocation.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
  if (!location) throw AppError.notFound('Không tìm thấy điểm nhận');
  const inUse = () => AppError.unprocessable('Điểm nhận đã có đơn hàng. Hãy tắt điểm nhận thay vì xoá để giữ lịch sử.');
  if (location._count.orders > 0) throw inUse();
  try {
    await prisma.campusPickupLocation.delete({ where: { id } });
  } catch (e) {
    // Có đơn vừa đặt tới điểm nhận này đúng lúc xoá → khoá ngoại chặn lại
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw inUse();
    throw e;
  }
  await audit({ req, action: 'PICKUP_LOCATION_DELETE', entityType: 'CampusPickupLocation', entityId: id, metadata: { name: location.name } });
  sendSuccess(res, { id });
});
