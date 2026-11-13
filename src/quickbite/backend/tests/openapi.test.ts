import { describe, expect, it } from 'vitest';
import { openApiSpec } from '../src/docs/openapi.js';
import { API, app, request } from './helpers.js';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
const METHODS: Method[] = ['get', 'post', 'patch', 'put', 'delete'];

const operations = Object.entries(openApiSpec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => m in item).map((method) => ({ path, method, op: (item as Record<string, { summary: string; tags: string[] }>)[method]! })),
);

describe('Tài liệu OpenAPI', () => {
  it('phục vụ đặc tả JSON và trang Swagger UI', async () => {
    const spec = await request(app).get(`${API}/openapi.json`);
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(Object.keys(spec.body.paths).length).toBeGreaterThan(50);

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('body của request sinh từ schema Zod (vd: đăng ký có đủ trường và ràng buộc)', () => {
    const body = openApiSpec.paths['/auth/register'].post.requestBody as { content: Record<string, { schema: unknown }> };
    const register = body.content['application/json']!.schema as {
      properties: Record<string, { minLength?: number; maxLength?: number }>;
      required: string[];
    };
    expect(Object.keys(register.properties)).toEqual(expect.arrayContaining(['fullName', 'email', 'password', 'phone', 'studentCode']));
    expect(register.required).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
    expect(register.properties.password).toMatchObject({ minLength: 8, maxLength: 72 });
  });

  it('mọi thao tác đều có tag và mô tả tiếng Việt', () => {
    for (const { path, method, op } of operations) {
      expect(op.tags?.length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
      expect(op.summary, `${method.toUpperCase()} ${path}`).toBeTruthy();
    }
  });

  it.each(operations.map((o) => [o.method.toUpperCase(), o.path, o.method] as const))('%s %s tồn tại trên server', async (_m, path, method) => {
    // Thay tham số đường dẫn bằng giá trị mẫu; không cần đăng nhập — chỉ kiểm tra route tồn tại
    const url = API + path.replace(/\{[^}]+\}/g, '1');
    const res = await request(app)[method](url).send({});
    const routeMissing = res.status === 404 && /Không tìm thấy đường dẫn/.test(res.body?.error?.message ?? '');
    expect(routeMissing, `${method.toUpperCase()} ${path} không có trên server`).toBe(false);
  });
});
