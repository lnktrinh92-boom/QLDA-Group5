import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Clock, MapPin, Phone, Star, UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { ApiError } from '@/lib/api-client';
import { catalogKeys, catalogService } from '@/services/catalog.service';
import { RatingBadge, StallStatusBadge } from '@/features/food-discovery/badges';
import { FoodCard, FoodGridSkeleton } from '@/features/food-discovery/FoodCard';
import { useFoodDetailDialog } from '@/features/food-discovery/FoodDetailDialog';
import { ReportReviewButton } from '@/features/reviews/ReportReviewButton';
import { useCurrentUser } from '@/features/auth/hooks';
import { NotFoundPage } from './NotFoundPage';
import { formatDate } from '@/lib/utils';

export function StallDetailPage() {
  const { slug = '' } = useParams();
  const detail = useFoodDetailDialog();
  const { data: user } = useCurrentUser();
  const canReport = !!user && user.role !== 'ADMIN';
  const { data, isPending, error, refetch } = useQuery({ queryKey: catalogKeys.stall(slug), queryFn: () => catalogService.stall(slug) });

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;

  return (
    <>
      {/* Ảnh bìa & thông tin quầy */}
      <section className="relative bg-navy-900">
        {data && <ImageWithFallback src={data.stall.imageUrl ?? undefined} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-900/70 to-navy-900/30" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pt-6 pb-10 sm:px-6 lg:pb-14">
          <Link to="/quan-an" className="inline-flex items-center gap-1 text-sm font-medium text-navy-200 hover:text-white">
            <ChevronLeft className="size-4" aria-hidden /> Tất cả quầy
          </Link>
          {isPending ? (
            <div className="mt-8 space-y-3">
              <Skeleton className="h-10 w-72 bg-white/20" />
              <Skeleton className="h-5 w-96 max-w-full bg-white/20" />
            </div>
          ) : data ? (
            <div className="mt-8 max-w-3xl text-white">
              <StallStatusBadge isOpenNow={data.stall.isOpenNow} canOrderNow={data.stall.canOrderNow} className="bg-white/95" />
              <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">{data.stall.name}</h1>
              {data.stall.description && <p className="mt-3 text-lg text-navy-100">{data.stall.description}</p>}
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-100">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden /> {data.stall.location}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden /> Mở cửa {data.stall.openTime} – {data.stall.closeTime}
                </span>
                {data.stall.phone && (
                  <a href={`tel:${data.stall.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
                    <Phone className="size-4" aria-hidden /> {data.stall.phone}
                  </a>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  {data.stall.rating.average !== null ? `${data.stall.rating.average.toFixed(1)} (${data.stall.rating.count} đánh giá)` : 'Chưa có đánh giá'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {isPending ? (
          <FoodGridSkeleton />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : data.menuItems.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed className="size-7" aria-hidden />} title="Quầy chưa có món nào" description="Quay lại sau nhé!" />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
            {/* Mục lục danh mục: thanh ngang cuộn được trên điện thoại, cột dính bên trái trên máy tính */}
            <nav aria-label="Danh mục thực đơn" className="sticky top-16 z-10 -mx-4 bg-gray-50/95 px-4 py-2 backdrop-blur lg:top-24 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0">
              <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
                {data.categories.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <a
                      href={`#danh-muc-${c.slug}`}
                      className="block rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-navy-700 hover:border-brand-300 hover:text-brand-600 lg:rounded-lg lg:border-0 lg:bg-transparent lg:px-3"
                    >
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-12">
              {data.categories.map((c) => (
                <section key={c.id} id={`danh-muc-${c.slug}`} aria-labelledby={`heading-${c.slug}`} className="scroll-mt-32">
                  <h2 id={`heading-${c.slug}`} className="mb-5 text-2xl font-extrabold">
                    {c.name}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
                    {data.menuItems
                      .filter((m) => m.category.id === c.id)
                      .map((item) => (
                        <FoodCard key={item.id} item={item} onSelect={detail.open} quickAdd={detail.quickAdd} hideStall />
                      ))}
                  </div>
                </section>
              ))}

              {data.reviews.length > 0 && (
                <section aria-labelledby="reviews-heading">
                  <div className="mb-5 flex flex-wrap items-baseline gap-3">
                    <h2 id="reviews-heading" className="text-2xl font-extrabold">
                      Đánh giá gần đây
                    </h2>
                    <RatingBadge rating={data.stall.rating} />
                  </div>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {data.reviews.map((r) => (
                      <li key={r.id}>
                        <Card className="h-full p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{r.author}</p>
                            <span className="flex" aria-label={`${r.rating} trên 5 sao`}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star key={i} className={i < r.rating ? 'size-4 fill-amber-400 text-amber-400' : 'size-4 text-gray-300'} aria-hidden />
                              ))}
                            </span>
                          </div>
                          {r.comment && <p className="mt-2 text-navy-600">{r.comment}</p>}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-xs text-navy-400">{formatDate(r.createdAt)}</p>
                            {canReport && <ReportReviewButton reviewId={r.id} author={r.author} />}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
      {detail.dialog}
    </>
  );
}
