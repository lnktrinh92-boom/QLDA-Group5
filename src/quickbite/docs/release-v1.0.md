# QuickBite v1.0.x — Phát hành & triển khai production

## Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| **v1.0.1** | 24/11/2026 | **Sửa 4 lỗi UAT** (SCRUM-124): ảnh món có khung chờ khi mạng yếu, báo "Đang tải món...", tải sẵn trang kế; bộ lọc trên điện thoại dạng bảng trượt + chip; nút "Nhận đơn" cao 44px; xác nhận "Đã lưu lúc HH:mm" khi lưu thông tin quầy. **Vận hành:** sao lưu / khôi phục database, `npm run prod:check` (SCRUM-122); `npm run smoke`, cấu hình Vercel trong repo (SCRUM-142). **Tài liệu:** Swagger mô tả đủ API chính + `docs/openapi.json` (SCRUM-121); README & tài liệu kỹ thuật (SCRUM-125). Không có migration mới. PR #31–#35 |
| **v1.0.0** | 19/11/2026 | Bản chốt cho UAT Sprint 7 (chi tiết bên dưới) |

> Các mục dưới đây mô tả bản v1.0.0. Triển khai v1.0.1 làm theo đúng quy trình ở mục 2, thay số phiên bản (`v1.0.1`, `--version=1.0.1`). v1.0.1 không có migration mới nên bước 4 không thay đổi gì trong database.


