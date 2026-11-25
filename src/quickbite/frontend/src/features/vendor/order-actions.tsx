import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCurrency } from '@/lib/utils';
import { useConfirmPayment, useUpdateOrderStatus, type OrderActionMode } from './use-update-order-status';
import type { Money, OrderStatus, PaymentMethod } from '@/types/models';

/** Nhãn nút cho từng bước chuyển trạng thái (góc nhìn của quầy) */
const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'Nhận đơn',
  PREPARING: 'Bắt đầu làm',
  READY_FOR_PICKUP: 'Món đã xong',
  COMPLETED: 'Đã giao & thu tiền',
  REJECTED: 'Từ chối',
  CANCELLED: 'Huỷ đơn',
};

/** Thông tin thanh toán để hiện đúng nút: đơn chuyển khoản chưa có tiền → nút "Đã nhận tiền" */
export interface OrderPaymentInfo {
  method: PaymentMethod;
  awaitingPayment: boolean;
  total: Money;
}

/** Các bước cần nhập lý do */
const NEEDS_REASON: OrderStatus[] = ['REJECTED', 'CANCELLED'];

/** Các nút xử lý đơn theo trạng thái tiếp theo hợp lệ (do server tính) */
export function OrderActions({
  stallId,
  orderId,
  orderNumber,
  nextStatuses,
  size = 'sm',
  mode = 'vendor',
  payment,
}: {
  stallId: number;
  orderId: number;
  orderNumber: string;
  nextStatuses: OrderStatus[];
  size?: 'sm' | 'md';
  mode?: OrderActionMode;
  payment?: OrderPaymentInfo;
}) {
  const update = useUpdateOrderStatus(stallId, mode);
  const confirmPayment = useConfirmPayment(stallId, mode);
  const [reasonFor, setReasonFor] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  const awaitingPayment = payment?.awaitingPayment ?? false;
  if (nextStatuses.length === 0 && !awaitingPayment) return null;

  const forward = nextStatuses.filter((s) => !NEEDS_REASON.includes(s));
  // Đơn chờ xác nhận chỉ cần "Từ chối", không hiện thêm "Huỷ đơn" trùng nghĩa (Design QA UI-02, VN-02).
  // "Huỷ đơn" chỉ hiện sau khi quầy đã nhận đơn.
  const negative = nextStatuses.filter((s) => NEEDS_REASON.includes(s) && !(s === 'CANCELLED' && nextStatuses.includes('REJECTED')));
  const busy = update.isPending || confirmPayment.isPending;
  // Đơn đã chuyển khoản: bước cuối chỉ là giao món, không thu tiền nữa
  const labelOf = (status: OrderStatus) => (status === 'COMPLETED' && payment?.method === 'VIETQR' ? 'Đã giao món' : ACTION_LABELS[status]);
  const transferContent = orderNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Nút bước chính (Nhận đơn, Bắt đầu làm...) lớn hơn một cỡ: cao ≥ 44px cho dễ bấm khi đứng quầy (UAT-Q01);
  // trên điện thoại kéo dài ra để vùng bấm rộng
  const primarySize = size === 'sm' ? 'md' : 'lg';
  const primaryClass = 'min-w-36 grow sm:grow-0 text-base font-bold';

  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      {awaitingPayment && (
        <Button
          size={primarySize}
          className={primaryClass}
          loading={confirmPayment.isPending}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmPaidOpen(true);
          }}
        >
          <BadgeCheck className="size-4" aria-hidden /> Đã nhận tiền
        </Button>
      )}
      {forward.map((status) => (
        <Button
          key={status}
          size={primarySize}
          className={primaryClass}
          loading={busy && update.variables?.status === status}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            update.mutate({ orderId, status });
          }}
        >
          {labelOf(status)}
        </Button>
      ))}
      {negative.map((status) => (
        <Button
          key={status}
          size={size}
          variant="outline"
          className="text-red-600 hover:bg-red-50"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            setReason('');
            setReasonError('');
            setReasonFor(status);
          }}
        >
          {ACTION_LABELS[status]}
        </Button>
      ))}

      {payment && (
        <ConfirmDialog
          open={confirmPaidOpen}
          title={`Xác nhận đã nhận tiền đơn ${orderNumber}?`}
          description={`Chỉ xác nhận sau khi app ngân hàng của quầy báo đã nhận ${formatCurrency(payment.total)} với nội dung ${transferContent}.`}
          confirmLabel="Đã nhận tiền"
          cancelLabel="Chưa"
          loading={confirmPayment.isPending}
          onCancel={() => setConfirmPaidOpen(false)}
          onConfirm={() => confirmPayment.mutate(orderId, { onSettled: () => setConfirmPaidOpen(false) })}
        />
      )}

      <ConfirmDialog
        open={reasonFor !== null}
        title={`${reasonFor ? ACTION_LABELS[reasonFor] : ''} đơn ${orderNumber}?`}
        description="Sinh viên sẽ nhận được thông báo kèm lý do bạn nhập."
        confirmLabel={reasonFor ? ACTION_LABELS[reasonFor] : 'Xác nhận'}
        cancelLabel="Quay lại"
        tone="danger"
        loading={busy}
        onCancel={() => setReasonFor(null)}
        onConfirm={() => {
          if (!reason.trim()) {
            setReasonError('Vui lòng nhập lý do');
            return;
          }
          update.mutate({ orderId, status: reasonFor!, reason: reason.trim() }, { onSettled: () => setReasonFor(null) });
        }}
      >
        <label htmlFor={`reason-${orderId}`} className="mb-1.5 block text-sm font-medium">
          Lý do <span className="text-brand-600">*</span>
        </label>
        <input
          id={`reason-${orderId}`}
          value={reason}
          maxLength={255}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError('');
          }}
          placeholder="Vd: Hết nguyên liệu, quầy quá tải..."
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? `reason-${orderId}-error` : undefined}
          className="h-11 w-full rounded-xl border border-gray-300 px-3.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
        {reasonError && (
          <p id={`reason-${orderId}-error`} role="alert" className="mt-1.5 text-sm text-red-600">
            {reasonError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
