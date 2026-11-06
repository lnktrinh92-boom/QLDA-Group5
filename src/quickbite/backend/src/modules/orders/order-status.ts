import type { OrderStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';

/**
 * Máy trạng thái đơn hàng (xem docs/business-rules.md).
 *   PENDING → ACCEPTED → PREPARING → READY_FOR_PICKUP → COMPLETED
 *   PENDING → REJECTED | CANCELLED,  ACCEPTED → CANCELLED
 *
 * actor:
 *   - 'STUDENT_OWNER': sinh viên chủ đơn
 *   - 'STALL_STAFF'  : nhân viên của đúng quầy nhận đơn
 *   - 'ADMIN'
 */
export type OrderActor = 'STUDENT_OWNER' | 'STALL_STAFF' | 'ADMIN';

interface Transition {
  to: OrderStatus;
  actors: OrderActor[];
  /** Bắt buộc nhập lý do */
  requiresReason?: boolean;
}

export const ORDER_TRANSITIONS: Record<OrderStatus, Transition[]> = {
  PENDING: [
    { to: 'ACCEPTED', actors: ['STALL_STAFF', 'ADMIN'] },
    { to: 'REJECTED', actors: ['STALL_STAFF', 'ADMIN'], requiresReason: true },
    { to: 'CANCELLED', actors: ['STUDENT_OWNER', 'ADMIN'] },
  ],
  ACCEPTED: [
    { to: 'PREPARING', actors: ['STALL_STAFF', 'ADMIN'] },
    { to: 'CANCELLED', actors: ['STALL_STAFF', 'ADMIN'], requiresReason: true },
  ],
  PREPARING: [{ to: 'READY_FOR_PICKUP', actors: ['STALL_STAFF', 'ADMIN'] }],
  READY_FOR_PICKUP: [{ to: 'COMPLETED', actors: ['STALL_STAFF', 'ADMIN'] }],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'];
export const FINAL_STATUSES: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED'];

export function findTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): Transition | undefined {
  return ORDER_TRANSITIONS[from].find((t) => t.to === to && t.actors.includes(actor));
}

/** Các trạng thái tiếp theo mà actor được phép chuyển tới */
export function allowedNextStatuses(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return ORDER_TRANSITIONS[from].filter((t) => t.actors.includes(actor)).map((t) => t.to);
}

/** Đơn chuyển khoản VietQR chưa nhận được tiền: quầy chưa được nhận đơn */
export const isAwaitingTransfer = (order: { paymentMethod: PaymentMethod; paymentStatus: PaymentStatus }) =>
  order.paymentMethod === 'VIETQR' && order.paymentStatus === 'UNPAID';

/**
 * Các bước tiếp theo hợp lệ, có tính tới thanh toán:
 * - Đơn VietQR chưa thanh toán: quầy chưa được "Nhận đơn" (chỉ từ chối được)
 * - Đơn đã thanh toán chuyển khoản: sinh viên không tự huỷ (phải liên hệ quầy để được hoàn tiền)
 */
export function nextStatusesFor(
  order: { status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus },
  actor: OrderActor,
): OrderStatus[] {
  return allowedNextStatuses(order.status, actor).filter((to) => {
    if (to === 'ACCEPTED' && isAwaitingTransfer(order)) return false;
    if (to === 'CANCELLED' && actor === 'STUDENT_OWNER' && order.paymentStatus === 'PAID') return false;
    return true;
  });
}

export function actorForRole(role: Role, isOwner: boolean, isStallStaff: boolean): OrderActor | null {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'VENDOR' && isStallStaff) return 'STALL_STAFF';
  if (role === 'STUDENT' && isOwner) return 'STUDENT_OWNER';
  return null;
}

/** Nhãn tiếng Việt dùng trong thông báo gửi người dùng */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Chờ quầy xác nhận',
  ACCEPTED: 'Quầy đã nhận đơn',
  PREPARING: 'Đang chuẩn bị',
  READY_FOR_PICKUP: 'Sẵn sàng để nhận',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã huỷ',
  REJECTED: 'Bị từ chối',
};
