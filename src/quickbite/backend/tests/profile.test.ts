import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API, TEST_PASSWORD, app, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const fieldsOf = (res: request.Response) => (res.body.error?.details ?? []).map((d: { field: string }) => d.field);

describe('Hồ sơ cá nhân — PATCH /users/me', () => {
  it('chưa đăng nhập → 401 cho cả sửa hồ sơ và đổi mật khẩu', async () => {
    expect((await request(app).patch(`${API}/users/me`).send({ fullName: 'Ai Đó' })).status).toBe(401);
    expect((await request(app).patch(`${API}/users/me/password`).send({})).status).toBe(401);
  });

  it('cập nhật họ tên (tự bỏ khoảng trắng thừa), số điện thoại, mã sinh viên; /auth/me thấy ngay', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me`).send({ fullName: '  Nguyễn Thị Hoa  ', phone: '0912345678', studentCode: 'SV2024001' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ fullName: 'Nguyễn Thị Hoa', phone: '0912345678', studentCode: 'SV2024001' });
    expect((await agent.get(`${API}/auth/me`)).body.data.user.fullName).toBe('Nguyễn Thị Hoa');
  });

  it('PATCH chỉ sửa trường được gửi: gửi mỗi họ tên thì số điện thoại, mã sinh viên giữ nguyên', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    await agent.patch(`${API}/users/me`).send({ fullName: 'Tên Cũ', phone: '0912345678', studentCode: 'SV2024001' });

    const onlyName = await agent.patch(`${API}/users/me`).send({ fullName: 'Tên Mới' });
    expect(onlyName.status).toBe(200);
    expect(onlyName.body.data.user).toMatchObject({ fullName: 'Tên Mới', phone: '0912345678', studentCode: 'SV2024001' });

    const onlyPhone = await agent.patch(`${API}/users/me`).send({ phone: '' });
    expect(onlyPhone.body.data.user).toMatchObject({ fullName: 'Tên Mới', phone: null, studentCode: 'SV2024001' });

    // Gửi body rỗng: không đổi gì
    expect((await agent.patch(`${API}/users/me`).send({})).body.data.user).toMatchObject({ fullName: 'Tên Mới', studentCode: 'SV2024001' });
  });

  it('KHÔNG đổi được email, vai trò, trạng thái qua API hồ sơ (các trường này bị bỏ qua)', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent
      .patch(`${API}/users/me`)
      .send({ fullName: 'Tên Hợp Lệ', email: 'hacker@test.local', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0, passwordHash: 'x' });
    expect(res.status).toBe(200);
    const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(db).toMatchObject({ email: 'sv@test.local', role: 'STUDENT', fullName: 'Tên Hợp Lệ' });
    expect(db.passwordHash).not.toBe('x');
    expect((await agent.get(`${API}/admin/users`)).status).toBe(403);
  });

  it('dữ liệu sai → 400, báo lỗi đúng từng trường bằng tiếng Việt', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me`).send({ fullName: 'A', phone: '12345', studentCode: 'S' });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toEqual(expect.arrayContaining(['fullName', 'phone', 'studentCode']));
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { field: 'fullName', message: 'Họ tên phải có ít nhất 2 ký tự' },
        { field: 'phone', message: 'Số điện thoại không hợp lệ (vd: 0901234567)' },
        { field: 'studentCode', message: 'Mã sinh viên quá ngắn' },
      ]),
    );
  });

  it('phản hồi không bao giờ chứa mật khẩu, hash hay tokenVersion', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me`).send({ fullName: 'Tên Mới' });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/);
  });
});

describe('Đổi mật khẩu — PATCH /users/me/password', () => {
  it('thành công → thông báo tiếng Việt, cấp cookie mới; mật khẩu cũ không đăng nhập được nữa', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me/password`).send({ currentPassword: TEST_PASSWORD, newPassword: 'MatKhauMoi2' });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Đổi mật khẩu thành công. Các thiết bị khác đã bị đăng xuất.');
    expect(String(res.headers['set-cookie'])).toMatch(/qb_session=.+HttpOnly/);
    await expect(loginAs('sv@test.local')).rejects.toThrow();
    await expect(loginAs('sv@test.local', 'MatKhauMoi2')).resolves.toBeDefined();
  });

  it('sai mật khẩu hiện tại → 400 tại ô currentPassword; KHÔNG đăng xuất các thiết bị khác', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const other = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me/password`).send({ currentPassword: 'SaiMatKhau1', newPassword: 'MatKhauMoi2' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' }]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(0);
    expect((await other.get(`${API}/auth/me`)).status).toBe(200);
  });

  it('mật khẩu mới yếu hoặc trùng mật khẩu cũ → 400 tại ô newPassword', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const weak = await agent.patch(`${API}/users/me/password`).send({ currentPassword: TEST_PASSWORD, newPassword: 'chiCoChu' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details).toEqual([{ field: 'newPassword', message: 'Mật khẩu phải có ít nhất 1 chữ số' }]);

    const same = await agent.patch(`${API}/users/me/password`).send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });
    expect(same.status).toBe(400);
    expect(same.body.error.details).toEqual([{ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại' }]);
  });

  it('bỏ trống → 400, không đổi gì', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me/password`).send({});
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toEqual(expect.arrayContaining(['currentPassword', 'newPassword']));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(0);
  });

  it('mật khẩu mới được lưu dạng hash bcrypt, không lưu chữ thường', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    await agent.patch(`${API}/users/me/password`).send({ currentPassword: TEST_PASSWORD, newPassword: 'MatKhauMoi2' });
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(passwordHash).not.toContain('MatKhauMoi2');
  });
});
