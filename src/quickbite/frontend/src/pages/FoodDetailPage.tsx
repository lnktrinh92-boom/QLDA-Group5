import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { ApiError } from '@/lib/api-client';
import { catalogKeys, catalogService } from '@/services/catalog.service';
import { FoodCard } from '@/features/food-discovery/FoodCard';
import { FoodDetailContent } from '@/features/food-discovery/FoodDetailContent';
import { useFoodDetailDialog } from '@/features/food-discovery/FoodDetailDialog';
import { useAddToCartAction } from '@/features/cart/use-add-to-cart-action';
import { SectionHeader } from '@/features/food-discovery/SectionHeader';
import { NotFoundPage } from './NotFoundPage';

/** Trang chi tiết món (link chia sẻ được). Từ danh sách, món được mở dạng hộp thoại. */
export function FoodDetailPage() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const detail = useFoodDetailDialog();
  const cart = useAddToCartAction();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: catalogKeys.menuItem(id),
    queryFn: () => catalogService.menuItem(id),
    enabled: valid,
  });

  if (!valid || (error instanceof ApiError && error.status === 404)) return <NotFoundPage />;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <Link to="/mon-an" className="inline-flex items-center gap-1 text-sm font-medium text-navy-500 hover:text-brand-600">
        <ChevronLeft className="size-4" aria-hidden /> Tất cả món ăn
      </Link>

      <div className="mt-6">
        {isPending ? (
          <div className="grid gap-8 md:grid-cols-2">
            <Skeleton className="aspect-square" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : (
          <>
            <FoodDetailContent
              key={data.item.id}
              item={data.item}
              layout="page"
              onAddToCart={(input) => cart.handleAdd(data.item, input)}
              adding={cart.adding}
              blockedReason={cart.blockedReason}
            />
            {data.related.length > 0 && (
              <div className="mt-16">
                <SectionHeader title={`Món khác của ${data.item.stall.name}`} to={`/quan-an/${data.item.stall.slug}`} linkLabel="Xem cả quầy" />
                <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
                  {data.related.map((item) => (
                    <FoodCard key={item.id} item={item} onSelect={detail.open} quickAdd={detail.quickAdd} hideStall />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {detail.dialog}
      {cart.confirmDialog}
    </section>
  );
}
