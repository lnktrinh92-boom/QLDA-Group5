import { describe, expect, it } from 'vitest';
import { dateOnlySchema } from '../src/utils/dates.js';

describe('dateOnlySchema: ngày dạng YYYY-MM-DD phải là ngày có thật', () => {
  it('nhận ngày hợp lệ, kể cả 29/02 năm nhuận', () => {
    for (const ymd of ['2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(dateOnlySchema.safeParse(ymd).success, ymd).toBe(true);
    }
  });

  it('từ chối ngày không tồn tại (không âm thầm đổi sang ngày khác), báo lỗi tiếng Việt', () => {
    for (const ymd of ['2026-02-30', '2026-11-31', '2026-13-01', '2026-00-10', '2026-02-00', '2027-02-29']) {
      const result = dateOnlySchema.safeParse(ymd);
      expect(result.success, ymd).toBe(false);
      expect(result.error?.issues[0]?.message, ymd).toBe('Ngày không tồn tại');
    }
  });

  it('sai định dạng vẫn báo lỗi định dạng', () => {
    expect(dateOnlySchema.safeParse('13/11/2026').error?.issues[0]?.message).toBe('Ngày phải có dạng YYYY-MM-DD');
  });
});
