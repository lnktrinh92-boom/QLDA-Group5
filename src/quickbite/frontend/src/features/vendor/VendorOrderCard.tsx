import { Clock, MapPin, MessageSquareText, User } from 'lucide-react';
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge';
import type { VendorOrderRow } from '@/types/vendor';
import { formatCurrency, formatDateTime, formatTime } from '@/lib/utils';
import { useNow } from '@/hooks/use-now';
import { OrderActions } from './order-actions';
import { PaymentBadge } from '@/features/payments/PaymentBadge';
import { PaymentCountdown } from '@/features/payments/PaymentCountdown';

/** Phiếu đơn cho màn hình xử lý của quầy: món, ghi chú, người nhận, nút xử lý */
export function VendorOrderCard({ order, stallId, onOpen }: { order: VendorOrderRow; stallId: number; onOpen: (id: number) => void }) {
  const now = useNow();
  const minutesAgo = Math.max(0, Math.round((now - new Date(order.createdAt).getTime()) / 60_000));
  const waitingLong = order.status === 'PENDING' && minutesAgo >= 5;

  return (
    <article className="rounded-(--radius-card) border border-gray-100 bg-white shadow-(--shadow-card)">
      <button type="button" onClick={() => onOpen(order.id)} className="block w-full p-4 text-left" aria-label={`Xem chi tiết đơn ${order.orderNumber}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-extrabold">{order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <span className={waitingLong ? 'text-sm font-semibold text-red-600' : 'text-sm text-navy-500'}>
            {order.status === 'PENDING' ? `Chờ ${minutesAgo} phút` : formatDateTime(order.createdAt)}
          </span>
        </div>

        <ul className="mt-3 space-y-1">
          {order.items.map((item, i) => (
            <li key={i} className="text-sm">
              <span className="font-bold">{item.quantity} ×</span> {item.itemName}
              {item.note && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">{item.note}</span>}
            </li>
          ))}
        </ul>

        {order.customerNote && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-sm text-navy-600">
            <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden /> {order.customerNote}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-500">
          <span className="inline-flex items-center gap-1">
            <User className="size-4" aria-hidden /> {order.student.fullName}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden /> {order.pickupLocation.name}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> {order.pickupTime ? `Nhận lúc ${formatTime(order.pickupTime)}` : 'Sớm nhất có thể'}
          </span>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-extrabold">{formatCurrency(order.total)}</span>
          <PaymentBadge method={order.paymentMethod} status={order.paymentStatus} />
          {order.awaitingPayment && order.paymentExpiresAt && <PaymentCountdown expiresAt={order.paymentExpiresAt} />}
        </span>
        <OrderActions
          stallId={stallId}
          orderId={order.id}
          orderNumber={order.orderNumber}
          nextStatuses={order.nextStatuses}
          payment={{ method: order.paymentMethod, awaitingPayment: order.awaitingPayment, total: order.total }}
        />
      </div>
    </article>
  );
}
