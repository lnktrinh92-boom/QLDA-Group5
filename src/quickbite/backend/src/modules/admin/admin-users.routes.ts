import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { currentUser } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { AppError } from '../../utils/app-error.js';
import { buildPaginationMeta, sendSuccess } from '../../utils/response.js';
import { idParamSchema, paginationSchema, toSkipTake } from '../../utils/validation.js';
import { emailSchema, fullNameSchema, passwordSchema, phoneSchema, studentCodeSchema } from '../auth/auth.schemas.js';
import { toPublicUser, userWithStallsInclude } from '../users/users.mapper.js';
import { audit } from './audit.js';

export const adminUsersRouter = Router();

const role = z.enum(['STUDENT', 'VENDOR', 'ADMIN']);
const status = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
const nullable = <T extends z.ZodType>(s: T) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), s.nullish());

const keyword = z.string().trim().max(100, 'Từ khoá tối đa 100 ký tự').optional();
const listQuery = paginationSchema.extend({
  /** Từ khoá tìm theo tên, email, mã sinh viên. `search` là tên cũ, giao diện vẫn dùng */
  q: keyword,
  search: keyword,
  role: role.optional(),
  status: status.optional(),
});

export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role,
  phone: nullable(phoneSchema),
  studentCode: nullable(studentCodeSchema),
});

export const updateUserSchema = z.object({
  fullName: fullNameSchema.optional(),
  phone: nullable(phoneSchema),
  studentCode: nullable(studentCodeSchema),
  role: role.optional(),
  status: status.optional(),
});

const loadUser = (id: number) =>
  prisma.user.findUnique({ where: { id }, include: userWithStallsInclude }).then((u) => {
    if (!u) throw AppError.notFound('Không tìm thấy người dùng');
    return u;
  });

adminUsersRouter.get('/', async (req, res) => {
  const query = listQuery.parse(req.query);
  const q = query.q || query.search;
  const where: Prisma.UserWhereInput = {
    role: query.role,
    status: query.status,
    ...(q && {
      OR: [{ fullName: { contains: q } }, { email: { contains: q } }, { studentCode: { contains: q } }],
    }),
  };
  const [users, total] = await Promise.all([
    // Sắp thêm theo id để thứ tự ổn định khi nhiều tài khoản tạo cùng lúc (phân trang không trùng / sót)
    prisma.user.findMany({ where, include: userWithStallsInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);
  sendSuccess(res, users.map(toPublicUser), 200, buildPaginationMeta(query.page, query.pageSize, total));
});

adminUsersRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const user = await loadUser(id);
  const orderCount = await prisma.order.count({ where: { studentId: id } });
  sendSuccess(res, { user: { ...toPublicUser(user), lastLoginAt: user.lastLoginAt, orderCount } });
});

// Admin tạo tài khoản (vd: tài khoản chủ quầy, admin khác)
adminUsersRouter.post('/', async (req, res) => {
  const input = createUserSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw AppError.conflict('Email này đã được sử dụng', [{ field: 'email', message: 'Email này đã được sử dụng' }]);
  }
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        phone: input.phone ?? null,
        studentCode: input.studentCode ?? null,
      },
      include: userWithStallsInclude,
    });
    await audit({ req, action: 'USER_CREATE', entityType: 'User', entityId: created.id, metadata: { email: created.email, role: created.role } }, tx);
    return created;
  });
  sendSuccess(res, { user: toPublicUser(user) }, 201);
});

adminUsersRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);
  const me = currentUser(req);
  const before = await loadUser(id);

  // Không tự khoá / tự hạ quyền chính mình (tránh mất quyền quản trị)
  if (id === me.id && ((input.role && input.role !== 'ADMIN') || (input.status && input.status !== 'ACTIVE'))) {
    throw AppError.unprocessable('Bạn không thể tự đổi vai trò hoặc khoá tài khoản của chính mình');
  }
  const losesAdmin = before.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || (input.status && input.status !== 'ACTIVE'));
  const roleChanged = input.role !== undefined && input.role !== before.role;
  const statusChanged = input.status !== undefined && input.status !== before.status;

  const user = await prisma.$transaction(async (tx) => {
    // Luôn giữ ít nhất một admin đang hoạt động. Khoá các dòng admin (FOR UPDATE) để hai admin
    // không thể đồng thời hạ quyền lẫn nhau và làm hệ thống mất hết admin.
    if (losesAdmin) {
      const activeAdmins = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE`;
      if (activeAdmins.length <= 1) throw AppError.unprocessable('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');
    }

    // Chủ quầy phải chuyển quyền cho người khác trước khi đổi sang vai trò khác,
    // nếu không quầy sẽ bị bỏ trống chủ (vi phạm quy tắc mỗi quầy đúng 1 chủ quầy)
    if (roleChanged && input.role !== 'VENDOR') {
      const owned = await tx.vendorMembership.findMany({ where: { userId: id, role: 'OWNER' }, select: { stall: { select: { name: true } } } });
      if (owned.length > 0) {
        const names = owned.map((m) => `"${m.stall.name}"`).join(', ');
        throw AppError.unprocessable(`${before.fullName} đang là chủ quầy ${names}. Hãy chuyển quyền chủ quầy cho người khác (Quầy ăn → Nhân sự) trước khi đổi vai trò.`, [
          { field: 'role', message: `Đang là chủ quầy ${names}, cần chuyển quyền trước` },
        ]);
      }
    }

    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.studentCode !== undefined && { studentCode: input.studentCode }),
        ...(roleChanged && { role: input.role }),
        ...(statusChanged && { status: input.status }),
        // Đổi vai trò / khoá tài khoản → đăng xuất mọi phiên đang mở
        ...((roleChanged || statusChanged) && { tokenVersion: { increment: 1 } }),
      },
      include: userWithStallsInclude,
    });
    // Không còn là chủ quầy → gỡ khỏi các quầy
    if (roleChanged && input.role !== 'VENDOR') await tx.vendorMembership.deleteMany({ where: { userId: id } });

    if (roleChanged) {
      await audit({ req, action: 'USER_ROLE_CHANGE', entityType: 'User', entityId: id, metadata: { from: before.role, to: input.role! } }, tx);
    }
    if (statusChanged) {
      await audit({ req, action: 'USER_STATUS_CHANGE', entityType: 'User', entityId: id, metadata: { from: before.status, to: input.status! } }, tx);
    }
    if (!roleChanged && !statusChanged) {
      await audit({ req, action: 'USER_UPDATE', entityType: 'User', entityId: id }, tx);
    }
    return roleChanged && input.role !== 'VENDOR' ? { ...updated, memberships: [] } : updated;
  });

  sendSuccess(res, { user: toPublicUser(user) });
});

// Đặt lại mật khẩu cho người dùng (vd: quên mật khẩu) → đăng xuất mọi phiên
adminUsersRouter.post('/:id/reset-password', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { newPassword } = z.object({ newPassword: passwordSchema }).parse(req.body);
  await loadUser(id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } } });
    await audit({ req, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: id }, tx);
  });
  sendSuccess(res, { message: 'Đã đặt lại mật khẩu. Người dùng sẽ phải đăng nhập lại.' });
});
