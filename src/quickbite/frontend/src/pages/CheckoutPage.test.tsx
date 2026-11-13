import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { cartService } from '@/services/cart.service';
import { ordersService } from '@/services/orders.service';
import { makeCart, makeOrder, makeStall } from '@/test/fixtures';
import { makeUser, renderRoutes } from '@/test/utils';
import { CheckoutPage } from './CheckoutPage';

vi.mock('@/services/auth.service', () => ({ authService: { me: vi.fn() } }));
vi.mock('@/services/cart.service', () => ({ cartService: { get: vi.fn() } }));
vi.mock('@/services/orders.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/orders.service')>();
  return { ...actual, ordersService: { pickupLocations: vi.fn(), create: vi.fn() } };
});
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string, o?: unknown) => (o ? toastError(m, o) : toastError(m)) } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.me).mockResolvedValue(makeUser({ role: 'STUDENT' }));
  vi.mocked(cartService.get).mockResolvedValue(makeCart());
  vi.mocked(ordersService.pickupLocations).mockResolvedValue([
    { id: 1, name: 'Sảnh tòa A1', building: null, description: 'Tầng trệt' },
    { id: 2, name: 'Thư viện', building: null, description: null },
  ]);
});

const render = () =>
  renderRoutes(
    [
      { path: '/thanh-toan', element: <CheckoutPage /> },
      { path: '/gio-hang', element: <p>Trang giỏ hàng</p> },
      { path: '/don-hang/:id', element: <p>Trang chi tiết đơn</p> },
    ],
    '/thanh-toan',
  );

describe('CheckoutPage', () => {
  it('bắt buộc chọn điểm nhận', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Đặt món' }));
    expect(await screen.findByText('Vui lòng chọn điểm nhận món')).toBeInTheDocument();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('gửi đúng dữ liệu (kèm idempotencyKey) và chuyển tới trang xác nhận', async () => {
    vi.mocked(ordersService.create).mockResolvedValue({ order: makeOrder({ id: 42 }), created: true });
    const { router } = render();

    await userEvent.click(await screen.findByRole('radio', { name: /Thư viện/ }));
    await userEvent.selectOptions(screen.getByLabelText('Giờ nhận món'), '2026-10-16T03:45:00.000Z');
    await userEvent.type(screen.getByLabelText(/Ghi chú cho quầy/), 'Gọi mình nhé');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt món' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/don-hang/42'));
    expect(router.state.location.search).toBe('?moi=1');

    const payload = vi.mocked(ordersService.create).mock.calls[0]![0];
    expect(payload).toEqual({
      pickupLocationId: 2,
      pickupTime: '2026-10-16T03:45:00.000Z',
      customerNote: 'Gọi mình nhé',
      paymentMethod: 'CASH_ON_PICKUP',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('bấm đặt lại sau lỗi dùng CÙNG idempotencyKey (không tạo đơn trùng)', async () => {
    vi.mocked(ordersService.create).mockRejectedValueOnce(new ApiError('Lỗi mạng', 0, 'NETWORK_ERROR'));
    vi.mocked(ordersService.create).mockResolvedValueOnce({ order: makeOrder(), created: false });
    render();

    await userEvent.click(await screen.findByRole('radio', { name: /Sảnh tòa A1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Đặt món' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Lỗi mạng'));
    await userEvent.click(screen.getByRole('button', { name: 'Đặt món' }));

    await waitFor(() => expect(ordersService.create).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(ordersService.create).mock.calls;
    expect(first![0].idempotencyKey).toBe(second![0].idempotencyKey);
  });

  it('đơn đã đặt ở lần gửi trước với điểm nhận khác → báo dưới ô điểm nhận, có nút Xem đơn, không chuyển trang', async () => {
    const message = 'Đơn QB-261113-AB12 đã được đặt trước đó (nhận tại "Sảnh tòa A1"). Không thể đổi khi gửi lại — hãy xem đơn đó, huỷ nếu cần rồi đặt lại.';
    vi.mocked(ordersService.create).mockRejectedValueOnce(
      new ApiError(message, 409, 'ORDER_ALREADY_PLACED', [{ field: 'pickupLocationId', message, orderId: 42 }]),
    );
    const { router } = render();
    await userEvent.click(await screen.findByRole('radio', { name: /Thư viện/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Đặt món' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/thanh-toan');
    expect(toastError).toHaveBeenCalledWith(message, { action: expect.objectContaining({ label: 'Xem đơn' }) });
    const { action } = toastError.mock.calls[0]![1] as { action: { onClick: () => void } };
    action.onClick();
    await waitFor(() => expect(router.state.location.pathname).toBe('/don-hang/42'));
  });

  it('quầy chưa cài tài khoản: chỉ chọn được tiền mặt, chuyển khoản bị khoá kèm lý do', async () => {
    render();
    expect(await screen.findByRole('radio', { name: /Tiền mặt khi nhận món/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Chuyển khoản VietQR/ })).toBeDisabled();
    expect(screen.getByText('Quầy này chưa nhận thanh toán chuyển khoản.')).toBeInTheDocument();
  });

  it('quầy nhận chuyển khoản: chọn VietQR thì gửi paymentMethod VIETQR', async () => {
    vi.mocked(cartService.get).mockResolvedValue(makeCart({ stall: makeStall({ acceptsVietQr: true }) }));
    vi.mocked(ordersService.create).mockResolvedValue({ order: makeOrder({ id: 7, paymentMethod: 'VIETQR' }), created: true });
    const { router } = render();

    await userEvent.click(await screen.findByRole('radio', { name: /Sảnh tòa A1/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Chuyển khoản VietQR/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Đặt món & lấy mã QR' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/don-hang/7'));
    expect(vi.mocked(ordersService.create).mock.calls[0]![0]).toMatchObject({ paymentMethod: 'VIETQR' });
  });

  it('giỏ không thể thanh toán → quay về trang giỏ', async () => {
    vi.mocked(cartService.get).mockResolvedValue(makeCart({ canCheckout: false }));
    render();
    expect(await screen.findByText('Trang giỏ hàng')).toBeInTheDocument();
  });
});
