import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { adminOperationsRouter } from './admin-operations.routes.js';
import { adminUsersRouter } from './admin-users.routes.js';

/**
 * API quản trị. Mọi route đều yêu cầu vai trò ADMIN (kiểm tra ở server).
 * Các thao tác thay đổi dữ liệu quan trọng được ghi vào audit_logs.
 */
export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/', adminOperationsRouter); // /dashboard, /orders, /reviews, /audit-logs
