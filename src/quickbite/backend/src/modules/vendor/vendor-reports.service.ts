import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { addDays, dateOnlySchema, eachDay, vnDayEnd, vnDayStart, vnToday } from '../../utils/dates.js';
import { getStallRatings } from '../catalog/catalog.mappers.js';
import { ACTIVE_STATUSES } from '../orders/order-status.js';

const MAX_RANGE_DAYS = 366;

export const reportQuery = z
  .object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() })
  .transform(({ from, to }) => {
    const end = to ?? vnToday();
    return { from: from ?? addDays(end, -6), to: end };
  })
  .refine((r) => r.from <= r.to, { path: ['to'], message: 'Ngày kết thúc phải sau ngày bắt đầu' })
  .refine((r) => eachDay(r.from, r.to).length <= MAX_RANGE_DAYS, { path: ['from'], message: `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày` });

const money = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0).toFixed(0);

/** Món bán chạy (đơn đã hoàn thành) trong khoảng thời gian */
async function topItems(stallId: number, from: Date, to: Date, limit: number) {
  const rows = await prisma.$queryRaw<{ menuItemId: number; name: string; quantity: bigint | number; revenue: Prisma.Decimal | string }[]>`
    SELECT oi.menuItemId AS menuItemId, MAX(oi.itemName) AS name,
           SUM(oi.quantity) AS quantity, SUM(oi.lineTotal) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.orderId
    WHERE o.stallId = ${stallId} AND o.status = 'COMPLETED' AND o.createdAt >= ${from} AND o.createdAt < ${to}
    GROUP BY oi.menuItemId
    ORDER BY quantity DESC, revenue DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ menuItemId: Number(r.menuItemId), name: r.name, quantity: Number(r.quantity), revenue: money(r.revenue) }));
}

export const vendorReportsService = {
  /** Số liệu tổng quan hôm nay + hàng đợi đơn cần xử lý */
  async dashboard(stallId: number) {
    const today = vnToday();
    const start = vnDayStart(today);
    const end = vnDayEnd(today);

    const [todayByStatus, todayRevenue, queue, ratings, top, stall] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where: { stallId, createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { stallId, status: 'COMPLETED', createdAt: { gte: start, lt: end } }, _sum: { total: true } }),
      prisma.order.groupBy({ by: ['status'], where: { stallId, status: { in: ACTIVE_STATUSES } }, _count: { _all: true } }),
      getStallRatings([stallId]),
      topItems(stallId, vnDayStart(addDays(today, -6)), end, 5),
      prisma.foodStall.findUniqueOrThrow({ where: { id: stallId }, select: { isAcceptingOrders: true, openTime: true, closeTime: true } }),
    ]);

    const count = (rows: { status: string; _count: { _all: number } }[], ...statuses: string[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r._count._all, 0);

    return {
      date: today,
      stall,
      today: {
        orders: todayByStatus.reduce((n, r) => n + r._count._all, 0),
        completed: count(todayByStatus, 'COMPLETED'),
        cancelled: count(todayByStatus, 'CANCELLED', 'REJECTED'),
        revenue: money(todayRevenue._sum.total),
      },
      queue: {
        pending: count(queue, 'PENDING'),
        inProgress: count(queue, 'ACCEPTED', 'PREPARING'),
        ready: count(queue, 'READY_FOR_PICKUP'),
      },
      rating: ratings.get(stallId) ?? { average: null, count: 0 },
      topItems7Days: top,
    };
  },

  /** Báo cáo doanh thu theo khoảng ngày (giờ Việt Nam). Doanh thu = tổng tiền các đơn COMPLETED. */
  async report(stallId: number, range: { from: string; to: string }) {
    const from = vnDayStart(range.from);
    const to = vnDayEnd(range.to);

    const [daily, byStatus, top] = await Promise.all([
      prisma.$queryRaw<{ day: string; orders: bigint | number; completed: bigint | number; revenue: Prisma.Decimal | string | null }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '+07:00'), '%Y-%m-%d') AS day,
               COUNT(*) AS orders,
               SUM(status = 'COMPLETED') AS completed,
               SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END) AS revenue
        FROM orders
        WHERE stallId = ${stallId} AND createdAt >= ${from} AND createdAt < ${to}
        GROUP BY day
        ORDER BY day`,
      prisma.order.groupBy({ by: ['status'], where: { stallId, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
      topItems(stallId, from, to, 10),
    ]);

    // Điền 0 cho những ngày không có đơn để biểu đồ liên tục
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = eachDay(range.from, range.to).map((day) => {
      const d = byDay.get(day);
      return { date: day, orders: Number(d?.orders ?? 0), completed: Number(d?.completed ?? 0), revenue: money(d?.revenue) };
    });

    const revenue = series.reduce((sum, d) => sum.add(d.revenue), new Prisma.Decimal(0));
    const statusCounts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const completed = statusCounts.COMPLETED ?? 0;

    return {
      range,
      totals: {
        orders: byStatus.reduce((n, r) => n + r._count._all, 0),
        completed,
        cancelled: (statusCounts.CANCELLED ?? 0) + (statusCounts.REJECTED ?? 0),
        revenue: revenue.toFixed(0),
        averageOrderValue: completed > 0 ? revenue.div(completed).toFixed(0) : '0',
      },
      statusCounts,
      series,
      topItems: top,
    };
  },
};
