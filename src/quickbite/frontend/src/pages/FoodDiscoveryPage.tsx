import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, SearchX, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { inputClass } from '@/components/ui/styles';
import { catalogKeys, catalogService, type MenuSort } from '@/services/catalog.service';
import { ActiveFilterChips } from '@/features/food-discovery/ActiveFilterChips';
import { FilterPanel } from '@/features/food-discovery/FilterPanel';
import { FoodCard, FoodGridSkeleton } from '@/features/food-discovery/FoodCard';
import { useFoodDetailDialog } from '@/features/food-discovery/FoodDetailDialog';
import { SORT_OPTIONS, useMenuFilters } from '@/features/food-discovery/use-menu-filters';
import { cn } from '@/lib/utils';

export function FoodDiscoveryPage() {
  const { state, update, reset, apiFilters, activeCount } = useMenuFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const detail = useFoodDetailDialog();

  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: catalogService.categories, staleTime: 5 * 60_000 });
  const stalls = useQuery({ queryKey: catalogKeys.stalls(), queryFn: () => catalogService.stalls(), staleTime: 5 * 60_000 });
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: catalogKeys.menuItems(apiFilters),
    queryFn: () => catalogService.menuItems(apiFilters),
    placeholderData: keepPreviousData,
  });

  // Tải sẵn trang kế tiếp khi đang rảnh → bấm "Trang sau" có ngay dữ liệu, kể cả khi mạng yếu (UAT-SV01)
  const queryClient = useQueryClient();
  const nextPage = data && data.meta.page < data.meta.totalPages ? data.meta.page + 1 : null;
  useEffect(() => {
    if (nextPage === null) return;
    const next = { ...apiFilters, page: nextPage };
    void queryClient.prefetchQuery({ queryKey: catalogKeys.menuItems(next), queryFn: () => catalogService.menuItems(next) });
  }, [nextPage, apiFilters, queryClient]);

  const currentCategory = categories.data?.find((c) => c.slug === state.category);

  const goToPage = (page: number) => {
    update({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const panel = (
    <FilterPanel
      state={state}
      update={update}
      reset={reset}
      activeCount={activeCount}
      categories={categories.data ?? []}
      stalls={stalls.data ?? []}
    />
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">{currentCategory ? currentCategory.name : state.q ? `Kết quả cho “${state.q}”` : 'Khám phá món ăn'}</h1>
          <p className="mt-1 text-navy-500" aria-live="polite">
            {data ? `${data.meta.total} món` : 'Đang tìm món...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Bộ lọc{activeCount > 0 && ` (${activeCount})`}
          </Button>
          <label htmlFor="sort" className="sr-only">
            Sắp xếp
          </label>
          <select id="sort" value={state.sort} onChange={(e) => update({ sort: e.target.value as MenuSort })} className={cn(inputClass(), 'w-auto')}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Điện thoại: chỉ hiện chip bộ lọc đang chọn; bộ lọc đầy đủ mở trong bảng trượt từ dưới lên (UAT-SV02) */}
      <ActiveFilterChips state={state} update={update} categories={categories.data ?? []} stalls={stalls.data ?? []} className="mt-4 lg:hidden" />
      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Bộ lọc món ăn"
        className="mt-auto mb-0 w-full max-w-none rounded-b-none sm:mb-auto sm:max-w-lg sm:rounded-2xl lg:hidden"
      >
        <div className="px-6 pt-4 pb-4">{panel}</div>
        <div className="sticky bottom-0 flex gap-3 border-t border-gray-100 bg-white px-6 py-4">
          <Button variant="outline" className="flex-1" onClick={reset} disabled={activeCount === 0}>
            Xoá bộ lọc
          </Button>
          <Button className="flex-1" onClick={() => setFiltersOpen(false)} loading={isFetching}>
            {data ? `Xem ${data.meta.total} món` : 'Xem kết quả'}
          </Button>
        </div>
      </Dialog>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Bộ lọc" className="hidden lg:block">
          <Card className="sticky top-24 p-5">{panel}</Card>
        </aside>

        <div aria-busy={isFetching} className="relative">
          {/* Đang tải lại (đổi bộ lọc / sang trang) → báo rõ thay vì chỉ làm mờ danh sách (UAT-SV01) */}
          {isFetching && !isPending && (
            <p role="status" className="sticky top-20 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Đang tải món...
            </p>
          )}
          <div className={cn('transition-opacity', isFetching && !isPending && 'opacity-50')}>
          {isPending ? (
            <FoodGridSkeleton count={PAGE_SKELETONS} />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-7" aria-hidden />}
              title="Không tìm thấy món phù hợp"
              description="Thử từ khoá khác hoặc bỏ bớt bộ lọc nhé."
              action={
                activeCount > 0 && (
                  <Button variant="outline" onClick={reset}>
                    Xoá bộ lọc
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
                {data.items.map((item, i) => (
                  <FoodCard key={item.id} item={item} onSelect={detail.open} quickAdd={detail.quickAdd} priority={i < PRIORITY_IMAGES} />
                ))}
              </div>
              {data.meta.totalPages > 1 && (
                <div className="mt-10">
                  <Pagination meta={data.meta} onPageChange={goToPage} />
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
      {detail.dialog}
    </section>
  );
}

const PAGE_SKELETONS = 6;
/** Số ảnh đầu danh sách tải ngay (thấy được khi mở trang trên điện thoại / máy tính) */
const PRIORITY_IMAGES = 4;
