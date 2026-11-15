import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/auth.service';
import { adminService } from '@/services/admin.service';
import { makeUser, renderRoutes } from '@/test/utils';
import { AdminUsersPage } from './AdminUsersPage';

vi.mock('@/services/auth.service', () => ({ authService: { me: vi.fn() } }));
vi.mock('@/services/admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/admin.service')>();
  return { ...actual, adminService: { listUsers: vi.fn(), updateUser: vi.fn(), createUser: vi.fn(), resetPassword: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const admin = makeUser({ id: 1, fullName: 'Quản Trị Viên', email: 'admin@test.local', role: 'ADMIN' });
const student = makeUser({ id: 2, fullName: 'Nguyễn Văn An', email: 'an@test.local' });
const locked = makeUser({ id: 3, fullName: 'Võ Quốc Em', email: 'em@test.local', status: 'SUSPENDED' });
const meta = { page: 1, pageSize: 15, total: 3, totalPages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.me).mockResolvedValue(admin);
  vi.mocked(adminService.listUsers).mockResolvedValue({ users: [admin, student, locked], meta });
});

const render = () => renderRoutes([{ path: '/quan-tri/nguoi-dung', element: <AdminUsersPage /> }], '/quan-tri/nguoi-dung');
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('AdminUsersPage (quản lý người dùng)', () => {
  it('bảng người dùng: họ tên, email, vai trò, trạng thái; dòng của chính mình ghi "(bạn)" và không có nút khoá', async () => {
    render();
    const me = await rowOf('Quản Trị Viên');
    expect(within(me).getByText('(bạn)')).toBeInTheDocument();
    expect(within(me).queryByRole('button', { name: /Khoá tài khoản/ })).not.toBeInTheDocument();
    const an = await rowOf('Nguyễn Văn An');
    expect(within(an).getByText('an@test.local')).toBeInTheDocument();
    expect(within(an).getByText('Sinh viên')).toBeInTheDocument();
    expect(within(an).getByText('Đang hoạt động')).toBeInTheDocument();
  });

  it('tìm kiếm (chờ gõ xong mới gọi API) và lọc theo vai trò', async () => {
    render();
    await rowOf('Nguyễn Văn An');
    await userEvent.type(screen.getByLabelText('Tìm người dùng'), 'an');
    await waitFor(() => expect(adminService.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'an', page: 1 })), { timeout: 2000 });
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'STUDENT');
    await waitFor(() => expect(adminService.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'STUDENT' })));
  });

  it('bấm "Khoá" → hỏi xác nhận; bấm "Quay lại" thì KHÔNG khoá', async () => {
    render();
    await userEvent.click(within(await rowOf('Nguyễn Văn An')).getByRole('button', { name: 'Khoá tài khoản Nguyễn Văn An' }));
    const dialog = await screen.findByRole('dialog', { name: 'Khoá tài khoản Nguyễn Văn An?' });
    expect(dialog).toHaveTextContent('đăng xuất khỏi mọi thiết bị');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quay lại' }));
    expect(adminService.updateUser).not.toHaveBeenCalled();
  });

  it('xác nhận khoá → gọi API đổi trạng thái SUSPENDED', async () => {
    vi.mocked(adminService.updateUser).mockResolvedValue({ ...student, status: 'SUSPENDED' });
    render();
    await userEvent.click(within(await rowOf('Nguyễn Văn An')).getByRole('button', { name: 'Khoá tài khoản Nguyễn Văn An' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Khoá tài khoản' }));
    await waitFor(() => expect(adminService.updateUser).toHaveBeenCalledWith(2, { status: 'SUSPENDED' }));
  });

  it('tài khoản đang bị khoá → nút "Mở khoá", xác nhận rồi đổi về ACTIVE', async () => {
    vi.mocked(adminService.updateUser).mockResolvedValue({ ...locked, status: 'ACTIVE' });
    render();
    await userEvent.click(within(await rowOf('Võ Quốc Em')).getByRole('button', { name: 'Mở khoá tài khoản Võ Quốc Em' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Mở khoá tài khoản Võ Quốc Em?' })).getByRole('button', { name: 'Mở khoá' }));
    await waitFor(() => expect(adminService.updateUser).toHaveBeenCalledWith(3, { status: 'ACTIVE' }));
  });
});
