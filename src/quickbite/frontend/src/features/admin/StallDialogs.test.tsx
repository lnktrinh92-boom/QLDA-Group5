import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { adminService } from '@/services/admin.service';
import { withQueryClient } from '@/test/utils';
import type { AdminStall } from '@/types/admin';
import { StallFormDialog, StallMembersDialog } from './StallDialogs';

vi.mock('@/services/admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/admin.service')>();
  return {
    ...actual,
    adminService: { createStall: vi.fn(), updateStall: vi.fn(), addMember: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn() },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const member = (id: number, role: 'OWNER' | 'STAFF', fullName: string) => ({
  id,
  role,
  userId: id,
  user: { id, fullName, email: `u${id}@test.local`, status: 'ACTIVE' as const },
});

function makeAdminStall(overrides: Partial<AdminStall> = {}): AdminStall {
  return {
    id: 7,
    name: 'Bếp Nhà Sinh Viên',
    slug: 'bep-nha-sinh-vien',
    description: null,
    imageUrl: null,
    location: 'Căn tin tòa A',
    phone: null,
    openTime: '07:00',
    closeTime: '20:00',
    isActive: true,
    isAcceptingOrders: true,
    isOpenNow: true,
    canOrderNow: true,
    rating: { average: null, count: 0 },
    memberships: [member(1, 'OWNER', 'Đỗ Thị Hạnh'), member(2, 'STAFF', 'Ngô Văn Tài')],
    _count: { menuItems: 6, orders: 20 },
    ...overrides,
  };
}

/** Thông báo lỗi mặc định (tiếng Anh) của thư viện kiểm tra dữ liệu, không được lọt ra giao diện */
const ENGLISH_ERRORS = /Too (big|small)|Invalid|expected|Required/;

beforeEach(() => vi.clearAllMocks());

describe('Form thêm / sửa quầy', () => {
  it('mọi lỗi kiểm tra dữ liệu đều bằng tiếng Việt, không gọi API', async () => {
    withQueryClient(<StallFormDialog stall="new" onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Tên quầy/), 'Q');
    await userEvent.type(screen.getByLabelText(/Slug/), 'Sai Slug');
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), '12345');
    await userEvent.type(screen.getByLabelText(/Ảnh bìa/), 'http://anh.example/a.png');
    await userEvent.type(screen.getByLabelText(/Email chủ quầy/), 'khong-phai-email');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo quầy' }));

    expect(await screen.findByText('Tên quầy phải có ít nhất 2 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Chỉ gồm chữ thường không dấu, số và dấu gạch ngang')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập vị trí')).toBeInTheDocument();
    expect(screen.getByText('Số điện thoại không hợp lệ')).toBeInTheDocument();
    expect(screen.getByText('Ảnh phải là /images/..., /uploads/... hoặc https://')).toBeInTheDocument();
    expect(screen.getByText('Email chủ quầy không hợp lệ')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(ENGLISH_ERRORS);
    expect(adminService.createStall).not.toHaveBeenCalled();
  });

  it('quá độ dài cho phép → báo tiếng Việt (tên, slug, vị trí, giới thiệu)', async () => {
    withQueryClient(<StallFormDialog stall="new" onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Tên quầy/));
    await user.paste('a'.repeat(121));
    await user.click(screen.getByLabelText(/Slug/));
    await user.paste('a'.repeat(141));
    await user.click(screen.getByLabelText(/Vị trí/));
    await user.paste('a'.repeat(201));
    await user.click(screen.getByLabelText('Giới thiệu'));
    await user.paste('a'.repeat(1001));
    await user.click(screen.getByRole('button', { name: 'Tạo quầy' }));

    expect(await screen.findByText('Tên quầy tối đa 120 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Slug tối đa 140 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Vị trí tối đa 200 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Giới thiệu tối đa 1000 ký tự')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(ENGLISH_ERRORS);
  });

  it('thêm quầy kèm chủ quầy: gửi ownerEmail; email chưa có vai trò Chủ quầy → báo ngay dưới ô email', async () => {
    vi.mocked(adminService.createStall).mockRejectedValueOnce(
      new ApiError('"Nguyễn Văn An" chưa có vai trò Chủ quầy. Hãy đổi vai trò người dùng sang Chủ quầy trước.', 422, 'BUSINESS_RULE_VIOLATION', [
        { field: 'email', message: 'Người dùng chưa có vai trò Chủ quầy' },
      ]),
    );
    withQueryClient(<StallFormDialog stall="new" onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Tên quầy/), 'Quầy Mới');
    await userEvent.type(screen.getByLabelText(/Vị trí/), 'Tòa B');
    await userEvent.type(screen.getByLabelText(/Email chủ quầy/), 'an@test.local');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo quầy' }));

    await waitFor(() => expect(adminService.createStall).toHaveBeenCalledWith(expect.objectContaining({ name: 'Quầy Mới', location: 'Tòa B', ownerEmail: 'an@test.local' })));
    expect(await screen.findByText(/chưa có vai trò Chủ quầy/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email chủ quầy/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sửa quầy: không có ô chủ quầy, không gửi ownerEmail; slug trùng → báo dưới ô slug', async () => {
    vi.mocked(adminService.updateStall).mockRejectedValueOnce(
      new ApiError('Slug đã được dùng', 409, 'CONFLICT', [{ field: 'slug', message: 'Slug đã được dùng cho quầy khác' }]),
    );
    withQueryClient(<StallFormDialog stall={makeAdminStall()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText(/Email chủ quầy/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(adminService.updateStall).toHaveBeenCalled());
    expect(vi.mocked(adminService.updateStall).mock.calls[0]![1]).not.toHaveProperty('ownerEmail');
    expect(await screen.findByText('Slug đã được dùng cho quầy khác')).toBeInTheDocument();
  });
});

describe('Nhân sự quầy: mỗi quầy đúng 1 chủ quầy', () => {
  it('đã có chủ quầy: chỉ thêm được nhân viên, không gỡ được chủ quầy', () => {
    withQueryClient(<StallMembersDialog stall={makeAdminStall()} onClose={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Chủ quầy (đã có)' })).toBeDisabled();
    expect(screen.getByLabelText('Vai trò tại quầy')).toHaveValue('STAFF');
    expect(screen.getByRole('button', { name: 'Không gỡ được chủ quầy Đỗ Thị Hạnh' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gỡ Ngô Văn Tài khỏi quầy' })).toBeEnabled();
  });

  it('chưa có chủ quầy: cảnh báo và mặc định thêm làm chủ quầy', async () => {
    vi.mocked(adminService.addMember).mockResolvedValueOnce(makeAdminStall({ memberships: [member(3, 'OWNER', 'Chủ Mới')] }));
    withQueryClient(<StallMembersDialog stall={makeAdminStall({ memberships: [] })} onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mỗi quầy cần đúng 1 chủ quầy');
    expect(screen.getByLabelText('Vai trò tại quầy')).toHaveValue('OWNER');

    await userEvent.type(screen.getByLabelText('Email người dùng'), 'chu.moi@test.local');
    await userEvent.click(screen.getByRole('button', { name: /Thêm/ }));
    await waitFor(() => expect(adminService.addMember).toHaveBeenCalledWith(7, 'chu.moi@test.local', 'OWNER'));
    expect(toast.success).toHaveBeenCalledWith('Đã gán chủ quầy');
  });

  it('chuyển quyền chủ quầy cho nhân viên: hỏi xác nhận rồi gọi API', async () => {
    vi.mocked(adminService.updateMember).mockResolvedValueOnce(makeAdminStall({ memberships: [member(2, 'OWNER', 'Ngô Văn Tài'), member(1, 'STAFF', 'Đỗ Thị Hạnh')] }));
    withQueryClient(<StallMembersDialog stall={makeAdminStall()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Làm chủ quầy' }));
    const confirm = await screen.findByRole('dialog', { name: /Chuyển quyền chủ quầy cho Ngô Văn Tài/ });
    expect(confirm).toHaveTextContent('Đỗ Thị Hạnh sẽ chuyển thành nhân viên');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Chuyển quyền' }));

    await waitFor(() => expect(adminService.updateMember).toHaveBeenCalledWith(7, 2, 'OWNER'));
    expect(toast.success).toHaveBeenCalledWith('Đã chuyển quyền chủ quầy');
  });

  it('lỗi từ server hiện đúng câu tiếng Việt; email sai định dạng báo ngay, không gọi API', async () => {
    vi.mocked(adminService.addMember).mockRejectedValueOnce(new ApiError('Không tìm thấy người dùng với email này', 404, 'NOT_FOUND'));
    withQueryClient(<StallMembersDialog stall={makeAdminStall()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Email người dùng'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /Thêm/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập email hợp lệ');
    expect(adminService.addMember).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Email người dùng'));
    await userEvent.type(screen.getByLabelText('Email người dùng'), 'khong.co@test.local');
    await userEvent.click(screen.getByRole('button', { name: /Thêm/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy người dùng với email này');
  });
});
