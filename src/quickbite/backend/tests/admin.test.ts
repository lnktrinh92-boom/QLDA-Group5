import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

let seq = 0;

async function setup() {
  const admin = await createUser({ role: 'ADMIN', email: 'admin@test.local' });
  const student = await createUser({ role: 'STUDENT', email: 'sv@test.local' });
  const student2 = await createUser({ role: 'STUDENT', email: 'sv2@test.local' });
  const vendor = await createUser({ role: 'VENDOR', email: 'vendor@test.local' });
  const category = await prisma.foodCategory.create({ data: { name: 'Cơm', slug: 'com' } });
  const stall = await createStall('Quầy A', [{ userId: vendor.id }]);
  await prisma.foodStall.updateMany({ data: { openTime: '00:00', closeTime: '00:00' } });
  const rice = await prisma.menuItem.create({ data: { stallId: stall.id, categoryId: category.id, name: 'Cơm gà', price: new Prisma.Decimal(35000) } });
  const pickup = await prisma.campusPickupLocation.create({ data: { name: 'Sảnh A1' } });
  const adminAgent = await loginAs('admin@test.local');
  const studentAgent = await loginAs('sv@test.local');

  const placeOrder = async () => {
    await studentAgent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    const res = await studentAgent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: `adm-${Date.now()}-${++seq}` });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body.data.order.id as number;
  };

  return { admin, student, student2, vendor, category, stall, rice, pickup, adminAgent, studentAgent, placeOrder };
}

const auditCount = (action: string) => prisma.auditLog.count({ where: { action } });

