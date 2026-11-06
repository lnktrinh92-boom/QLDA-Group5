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

describe('Xử lý đơn theo trạng thái', () => {
  it('luồng đầy đủ: nhận → chuẩn bị → sẵn sàng → hoàn thành (thanh toán PAID, cộng số đã bán, báo sinh viên)', async () => {
    const { ownerAgent, base, placeOrder, student, rice, studentAgent } = await setup();
    const orderId = await placeOrder(2);

    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']) {
      const res = await ownerAgent.patch(`${base}/orders/${orderId}/status`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe(status);
    }

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, statusHistory: true } });
    expect(order).toMatchObject({ paymentStatus: 'PAID', payment: { status: 'PAID' } });
    expect(order.completedAt).not.toBeNull();
    expect(order.payment?.paidAt).not.toBeNull();
    expect(order.statusHistory).toHaveLength(5);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: rice.id } })).soldCount).toBe(2);
    // 1 thông báo khi đặt + 4 lần đổi trạng thái
    expect(await prisma.notification.count({ where: { userId: student.id, orderId } })).toBe(5);
    // Sinh viên thấy trạng thái mới
    expect((await studentAgent.get(`${API}/orders/${orderId}`)).body.data.order.status).toBe('COMPLETED');
  });

  it('không cho nhảy cóc trạng thái (422) và trả về các bước hợp lệ', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const orderId = await placeOrder();
    const res = await ownerAgent.patch(`${base}/orders/${orderId}/status`).send({ status: 'COMPLETED' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.allowed).toEqual(['ACCEPTED', 'REJECTED']);
  });

  it('từ chối đơn bắt buộc có lý do; từ chối xong thanh toán VOIDED', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const orderId = await placeOrder();
    expect((await ownerAgent.patch(`${base}/orders/${orderId}/status`).send({ status: 'REJECTED' })).status).toBe(400);

    const res = await ownerAgent.patch(`${base}/orders/${orderId}/status`).send({ status: 'REJECTED', reason: 'Hết cơm' });
    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ status: 'REJECTED', paymentStatus: 'VOIDED', cancelReason: 'Hết cơm', nextStatuses: [] });
  });

  it('hai nhân viên bấm cùng lúc: chỉ một lần chuyển trạng thái thành công', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const orderId = await placeOrder();
    const staff = await loginAs('staff@test.local');
    const [a, b] = await Promise.all([
      ownerAgent.patch(`${base}/orders/${orderId}/status`).send({ status: 'ACCEPTED' }),
      staff.patch(`${base}/orders/${orderId}/status`).send({ status: 'ACCEPTED' }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId, toStatus: 'ACCEPTED' } })).toBe(1);
  });

  it('không xử lý được đơn của quầy khác (404)', async () => {
    const { placeOrder } = await setup();
    const orderId = await placeOrder();
    const other = await loginAs('other@test.local');
    const otherStallId = (await prisma.foodStall.findFirstOrThrow({ where: { name: 'Quầy B' } })).id;
    expect((await other.patch(`${API}/vendor/stalls/${otherStallId}/orders/${orderId}/status`).send({ status: 'ACCEPTED' })).status).toBe(404);
  });

  it('danh sách đơn theo tab, kèm số lượng từng tab và tìm theo mã đơn', async () => {
    const { ownerAgent, base, placeOrder } = await setup();
    const first = await placeOrder();
    await placeOrder();
    await ownerAgent.patch(`${base}/orders/${first}/status`).send({ status: 'ACCEPTED' });

    const res = await ownerAgent.get(`${base}/orders?tab=new`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nextStatuses).toEqual(['ACCEPTED', 'REJECTED']);
    expect(res.body.meta.tabCounts).toMatchObject({ new: 1, in_progress: 1, ready: 0, completed: 0, cancelled: 0 });

    const number = (await prisma.order.findUniqueOrThrow({ where: { id: first } })).orderNumber;
    expect((await ownerAgent.get(`${base}/orders?q=${number}`)).body.data.map((o: { id: number }) => o.id)).toEqual([first]);
    expect((await ownerAgent.get(`${base}/orders?from=2020-01-01&to=2020-01-31`)).body.data).toHaveLength(0);
  });
});

