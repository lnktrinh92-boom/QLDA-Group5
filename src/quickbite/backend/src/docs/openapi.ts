/**
 * Đặc tả OpenAPI 3.1 của QuickBite API.
 *
 * Body của request được sinh trực tiếp từ các schema Zod dùng để kiểm tra dữ liệu (z.toJSONSchema),
 * nên tài liệu luôn khớp với quy tắc validate thật. Test `tests/openapi.test.ts` kiểm tra mọi
 * đường dẫn trong tài liệu đều tồn tại trên server.
 */
import { z } from 'zod';
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from '../modules/auth/auth.schemas.js';
import { addCartItemSchema, updateCartItemSchema } from '../modules/cart/cart.schemas.js';
import { cancelOrderSchema, createOrderSchema } from '../modules/orders/orders.schemas.js';
import { createReviewSchema } from '../modules/reviews/reviews.routes.js';
import { createMenuItemSchema, updateMenuItemSchema } from '../modules/vendor/vendor-menu.service.js';
import { updateOrderStatusSchema } from '../modules/vendor/vendor-orders.service.js';
import { vendorUpdateStallSchema } from '../modules/vendor/vendor.routes.js';
import { createUserSchema, updateUserSchema } from '../modules/admin/admin-users.routes.js';
import { createStallSchema, stallMemberSchema, updateStallSchema } from '../modules/admin/admin-stalls.routes.js';
import { categorySchema, pickupSchema } from '../modules/admin/admin-catalog.routes.js';

type Json = Record<string, unknown>;

/** Zod → JSON Schema (dạng dữ liệu ĐẦU VÀO client gửi lên) */
const schemaOf = (schema: z.ZodType): Json => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
  return rest;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const ok = (data: Json, description = 'Thành công') => ({
  description,
  content: {
    'application/json': { schema: { type: 'object', properties: { success: { const: true }, data } } },
  },
});

const paged = (item: Json) => ({
  description: 'Thành công (có phân trang)',
  content: {
    'application/json': {
      schema: { type: 'object', properties: { success: { const: true }, data: { type: 'array', items: item }, meta: ref('Pagination') } },
    },
  },
});

const err = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });

const COMMON_ERRORS = {
  400: err('Dữ liệu không hợp lệ (VALIDATION_ERROR)'),
  401: err('Chưa đăng nhập / phiên hết hạn'),
  403: err('Không có quyền'),
  404: err('Không tìm thấy'),
};

const path = (name: string, description: string, schema: Json = { type: 'integer', minimum: 1 }) => ({ name, in: 'path', required: true, description, schema });
const query = (name: string, description: string, schema: Json = { type: 'string' }) => ({ name, in: 'query', required: false, description, schema });
const pageParams = [query('page', 'Trang (bắt đầu từ 1)', { type: 'integer', minimum: 1, default: 1 }), query('pageSize', 'Số dòng mỗi trang', { type: 'integer', minimum: 1 })];
const dateParams = [query('from', 'Từ ngày (YYYY-MM-DD, giờ Việt Nam)', { type: 'string', format: 'date' }), query('to', 'Đến ngày (YYYY-MM-DD)', { type: 'string', format: 'date' })];

interface OpInput {
  tag: string;
  summary: string;
  description?: string;
  auth?: boolean;
  params?: Json[];
  body?: z.ZodType | Json;
  multipart?: boolean;
  response?: Json;
  status?: number;
  errors?: Record<number, Json>;
}

function op({ tag, summary, description, auth = true, params, body, multipart, response, status = 200, errors }: OpInput) {
  const bodySchema = body instanceof z.ZodType ? schemaOf(body) : body;
  return {
    tags: [tag],
    summary,
    ...(description && { description }),
    ...(auth ? { security: [{ cookieAuth: [] }] } : { security: [] }),
    ...(params && { parameters: params }),
    ...(bodySchema && {
      requestBody: { required: true, content: { [multipart ? 'multipart/form-data' : 'application/json']: { schema: bodySchema } } },
    }),
    responses: {
      [status]: response ?? ok({ type: 'object' }),
      ...(auth ? COMMON_ERRORS : { 400: COMMON_ERRORS[400], 404: COMMON_ERRORS[404] }),
      ...errors,
    },
  };
}

