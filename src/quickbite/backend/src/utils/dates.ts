import { z } from 'zod';
import { CAMPUS_TIME_ZONE } from './opening-hours.js';

/** Ngày dạng YYYY-MM-DD theo giờ Việt Nam. Phải là ngày có thật: 2026-02-30 hay 2026-13-01 bị từ chối */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((ymd) => {
    const date = new Date(`${ymd}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === ymd;
  }, 'Ngày không tồn tại');

/** 00:00 giờ Việt Nam của ngày `ymd` (trả về thời điểm UTC tương ứng) */
export function vnDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`);
}

/** 00:00 giờ Việt Nam của ngày HÔM SAU `ymd` (dùng làm cận trên "nhỏ hơn") */
export function vnDayEnd(ymd: string): Date {
  return new Date(vnDayStart(ymd).getTime() + 24 * 3600_000);
}

/** Ngày hôm nay (hoặc `date`) theo giờ Việt Nam, dạng YYYY-MM-DD */
export function vnToday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIME_ZONE }).format(date);
}

/** Cộng/trừ số ngày cho chuỗi YYYY-MM-DD */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Danh sách các ngày từ `from` tới `to` (bao gồm cả hai đầu) */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
