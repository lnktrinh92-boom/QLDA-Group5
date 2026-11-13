import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '../src/config/zod-vi.js';

const messages = (schema: z.ZodType, input: unknown) => {
  const r = schema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('Câu báo lỗi Zod mặc định bằng tiếng Việt', () => {
  it('vượt giới hạn số / độ dài / số phần tử', () => {
    expect(messages(z.number().max(100), 500)).toEqual(['Giá trị tối đa là 100']);
    expect(messages(z.number().min(1), 0)).toEqual(['Giá trị tối thiểu là 1']);
    expect(messages(z.number().positive(), 0)).toEqual(['Phải lớn hơn 0']);
    expect(messages(z.number().lt(10), 10)).toEqual(['Phải nhỏ hơn 10']);
    expect(messages(z.string().max(5), 'abcdefgh')).toEqual(['Tối đa 5 ký tự']);
    expect(messages(z.string().min(3), 'ab')).toEqual(['Tối thiểu 3 ký tự']);
    expect(messages(z.string().min(1), '')).toEqual(['Không được để trống']);
    expect(messages(z.array(z.number()).min(1), [])).toEqual(['Cần ít nhất 1 phần tử']);
    expect(messages(z.array(z.number()).max(2), [1, 2, 3])).toEqual(['Tối đa 2 phần tử']);
  });

  it('sai lựa chọn, sai kiểu, thiếu trường, sai định dạng, trường lạ', () => {
    expect(messages(z.enum(['A', 'B']), 'X')).toEqual(['Giá trị không hợp lệ. Chỉ chấp nhận: A, B']);
    expect(messages(z.object({ n: z.number() }), {})).toEqual(['Thiếu thông tin bắt buộc']);
    expect(messages(z.number(), 'abc')).toEqual(['Phải là số']);
    expect(messages(z.number().int(), 1.5)).toEqual(['Phải là số nguyên']);
    expect(messages(z.boolean(), 'yes')).toEqual(['Phải là true hoặc false']);
    expect(messages(z.string().email(), 'x')).toEqual(['Email không hợp lệ']);
    expect(messages(z.string().regex(/^\d+$/), 'x')).toEqual(['Sai định dạng']);
    expect(messages(z.strictObject({ a: z.number() }), { a: 1, b: 2 })).toEqual(['Không hỗ trợ trường: b']);
  });

  it('câu báo lỗi riêng của schema luôn được ưu tiên; không còn câu tiếng Anh mặc định', () => {
    expect(messages(z.string().min(2, 'Tên quá ngắn'), 'a')).toEqual(['Tên quá ngắn']);
    expect(messages(z.number({ error: 'Giá không hợp lệ' }), 'x')).toEqual(['Giá không hợp lệ']);
    const all = [
      ...messages(z.string().uuid(), 'x'),
      ...messages(z.literal('a'), 'b'),
      ...messages(z.number().multipleOf(5), 3),
      ...messages(z.union([z.number(), z.boolean()]), 'x'),
    ];
    expect(all).toHaveLength(4);
    for (const m of all) expect(m).not.toMatch(/Invalid|Too (big|small)|expected|Required/);
  });
});
