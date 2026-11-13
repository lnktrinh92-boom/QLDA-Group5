import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField, PasswordField } from '@/components/ui/FormField';
import { SelectField } from '@/components/ui/SelectField';
import { ROLE_LABELS, STATUS_LABELS, type AccountStatus, type Role, type User } from '@/features/auth/types';
import { applyServerErrors } from '@/lib/form-errors';
import { adminKeys, adminService } from '@/services/admin.service';

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }));

const phone = z.string().trim().refine((v) => v === '' || /^(0|\+84)\d{9,10}$/.test(v), 'Số điện thoại không hợp lệ');
const password = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu phải có ít nhất 1 chữ cái')
  .regex(/\d/, 'Mật khẩu phải có ít nhất 1 chữ số');

const useInvalidateUsers = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: adminKeys.dashboard });
  };
};

// ─────────── Tạo tài khoản ───────────
const createSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  email: z.string().trim().min(1, 'Vui lòng nhập email').pipe(z.email('Email không hợp lệ')),
  password,
  role: z.enum(['STUDENT', 'VENDOR', 'ADMIN']),
  phone,
  studentCode: z.string().trim(),
});
type CreateValues = z.infer<typeof createSchema>;

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Tạo tài khoản" className="max-w-lg">
      {open && <CreateUserForm onDone={onClose} />}
    </Dialog>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const invalidate = useInvalidateUsers();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'VENDOR', phone: '', studentCode: '' },
  });
  const create = useMutation({
    mutationFn: adminService.createUser,
    onSuccess: (user) => {
      invalidate();
      toast.success(`Đã tạo tài khoản ${user.email}`);
      onDone();
    },
    onError: (e) => applyServerErrors(e, setError, ['fullName', 'email', 'password', 'role', 'phone', 'studentCode']),
  });

  return (
    <form
      noValidate
      className="space-y-4 p-6 pt-4"
      onSubmit={handleSubmit((v) => create.mutate({ ...v, phone: v.phone || null, studentCode: v.studentCode || null }))}
    >
      <FormField label="Họ và tên" required error={errors.fullName?.message} {...register('fullName')} />
      <FormField label="Email" type="email" required autoComplete="off" error={errors.email?.message} {...register('email')} />
      <PasswordField label="Mật khẩu ban đầu" required autoComplete="new-password" hint="Gửi mật khẩu này cho người dùng; họ nên đổi sau khi đăng nhập." error={errors.password?.message} {...register('password')} />
      <SelectField label="Vai trò" required options={ROLE_OPTIONS} error={errors.role?.message} {...register('role')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Số điện thoại" type="tel" error={errors.phone?.message} {...register('phone')} />
        <FormField label="Mã sinh viên" error={errors.studentCode?.message} {...register('studentCode')} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" loading={create.isPending}>
          Tạo tài khoản
        </Button>
      </div>
    </form>
  );
}

// ─────────── Sửa người dùng ───────────
const editSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  phone,
  studentCode: z.string().trim(),
  role: z.enum(['STUDENT', 'VENDOR', 'ADMIN']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});
type EditValues = z.infer<typeof editSchema>;

export function EditUserDialog({ user, isSelf, onClose }: { user: User | null; isSelf: boolean; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onClose={onClose} title={user ? `Sửa: ${user.fullName}` : 'Sửa người dùng'} className="max-w-lg">
      {user && <EditUserForm key={user.id} user={user} isSelf={isSelf} onDone={onClose} />}
    </Dialog>
  );
}

function EditUserForm({ user, isSelf, onDone }: { user: User; isSelf: boolean; onDone: () => void }) {
  const invalidate = useInvalidateUsers();
  const { register, handleSubmit, setError, control, formState: { errors, isDirty } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: user.fullName, phone: user.phone ?? '', studentCode: user.studentCode ?? '', role: user.role, status: user.status },
  });
  const update = useMutation({
    mutationFn: (v: EditValues) => adminService.updateUser(user.id, { ...v, phone: v.phone || null, studentCode: v.studentCode || null }),
    onSuccess: () => {
      invalidate();
      toast.success('Đã cập nhật người dùng');
      onDone();
    },
    onError: (e) => applyServerErrors(e, setError, ['fullName', 'phone', 'studentCode', 'role', 'status']),
  });
  const [role, status] = useWatch({ control, name: ['role', 'status'] });
  // Chủ quầy phải chuyển quyền cho người khác trước khi đổi vai trò, nếu không quầy sẽ mất chủ
  const ownedStalls = user.stalls.filter((s) => s.role === 'OWNER');
  const blockedByOwnership = ownedStalls.length > 0 && role !== 'VENDOR';

  return (
    <form noValidate className="space-y-4 p-6 pt-4" onSubmit={handleSubmit((v) => update.mutate(v))}>
      <p className="text-sm text-navy-500">{user.email}</p>
      <FormField label="Họ và tên" required error={errors.fullName?.message} {...register('fullName')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Số điện thoại" type="tel" error={errors.phone?.message} {...register('phone')} />
        <FormField label="Mã sinh viên" error={errors.studentCode?.message} {...register('studentCode')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Vai trò" options={ROLE_OPTIONS} disabled={isSelf} error={errors.role?.message} {...register('role')} />
        <SelectField label="Trạng thái" options={STATUS_OPTIONS} disabled={isSelf} error={errors.status?.message} {...register('status')} />
      </div>
      {isSelf && <p className="text-xs text-navy-500">Bạn không thể tự đổi vai trò hoặc khoá tài khoản của chính mình.</p>}
      {(role !== user.role || status !== user.status) && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Đổi vai trò hoặc trạng thái sẽ đăng xuất người dùng khỏi mọi thiết bị.
          {user.role === 'VENDOR' && role !== 'VENDOR' && !blockedByOwnership && ' Người dùng cũng sẽ bị gỡ khỏi các quầy đang quản lý.'}
        </p>
      )}
      {blockedByOwnership && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {user.fullName} đang là chủ quầy {ownedStalls.map((s) => `"${s.name}"`).join(', ')}. Hãy chuyển quyền chủ quầy cho người khác (Quầy ăn → Nhân sự) trước khi đổi vai trò.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" loading={update.isPending} disabled={!isDirty || blockedByOwnership}>
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}

// ─────────── Đặt lại mật khẩu ───────────
export function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onClose={onClose} title={user ? `Đặt lại mật khẩu: ${user.fullName}` : 'Đặt lại mật khẩu'} className="max-w-md">
      {user && <ResetPasswordForm key={user.id} user={user} onDone={onClose} />}
    </Dialog>
  );
}

function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { register, handleSubmit, setError, formState: { errors } } = useForm<{ newPassword: string }>({
    resolver: zodResolver(z.object({ newPassword: password })),
    defaultValues: { newPassword: '' },
  });
  const reset = useMutation({
    mutationFn: (v: { newPassword: string }) => adminService.resetPassword(user.id, v.newPassword),
    onSuccess: (r) => {
      toast.success(r.message);
      onDone();
    },
    onError: (e) => applyServerErrors(e, setError, ['newPassword']),
  });
  return (
    <form noValidate className="space-y-4 p-6 pt-4" onSubmit={handleSubmit((v) => reset.mutate(v))}>
      <p className="text-sm text-navy-600">Người dùng {user.email} sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập bằng mật khẩu mới.</p>
      <PasswordField label="Mật khẩu mới" required autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword')} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" variant="danger" loading={reset.isPending}>
          Đặt lại mật khẩu
        </Button>
      </div>
    </form>
  );
}
