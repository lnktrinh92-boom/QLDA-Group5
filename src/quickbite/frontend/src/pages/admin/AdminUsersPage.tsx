import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { KeyRound, Lock, LockOpen, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorState } from '@/components/ui/States';
import { inputClass } from '@/components/ui/styles';
import { PageHeader } from '@/features/admin/PageHeader';
import { CreateUserDialog, EditUserDialog, LockUserDialog, ResetPasswordDialog } from '@/features/admin/UserDialogs';
import { useCurrentUser } from '@/features/auth/hooks';
import { ROLE_LABELS, STATUS_LABELS, type AccountStatus, type Role, type User } from '@/features/auth/types';
import { adminKeys, adminService } from '@/services/admin.service';
import { cn, formatDate } from '@/lib/utils';

const STATUS_STYLE: Record<AccountStatus, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
  SUSPENDED: 'bg-red-50 text-red-700',
};

export function AdminUsersPage() {
  const { data: me } = useCurrentUser();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [locking, setLocking] = useState<User | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = { search, role: role || undefined, status: status || undefined, page, pageSize: 15 };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => adminService.listUsers(params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<User>[] = [
    {
      key: 'user',
      header: 'Người dùng',
      cell: (u) => (
        <>
          <p className="font-medium">
            {u.fullName}
            {u.id === me?.id && <span className="ml-1.5 text-xs text-brand-600">(bạn)</span>}
          </p>
          <p className="text-xs text-navy-500">{u.email}</p>
        </>
      ),
    },
    { key: 'role', header: 'Vai trò', cell: (u) => <span className="whitespace-nowrap">{ROLE_LABELS[u.role]}</span> },
    { key: 'stalls', header: 'Quầy quản lý', cell: (u) => <span className="text-navy-600">{u.stalls.map((s) => s.name).join(', ') || '—'}</span> },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (u) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_STYLE[u.status])}>{STATUS_LABELS[u.status]}</span>,
    },
    { key: 'created', header: 'Ngày tạo', cell: (u) => <span className="whitespace-nowrap text-navy-500">{formatDate(u.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Sửa ${u.fullName}`}>
            <Pencil className="size-4" aria-hidden /> Sửa
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResetting(u)} aria-label={`Đặt lại mật khẩu cho ${u.fullName}`}>
            <KeyRound className="size-4" aria-hidden />
          </Button>
          {/* Không tự khoá chính mình (server cũng chặn) */}
          {u.id !== me?.id &&
            (u.status === 'SUSPENDED' ? (
              <Button variant="ghost" size="sm" className="text-green-700 hover:bg-green-50" onClick={() => setLocking(u)} aria-label={`Mở khoá tài khoản ${u.fullName}`} title="Mở khoá">
                <LockOpen className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setLocking(u)} aria-label={`Khoá tài khoản ${u.fullName}`} title="Khoá tài khoản">
                <Lock className="size-4" aria-hidden />
              </Button>
            ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description={data ? `${data.meta.total} tài khoản` : ' '}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Tạo tài khoản
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <label htmlFor="user-search" className="sr-only">
            Tìm người dùng
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            id="user-search"
            type="search"
            placeholder="Tìm theo tên, email, mã sinh viên..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={cn(inputClass(), 'pl-10')}
          />
        </div>
        <label htmlFor="role-filter" className="sr-only">
          Vai trò
        </label>
        <select
          id="role-filter"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role | '');
            setPage(1);
          }}
          className={cn(inputClass(), 'md:w-44')}
        >
          <option value="">Tất cả vai trò</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <label htmlFor="status-filter" className="sr-only">
          Trạng thái
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AccountStatus | '');
            setPage(1);
          }}
          className={cn(inputClass(), 'md:w-44')}
        >
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (
        <div className={cn('transition-opacity', isFetching && !isPending && 'opacity-60')}>
          <DataTable caption="Danh sách người dùng" columns={columns} rows={data?.users} rowKey={(u) => u.id} loading={isPending} empty="Không tìm thấy người dùng phù hợp" />
          {data && data.meta.totalPages > 1 && (
            <div className="mt-4">
              <Pagination meta={data.meta} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <EditUserDialog user={editing} isSelf={editing?.id === me?.id} onClose={() => setEditing(null)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <LockUserDialog user={locking} onClose={() => setLocking(null)} />
    </div>
  );
}
