/**
 * SCRUM-141 (7.3.3): kiểm thử các lỗi mức High từ báo cáo Design QA (SCRUM-101)
 * và rà soát Accessibility & câu chữ tiếng Việt (SCRUM-116).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/auth.service';
import { AcceptingOrdersStatus } from '@/components/layout/VendorLayout';
import { Header } from '@/components/layout/Header';
import { Switch } from '@/components/ui/Switch';
import { FoodCard } from '@/features/food-discovery/FoodCard';
import { StallCard } from '@/features/food-discovery/StallCard';
import { OrderActions } from '@/features/vendor/order-actions';
import { hungryTitle } from '@/lib/hungry-title';
import { makeMenuItem, makeStall } from './fixtures';
import { makeUser, renderRoutes, withQueryClient } from './utils';

vi.mock('@/services/auth.service', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('UI-01: nút "+" thêm nhanh trên thẻ món', () => {
  it('món đặt được → có nút "+", bấm thêm 1 phần mà không mở chi tiết món', async () => {
    const item = makeMenuItem();
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(<FoodCard item={item} onSelect={onSelect} quickAdd={{ onAdd }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhanh 1 phần Phở bò tái vào giỏ' }));
    expect(onAdd).toHaveBeenCalledWith(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('món tạm hết / quầy chưa nhận đơn → không có nút "+"', () => {
    render(<FoodCard item={makeMenuItem({ isAvailable: false, canOrder: false })} onSelect={vi.fn()} quickAdd={{ onAdd: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: /Thêm nhanh/ })).not.toBeInTheDocument();
  });

  it('đang thêm vào giỏ → nút "+" bị khoá, tránh bấm hai lần', () => {
    render(<FoodCard item={makeMenuItem()} onSelect={vi.fn()} quickAdd={{ onAdd: vi.fn(), busy: true }} />);
    expect(screen.getByRole('button', { name: /Thêm nhanh/ })).toBeDisabled();
  });

  it('không truyền quickAdd (tài khoản quầy / quản trị) → chỉ có một nút là cả thẻ', () => {
    render(<FoodCard item={makeMenuItem()} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('UI-02 / VN-02: đơn chờ xác nhận không hiện "Huỷ đơn" trùng với "Từ chối"', () => {
  it('đơn chờ xác nhận: chỉ có "Nhận đơn" và "Từ chối"', () => {
    withQueryClient(<OrderActions stallId={1} orderId={1} orderNumber="QB-1" nextStatuses={['ACCEPTED', 'REJECTED', 'CANCELLED']} />);
    expect(screen.getByRole('button', { name: 'Nhận đơn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  });

  it('đơn đã nhận: vẫn huỷ được với nút "Huỷ đơn"', () => {
    withQueryClient(<OrderActions stallId={1} orderId={1} orderNumber="QB-1" nextStatuses={['PREPARING', 'CANCELLED']} />);
    expect(screen.getByRole('button', { name: 'Huỷ đơn' })).toBeInTheDocument();
  });
});

describe('UI-03 / ACC-04 / VN-08: trạng thái công tắc "Nhận đơn mới" nói rõ bằng chữ', () => {
  const base = { isActive: true, isAcceptingOrders: true, isOpenNow: true, canOrderNow: true, openTime: '07:00', closeTime: '21:00' };

  it('đang bật và trong giờ → sinh viên đặt được', () => {
    render(<AcceptingOrdersStatus stall={base} />);
    expect(screen.getByText('Đang bật: sinh viên đang đặt món trực tuyến được.')).toBeInTheDocument();
  });

  it('đang bật nhưng ngoài giờ → cảnh báo, không còn mâu thuẫn với nhãn "Đã đóng cửa"', () => {
    render(<AcceptingOrdersStatus stall={{ ...base, isOpenNow: false, canOrderNow: false }} />);
    expect(screen.getByText(/Đang bật nhưng ngoài giờ mở cửa: sinh viên đặt được từ 07:00/)).toBeInTheDocument();
  });

  it('quầy bị quản trị khoá → nói rõ lý do', () => {
    render(<AcceptingOrdersStatus stall={{ ...base, isActive: false, canOrderNow: false }} />);
    expect(screen.getByText(/quầy đang bị quản trị tạm khoá/)).toBeInTheDocument();
  });

  it('đang tắt → sinh viên chưa đặt được', () => {
    render(<AcceptingOrdersStatus stall={{ ...base, isAcceptingOrders: false, canOrderNow: false }} />);
    expect(screen.getByText('Đang tắt: sinh viên chưa đặt món được.')).toBeInTheDocument();
  });

  it('công tắc trỏ tới dòng trạng thái để trình đọc màn hình đọc kèm', () => {
    render(
      <>
        <Switch label="Nhận đơn mới" checked onChange={vi.fn()} describedBy="accepting-orders-status" />
        <AcceptingOrdersStatus stall={base} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Nhận đơn mới' })).toHaveAccessibleDescription('Đang bật: sinh viên đang đặt món trực tuyến được.');
  });
});

describe('UI-04: thẻ quầy có lời gọi "Xem thực đơn →"', () => {
  it('chân thẻ hiện "Xem thực đơn", cả thẻ dẫn tới trang quầy', () => {
    render(
      <MemoryRouter>
        <StallCard stall={makeStall()} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/quan-an/pho-mi-co-ba');
    expect(within(link).getByText('Xem thực đơn')).toBeInTheDocument();
  });
});

describe('VN-01: câu mời đặt món cuối trang chủ', () => {
  it('sinh viên → gọi bằng tên riêng', () => {
    expect(hungryTitle({ role: 'STUDENT', fullName: 'Lê Bảo Ngọc' })).toBe('Đói rồi phải không, Ngọc?');
  });

  it('tài khoản quản trị / quầy → câu chung, không còn "phải không, QuickBite?"', () => {
    expect(hungryTitle({ role: 'ADMIN', fullName: 'Quản trị viên QuickBite' })).toBe('Đói rồi phải không bạn ơi?');
    expect(hungryTitle({ role: 'VENDOR', fullName: 'Kiều Minh Khoa' })).toBe('Đói rồi phải không bạn ơi?');
  });
});

describe('ACC-02: nút tài khoản trên thanh điều hướng có tên cho trình đọc màn hình', () => {
  it('nút mở menu tài khoản có nhãn kèm họ tên (kể cả khi tên bị ẩn trên điện thoại)', async () => {
    vi.mocked(authService.me).mockResolvedValue(makeUser({ fullName: 'Nguyễn Văn An' }));
    renderRoutes([{ path: '/', element: <Header /> }], '/');
    const button = await screen.findByRole('button', { name: 'Tài khoản: Nguyễn Văn An' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('title', 'Nguyễn Văn An');
  });
});