| Mục | Nội dung |
|---|---|
| **Phiên bản** | `v1.0.0` (tag trên `master`, commit `1b30992`, gom tới PR #29) |
| **Ngày chốt** | 19/11/2026: bản chốt cho UAT Sprint 7 |
| **Giao diện** | https://quickbite-coral.vercel.app |
| **API** | https://backend-henna-iota-13.vercel.app/api/v1 (kiểm tra sống: `/api/v1/health`) |
| **Tài liệu API** | https://backend-henna-iota-13.vercel.app/api/docs |
| **Database** | Aiven MySQL (`mysql-22d05214`, DigitalOcean Singapore), 5 migration |

## 1. Nội dung bản phát hành

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Đăng ký / đăng nhập / đăng xuất bằng cookie HttpOnly, hồ sơ, đổi mật khẩu, phân quyền Sinh viên / Chủ quầy / Quản trị |
| Khám phá món | Trang chủ, tìm kiếm, lọc theo danh mục / quầy / giá, chi tiết món, chi tiết quầy, đánh giá |
| Đặt món | Giỏ hàng + giỏ mini, đặt đơn (transaction), chọn điểm nhận, thanh toán tiền mặt / VietQR, lịch sử & chi tiết đơn, huỷ đơn |
| Chủ quầy | Tổng quan, xử lý đơn theo state machine, thực đơn + tải ảnh, báo cáo doanh thu theo ngày và **theo ca**, **trang thông báo của quầy** |
| Quản trị | Người dùng (khoá có xác nhận), quầy & nhân viên, danh mục, điểm nhận, rà soát đơn, nhật ký quản trị |
| Thông báo | Đơn mới, đổi trạng thái, huỷ đơn, tiền chuyển khoản về |

PR đã gộp: #15–#18 (Tuần 5), #20–#24 (Tuần 6), #27 (SCRUM-108), #28 (SCRUM-94), #29 (release/v1.0.0 → master).

Migration của bản này (`prisma/migrations`):

| # | Migration |
|---|---|
| 1 | `20261016061512_init` |
| 2 | `20261016064101_add_menu_item_sold_count` |
| 3 | `20261020090000_add_vietqr_payment` |
| 4 | `20261021090000_stall_payment_timeout` |
| 5 | `20261026090000_menu_item_portion` |

## 2. Quy trình triển khai

Hai project trên Vercel: **backend** (Node.js serverless, thư mục `src/quickbite/backend`) và **frontend** (Vite tĩnh, thư mục `src/quickbite/frontend`). Frontend chuyển `/api/*` sang backend bằng rewrite của Vercel, nên giao diện và API chạy chung một tên miền.

Cấu hình triển khai nằm trong repo:

| File | Vai trò |
|---|---|
| `backend/api/index.js` | Điểm vào hàm serverless (`export default createApp()`) |
| `backend/vercel.json` | Lệnh build, chuyển mọi request vào hàm `/api` |
| `frontend/vercel.json` | Chuyển `/api/*`, `/uploads/*` sang backend; mọi đường dẫn khác về `index.html` (SPA) |

Cấu hình trên trang Vercel của project backend: **Function Region = `sin1` (Singapore)**, cùng vùng với database Aiven.

| Bước | Việc làm | Lệnh / nơi làm |
|---|---|---|
| 1 | Lấy đúng mã nguồn bản phát hành | `git fetch --tags && git checkout v1.0.0` |
| 2 | Build và chạy test trên máy | `cd src/quickbite/backend && npm ci && npm run build && npm test`; `cd ../frontend && npm ci && npm run build` |
| 3 | Sao lưu database production trước khi đổi | `npm run db:backup -- --label=truoc-v1.0.0` (với `DATABASE_URL` của Aiven) |
| 4 | Chạy migration production | `npm run db:deploy` (= `prisma migrate deploy`, chỉ áp migration chưa chạy, không xoá dữ liệu) |
| 5 | Triển khai backend, rồi frontend | Vercel → Project → Deployments → **Redeploy** bản build từ `v1.0.0`, hoặc `vercel --prod` trong từng thư mục |
| 6 | Smoke test | `npm run smoke -- --api=<URL backend> --web=<URL frontend> --version=1.0.0` → phải **ĐẠT** (không có mục FAIL) |
| 7 | Nếu smoke test không đạt | Vercel → Deployments → bản trước → **Promote to Production** (quay lại tức thì). Nếu migration làm hỏng dữ liệu: `npm run db:restore -- <bản truoc-v1.0.0> --yes --confirm=<db>` |

Biến môi trường production: xem `backend/.env.production.example` và `docs/deployment.md`. Các lệnh `db:backup --label`, `db:restore --confirm`, `prod:check` có từ SCRUM-122.

## 3. Smoke test: `npm run smoke`

Script `backend/scripts/smoke-test.ts` **chỉ đọc**, không tạo hay sửa dữ liệu. Thoát mã 1 khi có mục FAIL.

| Nhóm | Kiểm tra |
|---|---|
| Backend | `/health`: status ok + database connected; phiên bản API đúng `--version` |
| Dữ liệu công khai | Danh mục, quầy, món, điểm nhận, trang chủ: HTTP 200 và có dữ liệu |
| Bảo mật | `/auth/me`, `/orders`, `/admin/users` trả **401** khi chưa đăng nhập; đường dẫn lạ trả 404 JSON; có HSTS, nosniff, CSP, X-Frame-Options; CORS **không** mở cho trang lạ, có mở cho frontend |
| Frontend | Trang chủ 200 và tải được file JS; mở thẳng `/mon-an`, `/quan-an`, `/dang-nhap`, `/quan-ly/bao-cao` vẫn 200 (SPA); `/api` qua frontend tới được backend |
| Đăng nhập (tuỳ chọn) | Đặt `SMOKE_EMAIL`, `SMOKE_PASSWORD` (tài khoản kiểm thử) → đăng nhập (cookie Secure + HttpOnly), `/auth/me`, đăng xuất |
| Hiệu năng | Mục nào phản hồi quá 3 giây → WARN |

## 4. Ghi chú vận hành

- Backend Vercel đã chuyển từ vùng **iad1 (Mỹ)** sang **sin1 (Singapore)** ngày 20/11/2026, cùng vùng với database. Thời gian phản hồi (lần nhanh nhất) giảm từ khoảng 1 051 ms xuống 292 ms. Không đổi lại sang vùng khác nếu database vẫn ở Singapore.
- Ổ đĩa Vercel không lưu lâu dài: ảnh do chủ quầy tải lên có thể mất sau mỗi lần triển khai lại.
- Trước khi dùng thật: xoá tài khoản demo `@quickbite.test` (`npm run prod:check` sẽ báo).
