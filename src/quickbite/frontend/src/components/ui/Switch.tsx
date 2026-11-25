import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Ẩn nhãn khỏi màn hình (vẫn đọc được bởi trình đọc màn hình) */
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** id của đoạn mô tả trạng thái đi kèm (aria-describedby) */
  describedBy?: string;
}

/** Công tắc bật/tắt có vai trò "switch" cho trình đọc màn hình */
export function Switch({ checked, onChange, label, hideLabel, disabled, size = 'md', describedBy }: SwitchProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full transition-colors',
          size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
          checked ? 'bg-green-500' : 'bg-gray-300',
        )}
      >
        <span
          className={cn(
            'inline-block rounded-full bg-white shadow transition-transform',
            size === 'sm' ? 'size-4' : 'size-5',
            checked ? (size === 'sm' ? 'translate-x-4.5' : 'translate-x-5.5') : 'translate-x-0.5',
          )}
        />
      </button>
      {!hideLabel && <span className="text-sm font-medium text-navy-800">{label}</span>}
    </label>
  );
}
