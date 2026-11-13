import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { adminService } from '@/services/admin.service';
import { makeUser, withQueryClient } from '@/test/utils';
import { EditUserDialog } from './UserDialogs';

vi.mock('@/services/admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/admin.service')>();
  return { ...actual, adminService: { updateUser: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const owner = makeUser({
  id: 5,
  fullName: 'Đỗ Thị Hạnh',
  role: 'VENDOR',
  stalls: [{ id: 1, name: 'Bếp Nhà Sinh Viên', slug: 'bep-nha-sinh-vien', role: 'OWNER' }],
});

describe('Sửa người dùng: đổi vai trò chủ quầy', () => {
  it('chủ quầy đổi sang vai trò khác → cảnh báo cần chuyển quyền trước, không cho lưu', async () => {
    withQueryClient(<EditUserDialog user={owner} isSelf={false} onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'STUDENT');

    expect(screen.getByRole('alert')).toHaveTextContent('Đỗ Thị Hạnh đang là chủ quầy "Bếp Nhà Sinh Viên". Hãy chuyển quyền chủ quầy cho người khác');
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();

    // Đổi lại Chủ quầy thì hết cảnh báo
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'VENDOR');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('nhân viên quầy đổi vai trò: được lưu, báo sẽ bị gỡ khỏi quầy', async () => {
    vi.mocked(adminService.updateUser).mockResolvedValueOnce(makeUser());
    const staff = makeUser({ id: 6, role: 'VENDOR', stalls: [{ id: 1, name: 'Bếp Nhà Sinh Viên', slug: 'bep-nha-sinh-vien', role: 'STAFF' }] });
    withQueryClient(<EditUserDialog user={staff} isSelf={false} onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'STUDENT');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('sẽ bị gỡ khỏi các quầy đang quản lý');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(adminService.updateUser).toHaveBeenCalledWith(6, expect.objectContaining({ role: 'STUDENT' })));
  });

  it('server từ chối (dữ liệu cũ chưa kịp cập nhật) → hiện lỗi ngay dưới ô vai trò', async () => {
    vi.mocked(adminService.updateUser).mockRejectedValueOnce(
      new ApiError('Đang là chủ quầy', 422, 'BUSINESS_RULE_VIOLATION', [{ field: 'role', message: 'Đang là chủ quầy "Quầy B", cần chuyển quyền trước' }]),
    );
    withQueryClient(<EditUserDialog user={makeUser({ id: 7, role: 'VENDOR' })} isSelf={false} onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'STUDENT');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Đang là chủ quầy "Quầy B", cần chuyển quyền trước')).toBeInTheDocument();
    expect(screen.getByLabelText('Vai trò')).toHaveAttribute('aria-invalid', 'true');
  });
});
