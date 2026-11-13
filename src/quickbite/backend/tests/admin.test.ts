import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase, TEST_PASSWORD } from './helpers.js';

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
    for (const path of ['/dashboard', '/users', '/stalls', '/categories', '/pickup-locations', '/orders', '/reviews', '/audit-logs']) {
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

describe('Quản lý người dùng', () => {
  it('tạo tài khoản chủ quầy, ghi nhật ký; email trùng → 409', async () => {
    const { adminAgent } = await setup();
    const res = await adminAgent.post(`${API}/admin/users`).send({ fullName: 'Chủ Quầy Mới', email: 'Moi@Test.local', password: 'Matkhau123', role: 'VENDOR' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'moi@test.local', role: 'VENDOR' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    expect(await auditCount('USER_CREATE')).toBe(1);
    await expect(loginAs('moi@test.local', 'Matkhau123')).resolves.toBeDefined();

    expect((await adminAgent.post(`${API}/admin/users`).send({ fullName: 'Trùng', email: 'moi@test.local', password: 'Matkhau123', role: 'STUDENT' })).status).toBe(409);
  });

  it('khoá tài khoản: phiên đang mở bị đăng xuất ngay, không đăng nhập lại được', async () => {
    const { adminAgent, studentAgent, student } = await setup();
    const res = await adminAgent.patch(`${API}/admin/users/${student.id}`).send({ status: 'SUSPENDED' });
    expect(res.status).toBe(200);
    expect((await studentAgent.get(`${API}/auth/me`)).status).toBe(401);
    expect((await request(app).post(`${API}/auth/login`).send({ email: 'sv@test.local', password: TEST_PASSWORD })).status).toBe(403);
    expect(await auditCount('USER_STATUS_CHANGE')).toBe(1);
  });

  it('không tự khoá / tự hạ quyền; luôn còn ít nhất một admin', async () => {
    const { adminAgent, admin } = await setup();
    expect((await adminAgent.patch(`${API}/admin/users/${admin.id}`).send({ status: 'SUSPENDED' })).status).toBe(422);
    expect((await adminAgent.patch(`${API}/admin/users/${admin.id}`).send({ role: 'STUDENT' })).status).toBe(422);

    // Có admin thứ hai: được hạ quyền admin đó, nhưng không được hạ admin cuối cùng
    const admin2 = await createUser({ role: 'ADMIN', email: 'admin2@test.local' });
    expect((await adminAgent.patch(`${API}/admin/users/${admin2.id}`).send({ role: 'STUDENT' })).status).toBe(200);
  });

  it('hai admin hạ quyền lẫn nhau cùng lúc: vẫn còn ít nhất một admin', async () => {
    const { adminAgent, admin } = await setup();
    const admin2 = await createUser({ role: 'ADMIN', email: 'admin2@test.local' });
    const admin2Agent = await loginAs('admin2@test.local');
    const [a, b] = await Promise.all([
      adminAgent.patch(`${API}/admin/users/${admin2.id}`).send({ status: 'SUSPENDED' }),
      admin2Agent.patch(`${API}/admin/users/${admin.id}`).send({ status: 'SUSPENDED' }),
    ]);
    expect([a.status, b.status]).toContain(200);
    expect(await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).toBeGreaterThanOrEqual(1);
  });

  it('ảnh quầy chỉ nhận ảnh tự tải lên hoặc tên miền được phép', async () => {
    const { adminAgent, stall } = await setup();
    const tracker = await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: 'https://tracker.example.com/pixel.gif' });
    expect(tracker.status).toBe(400);
    const allowed = await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: 'https://images.unsplash.com/photo-1?w=800' });
    expect(allowed.status).toBe(200);
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: '/uploads/../../.env' })).status).toBe(400);
    // Ảnh có sẵn trong giao diện (frontend/public/images)
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: '/images/food/pho-bo-tai.webp' })).status).toBe(200);
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: '/images/../.env' })).status).toBe(400);
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}`).send({ imageUrl: '/images/food/x.svg' })).status).toBe(400);
  });

  it('đổi vai trò chủ quầy → sinh viên thì gỡ khỏi quầy', async () => {
    const { adminAgent, vendor } = await setup();
    const res = await adminAgent.patch(`${API}/admin/users/${vendor.id}`).send({ role: 'STUDENT' });
    expect(res.body.data.user).toMatchObject({ role: 'STUDENT', stalls: [] });
    expect(await prisma.vendorMembership.count({ where: { userId: vendor.id } })).toBe(0);
  });

  it('đặt lại mật khẩu: mật khẩu cũ hết hiệu lực', async () => {
    const { adminAgent, studentAgent, student } = await setup();
    expect((await adminAgent.post(`${API}/admin/users/${student.id}/reset-password`).send({ newPassword: 'MatKhauMoi9' })).status).toBe(200);
    expect((await studentAgent.get(`${API}/auth/me`)).status).toBe(401);
    await expect(loginAs('sv@test.local', 'MatKhauMoi9')).resolves.toBeDefined();
    await expect(loginAs('sv@test.local')).rejects.toThrow();
  });

  it('danh sách: tìm theo q (tên / email / mã SV), lọc vai trò + trạng thái, phân trang đúng tổng số và số trang', async () => {
    const { adminAgent, student, student2 } = await setup();
    await prisma.user.update({ where: { id: student.id }, data: { fullName: 'Nguyễn Văn An', studentCode: 'SV2024001' } });
    await prisma.user.update({ where: { id: student2.id }, data: { fullName: 'Trần Thị Bình', status: 'SUSPENDED' } });
    for (let i = 1; i <= 5; i++) await createUser({ role: 'STUDENT', email: `them${i}@test.local` });
    const list = (qs: string) => adminAgent.get(`${API}/admin/users?${qs}`);
    const emails = async (qs: string) => (await list(qs)).body.data.map((u: { email: string }) => u.email);

    // Tìm không dấu, không phân biệt hoa thường; theo tên, email, mã SV; "search" (tên cũ) vẫn dùng được
    expect(await emails('q=nguyen van an')).toEqual(['sv@test.local']);
    expect(await emails('q=SV2@TEST')).toEqual(['sv2@test.local']);
    expect(await emails('q=sv2024001')).toEqual(['sv@test.local']);
    expect(await emails('search=tran thi binh')).toEqual(['sv2@test.local']);

    // Lọc vai trò, trạng thái và kết hợp với từ khoá
    expect((await list('role=STUDENT')).body.meta.total).toBe(7);
    expect(await emails('status=SUSPENDED')).toEqual(['sv2@test.local']);
    expect((await list('role=STUDENT&status=ACTIVE')).body.meta.total).toBe(6);
    expect(await emails('q=test.local&role=VENDOR')).toEqual(['vendor@test.local']);

    // Phân trang: 9 tài khoản, 4 / trang → 3 trang, không trùng, không sót
    const ids: number[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await list(`pageSize=4&page=${page}`);
      expect(res.body.meta).toEqual({ page, pageSize: 4, total: 9, totalPages: 3 });
      ids.push(...res.body.data.map((u: { id: number }) => u.id));
    }
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect((await list('pageSize=4&page=4')).body.data).toEqual([]);

    // Tham số sai → 400, thông báo tiếng Việt
    const long = await list(`q=${'a'.repeat(101)}`);
    expect(long.status).toBe(400);
    expect(long.body.error.details).toEqual([{ field: 'q', message: 'Từ khoá tối đa 100 ký tự' }]);
    expect((await list('pageSize=0')).status).toBe(400);
    expect((await list('status=DELETED')).status).toBe(400);
  });

  it('khoá rồi mở khoá: đăng nhập lại được; đổi vai trò; người không phải admin sửa người dùng → 403', async () => {
    const { adminAgent, studentAgent, student2 } = await setup();
    const vendorAgent = await loginAs('vendor@test.local');
    expect((await studentAgent.patch(`${API}/admin/users/${student2.id}`).send({ status: 'SUSPENDED' })).status).toBe(403);
    expect((await vendorAgent.patch(`${API}/admin/users/${student2.id}`).send({ role: 'ADMIN' })).status).toBe(403);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: student2.id } })).toMatchObject({ status: 'ACTIVE', role: 'STUDENT' });

    expect((await adminAgent.patch(`${API}/admin/users/${student2.id}`).send({ status: 'SUSPENDED' })).body.data.user.status).toBe('SUSPENDED');
    await expect(loginAs('sv2@test.local')).rejects.toThrow();
    expect((await adminAgent.patch(`${API}/admin/users/${student2.id}`).send({ status: 'ACTIVE' })).body.data.user.status).toBe('ACTIVE');
    await expect(loginAs('sv2@test.local')).resolves.toBeDefined();

    expect((await adminAgent.patch(`${API}/admin/users/${student2.id}`).send({ role: 'VENDOR' })).body.data.user.role).toBe('VENDOR');
    expect(await auditCount('USER_STATUS_CHANGE')).toBe(2);
    expect(await auditCount('USER_ROLE_CHANGE')).toBe(1);
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

  it('mỗi quầy đúng 1 chủ quầy: tạo kèm chủ quầy, không thêm chủ quầy thứ 2, chuyển quyền, không gỡ / hạ chủ quầy duy nhất', async () => {
    const { adminAgent, stall, vendor } = await setup();
    const staff = await createUser({ role: 'VENDOR', email: 'nv2@test.local' });
    await createUser({ role: 'VENDOR', email: 'chu.moi@test.local' });
    const owners = (stallId: number) => prisma.vendorMembership.findMany({ where: { stallId, role: 'OWNER' }, select: { userId: true } });

    // Tạo quầy kèm chủ quầy; người chưa có vai trò Chủ quầy → 422, quầy không được tạo
    const created = await adminAgent.post(`${API}/admin/stalls`).send({ name: 'Quầy Mới', location: 'Tòa B', ownerEmail: 'Chu.Moi@test.local' });
    expect(created.status).toBe(201);
    expect(created.body.data.stall.memberships).toMatchObject([{ role: 'OWNER', user: { email: 'chu.moi@test.local' } }]);
    expect((await adminAgent.post(`${API}/admin/stalls`).send({ name: 'Quầy Lỗi', location: 'Tòa B', ownerEmail: 'sv@test.local' })).status).toBe(422);
    expect(await prisma.foodStall.count({ where: { name: 'Quầy Lỗi' } })).toBe(0);

    // Quầy A đã có chủ quầy → không thêm chủ quầy thứ 2, thêm làm nhân viên thì được
    const second = await adminAgent.post(`${API}/admin/stalls/${stall.id}/members`).send({ email: 'nv2@test.local', role: 'OWNER' });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/Mỗi quầy chỉ có 1 chủ quầy/);
    expect((await adminAgent.post(`${API}/admin/stalls/${stall.id}/members`).send({ email: 'nv2@test.local', role: 'STAFF' })).status).toBe(201);

    // Không hạ / gỡ chủ quầy duy nhất
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}/members/${vendor.id}`).send({ role: 'STAFF' })).status).toBe(422);
    expect((await adminAgent.delete(`${API}/admin/stalls/${stall.id}/members/${vendor.id}`)).status).toBe(422);
    expect(await owners(stall.id)).toEqual([{ userId: vendor.id }]);

    // Chuyển quyền: nhân viên lên chủ quầy, chủ quầy cũ thành nhân viên → gỡ được
    expect((await adminAgent.patch(`${API}/admin/stalls/${stall.id}/members/${staff.id}`).send({ role: 'OWNER' })).status).toBe(200);
    expect(await owners(stall.id)).toEqual([{ userId: staff.id }]);
    expect(await prisma.vendorMembership.findFirstOrThrow({ where: { stallId: stall.id, userId: vendor.id } })).toMatchObject({ role: 'STAFF' });
    expect((await adminAgent.delete(`${API}/admin/stalls/${stall.id}/members/${vendor.id}`)).status).toBe(200);
    expect(await owners(stall.id)).toEqual([{ userId: staff.id }]);

    // Quầy chưa có chủ quầy, hai admin gán chủ quầy cùng lúc → chỉ một người thành công
    const empty = (await adminAgent.post(`${API}/admin/stalls`).send({ name: 'Quầy Trống', location: 'Tòa C' })).body.data.stall;
    const [a, b] = await Promise.all([
      adminAgent.post(`${API}/admin/stalls/${empty.id}/members`).send({ email: 'nv2@test.local', role: 'OWNER' }),
      adminAgent.post(`${API}/admin/stalls/${empty.id}/members`).send({ email: 'vendor@test.local', role: 'OWNER' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await owners(empty.id)).toHaveLength(1);
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

  it('điểm nhận: chỉ xoá cứng khi chưa có đơn; đã có đơn → 422, tắt thay vì xoá', async () => {
    const { adminAgent, placeOrder, pickup } = await setup();
    const unused = (await adminAgent.post(`${API}/admin/pickup-locations`).send({ name: 'Cổng phụ' })).body.data.location;
    expect((await adminAgent.delete(`${API}/admin/pickup-locations/${unused.id}`)).status).toBe(200);
    expect(await prisma.campusPickupLocation.count({ where: { id: unused.id } })).toBe(0);

    await placeOrder();
    const used = await adminAgent.delete(`${API}/admin/pickup-locations/${pickup.id}`);
    expect(used.status).toBe(422);
    expect(used.body.error.message).toBe('Điểm nhận đã có đơn hàng. Hãy tắt điểm nhận thay vì xoá để giữ lịch sử.');
    expect(await prisma.campusPickupLocation.count({ where: { id: pickup.id } })).toBe(1);
    expect((await adminAgent.patch(`${API}/admin/pickup-locations/${pickup.id}`).send({ isActive: false })).body.data.location.isActive).toBe(false);

    expect((await adminAgent.delete(`${API}/admin/pickup-locations/999999`)).status).toBe(404);
    expect(await auditCount('PICKUP_LOCATION_DELETE')).toBe(1);
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
