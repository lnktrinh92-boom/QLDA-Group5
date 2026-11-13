import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** Hai quầy mở cả ngày, mỗi quầy vài món, 1 điểm nhận, 1 sinh viên, 1 chủ quầy */
async function setup() {
  const student = await createUser({ role: 'STUDENT', email: 'sv@test.local' });
  const other = await createUser({ role: 'STUDENT', email: 'sv2@test.local' });
  const vendor = await createUser({ role: 'VENDOR', email: 'vendor@test.local' });
  const category = await prisma.foodCategory.create({ data: { name: 'Cơm', slug: 'com' } });
  const stallA = await createStall('Quầy A', [{ userId: vendor.id }]);
  const stallB = await createStall('Quầy B');
  // Mở cả ngày để test không phụ thuộc giờ chạy
  await prisma.foodStall.updateMany({ data: { openTime: '00:00', closeTime: '00:00' } });

  const item = (stallId: number, name: string, price: number, extra: Partial<Prisma.MenuItemUncheckedCreateInput> = {}) =>
    prisma.menuItem.create({ data: { stallId, categoryId: category.id, name, price: new Prisma.Decimal(price), ...extra } });

  const rice = await item(stallA.id, 'Cơm gà', 35000);
  const tea = await item(stallA.id, 'Trà đá', 5000);
  const soldOut = await item(stallA.id, 'Cơm sườn', 40000, { isAvailable: false });
  const noodle = await item(stallB.id, 'Phở bò', 45000);
  const pickup = await prisma.campusPickupLocation.create({ data: { name: 'Sảnh A1' } });
  const closedPickup = await prisma.campusPickupLocation.create({ data: { name: 'Đã đóng', isActive: false } });

  const agent = await loginAs('sv@test.local');
  return { student, other, vendor, stallA, stallB, rice, tea, soldOut, noodle, pickup, closedPickup, agent };
}

let keySeq = 0;
const newKey = () => `test-key-${Date.now()}-${++keySeq}`;

describe('Giỏ hàng', () => {
  it('chưa đăng nhập → 401, chủ quầy → 403', async () => {
    await setup();
    expect((await request(app).get(`${API}/cart`)).status).toBe(401);
    expect((await (await loginAs('vendor@test.local')).get(`${API}/cart`)).status).toBe(403);
  });

  it('thêm món, cộng dồn số lượng khi thêm lại, tính tạm tính ở server', async () => {
    const { agent, rice, tea } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 2, note: 'Ít cơm' });
    await agent.post(`${API}/cart/items`).send({ menuItemId: tea.id });
    const res = await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 3, note: 'Ít cơm', lineTotal: '105000' });
    expect(res.body.data).toMatchObject({ subtotal: '110000', itemCount: 4, canCheckout: true, stall: { name: 'Quầy A' } });
    expect(res.body.data.pickupSlots.length).toBeGreaterThan(0);
  });

  it('giỏ hàng lưu trong DB, đăng nhập lại vẫn còn', async () => {
    const { agent, rice } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 2 });
    const again = await loginAs('sv@test.local');
    expect((await again.get(`${API}/cart`)).body.data.itemCount).toBe(2);
  });

  it('không cho thêm món của quầy khác (409) trừ khi đồng ý thay giỏ', async () => {
    const { agent, rice, noodle } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });

    const conflict = await agent.post(`${API}/cart/items`).send({ menuItemId: noodle.id });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CART_STALL_CONFLICT');
    expect(conflict.body.error.details.currentStall.name).toBe('Quầy A');

    const replaced = await agent.post(`${API}/cart/items`).send({ menuItemId: noodle.id, replaceCart: true });
    expect(replaced.status).toBe(201);
    expect(replaced.body.data.items.map((i: { menuItem: { name: string } }) => i.menuItem.name)).toEqual(['Phở bò']);
  });

  it('không thêm được món hết hàng (422) hoặc không tồn tại (404)', async () => {
    const { agent, soldOut } = await setup();
    expect((await agent.post(`${API}/cart/items`).send({ menuItemId: soldOut.id })).status).toBe(422);
    expect((await agent.post(`${API}/cart/items`).send({ menuItemId: 999999 })).status).toBe(404);
  });

  it('giới hạn số lượng 1–20', async () => {
    const { agent, rice } = await setup();
    expect((await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 0 })).status).toBe(400);
    expect((await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 21 })).status).toBe(400);
  });

  it('cập nhật, xoá dòng; không sửa được giỏ của người khác', async () => {
    const { agent, rice, tea } = await setup();
    const added = await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    await agent.post(`${API}/cart/items`).send({ menuItemId: tea.id });
    const lineId = added.body.data.items[0].id;

    const updated = await agent.patch(`${API}/cart/items/${lineId}`).send({ quantity: 5, note: '' });
    expect(updated.body.data.items[0]).toMatchObject({ quantity: 5, note: null });

    const stranger = await loginAs('sv2@test.local');
    expect((await stranger.patch(`${API}/cart/items/${lineId}`).send({ quantity: 1 })).status).toBe(404);
    expect((await stranger.delete(`${API}/cart/items/${lineId}`)).status).toBe(404);

    const removed = await agent.delete(`${API}/cart/items/${lineId}`);
    expect(removed.body.data.items).toHaveLength(1);
  });

  it('món trong giỏ bị hết hàng sau đó → báo lỗi và không cho thanh toán', async () => {
    const { agent, rice } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    await prisma.menuItem.update({ where: { id: rice.id }, data: { isAvailable: false } });
    const res = await agent.get(`${API}/cart`);
    expect(res.body.data.canCheckout).toBe(false);
    expect(res.body.data.items[0].issue).toMatch(/hết/);
  });
});