const ORDER_STATUS = { type: 'string', enum: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'REJECTED'] };
const money = { type: 'string', description: 'Số tiền VND dạng chuỗi số nguyên, vd "35000"', example: '35000' };

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'QuickBite API',
    version: '1.0.0',
    description: [
      'API đặt món ăn trong khuôn viên trường đại học.',
      '',
      '**Xác thực:** gọi `POST /auth/login` → server đặt cookie `qb_session` (httpOnly). Trình duyệt tự gửi cookie ở các request sau.',
      'Trong Swagger UI, hãy đăng nhập bằng "Try it out" ở `POST /auth/login` trước khi thử các API cần đăng nhập.',
      '',
      '**Định dạng phản hồi:** `{ success: true, data, meta? }` hoặc `{ success: false, error: { code, message, details? } }`.',
      '',
      '**Tiền tệ:** VND, trả về dạng chuỗi số nguyên. **Thời gian:** ISO 8601 (UTC); ngày lọc báo cáo theo giờ Việt Nam.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1', description: 'Server hiện tại' }],
  tags: [
    { name: 'Hệ thống' },
    { name: 'Khám phá món', description: 'Công khai, không cần đăng nhập' },
    { name: 'Xác thực & tài khoản' },
    { name: 'Thông báo' },
    { name: 'Giỏ hàng', description: 'Chỉ sinh viên. Mỗi giỏ chỉ chứa món của một quầy.' },
    { name: 'Đơn hàng (sinh viên)' },
    { name: 'Thanh toán', description: 'Chuyển khoản VietQR vào tài khoản của quầy; xác nhận qua webhook SePay hoặc quầy tự xác nhận' },
    { name: 'Chủ quầy', description: 'Chủ quầy / nhân viên quầy (chỉ quầy được gán) và admin' },
    { name: 'Quản trị', description: 'Chỉ ADMIN. Thao tác thay đổi dữ liệu được ghi nhật ký.' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'qb_session', description: 'JWT trong cookie httpOnly, đặt bởi /auth/login' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Dữ liệu gửi lên không hợp lệ' },
              details: { description: 'Chi tiết, vd danh sách { field, message }' },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fullName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: ['string', 'null'] },
          studentCode: { type: ['string', 'null'] },
          role: { type: 'string', enum: ['STUDENT', 'VENDOR', 'ADMIN'] },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
          stalls: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, slug: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'STAFF'] } } } },
        },
      },
      Stall: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          slug: { type: 'string' },
          location: { type: 'string' },
          openTime: { type: 'string', example: '07:00' },
          closeTime: { type: 'string', example: '20:00' },
          isOpenNow: { type: 'boolean' },
          canOrderNow: { type: 'boolean', description: 'Đang hoạt động + bật nhận đơn + trong giờ mở cửa' },
          acceptsVietQr: { type: 'boolean', description: 'Quầy nhận thanh toán chuyển khoản VietQR' },
          paymentTimeoutMinutes: { type: 'integer', minimum: 5, maximum: 60, description: 'Số phút được phép chuyển khoản; quá hạn đơn tự huỷ' },
          rating: { type: 'object', properties: { average: { type: ['number', 'null'] }, count: { type: 'integer' } } },
        },
      },
      MenuItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          price: money,
          portion: { type: ['string', 'null'], description: 'Định lượng một phần, vd "1 tô · 450g"' },
          imageUrl: { type: ['string', 'null'] },
          isAvailable: { type: 'boolean' },
          soldCount: { type: 'integer' },
          category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, slug: { type: 'string' } } },
          stall: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, slug: { type: 'string' }, isOpenNow: { type: 'boolean' } } },
          canOrder: { type: 'boolean' },
        },
      },
      Cart: {
        type: 'object',
        properties: {
          stall: { oneOf: [ref('Stall'), { type: 'null' }] },
          items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, quantity: { type: 'integer' }, note: { type: ['string', 'null'] }, menuItem: ref('MenuItem'), lineTotal: money, issue: { type: ['string', 'null'] } } } },
          itemCount: { type: 'integer' },
          subtotal: money,
          stallIssue: { type: ['string', 'null'] },
          canCheckout: { type: 'boolean' },
          pickupSlots: { type: 'array', items: { type: 'string', format: 'date-time' } },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          orderNumber: { type: 'string', example: 'QB-261016-4F7K' },
          status: ORDER_STATUS,
          paymentMethod: { type: 'string', enum: ['CASH_ON_PICKUP', 'VIETQR'] },
          paymentStatus: { type: 'string', enum: ['UNPAID', 'PAID', 'REFUNDED', 'VOIDED'] },
          subtotal: money,
          serviceFee: money,
          discount: money,
          total: money,
          pickupTime: { type: ['string', 'null'], format: 'date-time' },
          items: { type: 'array', items: { type: 'object', properties: { itemName: { type: 'string' }, unitPrice: money, quantity: { type: 'integer' }, note: { type: ['string', 'null'] }, lineTotal: money } } },
          statusHistory: { type: 'array', items: { type: 'object', properties: { toStatus: ORDER_STATUS, createdAt: { type: 'string', format: 'date-time' }, note: { type: ['string', 'null'] } } } },
          awaitingPayment: { type: 'boolean', description: 'Đơn chuyển khoản đang chờ tiền về (quầy chưa nhận đơn được)' },
          vietQr: {
            description: 'Thông tin chuyển khoản; null với đơn tiền mặt',
            oneOf: [
              {
                type: 'object',
                properties: {
                  bankBin: { type: 'string', example: '970436' },
                  bankShortName: { type: 'string', example: 'Vietcombank' },
                  accountNo: { type: 'string' },
                  accountName: { type: 'string', example: 'NGUYEN VAN DAT' },
                  amount: money,
                  content: { type: 'string', example: 'QB2610164F7K', description: 'Nội dung chuyển khoản bắt buộc' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  paidAt: { type: ['string', 'null'], format: 'date-time' },
                  confirmedBy: { type: ['string', 'null'], enum: ['SEPAY', 'MANUAL', null] },
                  qrPayload: { type: ['string', 'null'], description: 'Chuỗi EMVCo để vẽ mã QR; chỉ có khi còn chờ thanh toán' },
                },
              },
              { type: 'null' },
            ],
          },
          canCancel: { type: 'boolean' },
          nextStatuses: { type: 'array', items: ORDER_STATUS, description: 'Chỉ có ở API chủ quầy / admin' },
        },
      },
    },
  },
  paths: {
    '/health': { get: op({ tag: 'Hệ thống', summary: 'Kiểm tra API và kết nối MySQL', auth: false, errors: { 503: err('Không kết nối được MySQL') } }) },

    // ─────────── Khám phá món ───────────
    '/home': { get: op({ tag: 'Khám phá món', summary: 'Dữ liệu trang chủ (danh mục, quầy nổi bật, món bán chạy, khuyến mãi)', auth: false }) },
    '/categories': { get: op({ tag: 'Khám phá món', summary: 'Danh mục đang hoạt động', auth: false }) },
    '/stalls': { get: op({ tag: 'Khám phá món', summary: 'Danh sách quầy', auth: false, params: [query('q', 'Tìm theo tên, mô tả, vị trí')], response: ok({ type: 'array', items: ref('Stall') }) }) },
    '/stalls/{idOrSlug}': {
      get: op({ tag: 'Khám phá món', summary: 'Chi tiết quầy + thực đơn + đánh giá', auth: false, params: [path('idOrSlug', 'ID hoặc slug', { type: 'string' })] }),
    },
    '/menu-items': {
      get: op({
        tag: 'Khám phá món',
        summary: 'Tìm & lọc món',
        description: 'Tìm kiếm không phân biệt dấu & hoa thường (collation utf8mb4_unicode_ci).',
        auth: false,
        params: [
          query('q', 'Từ khoá (tên, mô tả)'),
          query('category', 'Slug danh mục'),
          query('stall', 'Slug quầy'),
          query('categoryId', 'ID danh mục', { type: 'integer' }),
          query('stallId', 'ID quầy', { type: 'integer' }),
          query('minPrice', 'Giá tối thiểu', { type: 'integer' }),
          query('maxPrice', 'Giá tối đa', { type: 'integer' }),
          query('available', 'Chỉ món còn hàng', { type: 'string', enum: ['true', 'false'] }),
          query('featured', 'Chỉ món đề xuất', { type: 'string', enum: ['true', 'false'] }),
          query('sort', 'Sắp xếp', { type: 'string', enum: ['popular', 'price_asc', 'price_desc', 'newest', 'name'], default: 'popular' }),
          ...pageParams,
        ],
        response: paged(ref('MenuItem')),
      }),
    },
    '/menu-items/{id}': { get: op({ tag: 'Khám phá món', summary: 'Chi tiết món + món cùng quầy', auth: false, params: [path('id', 'ID món')] }) },
    '/pickup-locations': { get: op({ tag: 'Khám phá món', summary: 'Điểm nhận món đang hoạt động', auth: false }) },

    // ─────────── Xác thực & tài khoản ───────────
    '/auth/register': {
      post: op({ tag: 'Xác thực & tài khoản', summary: 'Đăng ký tài khoản sinh viên', description: 'Luôn tạo vai trò STUDENT. Giới hạn số lần thử theo IP.', auth: false, body: registerSchema, status: 201, response: ok({ type: 'object', properties: { user: ref('User') } }, 'Đã tạo, đặt cookie qb_session'), errors: { 409: err('Email đã được đăng ký'), 429: err('Thử quá nhiều lần') } }),
    },
    '/auth/login': {
      post: op({ tag: 'Xác thực & tài khoản', summary: 'Đăng nhập', auth: false, body: loginSchema, response: ok({ type: 'object', properties: { user: ref('User') } }, 'Đăng nhập thành công, đặt cookie qb_session'), errors: { 401: err('Sai email hoặc mật khẩu'), 403: err('Tài khoản bị khoá'), 429: err('Thử quá nhiều lần') } }),
    },
    '/auth/logout': { post: op({ tag: 'Xác thực & tài khoản', summary: 'Đăng xuất (xoá cookie)', auth: false }) },
    '/auth/me': { get: op({ tag: 'Xác thực & tài khoản', summary: 'Người dùng hiện tại', response: ok({ type: 'object', properties: { user: ref('User') } }) }) },
    '/users/me': { patch: op({ tag: 'Xác thực & tài khoản', summary: 'Cập nhật hồ sơ', body: updateProfileSchema }) },
    '/users/me/password': { patch: op({ tag: 'Xác thực & tài khoản', summary: 'Đổi mật khẩu (đăng xuất các thiết bị khác)', body: changePasswordSchema }) },

    // ─────────── Thông báo ───────────
    '/notifications': { get: op({ tag: 'Thông báo', summary: 'Thông báo của tôi', params: [query('unread', 'Chỉ chưa đọc', { type: 'string', enum: ['true', 'false'] }), ...pageParams], response: paged({ type: 'object' }) }) },
    '/notifications/unread-count': { get: op({ tag: 'Thông báo', summary: 'Số thông báo chưa đọc' }) },
    '/notifications/{id}/read': { patch: op({ tag: 'Thông báo', summary: 'Đánh dấu đã đọc', params: [path('id', 'ID thông báo')] }) },
    '/notifications/read-all': { post: op({ tag: 'Thông báo', summary: 'Đánh dấu tất cả đã đọc' }) },

    // ─────────── Giỏ hàng ───────────
    '/cart': {
      get: op({ tag: 'Giỏ hàng', summary: 'Xem giỏ hàng', response: ok(ref('Cart')) }),
      delete: op({ tag: 'Giỏ hàng', summary: 'Xoá cả giỏ', response: ok(ref('Cart')) }),
    },
    '/cart/items': {
      post: op({ tag: 'Giỏ hàng', summary: 'Thêm món vào giỏ', body: addCartItemSchema, status: 201, response: ok(ref('Cart')), errors: { 409: err('CART_STALL_CONFLICT: giỏ đang có món quầy khác (gửi replaceCart=true để thay)'), 422: err('Món hết / quầy không nhận đơn') } }),
    },
    '/cart/items/{id}': {
      patch: op({ tag: 'Giỏ hàng', summary: 'Sửa số lượng / ghi chú', params: [path('id', 'ID dòng trong giỏ')], body: updateCartItemSchema, response: ok(ref('Cart')) }),
      delete: op({ tag: 'Giỏ hàng', summary: 'Xoá món khỏi giỏ', params: [path('id', 'ID dòng trong giỏ')], response: ok(ref('Cart')) }),
    },

    // ─────────── Đơn hàng (sinh viên) ───────────
    '/orders': {
      post: op({
        tag: 'Đơn hàng (sinh viên)',
        summary: 'Đặt đơn từ giỏ hàng',
        description: 'Tạo đơn trong 1 transaction, tính tiền ở server. Gửi lại cùng `idempotencyKey` sẽ trả về đơn cũ (200) thay vì tạo đơn mới.',
        body: createOrderSchema,
        status: 201,
        response: ok({ type: 'object', properties: { order: ref('Order'), created: { type: 'boolean' } } }, 'Đã tạo đơn'),
        errors: { 200: ok({ type: 'object', properties: { order: ref('Order'), created: { const: false } } }, 'Đơn đã tồn tại với idempotencyKey này'), 422: err('ORDER_REJECTED: giỏ trống, món hết, quầy đóng, điểm nhận / giờ nhận không hợp lệ') },
      }),
      get: op({ tag: 'Đơn hàng (sinh viên)', summary: 'Lịch sử đơn của tôi', params: [query('group', 'Nhóm trạng thái', { type: 'string', enum: ['active', 'completed', 'cancelled'] }), ...pageParams], response: paged({ type: 'object' }) }),
    },
    '/orders/{id}': { get: op({ tag: 'Đơn hàng (sinh viên)', summary: 'Chi tiết & theo dõi đơn', params: [path('id', 'ID đơn')], response: ok({ type: 'object', properties: { order: ref('Order') } }) }) },
    '/orders/{id}/cancel': { post: op({ tag: 'Đơn hàng (sinh viên)', summary: 'Huỷ đơn (chỉ khi còn PENDING)', params: [path('id', 'ID đơn')], body: cancelOrderSchema, errors: { 422: err('Đơn không còn huỷ được') } }) },
    '/orders/{id}/review': { post: op({ tag: 'Đơn hàng (sinh viên)', summary: 'Đánh giá đơn đã hoàn thành', params: [path('id', 'ID đơn')], body: createReviewSchema, status: 201, errors: { 409: err('Đã đánh giá'), 422: err('Đơn chưa hoàn thành') } }) },
    // ─────────── Thanh toán ───────────
    '/payments/banks': { get: op({ tag: 'Thanh toán', summary: 'Ngân hàng hỗ trợ VietQR (mã BIN)', auth: false }) },
    '/payments/sepay/webhook': {
      post: op({
        tag: 'Thanh toán',
        summary: 'Webhook biến động số dư từ SePay',
        description:
          'SePay gọi khi tài khoản của quầy có tiền vào. Xác thực bằng header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. ' +
          'Tìm đơn theo nội dung chuyển khoản (QB + mã đơn), kiểm tra số tiền & tài khoản nhận rồi đánh dấu đã thanh toán. ' +
          'Giao dịch không khớp vẫn trả 200 kèm `matched: false` và `reason`.',
        auth: false,
        body: { type: 'object', required: ['id', 'transferType', 'transferAmount'], properties: { id: { type: 'integer' }, accountNumber: { type: 'string' }, code: { type: ['string', 'null'] }, content: { type: 'string' }, transferType: { type: 'string', enum: ['in', 'out'] }, transferAmount: { type: 'number' }, referenceCode: { type: 'string' } } },
        response: ok({ type: 'object', properties: { matched: { type: 'boolean' }, reason: { type: 'string' }, orderNumber: { type: 'string' } } }),
        errors: { 401: err('Sai API key'), 404: err('Webhook chưa bật (thiếu SEPAY_WEBHOOK_API_KEY)') },
      }),
    },

    '/reviews/{id}/report': {
      post: op({ tag: 'Đơn hàng (sinh viên)', summary: 'Báo cáo đánh giá không phù hợp', params: [path('id', 'ID đánh giá')], body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5, maxLength: 255 } } } }),
    },

    // ─────────── Chủ quầy ───────────
    '/vendor/stalls': { get: op({ tag: 'Chủ quầy', summary: 'Quầy tôi quản lý (admin: tất cả)' }) },
    '/vendor/stalls/{stallId}': {
      get: op({ tag: 'Chủ quầy', summary: 'Thông tin quầy & nhân sự', params: [path('stallId', 'ID quầy')] }),
      patch: op({ tag: 'Chủ quầy', summary: 'Cập nhật thông tin quầy (chỉ OWNER)', params: [path('stallId', 'ID quầy')], body: vendorUpdateStallSchema }),
    },
    '/vendor/stalls/{stallId}/accepting-orders': {
      patch: op({ tag: 'Chủ quầy', summary: 'Bật / tắt nhận đơn', params: [path('stallId', 'ID quầy')], body: { type: 'object', required: ['isAcceptingOrders'], properties: { isAcceptingOrders: { type: 'boolean' } } } }),
    },
    '/vendor/stalls/{stallId}/dashboard': { get: op({ tag: 'Chủ quầy', summary: 'Số liệu hôm nay & hàng đợi đơn', params: [path('stallId', 'ID quầy')] }) },
    '/vendor/stalls/{stallId}/reports': { get: op({ tag: 'Chủ quầy', summary: 'Báo cáo doanh thu theo ngày', params: [path('stallId', 'ID quầy'), ...dateParams] }) },
    '/vendor/stalls/{stallId}/orders': {
      get: op({
        tag: 'Chủ quầy',
        summary: 'Đơn của quầy (kèm số lượng từng tab)',
        params: [path('stallId', 'ID quầy'), query('tab', 'Tab', { type: 'string', enum: ['new', 'in_progress', 'ready', 'completed', 'cancelled'] }), query('q', 'Mã đơn / tên sinh viên'), ...dateParams, ...pageParams],
        response: paged(ref('Order')),
      }),
    },
    '/vendor/stalls/{stallId}/orders/{orderId}': { get: op({ tag: 'Chủ quầy', summary: 'Chi tiết đơn + bước tiếp theo hợp lệ', params: [path('stallId', 'ID quầy'), path('orderId', 'ID đơn')] }) },
    '/vendor/stalls/{stallId}/orders/{orderId}/status': {
      patch: op({ tag: 'Chủ quầy', summary: 'Chuyển trạng thái đơn', description: 'Theo máy trạng thái; REJECTED / CANCELLED bắt buộc `reason`.', params: [path('stallId', 'ID quầy'), path('orderId', 'ID đơn')], body: updateOrderStatusSchema, errors: { 409: err('Trạng thái vừa bị người khác đổi'), 422: err('Chuyển trạng thái không hợp lệ') } }),
    },
    '/vendor/stalls/{stallId}/orders/{orderId}/confirm-payment': {
      post: op({ tag: 'Chủ quầy', summary: 'Xác nhận đã nhận chuyển khoản (thủ công)', description: 'Dùng khi không bật webhook SePay: quầy kiểm tra app ngân hàng rồi xác nhận.', params: [path('stallId', 'ID quầy'), path('orderId', 'ID đơn')], errors: { 409: err('Đã xác nhận trước đó'), 422: err('Đơn trả tiền mặt') } }),
    },
    '/vendor/stalls/{stallId}/menu-items': {
      get: op({ tag: 'Chủ quầy', summary: 'Thực đơn của quầy', params: [path('stallId', 'ID quầy'), query('status', 'Trạng thái', { type: 'string', enum: ['active', 'inactive', 'all'] }), query('q', 'Tên món'), query('categoryId', 'Danh mục', { type: 'integer' })] }),
      post: op({ tag: 'Chủ quầy', summary: 'Thêm món', params: [path('stallId', 'ID quầy')], body: createMenuItemSchema, status: 201 }),
    },
    '/vendor/stalls/{stallId}/menu-items/{itemId}': {
      patch: op({ tag: 'Chủ quầy', summary: 'Sửa món (một phần)', params: [path('stallId', 'ID quầy'), path('itemId', 'ID món')], body: updateMenuItemSchema }),
      delete: op({ tag: 'Chủ quầy', summary: 'Ngừng bán món (xoá mềm)', params: [path('stallId', 'ID quầy'), path('itemId', 'ID món')] }),
    },
    '/vendor/stalls/{stallId}/uploads': {
      post: op({
        tag: 'Chủ quầy',
        summary: 'Tải ảnh (JPG/PNG/WEBP, tối đa MAX_UPLOAD_MB)',
        params: [path('stallId', 'ID quầy'), query('type', 'Loại ảnh', { type: 'string', enum: ['menu', 'stall'] })],
        multipart: true,
        body: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary' } } },
        status: 201,
        response: ok({ type: 'object', properties: { url: { type: 'string', example: '/uploads/menu/1700000000-abc.jpg' } } }),
      }),
    },

    // ─────────── Quản trị ───────────
    '/admin/dashboard': { get: op({ tag: 'Quản trị', summary: 'Tổng quan toàn hệ thống' }) },
    '/admin/users': {
      get: op({ tag: 'Quản trị', summary: 'Danh sách người dùng', params: [query('search', 'Tên, email, mã SV'), query('role', 'Vai trò', { type: 'string', enum: ['STUDENT', 'VENDOR', 'ADMIN'] }), query('status', 'Trạng thái', { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] }), ...pageParams], response: paged(ref('User')) }),
      post: op({ tag: 'Quản trị', summary: 'Tạo tài khoản', body: createUserSchema, status: 201, errors: { 409: err('Email đã được dùng') } }),
    },
    '/admin/users/{id}': {
      get: op({ tag: 'Quản trị', summary: 'Chi tiết người dùng', params: [path('id', 'ID người dùng')] }),
      patch: op({ tag: 'Quản trị', summary: 'Sửa người dùng (vai trò, trạng thái...)', description: 'Không tự khoá / tự hạ quyền; hệ thống luôn còn ≥ 1 admin. Đổi vai trò/trạng thái → đăng xuất người dùng.', params: [path('id', 'ID người dùng')], body: updateUserSchema, errors: { 422: err('Vi phạm quy tắc admin') } }),
    },
    '/admin/users/{id}/reset-password': {
      post: op({ tag: 'Quản trị', summary: 'Đặt lại mật khẩu', params: [path('id', 'ID người dùng')], body: { type: 'object', required: ['newPassword'], properties: { newPassword: { type: 'string', minLength: 8, maxLength: 72 } } } }),
    },
    '/admin/stalls': {
      get: op({ tag: 'Quản trị', summary: 'Danh sách quầy (kể cả đã tắt)', params: [query('q', 'Tên / vị trí')] }),
      post: op({ tag: 'Quản trị', summary: 'Tạo quầy (slug tự sinh nếu bỏ trống)', body: createStallSchema, status: 201 }),
    },
    '/admin/stalls/{id}': { patch: op({ tag: 'Quản trị', summary: 'Sửa / bật tắt quầy', params: [path('id', 'ID quầy')], body: updateStallSchema }) },
    '/admin/stalls/{id}/members': {
      post: op({ tag: 'Quản trị', summary: 'Gán nhân sự (người dùng vai trò VENDOR)', params: [path('id', 'ID quầy')], body: stallMemberSchema, status: 201, errors: { 409: err('Đã thuộc quầy'), 422: err('Người dùng không phải VENDOR') } }),
    },
    '/admin/stalls/{id}/members/{userId}': {
      patch: op({ tag: 'Quản trị', summary: 'Đổi vai trò nhân sự', params: [path('id', 'ID quầy'), path('userId', 'ID người dùng')], body: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['OWNER', 'STAFF'] } } } }),
      delete: op({ tag: 'Quản trị', summary: 'Gỡ nhân sự khỏi quầy', params: [path('id', 'ID quầy'), path('userId', 'ID người dùng')] }),
    },
    '/admin/categories': {
      get: op({ tag: 'Quản trị', summary: 'Tất cả danh mục' }),
      post: op({ tag: 'Quản trị', summary: 'Tạo danh mục', body: categorySchema, status: 201, errors: { 409: err('Trùng tên') } }),
    },
    '/admin/categories/{id}': {
      patch: op({ tag: 'Quản trị', summary: 'Sửa danh mục', params: [path('id', 'ID danh mục')], body: categorySchema.partial() }),
      delete: op({ tag: 'Quản trị', summary: 'Xoá danh mục chưa có món', params: [path('id', 'ID danh mục')], errors: { 422: err('Danh mục còn món') } }),
    },
    '/admin/pickup-locations': {
      get: op({ tag: 'Quản trị', summary: 'Tất cả điểm nhận' }),
      post: op({ tag: 'Quản trị', summary: 'Tạo điểm nhận', body: pickupSchema, status: 201 }),
    },
    '/admin/pickup-locations/{id}': { patch: op({ tag: 'Quản trị', summary: 'Sửa / bật tắt điểm nhận', params: [path('id', 'ID điểm nhận')], body: pickupSchema.partial() }) },
    '/admin/orders': {
      get: op({ tag: 'Quản trị', summary: 'Đơn toàn hệ thống', params: [query('status', 'Trạng thái', ORDER_STATUS), query('stallId', 'ID quầy', { type: 'integer' }), query('q', 'Mã đơn / sinh viên'), ...dateParams, ...pageParams], response: paged(ref('Order')) }),
    },
    '/admin/orders/{id}': { get: op({ tag: 'Quản trị', summary: 'Chi tiết đơn', params: [path('id', 'ID đơn')] }) },
    '/admin/orders/{id}/status': { patch: op({ tag: 'Quản trị', summary: 'Đổi trạng thái đơn (có ghi nhật ký)', params: [path('id', 'ID đơn')], body: updateOrderStatusSchema }) },
    '/admin/reviews': {
      get: op({ tag: 'Quản trị', summary: 'Đánh giá cần kiểm duyệt', params: [query('status', 'Trạng thái', { type: 'string', enum: ['VISIBLE', 'HIDDEN', 'REPORTED'] }), query('stallId', 'ID quầy', { type: 'integer' }), ...pageParams] }),
    },
    '/admin/reviews/{id}': {
      patch: op({ tag: 'Quản trị', summary: 'Ẩn / hiện đánh giá', params: [path('id', 'ID đánh giá')], body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['VISIBLE', 'HIDDEN'] }, note: { type: 'string', maxLength: 255 } } } }),
    },
    '/admin/audit-logs': { get: op({ tag: 'Quản trị', summary: 'Nhật ký quản trị', params: [query('action', 'Hành động'), query('entityType', 'Loại đối tượng'), query('actorId', 'ID người thực hiện', { type: 'integer' }), ...pageParams] }) },
  },
} as const;
