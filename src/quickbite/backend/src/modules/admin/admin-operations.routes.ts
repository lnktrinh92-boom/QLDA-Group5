import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { currentUser } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { addDays, dateOnlySchema, eachDay, vnDayEnd, vnDayStart, vnToday } from '../../utils/dates.js';
import { buildPaginationMeta, sendSuccess } from '../../utils/response.js';
import { idParamSchema, paginationSchema, toSkipTake } from '../../utils/validation.js';
import { nextStatusesFor } from '../orders/order-status.js';
import { transitionOrder } from '../orders/order-workflow.js';
import { orderDetailInclude, toOrderDto } from '../orders/orders.mapper.js';
import { updateOrderStatusSchema } from '../vendor/vendor-orders.service.js';
import { AUDIT_ACTIONS, audit } from './audit.js';

/** Thống kê, đơn hàng toàn hệ thống, kiểm duyệt đánh giá, nhật ký */
export const adminOperationsRouter = Router();

const money = (v: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(v ?? 0).toFixed(0);
const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'REJECTED'] as const;

// ─────────── Tổng quan hệ thống ───────────
adminOperationsRouter.get('/dashboard', async (_req, res) => {
  const today = vnToday();
  const from14 = addDays(today, -13);
  const from30 = vnDayStart(addDays(today, -29));
  const end = vnDayEnd(today);

  const [usersByRole, suspended, stalls, todayOrders, todayRevenue, revenue30, statusCounts, daily, topStalls, reportedReviews, activeOrders] =
    await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.foodStall.groupBy({ by: ['isActive'], _count: { _all: true } }),
      prisma.order.count({ where: { createdAt: { gte: vnDayStart(today), lt: end } } }),
      prisma.order.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: vnDayStart(today), lt: end } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: from30, lt: end } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from30, lt: end } }, _count: { _all: true } }),
      prisma.$queryRaw<{ day: string; orders: bigint | number; completed: bigint | number; revenue: Prisma.Decimal | string | null }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '+07:00'), '%Y-%m-%d') AS day,
               COUNT(*) AS orders,
               SUM(status = 'COMPLETED') AS completed,
               SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END) AS revenue
        FROM orders
        WHERE createdAt >= ${vnDayStart(from14)} AND createdAt < ${end}
        GROUP BY day ORDER BY day`,
      prisma.$queryRaw<{ stallId: number; name: string; orders: bigint | number; revenue: Prisma.Decimal | string }[]>`
        SELECT o.stallId AS stallId, s.name AS name, COUNT(*) AS orders, SUM(o.total) AS revenue
        FROM orders o JOIN food_stalls s ON s.id = o.stallId
        WHERE o.status = 'COMPLETED' AND o.createdAt >= ${from30} AND o.createdAt < ${end}
        GROUP BY o.stallId, s.name ORDER BY revenue DESC LIMIT 5`,
      prisma.review.count({ where: { status: 'REPORTED' } }),
      prisma.order.count({ where: { status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] } } }),
    ]);

  const byDay = new Map(daily.map((d) => [d.day, d]));
  sendSuccess(res, {
    date: today,
    users: {
      total: usersByRole.reduce((n, r) => n + r._count._all, 0),
      byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])),
      suspended,
    },
    stalls: {
      active: stalls.find((s) => s.isActive)?._count._all ?? 0,
      inactive: stalls.find((s) => !s.isActive)?._count._all ?? 0,
    },
    orders: { today: todayOrders, active: activeOrders, last30Days: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) },
    revenue: { today: money(todayRevenue._sum.total), last30Days: money(revenue30._sum.total), completedLast30Days: revenue30._count._all },
    series: eachDay(from14, today).map((date) => ({
      date,
      orders: Number(byDay.get(date)?.orders ?? 0),
      completed: Number(byDay.get(date)?.completed ?? 0),
      revenue: money(byDay.get(date)?.revenue),
    })),
    topStalls: topStalls.map((s) => ({ stallId: Number(s.stallId), name: s.name, orders: Number(s.orders), revenue: money(s.revenue) })),
    reportedReviews,
  });
});

// ─────────── Đơn hàng toàn hệ thống ───────────
const listOrdersQuery = paginationSchema
  .extend({
    status: z.enum(ORDER_STATUSES).optional(),
    stallId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().max(50).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, { path: ['to'], message: 'Ngày kết thúc phải sau ngày bắt đầu' });

adminOperationsRouter.get('/orders', async (req, res) => {
  const query = listOrdersQuery.parse(req.query);
  const where: Prisma.OrderWhereInput = {
    status: query.status,
    stallId: query.stallId,
    ...((query.from || query.to) && {
      createdAt: { ...(query.from && { gte: vnDayStart(query.from) }), ...(query.to && { lt: vnDayEnd(query.to) }) },
    }),
    ...(query.q && {
      OR: [{ orderNumber: { contains: query.q } }, { student: { fullName: { contains: query.q } } }, { student: { email: { contains: query.q } } }],
    }),
  };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
        stall: { select: { id: true, name: true } },
        student: { select: { id: true, fullName: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  sendSuccess(
    res,
    orders.map((o) => ({ ...o, total: money(o.total), nextStatuses: nextStatusesFor(o, 'ADMIN') })),
    200,
    buildPaginationMeta(query.page, query.pageSize, total),
  );
});

adminOperationsRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const order = await prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
  if (!order) throw AppError.notFound('Không tìm thấy đơn hàng');
  sendSuccess(res, { order: { ...toOrderDto(order), nextStatuses: nextStatusesFor(order, 'ADMIN') } });
});

// Admin can thiệp trạng thái đơn (vd: huỷ đơn bị treo); vẫn tuân theo máy trạng thái
adminOperationsRouter.patch('/orders/:id/status', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status, reason } = updateOrderStatusSchema.parse(req.body);
  const order = await transitionOrder({
    orderId: id,
    to: status,
    actor: 'ADMIN',
    userId: currentUser(req).id,
    reason,
    // Ghi nhật ký (kèm trạng thái cũ) trong cùng transaction: đổi trạng thái và nhật ký cùng thành công / thất bại
    onTransition: (tx, change) => audit({ req, action: 'ORDER_STATUS_CHANGE', entityType: 'Order', entityId: id, metadata: change }, tx),
  });
  sendSuccess(res, { order });
});

// ─────────── Kiểm duyệt đánh giá ───────────
const listReviewsQuery = paginationSchema.extend({
  status: z.enum(['VISIBLE', 'HIDDEN', 'REPORTED']).optional(),
  stallId: z.coerce.number().int().positive().optional(),
});

adminOperationsRouter.get('/reviews', async (req, res) => {
  const query = listReviewsQuery.parse(req.query);
  const where: Prisma.ReviewWhereInput = { status: query.status, stallId: query.stallId };
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      // Đánh giá bị báo cáo cần xử lý trước
      orderBy: [{ updatedAt: 'desc' }],
      ...toSkipTake(query),
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        stall: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  sendSuccess(res, reviews, 200, buildPaginationMeta(query.page, query.pageSize, total));
});

adminOperationsRouter.patch('/reviews/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status, note } = z
    .object({ status: z.enum(['VISIBLE', 'HIDDEN']), note: z.string().trim().max(255).optional() })
    .parse(req.body);
  const before = await prisma.review.findUnique({ where: { id } });
  if (!before) throw AppError.notFound('Không tìm thấy đánh giá');
  const review = await prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({
      where: { id },
      // Hiện lại → xoá lý do báo cáo; ẩn → giữ lý do để tra cứu
      data: { status, ...(status === 'VISIBLE' && { reportReason: null }) },
    });
    await audit({ req, action: 'REVIEW_MODERATE', entityType: 'Review', entityId: id, metadata: { from: before.status, to: status, note: note ?? null } }, tx);
    return updated;
  });
  sendSuccess(res, { review });
});

// ─────────── Nhật ký quản trị ───────────
const auditQuery = paginationSchema.extend({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.string().trim().max(50).optional(),
  actorId: z.coerce.number().int().positive().optional(),
});

adminOperationsRouter.get('/audit-logs', async (req, res) => {
  const query = auditQuery.parse(req.query);
  const where: Prisma.AuditLogWhereInput = { action: query.action, entityType: query.entityType, actorId: query.actorId };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  sendSuccess(res, logs, 200, buildPaginationMeta(query.page, query.pageSize, total));
});