describe('Đặt món (POST /orders)', () => {
  it('tạo đơn: tính tiền từ DB, snapshot món, thanh toán UNPAID, xoá giỏ, thông báo quầy', async () => {
    const { agent, rice, tea, pickup, vendor } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id, quantity: 2, note: 'Nhiều rau' });
    await agent.post(`${API}/cart/items`).send({ menuItemId: tea.id, quantity: 1 });

    const res = await agent.post(`${API}/orders`).send({
      pickupLocationId: pickup.id,
      customerNote: 'Gọi mình khi xong',
      idempotencyKey: newKey(),
      // Các trường dưới đây do client gửi phải bị bỏ qua
      total: 1,
      subtotal: 1,
      status: 'COMPLETED',
      paymentStatus: 'PAID',
    });

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'CASH_ON_PICKUP',
      subtotal: '75000',
      total: '75000',
      customerNote: 'Gọi mình khi xong',
      canCancel: true,
      pickupLocation: { name: 'Sảnh A1' },
    });
    expect(order.orderNumber).toMatch(/^QB-\d{6}-[A-Z0-9]{4}$/);
    expect(order.items).toEqual([
      expect.objectContaining({ itemName: 'Cơm gà', unitPrice: '35000', quantity: 2, note: 'Nhiều rau', lineTotal: '70000' }),
      expect.objectContaining({ itemName: 'Trà đá', unitPrice: '5000', quantity: 1, lineTotal: '5000' }),
    ]);
    expect(order.statusHistory).toEqual([expect.objectContaining({ toStatus: 'PENDING' })]);

    expect((await agent.get(`${API}/cart`)).body.data.items).toHaveLength(0);
    expect(await prisma.payment.findUnique({ where: { orderId: order.id } })).toMatchObject({ status: 'UNPAID' });
    expect(await prisma.notification.count({ where: { userId: vendor.id, orderId: order.id } })).toBe(1);
  });

  it('đổi giá món sau khi đặt không làm thay đổi đơn cũ (snapshot)', async () => {
    const { agent, rice, pickup } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const { body } = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() });
    await prisma.menuItem.update({ where: { id: rice.id }, data: { price: new Prisma.Decimal(99000), name: 'Tên mới' } });

    const detail = await agent.get(`${API}/orders/${body.data.order.id}`);
    expect(detail.body.data.order.items[0]).toMatchObject({ itemName: 'Cơm gà', unitPrice: '35000' });
    expect(detail.body.data.order.total).toBe('35000');
  });

  it('gửi lại cùng idempotencyKey (bấm 2 lần / mạng gửi lại) chỉ tạo MỘT đơn', async () => {
    const { agent, rice, pickup, student } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const key = newKey();
    const payload = { pickupLocationId: pickup.id, idempotencyKey: key };

    const [a, b] = await Promise.all([agent.post(`${API}/orders`).send(payload), agent.post(`${API}/orders`).send(payload)]);
    const c = await agent.post(`${API}/orders`).send(payload);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(c.status).toBe(200);
    expect(c.body.data.created).toBe(false);
    expect(new Set([a.body.data.order.id, b.body.data.order.id, c.body.data.order.id]).size).toBe(1);
    expect(await prisma.order.count({ where: { studentId: student.id } })).toBe(1);
  });

  it('gửi lại cùng idempotencyKey nhưng đổi điểm nhận / cách thanh toán → 409, không lặng lẽ trả đơn ở nơi cũ', async () => {
    const { agent, rice, pickup, student } = await setup();
    const pickupB = await prisma.campusPickupLocation.create({ data: { name: 'Căn tin cơ sở B' } });
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const key = newKey();
    const first = await agent.post(`${API}/orders`).send({ pickupLocationId: pickupB.id, idempotencyKey: key });
    expect(first.status).toBe(201);

    // Mạng chập chờn: sinh viên không thấy kết quả, đổi sang điểm nhận khác rồi bấm lại
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const changed = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: key });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('ORDER_ALREADY_PLACED');
    expect(changed.body.error.message).toContain(`Đơn ${first.body.data.order.orderNumber} đã được đặt trước đó (nhận tại "Căn tin cơ sở B")`);
    expect(changed.body.error.details).toEqual([expect.objectContaining({ field: 'pickupLocationId', orderId: first.body.data.order.id })]);

    const payChanged = await agent.post(`${API}/orders`).send({ pickupLocationId: pickupB.id, paymentMethod: 'VIETQR', idempotencyKey: key });
    expect(payChanged.status).toBe(409);
    expect(payChanged.body.error.details[0].field).toBe('paymentMethod');

    // Gửi lại đúng yêu cầu cũ → vẫn trả đơn cũ như trước; chỉ có 1 đơn, đúng nơi đã chọn
    const same = await agent.post(`${API}/orders`).send({ pickupLocationId: pickupB.id, idempotencyKey: key });
    expect(same.status).toBe(200);
    expect(same.body.data.order.pickupLocation.name).toBe('Căn tin cơ sở B');
    expect(await prisma.order.findMany({ where: { studentId: student.id }, select: { pickupLocationId: true } })).toEqual([{ pickupLocationId: pickupB.id }]);
  });

  it('hai lần checkout đồng thời với KHÁC idempotencyKey vẫn chỉ tạo một đơn (khoá giỏ hàng)', async () => {
    const { agent, rice, pickup, student } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const [a, b] = await Promise.all([
      agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() }),
      agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    expect(await prisma.order.count({ where: { studentId: student.id } })).toBe(1);
  });

  it('giỏ rỗng → 422', async () => {
    const { agent, pickup } = await setup();
    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/trống/);
  });

  it('món hết hàng lúc đặt → 422, KHÔNG tạo đơn và giỏ giữ nguyên (transaction)', async () => {
    const { agent, rice, tea, pickup, student } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    await agent.post(`${API}/cart/items`).send({ menuItemId: tea.id });
    await prisma.menuItem.update({ where: { id: tea.id }, data: { isAvailable: false } });

    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() });
    expect(res.status).toBe(422);
    expect(res.body.error.details.unavailableItems[0].name).toBe('Trà đá');
    expect(await prisma.order.count({ where: { studentId: student.id } })).toBe(0);
    expect((await agent.get(`${API}/cart`)).body.data.items).toHaveLength(2);
  });

  it('quầy tạm ngưng nhận đơn → 422', async () => {
    const { agent, rice, pickup, stallA } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    await prisma.foodStall.update({ where: { id: stallA.id }, data: { isAcceptingOrders: false } });
    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: newKey() });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/tạm ngưng/);
  });

  it('điểm nhận đã đóng hoặc giờ nhận không hợp lệ → 422', async () => {
    const { agent, rice, pickup, closedPickup } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });

    expect((await agent.post(`${API}/orders`).send({ pickupLocationId: closedPickup.id, idempotencyKey: newKey() })).status).toBe(422);

    const tooSoon = new Date(Date.now() + 60_000).toISOString();
    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, pickupTime: tooSoon, idempotencyKey: newKey() });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/ít nhất 15 phút/);
  });

  it('chọn giờ nhận hợp lệ từ danh sách khung giờ', async () => {
    const { agent, rice, pickup } = await setup();
    const cart = await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const slot = cart.body.data.pickupSlots[1];
    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, pickupTime: slot, idempotencyKey: newKey() });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.order.pickupTime).toISOString()).toBe(slot);
  });

  it('phương thức thanh toán không hỗ trợ → 400', async () => {
    const { agent, rice, pickup } = await setup();
    await agent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const res = await agent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, paymentMethod: 'VNPAY', idempotencyKey: newKey() });
    expect(res.status).toBe(400);
  });
});

