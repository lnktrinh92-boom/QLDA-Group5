import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setupRoles() {
  const student = await createUser({ role: 'STUDENT', email: 'sv@test.local' });
  const vendorA = await createUser({ role: 'VENDOR', email: 'vendor.a@test.local' });
  const vendorB = await createUser({ role: 'VENDOR', email: 'vendor.b@test.local' });
  const admin = await createUser({ role: 'ADMIN', email: 'admin@test.local' });
  const stallA = await createStall('Quầy A', [{ userId: vendorA.id }]);
  const stallB = await createStall('Quầy B', [{ userId: vendorB.id }]);
  return { student, vendorA, vendorB, admin, stallA, stallB };
}

describe('Phân quyền API quản trị', () => {
  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).get(`${API}/admin/users`)).status).toBe(401);
  });

  it('sinh viên và chủ quầy → 403', async () => {
    await setupRoles();
    expect((await (await loginAs('sv@test.local')).get(`${API}/admin/users`)).status).toBe(403);
    expect((await (await loginAs('vendor.a@test.local')).get(`${API}/admin/users`)).status).toBe(403);
  });

  it('admin → 200, có phân trang, không lộ mật khẩu', async () => {
    await setupRoles();
    const admin = await loginAs('admin@test.local');
    const res = await admin.get(`${API}/admin/users?pageSize=2&role=VENDOR`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 2, totalPages: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('query không hợp lệ → 400', async () => {
    await setupRoles();
    const admin = await loginAs('admin@test.local');
    expect((await admin.get(`${API}/admin/users?role=HACKER`)).status).toBe(400);
  });
});

describe('Phân quyền theo quầy (vendor ownership)', () => {
  it('sinh viên không truy cập được API chủ quầy', async () => {
    await setupRoles();
    expect((await (await loginAs('sv@test.local')).get(`${API}/vendor/stalls`)).status).toBe(403);
  });

  it('chủ quầy chỉ thấy quầy của mình', async () => {
    const { stallA } = await setupRoles();
    const res = await (await loginAs('vendor.a@test.local')).get(`${API}/vendor/stalls`);
    expect(res.status).toBe(200);
    expect(res.body.data.stalls.map((s: { id: number }) => s.id)).toEqual([stallA.id]);
  });

  it('chủ quầy A KHÔNG xem được quầy B (404), nhưng xem được quầy A', async () => {
    const { stallA, stallB } = await setupRoles();
    const vendorA = await loginAs('vendor.a@test.local');
    expect((await vendorA.get(`${API}/vendor/stalls/${stallB.id}`)).status).toBe(404);
    expect((await vendorA.get(`${API}/vendor/stalls/${stallA.id}`)).status).toBe(200);
  });

  it('admin xem được mọi quầy', async () => {
    const { stallB } = await setupRoles();
    const admin = await loginAs('admin@test.local');
    expect((await admin.get(`${API}/vendor/stalls/${stallB.id}`)).status).toBe(200);
    expect((await admin.get(`${API}/vendor/stalls`)).body.data.stalls).toHaveLength(2);
  });

  it('/auth/me của chủ quầy trả về danh sách quầy được quản lý', async () => {
    const { stallA } = await setupRoles();
    const me = await (await loginAs('vendor.a@test.local')).get(`${API}/auth/me`);
    expect(me.body.data.user.stalls).toEqual([expect.objectContaining({ id: stallA.id, role: 'OWNER' })]);
  });
});
