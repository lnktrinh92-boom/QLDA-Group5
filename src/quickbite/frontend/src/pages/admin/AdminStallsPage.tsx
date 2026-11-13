import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorState } from '@/components/ui/States';
import { Switch } from '@/components/ui/Switch';
import { PageHeader } from '@/features/admin/PageHeader';
import { StallFormDialog, StallMembersDialog } from '@/features/admin/StallDialogs';
import { StallStatusBadge } from '@/features/food-discovery/badges';
import { toApiError } from '@/lib/api-client';
import { adminKeys, adminService } from '@/services/admin.service';
import type { AdminStall } from '@/types/admin';

export function AdminStallsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminStall | 'new' | null>(null);
  const [members, setMembers] = useState<AdminStall | null>(null);
  const { data, isPending, error, refetch } = useQuery({ queryKey: adminKeys.stalls, queryFn: () => adminService.stalls() });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => adminService.updateStall(id, { isActive }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: adminKeys.stalls });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      toast.success(s.isActive ? `Đã bật quầy "${s.name}"` : `Đã tắt quầy "${s.name}" — sinh viên không còn thấy quầy này`);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const columns: Column<AdminStall>[] = [
    {
      key: 'name',
      header: 'Quầy',
      cell: (s) => (
        <>
          <p className="font-semibold">{s.name}</p>
          <p className="text-xs text-navy-500">{s.location}</p>
        </>
      ),
    },
    { key: 'hours', header: 'Giờ mở cửa', cell: (s) => <span className="whitespace-nowrap tabular-nums">{s.openTime} – {s.closeTime}</span> },
    { key: 'status', header: 'Tình trạng', cell: (s) => (s.isActive ? <StallStatusBadge isOpenNow={s.isOpenNow} canOrderNow={s.canOrderNow} /> : <span className="text-xs font-semibold text-gray-500">Đã tắt</span>) },
    {
      key: 'members',
      header: 'Nhân sự',
      cell: (s) => {
        const owner = s.memberships.find((m) => m.role === 'OWNER');
        const staff = s.memberships.length - (owner ? 1 : 0);
        return (
          <>
            {owner ? (
              <p className="text-navy-700">{owner.user.fullName}</p>
            ) : (
              <p className="text-xs font-semibold text-amber-700">Chưa có chủ quầy</p>
            )}
            {staff > 0 && <p className="text-xs text-navy-500">{staff} nhân viên</p>}
          </>
        );
      },
    },
    { key: 'stats', header: 'Món / Đơn', align: 'right', cell: (s) => <span className="tabular-nums">{s._count.menuItems} / {s._count.orders}</span> },
    { key: 'rating', header: 'Đánh giá', align: 'right', cell: (s) => (s.rating.average !== null ? `${s.rating.average.toFixed(1)} ★ (${s.rating.count})` : '—') },
    {
      key: 'active',
      header: 'Hoạt động',
      cell: (s) => <Switch size="sm" hideLabel label={`Quầy ${s.name} hoạt động`} checked={s.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: s.id, isActive: v })} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setMembers(s)} aria-label={`Nhân sự quầy ${s.name}`}>
            <Users className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`Sửa quầy ${s.name}`}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          {s.isActive && (
            <Link to={`/quan-an/${s.slug}`} className="inline-flex size-9 items-center justify-center rounded-xl text-navy-600 hover:bg-gray-100" aria-label={`Xem trang quầy ${s.name}`}>
              <ExternalLink className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quầy ăn"
        description={data ? `${data.length} quầy · ${data.filter((s) => s.isActive).length} đang hoạt động` : ' '}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Thêm quầy
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (
        <DataTable caption="Danh sách quầy ăn" columns={columns} rows={data} rowKey={(s) => s.id} loading={isPending} minWidth={960} empty="Chưa có quầy nào" />
      )}
      <StallFormDialog stall={editing} onClose={() => setEditing(null)} />
      <StallMembersDialog stall={members} onClose={() => setMembers(null)} />
    </div>
  );
}