describe('Lịch sử, chi tiết & huỷ đơn', () => {
  async function placeOrder() {
    const ctx = await setup();
    await ctx.agent.post(`${API}/cart/items`).send({ menuItemId: ctx.rice.id });
    const res = await ctx.agent.post(`${API}/orders`).send({ pickupLocationId: ctx.pickup.id, idempotencyKey: newKey() });
    return { ...ctx, orderId: res.body.data.order.id as number };
  }

  it('danh sách đơn của mình, lọc theo nhóm trạng thái', async () => {
    const { agent, orderId } = await placeOrder();
    const all = await agent.get(`${API}/orders`);
    expect(all.body.data.map((o: { id: number }) => o.id)).toEqual([orderId]);
    expect(all.body.data[0]).toMatchObject({ itemCount: 1, total: '35000', stall: { name: 'Quầy A' } });
    expect((await agent.get(`${API}/orders?group=active`)).body.data).toHaveLength(1);
    expect((await agent.get(`${API}/orders?group=completed`)).body.data).toHaveLength(0);
  });

  it('sinh viên khác không xem / huỷ được đơn (404)', async () => {
    const { orderId } = await placeOrder();
    const stranger = await loginAs('sv2@test.local');
    expect((await stranger.get(`${API}/orders/${orderId}`)).status).toBe(404);
    expect((await stranger.post(`${API}/orders/${orderId}/cancel`).send({})).status).toBe(404);
    expect((await stranger.get(`${API}/orders`)).body.data).toHaveLength(0);
  });

  it('huỷ đơn PENDING: trạng thái CANCELLED, thanh toán VOIDED, ghi lịch sử', async () => {
    const { agent, orderId } = await placeOrder();
    const res = await agent.post(`${API}/orders/${orderId}/cancel`).send({ reason: 'Đổi ý' });
    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: 'Đổi ý', canCancel: false });
    expect(res.body.data.order.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'CANCELLED']);
  });

  it('không huỷ được đơn quầy đã nhận (422) hoặc đã huỷ', async () => {
    const { agent, orderId } = await placeOrder();
    await prisma.order.update({ where: { id: orderId }, data: { status: 'ACCEPTED' } });
    const res = await agent.post(`${API}/orders/${orderId}/cancel`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/liên hệ quầy/);
  });
});
