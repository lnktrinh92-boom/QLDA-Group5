import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { vendorRouter } from '../modules/vendor/vendor.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { homeRouter } from '../modules/home/home.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { stallsRouter } from '../modules/stalls/stalls.routes.js';
import { menuItemsRouter } from '../modules/menu-items/menu-items.routes.js';
import { pickupLocationsRouter } from '../modules/pickup-locations/pickup-locations.routes.js';
import { cartRouter } from '../modules/cart/cart.routes.js';
import { ordersRouter } from '../modules/orders/orders.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { reviewsRouter } from '../modules/reviews/reviews.routes.js';
import { paymentsRouter } from '../modules/payments/payments.routes.js';

export const apiRouter = Router();

// Kiểm tra API và kết nối MySQL
apiRouter.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    sendSuccess(res, { status: 'ok', database: 'connected', latencyMs: Date.now() - startedAt });
  } catch {
    res.status(503).json({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Không kết nối được tới MySQL' },
    });
  }
});

// Khám phá món ăn (công khai, không cần đăng nhập)
apiRouter.use('/home', homeRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/stalls', stallsRouter);
apiRouter.use('/menu-items', menuItemsRouter);
apiRouter.use('/pickup-locations', pickupLocationsRouter);

// Đặt món (sinh viên)
apiRouter.use('/cart', cartRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/payments', paymentsRouter);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/vendor', vendorRouter);
apiRouter.use('/admin', adminRouter);
