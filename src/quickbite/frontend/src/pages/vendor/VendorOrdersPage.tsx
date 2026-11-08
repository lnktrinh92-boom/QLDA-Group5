import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { inputClass } from '@/components/ui/styles';
import { VendorOrderCard } from '@/features/vendor/VendorOrderCard';
import { VendorOrderDialog } from '@/features/vendor/VendorOrderDialog';
import { useCurrentStallId } from '@/features/vendor/vendor-stall-context';
import { vendorKeys, vendorService, type VendorOrderFilters } from '@/services/vendor.service';
import type { VendorOrderTab } from '@/types/vendor';
import { cn } from '@/lib/utils';

const TABS: { value: VendorOrderTab; label: string }[] = [
  { value: 'new', label: 'Đơn mới' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'ready', label: 'Chờ nhận' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Huỷ / Từ chối' },
];

export function VendorOrdersPage() {
  const stallId = useCurrentStallId();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'new') as VendorOrderTab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const q = params.get('q') ?? '';
  const openOrder = Number(params.get('order')) || null;

  const [search, setSearch] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setSearch(q);
  }

  /** Cập nhật bộ lọc trên URL; đổi bộ lọc (trừ trang / đơn đang mở) thì quay về trang 1 */
  const update = useCallback(
    (patch: Record<string, string | number | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '' || (k === 'page' && v === 1)) next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in patch) && !('order' in patch)) next.delete('page');
        return next;
      }),
    [setParams],
  );

  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 400);
    return () => clearTimeout(t);
  }, [search, q, update]);

  const filters: VendorOrderFilters = { tab, page, pageSize: 10, from: from || undefined, to: to || undefined, q: q || undefined };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: vendorKeys.orders(stallId, filters),
    queryFn: () => vendorService.orders(stallId, filters),
    placeholderData: keepPreviousData,
    // Đơn mới / đang xử lý cần cập nhật liên tục
    refetchInterval: tab === 'completed' || tab === 'cancelled' ? false : 15_000,
  });

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Đơn hàng</h1>

      <div role="tablist" aria-label="Trạng thái đơn" className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = t.value === tab;
          const count = data?.meta.tabCounts[t.value];
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update({ tab: t.value === 'new' ? null : t.value })}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
                active ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-gray-200 hover:ring-brand-300',
              )}
            >
              {t.label}
              {count !== undefined && (
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : t.value === 'new' && count > 0 ? 'bg-brand-500 text-white' : 'bg-gray-100')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="order-search" className="sr-only">
            Tìm đơn
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            id="order-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mã đơn hoặc tên sinh viên..."
            className={cn(inputClass(), 'pl-10')}
          />
        </div>
        <div className="flex gap-2">
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-navy-500">
              Từ ngày
            </label>
            <input id="from" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} className={cn(inputClass(), 'w-40')} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-navy-500">
              Đến ngày
            </label>
            <input id="to" type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} className={cn(inputClass(), 'w-40')} />
          </div>
        </div>
      </div>

      <div className={cn('mt-6 transition-opacity', isFetching && !isPending && 'opacity-60')}>
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-(--radius-card)" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : data.orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-7" aria-hidden />}
            title="Không có đơn nào"
            description={tab === 'new' ? 'Đơn mới sẽ tự hiện ở đây (cập nhật mỗi 15 giây).' : 'Thử đổi bộ lọc hoặc khoảng ngày.'}
          />
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {data.orders.map((o) => (
                <VendorOrderCard key={o.id} order={o} stallId={stallId} onOpen={(id) => update({ order: id })} />
              ))}
            </div>
            {data.meta.totalPages > 1 && (
              <div className="mt-6">
                <Pagination meta={data.meta} onPageChange={(p) => update({ page: p })} />
              </div>
            )}
          </>
        )}
      </div>

      <VendorOrderDialog stallId={stallId} orderId={openOrder} onClose={() => update({ order: null })} />
    </div>
  );
}
