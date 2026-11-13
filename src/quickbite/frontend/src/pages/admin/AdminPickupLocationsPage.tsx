import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { ErrorState } from '@/components/ui/States';
import { Switch } from '@/components/ui/Switch';
import { PageHeader } from '@/features/admin/PageHeader';
import { applyServerErrors } from '@/lib/form-errors';
import { toApiError } from '@/lib/api-client';
import { adminKeys, adminService } from '@/services/admin.service';
import { orderKeys } from '@/services/orders.service';
import type { AdminPickupLocation } from '@/types/admin';

const schema = z.object({
  name: z.string().trim().min(2, 'Tên điểm nhận phải có ít nhất 2 ký tự').max(120),
  building: z.string().max(120),
  description: z.string().max(255),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function AdminPickupLocationsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminPickupLocation | 'new' | null>(null);
  const { data, isPending, error, refetch } = useQuery({ queryKey: adminKeys.pickups, queryFn: adminService.pickupLocations });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adminKeys.pickups });
    qc.invalidateQueries({ queryKey: orderKeys.pickupLocations });
  };
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => adminService.updatePickupLocation(id, { isActive }),
    onSuccess: (l) => {
      invalidate();
      toast.success(l.isActive ? `Đã mở điểm nhận "${l.name}"` : `Đã đóng điểm nhận "${l.name}"`);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const columns: Column<AdminPickupLocation>[] = [
    {
      key: 'name',
      header: 'Điểm nhận',
      cell: (l) => (
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
          <div>
            <p className="font-semibold">{l.name}</p>
            {l.building && <p className="text-xs text-navy-500">{l.building}</p>}
          </div>
        </div>
      ),
    },
    { key: 'desc', header: 'Hướng dẫn', cell: (l) => <span className="text-navy-600">{l.description ?? '—'}</span> },
    { key: 'orders', header: 'Số đơn', align: 'right', cell: (l) => l.orderCount },
    {
      key: 'active',
      header: 'Đang mở',
      cell: (l) => <Switch size="sm" hideLabel label={`Điểm nhận ${l.name} đang mở`} checked={l.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: l.id, isActive: v })} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (l) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(l)} aria-label={`Sửa ${l.name}`}>
          <Pencil className="size-4" aria-hidden /> Sửa
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Điểm nhận món"
        description="Điểm đang đóng sẽ không hiện ở trang đặt món. Đơn cũ vẫn giữ nguyên thông tin."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Thêm điểm nhận
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (
        <DataTable caption="Điểm nhận món" columns={columns} rows={data} rowKey={(l) => l.id} loading={isPending} minWidth={640} />
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Thêm điểm nhận' : 'Sửa điểm nhận'} className="max-w-lg">
        {editing !== null && <PickupForm key={editing === 'new' ? 'new' : editing.id} location={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function PickupForm({ location, onDone }: { location: AdminPickupLocation | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: location?.name ?? '', building: location?.building ?? '', description: location?.description ?? '', isActive: location?.isActive ?? true },
  });
  // Đã có đơn → khoá tên / toà nhà (server cũng chặn), vẫn sửa hướng dẫn và bật / tắt được
  const locked = !!location && location.orderCount > 0;
  const save = useMutation({
    mutationFn: (v: Values) => {
      const input = { name: v.name, building: v.building.trim() || null, description: v.description.trim() || null, isActive: v.isActive };
      return location ? adminService.updatePickupLocation(location.id, input) : adminService.createPickupLocation(input);
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: adminKeys.pickups });
      qc.invalidateQueries({ queryKey: orderKeys.pickupLocations });
      toast.success(location ? `Đã lưu "${l.name}"` : `Đã thêm điểm nhận "${l.name}"`);
      onDone();
    },
    onError: (e) => applyServerErrors(e, setError, ['name', 'building', 'description']),
  });
  return (
    <form noValidate className="space-y-4 p-6 pt-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
      {locked && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Điểm nhận đã có {location.orderCount} đơn hàng nên không đổi được tên và toà nhà (đơn cũ sẽ hiện sai nơi nhận). Muốn đổi nơi nhận: tắt điểm này và thêm điểm nhận mới.
        </p>
      )}
      <FormField label="Tên điểm nhận" required readOnly={locked} placeholder="Vd: Căn tin cơ sở B" error={errors.name?.message} {...register('name')} />
      <FormField label="Toà nhà" readOnly={locked} error={errors.building?.message} {...register('building')} />
      <FormField label="Hướng dẫn tìm đường" placeholder="Vd: Quầy nhận món cạnh thang máy" error={errors.description?.message} {...register('description')} />
      <Controller control={control} name="isActive" render={({ field }) => <Switch label="Đang mở (sinh viên chọn được)" checked={field.value} onChange={field.onChange} />} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" loading={save.isPending}>
          {location ? 'Lưu' : 'Thêm'}
        </Button>
      </div>
    </form>
  );
}
