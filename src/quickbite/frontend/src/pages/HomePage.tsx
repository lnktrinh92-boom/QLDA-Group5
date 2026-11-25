import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, MapPin, ShoppingBag, Sparkles } from 'lucide-react';
import { buttonClass } from '@/components/ui/styles';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { catalogKeys, catalogService } from '@/services/catalog.service';
import { useCurrentUser } from '@/features/auth/hooks';
import { FoodCard, FoodGridSkeleton } from '@/features/food-discovery/FoodCard';
import { StallCard, StallGridSkeleton } from '@/features/food-discovery/StallCard';
import { SearchBox } from '@/features/food-discovery/SearchBox';
import { SectionHeader } from '@/features/food-discovery/SectionHeader';
import { useFoodDetailDialog } from '@/features/food-discovery/FoodDetailDialog';
import { categoryIcon } from '@/features/food-discovery/category-icons';
import type { HomeData } from '@/types/models';
import { hungryTitle } from '@/lib/hungry-title';
import { cn } from '@/lib/utils';

const HERO_IMAGES = [
  '/images/food/pho-bo-tai.webp',
  '/images/food/tra-sua-tran-chau-duong-den.webp',
  '/images/food/com-chien-duong-chau.webp',
];

const STEPS = [
  { icon: Sparkles, title: 'Chọn món', text: 'Xem thực đơn các quầy trong trường, lọc theo giá và danh mục.' },
  { icon: ShoppingBag, title: 'Đặt & chọn giờ nhận', text: 'Chọn điểm nhận gần lớp học và thời gian phù hợp.' },
  { icon: MapPin, title: 'Nhận món, trả tiền', text: 'Đến điểm nhận khi món sẵn sàng. Trả tiền mặt khi nhận hoặc chuyển khoản bằng mã QR.' },
];

