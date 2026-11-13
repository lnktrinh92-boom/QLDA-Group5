import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminService } from '@/services/admin.service';
import { withQueryClient } from '@/test/utils';
import type { AdminPickupLocation } from '@/types/admin';
import { AdminPickupLocationsPage } from './AdminPickupLocationsPage';

vi.mock('@/services/admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/admin.service')>();
  return { ...actual, adminService: { pickupLocations: vi.fn(), updatePickupLocation: vi.fn(), createPickupLocation: vi.fn(), deletePickupLocation: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const loc = (o: Partial<AdminPickupLocation>): AdminPickupLocation => ({ id: 1, name: 'Căn tin cơ sở B', building: 'Cơ sở B', description: null, isActive: true, orderCount: 0, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminService.pickupLocations).mockResolvedValue([loc({ id: 1, orderCount: 12 }), loc({ id: 2, name: 'Cổng phụ cơ sở N', building: 'Cơ sở N', orderCount: 0 })]);
});

describe('Sửa điểm nhận', () => {
  it('điểm nhận đã có đơn: khoá tên và toà nhà, giải thích lý do; vẫn sửa được hướng dẫn', async () => {
    vi.mocked(adminService.updatePickupLocation).mockResolvedValueOnce(loc({ id: 1, orderCount: 12, description: 'Cạnh thang máy' }));
    withQueryClient(<AdminPickupLocationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa Căn tin cơ sở B' }));

    expect(screen.getByRole('status')).toHaveTextContent('Điểm nhận đã có 12 đơn hàng nên không đổi được tên và toà nhà');
    expect(screen.getByLabelText(/Tên điểm nhận/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Toà nhà')).toHaveAttribute('readonly');
    await userEvent.type(screen.getByLabelText('Toà nhà'), ' đổi');
    expect(screen.getByLabelText('Toà nhà')).toHaveValue('Cơ sở B');

    await userEvent.type(screen.getByLabelText('Hướng dẫn tìm đường'), 'Cạnh thang máy');
    await userEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(adminService.updatePickupLocation).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Căn tin cơ sở B', building: 'Cơ sở B', description: 'Cạnh thang máy' })));
  });

  it('điểm nhận chưa có đơn: đổi tên / toà nhà bình thường', async () => {
    withQueryClient(<AdminPickupLocationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa Cổng phụ cơ sở N' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Tên điểm nhận/)).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Toà nhà')).not.toHaveAttribute('readonly');
  });
});
