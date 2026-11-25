import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { catalogService } from '@/services/catalog.service';
import { makeMenuItem, makeStall } from '@/test/fixtures';
import { renderRoutes } from '@/test/utils';
import { StallDetailPage } from './StallDetailPage';

vi.mock('@/services/catalog.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/catalog.service')>();
  return { ...actual, catalogService: { stall: vi.fn(), menuItem: vi.fn() } };
});
vi.mock('@/services/auth.service', () => ({ authService: { me: vi.fn() } }));

const rice = { id: 1, name: 'Cơm', slug: 'com' };
const snack = { id: 5, name: 'Ăn vặt & Tráng miệng', slug: 'an-vat' };
const detail = {
  stall: makeStall({ name: 'Bếp Nhà Sinh Viên', slug: 'bep-nha-sinh-vien', description: 'Cơm nhà nấu, giá sinh viên.', location: 'Căn tin tòa A', phone: '0283800001', rating: { average: 4, count: 2 } }),
  categories: [rice, snack],
  menuItems: [
    makeMenuItem({ id: 1, name: 'Cơm gà bowl sốt mè', category: rice }),
    makeMenuItem({ id: 2, name: 'Thịt viên sốt cà', category: rice, isAvailable: false, canOrder: false }),
    makeMenuItem({ id: 3, name: 'Thịt nướng xiên', category: snack }),
  ],
  reviews: [{ id: 1, rating: 5, comment: 'Cơm ngon, phần đầy đặn!', createdAt: '2026-10-20T05:00:00.000Z', author: 'Nguyễn Văn An' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.me).mockResolvedValue(null as never);
  vi.mocked(catalogService.stall).mockResolvedValue(detail);
});

const render = (slug = 'bep-nha-sinh-vien') =>
  renderRoutes([{ path: '/quan-an/:slug', element: <StallDetailPage /> }], `/quan-an/${slug}`);

describe('StallDetailPage (trang quầy)', () => {
  it('hiện thông tin quầy: tên, mô tả, vị trí, giờ mở cửa, số điện thoại, điểm đánh giá', async () => {
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bếp Nhà Sinh Viên' })).toBeInTheDocument();
    expect(screen.getByText('Cơm nhà nấu, giá sinh viên.')).toBeInTheDocument();
    expect(screen.getByText('Căn tin tòa A')).toBeInTheDocument();
    expect(screen.getByText(/Mở cửa 06:00 – 20:00/)).toBeInTheDocument();
    expect(screen.getByText('0283800001')).toBeInTheDocument();
    expect(catalogService.stall).toHaveBeenCalledWith('bep-nha-sinh-vien');
  });

  it('thực đơn nhóm theo danh mục, có thanh điều hướng nhảy tới từng danh mục', async () => {
    render();
    const nav = await screen.findByRole('navigation', { name: 'Danh mục thực đơn' });
    expect(within(nav).getByRole('link', { name: 'Cơm' })).toHaveAttribute('href', '#danh-muc-com');
    const riceSection = screen.getByRole('region', { name: /^Cơm/ });
    expect(within(riceSection).getByText('Cơm gà bowl sốt mè')).toBeInTheDocument();
    expect(within(riceSection).getByText('Thịt viên sốt cà')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^Ăn vặt/ })).getByText('Thịt nướng xiên')).toBeInTheDocument();
  });

  it('món hết hàng có nhãn "Tạm hết"; bấm vào món mở hộp chi tiết', async () => {
    render();
    expect(await screen.findByText('Tạm hết')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Cơm gà bowl sốt mè,/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Cơm gà bowl sốt mè');
  });

  it('hiện đánh giá gần đây (tên người đánh giá, số sao, nhận xét)', async () => {
    render();
    expect(await screen.findByText('Cơm ngon, phần đầy đặn!')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.getByLabelText('5 trên 5 sao')).toBeInTheDocument();
  });

  it('quầy không tồn tại (404) → trang "Không tìm thấy trang"', async () => {
    vi.mocked(catalogService.stall).mockRejectedValue(new ApiError('Không tìm thấy quầy ăn', 404, 'NOT_FOUND'));
    render('khong-ton-tai');
    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument();
  });
});
