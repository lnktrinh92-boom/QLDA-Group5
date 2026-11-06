import { describe, expect, it } from 'vitest';
import { actorForRole, allowedNextStatuses, findTransition } from '../src/modules/orders/order-status.js';
import { generatePickupSlots, validatePickupTime } from '../src/modules/orders/pickup-slots.js';

describe('máy trạng thái đơn hàng', () => {
  it('luồng chuẩn của quầy', () => {
    expect(findTransition('PENDING', 'ACCEPTED', 'STALL_STAFF')).toBeDefined();
    expect(findTransition('ACCEPTED', 'PREPARING', 'STALL_STAFF')).toBeDefined();
    expect(findTransition('PREPARING', 'READY_FOR_PICKUP', 'STALL_STAFF')).toBeDefined();
    expect(findTransition('READY_FOR_PICKUP', 'COMPLETED', 'STALL_STAFF')).toBeDefined();
  });

  it('không được nhảy cóc hoặc quay lui', () => {
    expect(findTransition('PENDING', 'COMPLETED', 'STALL_STAFF')).toBeUndefined();
    expect(findTransition('PREPARING', 'ACCEPTED', 'STALL_STAFF')).toBeUndefined();
    expect(findTransition('COMPLETED', 'CANCELLED', 'ADMIN')).toBeUndefined();
  });

  it('sinh viên chỉ huỷ được khi đơn còn chờ xác nhận', () => {
    expect(allowedNextStatuses('PENDING', 'STUDENT_OWNER')).toEqual(['CANCELLED']);
    expect(allowedNextStatuses('ACCEPTED', 'STUDENT_OWNER')).toEqual([]);
    expect(findTransition('PENDING', 'ACCEPTED', 'STUDENT_OWNER')).toBeUndefined();
  });

  it('từ chối đơn bắt buộc có lý do', () => {
    expect(findTransition('PENDING', 'REJECTED', 'STALL_STAFF')?.requiresReason).toBe(true);
  });

  it('xác định vai trò thực hiện', () => {
    expect(actorForRole('STUDENT', true, false)).toBe('STUDENT_OWNER');
    expect(actorForRole('STUDENT', false, false)).toBeNull();
    expect(actorForRole('VENDOR', false, false)).toBeNull();
    expect(actorForRole('VENDOR', false, true)).toBe('STALL_STAFF');
    expect(actorForRole('ADMIN', false, false)).toBe('ADMIN');
  });
});

describe('khung giờ nhận món', () => {
  // 10:02 giờ Việt Nam
  const now = new Date(Date.UTC(2026, 9, 16, 3, 2));

  it('bắt đầu sau 15 phút, mỗi 15 phút, tối đa 4 giờ', () => {
    const slots = generatePickupSlots({ openTime: '00:00', closeTime: '00:00' }, now);
    expect(slots[0]!.toISOString()).toBe('2026-10-16T03:30:00.000Z'); // 10:30
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-16T07:00:00.000Z'); // 14:00
    expect(slots).toHaveLength(15);
  });

  it('chỉ lấy khung giờ trong giờ mở cửa', () => {
    const slots = generatePickupSlots({ openTime: '06:00', closeTime: '11:00' }, now);
    expect(slots.map((s) => s.toISOString())).toEqual(['2026-10-16T03:30:00.000Z', '2026-10-16T03:45:00.000Z']);
  });

  it('kiểm tra giờ nhận', () => {
    const allDay = { openTime: '00:00', closeTime: '00:00' };
    expect(validatePickupTime(new Date(now.getTime() + 2 * 60_000), allDay, now)).toMatch(/ít nhất 15 phút/);
    expect(validatePickupTime(new Date(now.getTime() + 30 * 60_000), allDay, now)).toBeNull();
    expect(validatePickupTime(new Date(now.getTime() + 6 * 3600_000), allDay, now)).toMatch(/4 giờ/);
    expect(validatePickupTime(new Date(now.getTime() + 60 * 60_000), { openTime: '06:00', closeTime: '11:00' }, now)).toMatch(/không mở cửa/);
  });
});
