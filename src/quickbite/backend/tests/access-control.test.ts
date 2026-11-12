import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API, app, createStall, createUser, loginAs, prisma, request, resetDatabase } from './helpers.js';
import { env } from '../src/config/env.js';
import { createAuthRateLimiter } from '../src/middlewares/rate-limit.js';
import { signSessionToken } from '../src/lib/jwt.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const cookieOf = (token: string) => `qb_session=${token}`;

describe('Middleware phân quyền: vai trò đọc từ DB ở MỖI request', () => {
  it('admin bị hạ xuống sinh viên → mất quyền quản trị ngay, không cần đăng nhập lại', async () => {
    const admin = await createUser({ role: 'ADMIN', email: 'admin@test.local' });
    const agent = await loginAs('admin@test.local');
    expect((await agent.get(`${API}/admin/users`)).status).toBe(200);

    await prisma.user.update({ where: { id: admin.id }, data: { role: 'STUDENT' } });
    expect((await agent.get(`${API}/admin/users`)).status).toBe(403);
  });

  it('nhân viên (STAFF) bị gỡ khỏi quầy → không vào được quầy đó nữa (404)', async () => {
    const staff = await createUser({ role: 'VENDOR', email: 'staff@test.local' });
    const stall = await createStall('Quầy A', [{ userId: staff.id, role: 'STAFF' }]);
    const agent = await loginAs('staff@test.local');
    expect((await agent.get(`${API}/vendor/stalls/${stall.id}`)).status).toBe(200);

    await prisma.vendorMembership.deleteMany({ where: { userId: staff.id } });
    expect((await agent.get(`${API}/vendor/stalls/${stall.id}`)).status).toBe(404);
  });
});

describe('tokenVersion: thu hồi phiên', () => {
  it('tăng tokenVersion → mọi phiên cũ bị 401 và cookie bị xoá', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    const res = await agent.get(`${API}/auth/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    expect(String(res.headers['set-cookie'])).toMatch(/qb_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('token mang tokenVersion cũ (dù chữ ký đúng) bị từ chối', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: 3 } });
    const old = signSessionToken({ sub: user.id, role: 'STUDENT', tv: 2 });
    const current = signSessionToken({ sub: user.id, role: 'STUDENT', tv: 3 });
    expect((await request(app).get(`${API}/auth/me`).set('Cookie', cookieOf(old))).status).toBe(401);
    expect((await request(app).get(`${API}/auth/me`).set('Cookie', cookieOf(current))).status).toBe(200);
  });
});

describe('JWT không hợp lệ', () => {
  it('token hết hạn → 401', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const expired = jwt.sign({ role: 'STUDENT', tv: 0 }, env.JWT_SECRET, { subject: String(user.id), issuer: 'quickbite-api', expiresIn: -10 });
    expect((await request(app).get(`${API}/auth/me`).set('Cookie', cookieOf(expired))).status).toBe(401);
  });

  it('ký bằng khoá khác / thuật toán "none" / tự đổi vai trò thành ADMIN → 401', async () => {
    const user = await createUser({ email: 'sv@test.local' });
    const wrongKey = jwt.sign({ role: 'ADMIN', tv: 0 }, 'khoa-gia-mao-khoa-gia-mao-khoa-gia-mao', { subject: String(user.id), issuer: 'quickbite-api' });
    const none = jwt.sign({ role: 'ADMIN', tv: 0 }, '', { subject: String(user.id), issuer: 'quickbite-api', algorithm: 'none' });
    for (const token of [wrongKey, none]) {
      expect((await request(app).get(`${API}/admin/users`).set('Cookie', cookieOf(token))).status).toBe(401);
    }
  });
});

describe('Rate limit chống dò mật khẩu', () => {
  // App nhỏ dùng ĐÚNG cấu hình của dự án nhưng giới hạn 3 lần để test nhanh
  function miniApp() {
    const mini = express();
    mini.post('/login/:ok', createAuthRateLimiter(3), (req, res) => {
      res.status(req.params.ok === 'dung' ? 200 : 401).json({ success: req.params.ok === 'dung' });
    });
    return mini;
  }

  it('sai quá số lần cho phép → 429 kèm thông báo tiếng Việt và header RateLimit', async () => {
    const mini = miniApp();
    for (let i = 0; i < 3; i++) expect((await request(mini).post('/login/sai')).status).toBe(401);
    const blocked = await request(mini).post('/login/sai');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.' } });
    expect(blocked.headers['ratelimit-policy']).toContain('q=3; w=900');
    // Đã bị chặn thì kể cả đúng mật khẩu cũng phải chờ
    expect((await request(mini).post('/login/dung')).status).toBe(429);
  });

  it('đăng nhập thành công KHÔNG bị tính vào số lần thử', async () => {
    const mini = miniApp();
    for (let i = 0; i < 5; i++) expect((await request(mini).post('/login/dung')).status).toBe(200);
    expect((await request(mini).post('/login/sai')).status).toBe(401);
  });

  it('các route đăng nhập / đăng ký / đổi mật khẩu thật đều gắn giới hạn (15 phút, theo AUTH_RATE_LIMIT_MAX)', async () => {
    await createUser({ email: 'sv@test.local' });
    const login = await request(app).post(`${API}/auth/login`).send({ email: 'sv@test.local', password: 'SaiMatKhau1' });
    const register = await request(app).post(`${API}/auth/register`).send({});
    const agent = await loginAs('sv@test.local');
    const change = await agent.patch(`${API}/users/me/password`).send({});
    for (const res of [login, register, change]) {
      expect(res.headers['ratelimit-policy']).toContain(`q=${env.AUTH_RATE_LIMIT_MAX}; w=900`);
    }
  });
});

describe('Chống CSRF', () => {
  it('PATCH / DELETE / POST từ trang web lạ bị chặn 403; GET từ trang lạ vẫn được (chỉ đọc)', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const evil = 'https://trang-gia-mao.example';
    expect((await agent.patch(`${API}/users/me`).set('Origin', evil).send({ fullName: 'Bị đổi tên' })).status).toBe(403);
    expect((await agent.delete(`${API}/cart`).set('Origin', evil)).status).toBe(403);
    expect((await agent.post(`${API}/auth/logout`).set('Origin', evil)).status).toBe(403);
    expect((await agent.get(`${API}/auth/me`).set('Origin', evil)).status).toBe(200);
    // Dữ liệu không bị đổi
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'sv@test.local' } })).fullName).not.toBe('Bị đổi tên');
  });

  it('frontend hợp lệ (CORS_ORIGINS) thao tác bình thường', async () => {
    await createUser({ email: 'sv@test.local' });
    const agent = await loginAs('sv@test.local');
    const res = await agent.patch(`${API}/users/me`).set('Origin', 'http://localhost:5173').send({ fullName: 'Tên Mới' });
    expect(res.status).toBe(200);
  });
});
