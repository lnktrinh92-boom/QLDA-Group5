import { Link } from 'react-router';
import { ArrowRight, Clock, MapPin } from 'lucide-react';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StallSummary } from '@/types/models';
import { RatingBadge, StallStatusBadge } from './badges';

export function StallCard({ stall }: { stall: StallSummary }) {
  return (
    <Link
      to={`/quan-an/${stall.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-gray-100 bg-white shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover)"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <ImageWithFallback src={stall.imageUrl ?? undefined} alt="" className="size-full object-cover transition duration-300 group-hover:scale-105" />
        <StallStatusBadge isOpenNow={stall.isOpenNow} canOrderNow={stall.canOrderNow} className="absolute top-3 left-3 bg-white/95" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-lg font-bold group-hover:text-brand-600">{stall.name}</h3>
        <RatingBadge rating={stall.rating} />
        {stall.description && <p className="line-clamp-2 text-sm text-navy-500">{stall.description}</p>}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-navy-500">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4 shrink-0" aria-hidden /> {stall.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4 shrink-0" aria-hidden /> {stall.openTime} – {stall.closeTime}
          </span>
        </div>
        {/* Lời gọi hành động ở chân thẻ cho biết thẻ bấm được (Design QA UI-04). Cả thẻ đã là một liên kết nên đây chỉ là chữ. */}
        <span className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-3 text-sm font-semibold text-brand-600" aria-hidden>
          Xem thực đơn <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function StallGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Đang tải quầy ăn">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-(--radius-card) border border-gray-100 bg-white">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
