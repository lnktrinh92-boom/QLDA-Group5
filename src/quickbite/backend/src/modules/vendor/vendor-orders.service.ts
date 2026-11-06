import type { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { dateOnlySchema, vnDayEnd, vnDayStart } from '../../utils/dates.js';
import { toSkipTake } from '../../utils/validation.js';
import { isAwaitingTransfer, nextStatusesFor, type OrderActor } from '../orders/order-status.js';
import { orderDetailInclude, toOrderDto } from '../orders/orders.mapper.js';
import { paymentsService } from '../payments/payments.service.js';

/** Nhóm trạng thái tương ứng các tab trong màn hình xử lý đơn */
export const VENDOR_ORDER_TABS = {
  new: ['PENDING'],
  in_progress: ['ACCEPTED', 'PREPARING'],
  ready: ['READY_FOR_PICKUP'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED'],
} as const satisfies Record<string, OrderStatus[]>;

export const listVendorOrdersQuery = z
  .object({
    tab: z.enum(Object.keys(VENDOR_ORDER_TABS) as [keyof typeof VENDOR_ORDER_TABS]).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Tìm theo mã đơn hoặc tên sinh viên */
    q: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, { path: ['to'], message: 'Ngày kết thúc phải sau ngày bắt đầu' });

export const updateOrderStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'REJECTED']),
  reason: z.string().trim().max(255, 'Lý do tối đa 255 ký tự').optional(),
});

type ListQuery = z.infer<typeof listVendorOrdersQuery>;

const listSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  total: true,
  pickupTime: true,
  customerNote: true,
  createdAt: true,
  student: { select: { fullName: true, phone: true } },
  pickupLocation: { select: { id: true, name: true } },
  items: { select: { itemName: true, quantity: true, note: true }, orderBy: { id: 'asc' } },
  payment: { select: { expiresAt: true } },
} satisfies Prisma.OrderSelect;

export const vendorOrdersService = {
  async list(stallId: number, query: ListQuery, actor: OrderActor) {
    // Huỷ các đơn chuyển khoản đã quá hạn trước khi hiển thị hàng đợi
    await paymentsService.expireUnpaidOrders();
    const base: Prisma.OrderWhereInput = {
      stallId,
      ...((query.from || query.to) && {
        createdAt: { ...(query.from && { gte: vnDayStart(query.from) }), ...(query.to && { lt: vnDayEnd(query.to) }) },
      }),
      ...(query.q && {
        OR: [{ orderNumber: { contains: query.q } }, { student: { fullName: { contains: query.q } } }],
      }),
    };
    const where: Prisma.OrderWhereInput = {
      ...base,
      ...(query.tab && { status: { in: [...VENDOR_ORDER_TABS[query.tab]] } }),
    };

    // Đơn mới / đang xử lý: cũ nhất lên trước (làm trước); đã xong: mới nhất lên trước
    const oldestFirst = query.tab === 'new' || query.tab === 'in_progress' || query.tab === 'ready';
    const [orders, total, counts] = await Promise.all([
      prisma.order.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: oldestFirst ? 'asc' : 'desc' },
        ...toSkipTake(query),
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));
    const tabCounts = Object.fromEntries(
      Object.entries(VENDOR_ORDER_TABS).map(([tab, statuses]) => [tab, statuses.reduce((n, s) => n + (byStatus.get(s) ?? 0), 0)]),
    );

    return {
      orders: orders.map(({ payment, ...o }) => ({
        ...o,
        /** Hạn chuyển khoản (chỉ có ý nghĩa khi awaitingPayment) */
        paymentExpiresAt: payment?.expiresAt ?? null,
        total: o.total.toFixed(0),
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        awaitingPayment: isAwaitingTransfer(o) && o.status === 'PENDING',
        nextStatuses: nextStatusesFor(o, actor),
      })),
      total,
      tabCounts,
    };
  },

  async detail(stallId: number, orderId: number, actor: OrderActor) {
    await paymentsService.expireUnpaidOrders({ orderId });
    const order = await prisma.order.findFirst({ where: { id: orderId, stallId }, include: orderDetailInclude });
    if (!order) throw AppError.notFound('Không tìm thấy đơn hàng');
    return { ...toOrderDto(order), nextStatuses: nextStatusesFor(order, actor) };
  },
};
