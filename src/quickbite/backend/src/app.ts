// Câu báo lỗi kiểm tra dữ liệu mặc định bằng tiếng Việt (phải nạp trước mọi schema)
import './config/zod-vi.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { apiDocsEnabled, env, isTest } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { csrfGuard } from './middlewares/csrf.js';
import { apiRateLimiter } from './middlewares/rate-limit.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Chỉ tin X-Forwarded-For khi thật sự có reverse proxy phía trước (xem TRUST_PROXY trong .env)
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      // Cho phép frontend (khác cổng) hiển thị ảnh tải lên từ /uploads
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS chỉ cho phép các origin khai báo rõ trong .env, kèm cookie
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  }

  // Ảnh đã tải lên. Ảnh không tồn tại → rơi xuống notFoundHandler (404)
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { index: false, dotfiles: 'deny', maxAge: '7d' }));
  // Tài liệu API (Swagger UI) — mặc định chỉ bật khi phát triển
  if (apiDocsEnabled) {
    app.get('/api/v1/openapi.json', (_req, res) => res.json(openApiSpec));
    // Trên Vercel (serverless) các file tĩnh của swagger-ui-dist không được đóng gói kèm,
    // nên tải CSS/JS giao diện Swagger từ CDN (đúng phiên bản đang cài) và nới CSP cho riêng /api/docs
    const onVercel = Boolean(process.env.VERCEL);
    const SWAGGER_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.3';
    if (onVercel) {
      app.use(
        '/api/docs',
        helmet.contentSecurityPolicy({
          directives: {
            scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          },
        }),
      );
    }
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customSiteTitle: 'QuickBite API — Tài liệu',
        swaggerOptions: { persistAuthorization: true, withCredentials: true, docExpansion: 'none', tagsSorter: 'alpha' },
        ...(onVercel && {
          customCssUrl: `${SWAGGER_CDN}/swagger-ui.css`,
          customJs: [`${SWAGGER_CDN}/swagger-ui-bundle.js`, `${SWAGGER_CDN}/swagger-ui-standalone-preset.js`],
        }),
      }),
    );
  }

  app.use('/api/v1', apiRateLimiter, csrfGuard, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
