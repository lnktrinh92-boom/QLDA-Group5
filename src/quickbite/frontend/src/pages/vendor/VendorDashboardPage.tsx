import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Banknote, ChefHat, ClipboardList, PackageCheck, Star } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatCard } from '@/features/vendor/StatCard';
import { VendorOrderCard } from '@/features/vendor/VendorOrderCard';
import { VendorOrderDialog } from '@/features/vendor/VendorOrderDialog';
import { useCurrentStallId, useVendorStall } from '@/features/vendor/vendor-stall-context';
import { vendorKeys, vendorService } from '@/services/vendor.service';
import { formatCurrency, formatDate } from '@/lib/utils';

export function VendorDashboardPage() {
  const stallId = useCurrentStallId();
  const { stall } = useVendorStall();
  const [openOrder, setOpenOrder] = useState<number | null>(null);

  const dashboard = useQuery({
    queryKey: vendorKeys.dashboard(stallId),
    queryFn: () => vendorService.dashboard(stallId),
    refetchInterval: 20_000,
  });
  const newOrders = useQuery({
    queryKey: vendorKeys.orders(stallId, { tab: 'new', pageSize: 5 }),
    queryFn: () => vendorService.orders(stallId, { tab: 'new', pageSize: 5 }),
    refetchInterval: 15_000,
  });

  if (dashboard.error) return <ErrorState message={dashboard.error.message} onRetry={() => dashboard.refetch()} />;
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Tổng quan</h1>
        <p className="mt-1 text-navy-500">{d ? `Hôm nay, ${formatDate(`${d.date}T12:00:00+07:00`)}` : 'Đang tải...'}</p>
      </div>

      {stall && !stall.canOrderNow && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {!stall.isAcceptingOrders
            ? 'Quầy đang TẠM NGƯNG nhận đơn. Sinh viên không thể đặt món cho tới khi bạn bật lại.'
            : `Quầy đang ngoài giờ mở cửa (${stall.openTime} – ${stall.closeTime}).`}
        </p>
      )}

      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-(--radius-card)" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Doanh thu hôm nay" value={formatCurrency(d.today.revenue)} hint={`${d.today.completed} đơn hoàn thành`} icon={Banknote} tone="success" />
          <StatCard label="Đơn hôm nay" value={d.today.orders} hint={`${d.today.cancelled} đơn huỷ / từ chối`} icon={ClipboardList} />
          <StatCard
            label="Chờ xác nhận"
            value={d.queue.pending}
            hint={`${d.queue.inProgress} đang làm · ${d.queue.ready} chờ nhận`}
            icon={d.queue.pending > 0 ? ChefHat : PackageCheck}
            tone={d.queue.pending > 0 ? 'warning' : 'neutral'}
          />
          <StatCard
            label="Đánh giá"
            value={d.rating.average !== null ? `${d.rating.average.toFixed(1)} ★` : '—'}
            hint={`${d.rating.count} lượt đánh giá`}
            icon={Star}
            tone="brand"
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section aria-labelledby="new-orders-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="new-orders-heading" className="text-lg font-bold">
              Đơn mới chờ xác nhận
            </h2>
            <Link to="/quan-ly/don-hang" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
              Tất cả đơn <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {newOrders.isPending ? (
            <Skeleton className="h-40 rounded-(--radius-card)" />
          ) : newOrders.error ? (
            <ErrorState message={newOrders.error.message} onRetry={() => newOrders.refetch()} />
          ) : newOrders.data.orders.length === 0 ? (
            <EmptyState title="Không có đơn mới" description="Đơn mới sẽ tự hiện ở đây (cập nhật mỗi 15 giây)." />
          ) : (
            <div className="space-y-3">
              {newOrders.data.orders.map((o) => (
                <VendorOrderCard key={o.id} order={o} stallId={stallId} onOpen={setOpenOrder} />
              ))}
            </div>
          )}
        </section>

        <Card className="h-fit p-5">
          <h2 className="font-bold">Món bán chạy 7 ngày</h2>
          {!d ? (
            <Skeleton className="mt-4 h-32" />
          ) : d.topItems7Days.length === 0 ? (
            <p className="mt-3 text-sm text-navy-500">Chưa có đơn hoàn thành trong 7 ngày qua.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {d.topItems7Days.map((item, i) => (
                <li key={item.menuItemId} className="flex items-center gap-3 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-600">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-navy-500 tabular-nums">{item.quantity} phần</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <VendorOrderDialog stallId={stallId} orderId={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  );
}
