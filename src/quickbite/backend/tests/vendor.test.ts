import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';
import { vnToday } from '../src/utils/dates.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

let orderSeq = 0;

async function setup() {
  const student = await createUser({ role: 'STUDENT', email: 'sv@test.local' });
  const owner = await createUser({ role: 'VENDOR', email: 'owner@test.local' });
  const staff = await createUser({ role: 'VENDOR', email: 'staff@test.local' });
  const otherVendor = await createUser({ role: 'VENDOR', email: 'other@test.local' });
  await createUser({ role: 'ADMIN', email: 'admin@test.local' });

  const category = await prisma.foodCategory.create({ data: { name: 'Cơm', slug: 'com' } });
  const hiddenCategory = await prisma.foodCategory.create({ data: { name: 'Ẩn', slug: 'an', isActive: false } });
  const stall = await createStall('Quầy A', [
    { userId: owner.id, role: 'OWNER' },
    { userId: staff.id, role: 'STAFF' },
  ]);
  const otherStall = await createStall('Quầy B', [{ userId: otherVendor.id, role: 'OWNER' }]);
  await prisma.foodStall.updateMany({ data: { openTime: '00:00', closeTime: '00:00' } });

  const rice = await prisma.menuItem.create({ data: { stallId: stall.id, categoryId: category.id, name: 'Cơm gà', price: new Prisma.Decimal(35000) } });
  const otherItem = await prisma.menuItem.create({ data: { stallId: otherStall.id, categoryId: category.id, name: 'Phở', price: new Prisma.Decimal(40000) } });
  const pickup = await prisma.campusPickupLocation.create({ data: { name: 'Sảnh A1' } });

  const studentAgent = await loginAs('sv@test.local');
  const ownerAgent = await loginAs('owner@test.local');
  const base = `${API}/vendor/stalls/${stall.id}`;

  /** Sinh viên đặt 1 đơn qua API thật */
  const placeOrder = async (quantity = 2) => {
    await studentAgent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity });
    const res = await studentAgent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: `k-${Date.now()}-${++orderSeq}` });
    if (res.status !== 201) throw new Error(`Đặt đơn thất bại: ${JSON.stringify(res.body)}`);
    return res.body.data.order.id as number;
  };

  return { student, owner, staff, stall, otherStall, category, hiddenCategory, rice, otherItem, studentAgent, ownerAgent, base, placeOrder };
}

describe('Phân quyền khu vực chủ quầy', () => {
  it('sinh viên → 403; chủ quầy khác → 404 cho mọi route của quầy', async () => {
    const { studentAgent, base } = await setup();
    const other = await loginAs('other@test.local');
    for (const p of ['', '/dashboard', '/orders', '/menu-items', '/reports']) {
      expect((await studentAgent.get(`${base}${p}`)).status).toBe(403);
      expect((await other.get(`${base}${p}`)).status).toBe(404);
    }
    expect((await other.post(`${base}/menu-items`).send({ name: 'Món lạ', price: 10000, categoryId: 1 })).status).toBe(404);
  });

  it('nhân viên (STAFF) xử lý được đơn nhưng không sửa được thông tin quầy', async () => {
    const { base, placeOrder } = await setup();
    const orderId = await placeOrder();
    const staff = await loginAs('staff@test.local');
    expect((await staff.patch(`${base}/orders/${orderId}/status`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await staff.patch(base).send({ description: 'Đổi mô tả' })).status).toBe(403);
    expect((await staff.patch(`${base}/accepting-orders`).send({ isAcceptingOrders: false })).status).toBe(200);
  });

  it('chủ quầy sửa được thông tin quầy; admin truy cập được mọi quầy', async () => {
    const { ownerAgent, base, otherStall } = await setup();
    const res = await ownerAgent.patch(base).send({ description: 'Cơm ngon', openTime: '07:00', closeTime: '19:00', phone: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.stall).toMatchObject({ description: 'Cơm ngon', openTime: '07:00', closeTime: '19:00', phone: null });
    expect((await ownerAgent.patch(base).send({ openTime: '25:00' })).status).toBe(400);

    const admin = await loginAs('admin@test.local');
    expect((await admin.get(`${API}/vendor/stalls/${otherStall.id}/dashboard`)).status).toBe(200);
  });
});

describe('Quản lý thực đơn', () => {
});

describe('Tổng quan & báo cáo', () => {
  it('dashboard đếm đúng đơn hôm nay, doanh thu, hàng đợi', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const done = await placeOrder(2);
    await placeOrder(1);
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']) {
      await ownerAgent.patch(`${base}/orders/${done}/status`).send({ status });
    }

    const res = await ownerAgent.get(`${base}/dashboard`);
    expect(res.body.data).toMatchObject({
      date: vnToday(),
      today: { orders: 2, completed: 1, cancelled: 0, revenue: '70000' },
      queue: { pending: 1, inProgress: 0, ready: 0 },
    });
    expect(res.body.data.topItems7Days[0]).toMatchObject({ name: 'Cơm gà', quantity: 2, revenue: '70000' });
  });

  it('báo cáo: doanh thu chỉ tính đơn hoàn thành, đủ ngày trong khoảng', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const done = await placeOrder(3);
    const rejected = await placeOrder(1);
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']) {
      await ownerAgent.patch(`${base}/orders/${done}/status`).send({ status });
    }
    await ownerAgent.patch(`${base}/orders/${rejected}/status`).send({ status: 'REJECTED', reason: 'Hết món' });

    const res = await ownerAgent.get(`${base}/reports`);
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.series.at(-1)).toMatchObject({ date: vnToday(), orders: 2, completed: 1, revenue: '105000' });
    expect(res.body.data.totals).toEqual({ orders: 2, completed: 1, cancelled: 1, revenue: '105000', averageOrderValue: '105000' });

    expect((await ownerAgent.get(`${base}/reports?from=2026-02-01&to=2026-01-01`)).status).toBe(400);
  });
});

describe('Thông báo', () => {
  it('xem, đếm chưa đọc, đánh dấu đã đọc; không đọc được thông báo của người khác', async () => {
    const { studentAgent, ownerAgent, placeOrder, owner } = await setup();
    await placeOrder();

    expect((await studentAgent.get(`${API}/notifications/unread-count`)).body.data.count).toBe(1);
    expect((await ownerAgent.get(`${API}/notifications/unread-count`)).body.data.count).toBe(1);

    const list = await studentAgent.get(`${API}/notifications`);
    const id = list.body.data[0].id;
    expect(list.body.data[0].order.orderNumber).toMatch(/^QB-/);

    const ownerNotification = await prisma.notification.findFirstOrThrow({ where: { userId: owner.id } });
    expect((await studentAgent.patch(`${API}/notifications/${ownerNotification.id}/read`)).status).toBe(404);

    expect((await studentAgent.patch(`${API}/notifications/${id}/read`)).status).toBe(200);
    expect((await studentAgent.get(`${API}/notifications/unread-count`)).body.data.count).toBe(0);
    expect((await ownerAgent.post(`${API}/notifications/read-all`)).body.data.updated).toBe(1);
  });
});