describe('Phân quyền quản trị', () => {
  it('sinh viên & chủ quầy bị chặn (403) ở mọi API quản trị', async () => {
    const { studentAgent } = await setup();
    const vendorAgent = await loginAs('vendor@test.local');
    for (const path of ['/dashboard', '/stalls', '/categories', '/pickup-locations', '/orders', '/reviews', '/audit-logs']) {
      expect((await studentAgent.get(`${API}/admin${path}`)).status).toBe(403);
      expect((await vendorAgent.get(`${API}/admin${path}`)).status).toBe(403);
    }
    expect((await request(app).get(`${API}/admin/dashboard`)).status).toBe(401);
  });

  it('dashboard trả về số liệu tổng quan', async () => {
    const { adminAgent, placeOrder } = await setup();
    await placeOrder();
    const res = await adminAgent.get(`${API}/admin/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      users: { total: 4, byRole: { ADMIN: 1, STUDENT: 2, VENDOR: 1 }, suspended: 0 },
      stalls: { active: 1, inactive: 0 },
      orders: { today: 1, active: 1 },
    });
    expect(res.body.data.series).toHaveLength(14);
  });
});

describe('Quầy ăn & nhân viên', () => {
  it('tạo quầy: slug tự sinh từ tên tiếng Việt và không trùng', async () => {
    const { adminAgent } = await setup();
    const a = await adminAgent.post(`${API}/admin/stalls`).send({ name: 'Bún Bò Đông Ba', location: 'Tòa C' });
    const b = await adminAgent.post(`${API}/admin/stalls`).send({ name: 'Bún bò đông ba', location: 'Tòa D' });
    expect(a.status).toBe(201);
    expect(a.body.data.stall.slug).toBe('bun-bo-dong-ba');
    expect(b.body.data.stall.slug).toBe('bun-bo-dong-ba-2');
    expect((await request(app).get(`${API}/stalls/bun-bo-dong-ba`)).status).toBe(200);
  });

  it('tắt quầy: ẩn khỏi trang công khai và gỡ món khỏi giỏ hàng', async () => {
    const { adminAgent, studentAgent, stall, rice } = await setup();
    await studentAgent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ isActive: false })).status).toBe(200);
    expect((await request(app).get(`${API}/stalls/${stall.slug}`)).status).toBe(404);
    expect((await studentAgent.get(`${API}/cart`)).body.data.items).toHaveLength(0);
  });

  it('gán nhân viên bằng email: chỉ người có vai trò Chủ quầy; gỡ ra thì mất quyền', async () => {
    const { adminAgent, stall } = await setup();
    expect((await adminAgent.post(`${API}/admin/stalls/${stall.id}/members`).send({ email: 'sv@test.local' })).status).toBe(422);

    const newVendor = await createUser({ role: 'VENDOR', email: 'nv@test.local' });
    const add = await adminAgent.post(`${API}/admin/stalls/${stall.id}/members`).send({ email: 'nv@test.local', role: 'STAFF' });
    expect(add.status).toBe(201);
    expect(add.body.data.stall.memberships.map((m: { user: { email: string } }) => m.user.email)).toContain('nv@test.local');
    expect((await adminAgent.post(`${API}/admin/stalls/${stall.id}/members`).send({ email: 'nv@test.local' })).status).toBe(409);

    const staffAgent = await loginAs('nv@test.local');
    expect((await staffAgent.get(`${API}/vendor/stalls/${stall.id}/orders`)).status).toBe(200);

    expect((await adminAgent.delete(`${API}/admin/stalls/${stall.id}/members/${newVendor.id}`)).status).toBe(200);
    expect((await staffAgent.get(`${API}/vendor/stalls/${stall.id}/orders`)).status).toBe(404);
    expect(await auditCount('STALL_MEMBER_ADD')).toBe(1);
    expect(await auditCount('STALL_MEMBER_REMOVE')).toBe(1);
  });
});

describe('Danh mục & điểm nhận', () => {
  it('danh mục: tạo, trùng tên 409, không xoá được khi còn món, tắt thì món bị ẩn', async () => {
    const { adminAgent, category } = await setup();
    const created = await adminAgent.post(`${API}/admin/categories`).send({ name: 'Đồ uống', icon: 'cup-soda', sortOrder: 2 });
    expect(created.status).toBe(201);
    expect(created.body.data.category.slug).toBe('do-uong');
    expect((await adminAgent.post(`${API}/admin/categories`).send({ name: 'Đồ uống' })).status).toBe(409);

    expect((await adminAgent.delete(`${API}/admin/categories/${category.id}`)).status).toBe(422);
    expect((await adminAgent.delete(`${API}/admin/categories/${created.body.data.category.id}`)).status).toBe(200);

    await adminAgent.patch(`${API}/admin/categories/${category.id}`).send({ isActive: false });
    expect((await request(app).get(`${API}/menu-items`)).body.meta.total).toBe(0);
  });

  it('điểm nhận: tắt thì không đặt đơn tới đó được', async () => {
    const { adminAgent, studentAgent, pickup, rice } = await setup();
    const extra = await adminAgent.post(`${API}/admin/pickup-locations`).send({ name: 'Thư viện', building: 'Thư viện' });
    expect(extra.status).toBe(201);
    await adminAgent.patch(`${API}/admin/pickup-locations/${pickup.id}`).send({ isActive: false });
    expect((await request(app).get(`${API}/pickup-locations`)).body.data.map((p: { name: string }) => p.name)).toEqual(['Thư viện']);

    await studentAgent.post(`${API}/cart/items`).send({ menuItemId: rice.id });
    expect((await studentAgent.post(`${API}/orders`).send({ pickupLocationId: pickup.id, idempotencyKey: `pk-${Date.now()}` })).status).toBe(422);
  });
});

describe('Đơn hàng toàn hệ thống', () => {
  it('lọc đơn, xem chi tiết, huỷ đơn có lý do theo máy trạng thái', async () => {
    const { adminAgent, placeOrder, stall } = await setup();
    const orderId = await placeOrder();

    const list = await adminAgent.get(`${API}/admin/orders?status=PENDING&stallId=${stall.id}`);
    expect(list.body.data.map((o: { id: number }) => o.id)).toEqual([orderId]);
    expect(list.body.data[0].nextStatuses).toEqual(['ACCEPTED', 'REJECTED', 'CANCELLED']);

    expect((await adminAgent.patch(`${API}/admin/orders/${orderId}/status`).send({ status: 'COMPLETED' })).status).toBe(422);
    const cancelled = await adminAgent.patch(`${API}/admin/orders/${orderId}/status`).send({ status: 'CANCELLED', reason: 'Quầy mất điện' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: 'Quầy mất điện' });
    expect(await auditCount('ORDER_STATUS_CHANGE')).toBe(1);
  });
});

describe('Đánh giá & kiểm duyệt', () => {
  async function completedOrder(ctx: Awaited<ReturnType<typeof setup>>) {
    const orderId = await ctx.placeOrder();
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']) {
      await ctx.adminAgent.patch(`${API}/admin/orders/${orderId}/status`).send({ status });
    }
    return orderId;
  }

  it('sinh viên chỉ đánh giá được đơn đã hoàn thành của mình, mỗi đơn một lần', async () => {
    const ctx = await setup();
    const pending = await ctx.placeOrder();
    expect((await ctx.studentAgent.post(`${API}/orders/${pending}/review`).send({ rating: 5 })).status).toBe(422);

    const done = await completedOrder(ctx);
    expect((await ctx.studentAgent.post(`${API}/orders/${done}/review`).send({ rating: 6 })).status).toBe(400);
    const ok = await ctx.studentAgent.post(`${API}/orders/${done}/review`).send({ rating: 4, comment: 'Ngon' });
    expect(ok.status).toBe(201);
    expect((await ctx.studentAgent.post(`${API}/orders/${done}/review`).send({ rating: 5 })).status).toBe(409);

    const other = await loginAs('sv2@test.local');
    expect((await other.post(`${API}/orders/${done}/review`).send({ rating: 1 })).status).toBe(404);

    const stall = await request(app).get(`${API}/stalls/${ctx.stall.slug}`);
    expect(stall.body.data.stall.rating).toEqual({ average: 4, count: 1 });
    expect((await ctx.studentAgent.get(`${API}/orders/${done}`)).body.data.order.review).toMatchObject({ rating: 4 });
  });

  it('báo cáo đánh giá → admin ẩn → biến mất khỏi trang quầy và điểm trung bình', async () => {
    const ctx = await setup();
    const done = await completedOrder(ctx);
    const review = (await ctx.studentAgent.post(`${API}/orders/${done}/review`).send({ rating: 1, comment: 'Nội dung xấu' })).body.data.review;

    expect((await ctx.studentAgent.post(`${API}/reviews/${review.id}/report`).send({ reason: 'Tự báo cáo mình' })).status).toBe(422);
    const other = await loginAs('sv2@test.local');
    expect((await other.post(`${API}/reviews/${review.id}/report`).send({ reason: 'Ngôn từ không phù hợp' })).status).toBe(200);

    // Báo cáo không tự ẩn đánh giá: vẫn hiển thị cho tới khi admin quyết định
    const stillVisible = await request(app).get(`${API}/stalls/${ctx.stall.slug}`);
    expect(stillVisible.body.data.reviews).toHaveLength(1);
    expect(stillVisible.body.data.stall.rating.count).toBe(1);

    // Chủ quầy không báo cáo được đánh giá của quầy mình
    const vendorAgent = await loginAs('vendor@test.local');
    expect((await vendorAgent.post(`${API}/reviews/${review.id}/report`).send({ reason: 'Muốn xoá đánh giá xấu' })).status).toBe(403);

    const reported = await ctx.adminAgent.get(`${API}/admin/reviews?status=REPORTED`);
    expect(reported.body.data[0]).toMatchObject({ id: review.id, reportReason: 'Ngôn từ không phù hợp' });

    expect((await ctx.adminAgent.patch(`${API}/admin/reviews/${review.id}`).send({ status: 'HIDDEN' })).status).toBe(200);
    const stall = await request(app).get(`${API}/stalls/${ctx.stall.slug}`);
    expect(stall.body.data.reviews).toHaveLength(0);
    expect(stall.body.data.stall.rating.count).toBe(0);
    expect(await auditCount('REVIEW_MODERATE')).toBe(1);
  });
});

describe('Nhật ký quản trị', () => {
  it('liệt kê và lọc theo hành động, kèm người thực hiện', async () => {
    const { adminAgent } = await setup();
    await adminAgent.post(`${API}/admin/categories`).send({ name: 'Ăn vặt' });
    await adminAgent.post(`${API}/admin/pickup-locations`).send({ name: 'Cổng chính' });

    const all = await adminAgent.get(`${API}/admin/audit-logs`);
    expect(all.body.meta.total).toBe(2);
    const filtered = await adminAgent.get(`${API}/admin/audit-logs?action=CATEGORY_CREATE`);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({ action: 'CATEGORY_CREATE', entityType: 'FoodCategory', actor: { email: 'admin@test.local' } });
    expect((await adminAgent.get(`${API}/admin/audit-logs?action=XOA_HET`)).status).toBe(400);
  });
});