describe('Quản lý thực đơn', () => {
  it('tạo món, kiểm tra giá & danh mục', async () => {
    const { ownerAgent, base, category, hiddenCategory } = await setup();
    const ok = await ownerAgent.post(`${base}/menu-items`).send({ name: 'Cơm sườn', price: 40000, categoryId: category.id, description: '' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ name: 'Cơm sườn', price: '40000', description: null, isActive: true, isAvailable: true });

    expect((await ownerAgent.post(`${base}/menu-items`).send({ name: 'Rẻ quá', price: 500, categoryId: category.id })).status).toBe(400);
    expect((await ownerAgent.post(`${base}/menu-items`).send({ name: 'Giá lẻ', price: 1500.5, categoryId: category.id })).status).toBe(400);
    expect((await ownerAgent.post(`${base}/menu-items`).send({ name: 'Danh mục ẩn', price: 20000, categoryId: hiddenCategory.id })).status).toBe(400);
    expect(
      (await ownerAgent.post(`${base}/menu-items`).send({ name: 'Ảnh lạ', price: 20000, categoryId: category.id, imageUrl: 'javascript:alert(1)' })).status,
    ).toBe(400);
  });

  it('cập nhật một phần (bật/tắt còn món) không làm đổi các trường khác', async () => {
    const { ownerAgent, base, rice } = await setup();
    const res = await ownerAgent.patch(`${base}/menu-items/${rice.id}`).send({ isAvailable: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isAvailable: false, isFeatured: false, price: '35000', name: 'Cơm gà' });
  });

  it('ngừng bán món: ẩn khỏi trang công khai, gỡ khỏi giỏ hàng, vẫn giữ trong DB', async () => {
    const { ownerAgent, studentAgent, base, rice } = await setup();
    await studentAgent.post(`${API}/cart/items`).send({ menuItemId: rice.id });

    const res = await ownerAgent.delete(`${base}/menu-items/${rice.id}`);
    expect(res.body.data.isActive).toBe(false);
    expect((await request(app).get(`${API}/menu-items/${rice.id}`)).status).toBe(404);
    expect((await studentAgent.get(`${API}/cart`)).body.data.items).toHaveLength(0);
    expect(await prisma.menuItem.count({ where: { id: rice.id } })).toBe(1);

    expect((await ownerAgent.get(`${base}/menu-items?status=inactive`)).body.data.map((i: { id: number }) => i.id)).toEqual([rice.id]);
    // Bán lại
    expect((await ownerAgent.patch(`${base}/menu-items/${rice.id}`).send({ isActive: true })).body.data.isActive).toBe(true);
  });

  it('không sửa / xoá được món của quầy khác (404)', async () => {
    const { ownerAgent, base, otherItem } = await setup();
    expect((await ownerAgent.patch(`${base}/menu-items/${otherItem.id}`).send({ price: 1000 })).status).toBe(404);
    expect((await ownerAgent.delete(`${base}/menu-items/${otherItem.id}`)).status).toBe(404);
  });
});

describe('Tải ảnh', () => {
  // PNG 1x1 hợp lệ
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('ảnh hợp lệ được lưu và truy cập được qua /uploads', async () => {
    const { ownerAgent, base } = await setup();
    const res = await ownerAgent.post(`${base}/uploads`).attach('image', png, { filename: 'mon.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/uploads\/menu\/[\w-]+\.png$/);
    expect(existsSync(path.resolve(process.env.UPLOAD_DIR!, res.body.data.url.replace('/uploads/', '')))).toBe(true);
    expect((await request(app).get(res.body.data.url)).status).toBe(200);
  });

  it('file giả mạo đuôi ảnh hoặc định dạng không cho phép → 400', async () => {
    const { ownerAgent, base } = await setup();
    const fake = await ownerAgent
      .post(`${base}/uploads`)
      .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const gif = await ownerAgent.post(`${base}/uploads`).attach('image', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);
  });

  it('ảnh vượt dung lượng → 400', async () => {
    const { ownerAgent, base } = await setup();
    const big = Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await ownerAgent.post(`${base}/uploads`).attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/quá lớn/);
  });
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
