import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env, isTest } from '../config/env.js';

const tooManyRequests = (message: string) => ({
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message },
});

/** Giới hạn thử đăng nhập / đăng ký / đổi mật khẩu để chống dò mật khẩu (tách hàm để test với giới hạn nhỏ) */
export const createAuthRateLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Chỉ đếm các lần thất bại, đăng nhập thành công không bị tính
    skipSuccessfulRequests: true,
    message: tooManyRequests('Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.'),
  });

export const authRateLimiter = createAuthRateLimiter(env.AUTH_RATE_LIMIT_MAX);

/** Giới hạn tải ảnh: tối đa 30 ảnh / 10 phút cho mỗi người dùng (tránh làm đầy ổ đĩa) */
export const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Đếm theo người dùng đã đăng nhập (route này luôn sau authenticate), dự phòng theo IP
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
  message: tooManyRequests('Bạn tải ảnh quá nhiều. Vui lòng thử lại sau ít phút.'),
});

/** Giới hạn chung cho toàn bộ API */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: tooManyRequests('Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.'),
});
