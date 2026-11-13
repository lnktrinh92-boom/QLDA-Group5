import type { Prisma, PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Tên hành động ghi vào audit_logs (dùng để lọc trong trang nhật ký) */
export const AUDIT_ACTIONS = [
  'USER_CREATE',
  'USER_UPDATE',
  'USER_STATUS_CHANGE',
  'USER_ROLE_CHANGE',
  'USER_PASSWORD_RESET',
  'STALL_CREATE',
  'STALL_UPDATE',
  'STALL_MEMBER_ADD',
  'STALL_MEMBER_UPDATE',
  'STALL_MEMBER_REMOVE',
  'CATEGORY_CREATE',
  'CATEGORY_UPDATE',
  'CATEGORY_DELETE',
  'PICKUP_LOCATION_CREATE',
  'PICKUP_LOCATION_UPDATE',
  'PICKUP_LOCATION_DELETE',
  'ORDER_STATUS_CHANGE',
  'REVIEW_MODERATE',
  /** Ghi bởi script nạp dữ liệu mẫu (prisma/seed.ts) */
  'SEED_DATABASE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

interface AuditInput {
  req: Request;
  action: AuditAction;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Prisma.InputJsonValue;
}

/** Ghi nhật ký thao tác quản trị. Truyền `db` là transaction để nhật ký và thay đổi cùng thành công / thất bại */
export function audit({ req, action, entityType, entityId, metadata }: AuditInput, db: Db = prisma) {
  return db.auditLog.create({
    data: {
      actorId: req.user?.id ?? null,
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      metadata,
      ipAddress: req.ip?.slice(0, 45) ?? null,
    },
  });
}
