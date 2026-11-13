import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, ChevronLeft, Clock, MapPin, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Spinner } from '@/components/ui/States';
import { inputClass } from '@/components/ui/styles';
import { cartKeys, useCart } from '@/features/cart/hooks';
import { orderKeys, ordersService } from '@/services/orders.service';
import { toast } from 'sonner';
import { toApiError } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { cn, formatCurrency, formatTime } from '@/lib/utils';

const checkoutSchema = z.object({
  pickupLocationId: z.string().min(1, 'Vui lòng chọn điểm nhận món'),
  /** '' = nhận sớm nhất có thể */
  pickupTime: z.string(),
  customerNote: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
  paymentMethod: z.enum(['CASH_ON_PICKUP', 'VIETQR']),
});
type CheckoutValues = z.infer<typeof checkoutSchema>;

export function CheckoutPage() {
  const cart = useCart();
  const locations = useQuery({ queryKey: orderKeys.pickupLocations, queryFn: ordersService.pickupLocations, staleTime: 10 * 60_000 });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Một khoá cho mỗi lần vào trang thanh toán: bấm "Đặt món" nhiều lần cũng chỉ tạo 1 đơn
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [placed, setPlaced] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { pickupLocationId: '', pickupTime: '', customerNote: '', paymentMethod: 'CASH_ON_PICKUP' },
  });

  const selectedLocation = useWatch({ control, name: 'pickupLocationId' });
  const selectedPayment = useWatch({ control, name: 'paymentMethod' });

  const createOrder = useMutation({
    mutationFn: ordersService.create,
    onSuccess: ({ order }) => {
      setPlaced(true);
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: cartKeys.cart });
      navigate(`/don-hang/${order.id}?moi=1`, { replace: true });
    },
    onError: (error) => {
      const apiError = toApiError(error);
      // Đơn đã được tạo ở lần gửi trước (vd mạng chập chờn) nhưng nay chọn khác điểm nhận / giờ / cách trả:
      // báo rõ và mở được đơn đã đặt, không để sinh viên tưởng đã đặt ở nơi mới
      if (apiError.code === 'ORDER_ALREADY_PLACED') {
        const orderId = (apiError.details as { orderId?: number }[] | undefined)?.[0]?.orderId;
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        if (orderId) toast.error(apiError.message, { action: { label: 'Xem đơn', onClick: () => navigate(`/don-hang/${orderId}`) } });
      }
      applyServerErrors(error, setError, ['pickupLocationId', 'pickupTime', 'paymentMethod']);
      // Giá / tình trạng món có thể đã đổi → tải lại giỏ để hiện cảnh báo mới nhất
      queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });

  if (cart.isPending || locations.isPending) return <Spinner label="Đang chuẩn bị đơn hàng..." />;
  if (cart.error || locations.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState message={(cart.error ?? locations.error)!.message} onRetry={() => (cart.refetch(), locations.refetch())} />
      </div>
    );
  }
  // Giỏ trống hoặc có món không đặt được → quay lại giỏ (trang giỏ hiển thị cảnh báo chi tiết)
  if (!placed && (cart.data.items.length === 0 || !cart.data.canCheckout)) {
    return <Navigate to="/gio-hang" replace />;
  }

  const { data } = cart;
  const acceptsVietQr = data.stall?.acceptsVietQr ?? false;
  const paymentOptions = [
    {
      value: 'CASH_ON_PICKUP' as const,
      icon: Banknote,
      title: 'Tiền mặt khi nhận món',
      description: 'Thanh toán trực tiếp cho quầy khi nhận món.',
      disabled: false,
    },
    {
      value: 'VIETQR' as const,
      icon: QrCode,
      title: 'Chuyển khoản VietQR',
      description: acceptsVietQr
        ? `Quét mã QR bằng app ngân hàng hoặc ví (ZaloPay, MoMo...) trong ${data.stall?.paymentTimeoutMinutes ?? 15} phút; quá hạn đơn tự huỷ.`
        : 'Quầy này chưa nhận thanh toán chuyển khoản.',
      disabled: !acceptsVietQr,
    },
  ];

  const onSubmit = handleSubmit((values) =>
    createOrder.mutate({
      pickupLocationId: Number(values.pickupLocationId),
      pickupTime: values.pickupTime || null,
      customerNote: values.customerNote.trim() || undefined,
      paymentMethod: values.paymentMethod === 'VIETQR' && acceptsVietQr ? 'VIETQR' : 'CASH_ON_PICKUP',
      idempotencyKey,
    }),
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <Link to="/gio-hang" className="inline-flex items-center gap-1 text-sm font-medium text-navy-500 hover:text-brand-600">
        <ChevronLeft className="size-4" aria-hidden /> Quay lại giỏ hàng
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">Xác nhận đặt món</h1>

      <form onSubmit={onSubmit} noValidate className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Điểm nhận */}
          <Card className="p-6">
            <fieldset aria-describedby={errors.pickupLocationId ? 'pickup-error' : undefined}>
              <legend className="flex items-center gap-2 text-lg font-bold">
                <MapPin className="size-5 text-brand-500" aria-hidden /> Điểm nhận món <span className="text-brand-600">*</span>
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {locations.data.map((l) => (
                  <label
                    key={l.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition',
                      selectedLocation === String(l.id) ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-200',
                    )}
                  >
                    <input type="radio" value={l.id} {...register('pickupLocationId')} className="mt-1 size-4 accent-brand-500" />
                    <span>
                      <span className="block font-semibold">{l.name}</span>
                      {l.description && <span className="block text-sm text-navy-500">{l.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {errors.pickupLocationId && (
                <p id="pickup-error" role="alert" className="mt-2 text-sm text-red-600">
                  {errors.pickupLocationId.message}
                </p>
              )}
            </fieldset>
          </Card>

          {/* Giờ nhận */}
          <Card className="p-6">
            <label htmlFor="pickupTime" className="flex items-center gap-2 text-lg font-bold">
              <Clock className="size-5 text-brand-500" aria-hidden /> Giờ nhận món
            </label>
            <select id="pickupTime" {...register('pickupTime')} className={cn(inputClass(!!errors.pickupTime), 'mt-4')}>
              <option value="">Sớm nhất có thể (khoảng 15–20 phút)</option>
              {data.pickupSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {formatTime(slot)}
                </option>
              ))}
            </select>
            {errors.pickupTime && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {errors.pickupTime.message}
              </p>
            )}
          </Card>

          {/* Thanh toán */}
          <Card className="p-6">
            <fieldset aria-describedby={errors.paymentMethod ? 'payment-error' : undefined}>
              <legend className="flex items-center gap-2 text-lg font-bold">
                <Banknote className="size-5 text-brand-500" aria-hidden /> Thanh toán
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {paymentOptions.map(({ value, icon: Icon, title, description, disabled }) => (
                  <label
                    key={value}
                    className={cn(
                      'flex gap-3 rounded-xl border-2 p-4 transition',
                      disabled ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-60' : 'cursor-pointer',
                      !disabled && (selectedPayment === value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-200'),
                    )}
                  >
                    <input type="radio" value={value} disabled={disabled} {...register('paymentMethod')} className="mt-1 size-4 accent-brand-500" />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Icon className="size-4 text-navy-500" aria-hidden /> {title}
                      </span>
                      <span className="mt-0.5 block text-sm text-navy-500">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.paymentMethod && (
                <p id="payment-error" role="alert" className="mt-2 text-sm text-red-600">
                  {errors.paymentMethod.message}
                </p>
              )}
            </fieldset>
          </Card>

          {/* Ghi chú */}
          <Card className="p-6">
            <label htmlFor="customerNote" className="text-lg font-bold">
              Ghi chú cho quầy <span className="text-sm font-normal text-navy-400">(không bắt buộc)</span>
            </label>
            <textarea
              id="customerNote"
              rows={3}
              maxLength={500}
              {...register('customerNote')}
              placeholder="Vd: Mình đến trễ 5 phút, giữ món giúp mình nhé"
              className="mt-4 w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none"
            />
          </Card>
        </div>

        {/* Tóm tắt đơn */}
        <Card className="p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Đơn hàng tại {data.stall?.name}</h2>
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {data.items.map((line) => (
              <li key={line.id} className="flex justify-between gap-3 py-2.5">
                <span>
                  <span className="font-semibold">{line.quantity} ×</span> {line.menuItem.name}
                  {line.note && <span className="block text-xs text-navy-500">Ghi chú: {line.note}</span>}
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-500">Tạm tính</dt>
              <dd>{formatCurrency(data.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-500">Phí dịch vụ</dt>
              <dd>Miễn phí</dd>
            </div>
            <div className="flex justify-between pt-1 text-base">
              <dt className="font-bold">Tổng thanh toán</dt>
              <dd className="text-xl font-extrabold text-brand-600">{formatCurrency(data.subtotal)}</dd>
            </div>
          </dl>
          <Button type="submit" size="lg" className="mt-6 w-full" loading={createOrder.isPending}>
            {selectedPayment === 'VIETQR' && acceptsVietQr ? 'Đặt món & lấy mã QR' : 'Đặt món'}
          </Button>
          <p className="mt-3 text-center text-xs text-navy-400">Tổng tiền được tính lại ở máy chủ theo giá hiện tại khi đặt.</p>
        </Card>
      </form>
    </section>
  );
}
