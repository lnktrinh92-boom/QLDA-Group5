import { z } from 'zod';

/**
 * Câu báo lỗi mặc định của Zod bằng tiếng Việt cho toàn bộ backend.
 * Chỉ dùng khi schema không tự ghi câu báo lỗi riêng (câu riêng luôn được ưu tiên).
 * Các trường hợp hay gặp (vượt giới hạn, sai lựa chọn, thiếu trường) được viết lại cho dễ hiểu,
 * còn lại dùng bản dịch tiếng Việt có sẵn của Zod.
 */
const KIND: Record<string, string> = { number: 'số', int: 'số nguyên', string: 'chuỗi ký tự', boolean: 'true hoặc false', array: 'danh sách', object: 'đối tượng', date: 'ngày' };

export function vietnameseIssue(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case 'too_big': {
      const max = String(issue.maximum);
      if (issue.origin === 'string') return `Tối đa ${max} ký tự`;
      if (issue.origin === 'array' || issue.origin === 'set') return `Tối đa ${max} phần tử`;
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') return issue.inclusive === false ? `Phải nhỏ hơn ${max}` : `Giá trị tối đa là ${max}`;
      return undefined;
    }
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string') return min <= 1 ? 'Không được để trống' : `Tối thiểu ${min} ký tự`;
      if (issue.origin === 'array' || issue.origin === 'set') return min <= 1 ? 'Cần ít nhất 1 phần tử' : `Cần ít nhất ${min} phần tử`;
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') return issue.inclusive === false ? `Phải lớn hơn ${min}` : `Giá trị tối thiểu là ${min}`;
      return undefined;
    }
    case 'invalid_value':
      return `Giá trị không hợp lệ. Chỉ chấp nhận: ${issue.values.map(String).join(', ')}`;
    case 'invalid_type':
      if (issue.input === undefined) return 'Thiếu thông tin bắt buộc';
      return KIND[issue.expected] ? `Phải là ${KIND[issue.expected]}` : undefined;
    case 'invalid_format':
      if (issue.format === 'email') return 'Email không hợp lệ';
      if (issue.format === 'url') return 'Đường dẫn không hợp lệ';
      if (issue.format === 'regex') return 'Sai định dạng';
      return undefined;
    case 'unrecognized_keys':
      return `Không hỗ trợ trường: ${issue.keys.join(', ')}`;
    default:
      return undefined;
  }
}

z.config(z.locales.vi());
z.config({ customError: vietnameseIssue });