export function HomePage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: catalogKeys.home, queryFn: catalogService.home });
  const detail = useFoodDetailDialog();

  return (
    <>
      <Hero />

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        {error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : (
          <>
            <Categories data={data} loading={isPending} />

            {data && data.promotions.length > 0 && <Promotions promotions={data.promotions} />}

            <section aria-labelledby="stalls-heading">
              <SectionHeader id="stalls-heading" title="Quầy ăn nổi bật" subtitle="Những quầy đang được yêu thích trong trường" to="/quan-an" />
              {isPending ? (
                <StallGridSkeleton />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {data.featuredStalls.map((s) => (
                    <StallCard key={s.id} stall={s} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="popular-heading">
              <SectionHeader id="popular-heading" title="Món bán chạy" subtitle="Được sinh viên đặt nhiều nhất" to="/mon-an?sort=popular" />
              {isPending ? (
                <FoodGridSkeleton />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                  {data.popularItems.map((item) => (
                    <FoodCard key={item.id} item={item} onSelect={detail.open} quickAdd={detail.quickAdd} />
                  ))}
                </div>
              )}
            </section>

            {data && data.featuredItems.length > 0 && (
              <section aria-labelledby="featured-heading">
                <SectionHeader id="featured-heading" title="Gợi ý hôm nay" subtitle="Món đặc trưng do các quầy đề xuất" />
                <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                  {data.featuredItems.slice(0, 4).map((item) => (
                    <FoodCard key={item.id} item={item} onSelect={detail.open} quickAdd={detail.quickAdd} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <HowItWorks />
      </div>

      <CallToAction />
      {detail.dialog}
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-orange-50">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-600 shadow-sm ring-1 ring-brand-100">
            <Clock className="size-4" aria-hidden /> Đặt trước, khỏi xếp hàng
          </span>
          <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Đồ ăn ngon trong trường, <span className="text-brand-500">nhanh như một cú chạm.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-navy-600">
            Xem thực đơn các quầy ăn trong khuôn viên, đặt món online và nhận tại điểm hẹn gần lớp học.
          </p>
          <SearchBox className="mt-8 max-w-xl" />
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/mon-an" className={buttonClass({ size: 'lg' })}>
              Khám phá món ăn <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link to="/quan-an" className={buttonClass({ variant: 'outline', size: 'lg' })}>
              Xem các quầy
            </Link>
          </div>
        </div>

        <div className="relative hidden h-[460px] lg:block" aria-hidden>
          <img src={HERO_IMAGES[0]} alt="" className="absolute top-0 right-6 h-72 w-72 rounded-3xl object-cover shadow-2xl ring-8 ring-white" />
          <img src={HERO_IMAGES[1]} alt="" className="absolute bottom-0 left-4 h-60 w-56 rounded-3xl object-cover shadow-2xl ring-8 ring-white" />
          <img src={HERO_IMAGES[2]} alt="" className="absolute right-0 bottom-10 h-44 w-48 rounded-3xl object-cover shadow-2xl ring-8 ring-white" />
          <div className="absolute top-24 left-0 rounded-2xl bg-white px-4 py-3 shadow-xl">
            <p className="text-xs text-navy-500">Thời gian chuẩn bị trung bình</p>
            <p className="text-xl font-extrabold text-brand-600">~15 phút</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Categories({ data, loading }: { data?: HomeData; loading: boolean }) {
  return (
    <section aria-labelledby="categories-heading">
      <SectionHeader id="categories-heading" title="Danh mục" to="/mon-an" />
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-28 rounded-(--radius-card)" />
              </li>
            ))
          : data?.categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              return (
                <li key={c.id}>
                  <Link
                    to={`/mon-an?category=${c.slug}`}
                    className="flex h-full flex-col items-center gap-2 rounded-(--radius-card) border border-gray-100 bg-white p-4 text-center shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-(--shadow-card-hover)"
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span className="text-sm leading-tight font-semibold">{c.name}</span>
                    <span className="text-xs text-navy-400">{c.itemCount} món</span>
                  </Link>
                </li>
              );
            })}
      </ul>
    </section>
  );
}

function Promotions({ promotions }: { promotions: HomeData['promotions'] }) {
  return (
    <section aria-label="Khuyến mãi" className="grid gap-5 md:grid-cols-2">
      {promotions.map((p) => (
        <Link
          key={p.id}
          to={p.link}
          className={cn(
            'group relative flex min-h-48 overflow-hidden rounded-3xl p-6 text-white shadow-(--shadow-card) sm:p-8',
            p.tone === 'navy' ? 'bg-navy-900' : 'bg-brand-500',
          )}
        >
          <ImageWithFallback src={p.imageUrl} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-90 transition duration-300 group-hover:scale-105" />
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-r',
              p.tone === 'navy' ? 'from-navy-900 via-navy-900/90 to-transparent' : 'from-brand-500 via-brand-500/90 to-transparent',
            )}
            aria-hidden
          />
          <div className="relative max-w-[65%]">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">{p.badge}</span>
            <h3 className="mt-3 text-2xl font-extrabold">{p.title}</h3>
            <p className="mt-2 text-sm text-white/85">{p.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
              Xem ngay <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading">
      <SectionHeader id="how-heading" title="Đặt món trong 3 bước" />
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-(--radius-card) border border-gray-100 bg-white p-6 shadow-(--shadow-card)">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-bold text-brand-600">Bước {i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-bold">{title}</h3>
            <p className="mt-1 text-navy-500">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CallToAction() {
  const { data: user } = useCurrentUser();
  return (
    <section className="bg-navy-900">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            {user ? hungryTitle(user) : 'Sẵn sàng cho bữa trưa nhanh gọn?'}
          </h2>
          <p className="mt-2 text-navy-200">
            {user ? 'Hàng chục món ngon đang chờ bạn.' : 'Tạo tài khoản sinh viên miễn phí để bắt đầu đặt món.'}
          </p>
        </div>
        <Link to={user ? '/mon-an' : '/dang-ky'} className={buttonClass({ size: 'lg' })}>
          {user ? 'Đặt món ngay' : 'Đăng ký miễn phí'} <ArrowRight className="size-5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
