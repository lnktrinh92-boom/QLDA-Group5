# 🍜 QuickBite — Nền tảng đặt món ăn trong trường đại học

QuickBite giúp sinh viên xem các quầy ăn trong khuôn viên trường, đặt món online, chọn điểm và giờ nhận,
rồi trả tiền mặt khi nhận hoặc chuyển khoản VietQR. Chủ quầy nhận và xử lý đơn theo thời gian thực; quản trị viên quản lý toàn hệ thống.

## 🌐 Bản đang chạy — v1.0.1

| | Địa chỉ |
|---|---|
| **Giao diện** | https://quickbite-coral.vercel.app |
| **API** | https://backend-henna-iota-13.vercel.app/api/v1 (kiểm tra: `/api/v1/health`) |
| **Tài liệu API** | [docs/openapi.json](docs/openapi.json) (mở bằng https://editor.swagger.io) · Swagger UI khi chạy trên máy: http://localhost:4000/api/docs |
| **Hạ tầng** | Vercel (backend serverless + frontend tĩnh, vùng Singapore) · MySQL trên Aiven (Singapore) |
| **Ghi chú phát hành** | [docs/release-v1.0.md](docs/release-v1.0.md): nội dung bản phát hành, quy trình triển khai, smoke test |

## ✨ Tính năng

<table>
<tr><th>👩‍🎓 Sinh viên</th><th>🧑‍🍳 Chủ quầy / Nhân viên</th><th>🛡️ Quản trị viên</th></tr>
<tr valign="top"><td>

- Đăng ký, đăng nhập, hồ sơ, đổi mật khẩu
- Trang chủ: danh mục, quầy nổi bật, món bán chạy, khuyến mãi
- Tìm món **không dấu** ("pho" → "Phở"), lọc theo danh mục / quầy / giá / còn hàng, sắp xếp, phân trang
- Trang quầy (thực đơn theo danh mục, giờ mở cửa, đánh giá) và chi tiết món
- Giỏ hàng lưu trên máy chủ, ghi chú từng món, **một quầy mỗi đơn**
- Checkout: điểm nhận, khung giờ nhận, ghi chú; trả **tiền mặt khi nhận** hoặc **chuyển khoản VietQR** (mã QR theo tài khoản của quầy)
- Xác nhận đơn, theo dõi trạng thái tự cập nhật, lịch sử đơn, huỷ khi quầy chưa nhận
- Đánh giá đơn đã hoàn thành, báo cáo đánh giá xấu
- Chuông & trang thông báo

</td><td>

- Tổng quan hôm nay: doanh thu, đơn, hàng đợi, món bán chạy
- Xử lý đơn theo tab (mới / đang làm / chờ nhận / xong / huỷ), lọc ngày, tìm mã đơn
- Nhận → làm → sẵn sàng → hoàn thành; từ chối / huỷ **bắt buộc lý do**
- Thực đơn: thêm, sửa, tải ảnh, bật tắt còn món & đề xuất, ngừng bán / bán lại
- Bật / tắt nhận đơn nhanh
- Thông tin quầy, giờ mở cửa, ảnh bìa (chủ quầy)
- Báo cáo doanh thu theo ngày **và theo ca** (sáng / trưa / chiều / tối): biểu đồ, bảng số liệu, món bán chạy
- Thông báo của quầy (đơn mới, huỷ, tiền chuyển khoản về), xác nhận đã nhận chuyển khoản
- Quản lý nhiều quầy (chuyển quầy nhanh)

</td><td>

- Tổng quan hệ thống: doanh thu 14 ngày, top quầy, trạng thái đơn
- Người dùng: tạo, sửa vai trò / trạng thái, **khoá có xác nhận**, đặt lại mật khẩu
- Quầy ăn: thêm, sửa, bật tắt, **gán chủ quầy & nhân viên**
- Danh mục món, điểm nhận món
- Đơn hàng toàn hệ thống, can thiệp trạng thái
- Kiểm duyệt đánh giá bị báo cáo
- **Nhật ký quản trị** (ai làm gì, lúc nào)

</td></tr>
</table>

Toàn bộ giao diện, thông báo lỗi và dữ liệu mẫu bằng **tiếng Việt**; giao diện responsive (máy tính, máy tính bảng, điện thoại).
App **chạy được hoàn toàn không cần Internet**: ảnh món mẫu (`frontend/public/images/food/`, 25 ảnh WebP ~3 MB) và font *Be Vietnam Pro* đều nằm sẵn trong dự án.

## 🧱 Công nghệ & kiến trúc

| Phần | Công nghệ |
|---|---|
| Frontend | React 19, Vite, TypeScript, React Router, Tailwind CSS 4, TanStack Query, Axios, React Hook Form + Zod, Recharts, Lucide, Sonner |
| Backend | Node.js, Express 5, TypeScript, Prisma 6, Zod, JWT (cookie httpOnly), bcrypt, Pino, Helmet, express-rate-limit, Multer, Swagger UI |
| Database | MySQL 8.x (`utf8mb4_unicode_ci`) |
| Test | Vitest, Supertest, React Testing Library |

```mermaid
flowchart LR
  subgraph Trình duyệt
    UI[React SPA<br/>TanStack Query]
  end
  UI -- "/api/v1 (cookie qb_session)" --> API
  subgraph Backend Node.js
    API[Express 5<br/>helmet · CORS · CSRF · rate limit] --> MW[authenticate · requireRole · requireStallAccess]
    MW --> MOD[Modules: auth, catalog, cart, orders,<br/>vendor, admin, notifications, reviews]
    MOD --> PR[Prisma ORM]
  end
  PR --> DB[(MySQL 8)]
  MOD --> FS[(uploads/)]
```

📚 **Tài liệu chi tiết**

| Tài liệu | Nội dung |
|---|---|
| [docs/api.md](docs/api.md) | Quy ước API, mã lỗi, danh sách endpoint · **Swagger UI: http://localhost:4000/api/docs** |
| [docs/database.md](docs/database.md) | Sơ đồ ER (Mermaid), quyết định thiết kế, hành vi khi xoá |
| [docs/payments.md](docs/payments.md) | Thanh toán chuyển khoản VietQR, webhook SePay, giả lập webhook khi phát triển |
| [docs/business-rules.md](docs/business-rules.md) | Máy trạng thái đơn, thanh toán, huỷ / từ chối / hoàn tiền, giờ nhận, giỏ hàng, quyền trong quầy, kiểm duyệt đánh giá |
| [docs/security.md](docs/security.md) | Biện pháp bảo mật, kết quả rà soát, giới hạn đã biết |
| [docs/deployment.md](docs/deployment.md) | Triển khai production (nginx / PM2 hoặc Vercel + Aiven), biến môi trường, **sao lưu & khôi phục**, quy trình khôi phục sự cố |
| [docs/release-v1.0.md](docs/release-v1.0.md) | Bản phát hành v1.0.x (lịch sử phiên bản), URL production, quy trình triển khai & quay lại, smoke test |
| [docs/cong-nghe.md](docs/cong-nghe.md) | Công nghệ & phiên bản thư viện đang dùng |
| [docs/openapi.json](docs/openapi.json) | Tài liệu API dạng tĩnh (OpenAPI 3.1), xem không cần chạy server |

---

## 🚀 Cài đặt & chạy trên Windows

> Đã kiểm chứng bằng một bản sao sạch (không có `node_modules`, `.env`): làm đúng các bước dưới đây là chạy được.

### Yêu cầu

- **Node.js 20+** (đã kiểm tra với Node 24) và npm
- **MySQL 8.x** cài trực tiếp, **hoặc** Docker Desktop (xem [MySQL bằng Docker](#-tuỳ-chọn-mysql-bằng-docker))

### Bước 1: Cài thư viện

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

`npm install` ở backend tự tạo Prisma Client (script `postinstall`).

### Bước 2: Cấu hình backend

Copy `backend/.env.example` thành `backend/.env`, rồi sửa:

```
DATABASE_URL="mysql://root:MAT_KHAU_CUA_BAN@localhost:3306/quickbite"
JWT_SECRET="<chuỗi ngẫu nhiên>"
```

- Tạo `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Database `quickbite` **không cần tạo trước**, Prisma sẽ tự tạo.
- Mật khẩu có ký tự đặc biệt phải mã hoá URL: `@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`, `?` → `%3F`, `&` → `%26`.
- *(Tuỳ chọn)* Dùng user MySQL riêng thay vì root: [`database/create-dev-user.sql`](database/create-dev-user.sql).

Kiểm tra kết nối (lần đầu sẽ báo *"database chưa tồn tại"* — bình thường):

```bash
npm run db:check
```

### Bước 3: Tạo bảng và dữ liệu mẫu

```bash
npm run db:migrate
```

Lệnh này tạo database, áp dụng toàn bộ migration có sẵn trong `prisma/migrations` và **tự chạy seed** (không hỏi gì thêm).
Kết thúc thấy `✅ Seed hoàn tất!` là xong. Muốn làm mới dữ liệu mẫu: `npm run db:seed`.

> Prisma có thể hiện khung *"Update available 6.x → 8.x"* — bỏ qua, dự án cố ý dùng Prisma 6 bản ổn định.

### Bước 4: Chạy ứng dụng (2 cửa sổ terminal)

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

| | Địa chỉ |
|---|---|
| Giao diện | http://localhost:5173 |
| API | http://localhost:4000/api/v1 · kiểm tra: http://localhost:4000/api/v1/health |
| Tài liệu API (Swagger) | http://localhost:4000/api/docs |
| Xem dữ liệu (Prisma Studio) | `npm run db:studio` trong `backend` |

### 🔐 Tài khoản demo — CHỈ DÙNG KHI PHÁT TRIỂN

Tạo bởi seed. Mật khẩu chung: **`QuickBite@123`**

| Vai trò | Email |
|---|---|
| Quản trị viên | `admin@quickbite.test` |
| Chủ quầy "Bếp Nhà Sinh Viên" | `hanh.bepnha@quickbite.test` |
| Nhân viên "Bếp Nhà Sinh Viên" | `tai.bepnha@quickbite.test` |
| Chủ quầy "Phở & Mì Cô Ba" | `ba.phomi@quickbite.test` |
| Chủ quầy "Góc Ăn Nhanh K-Town" | `khoa.ktown@quickbite.test` |
| Chủ quầy "Trà Sữa & Cà Phê Chill" | `han.chill@quickbite.test` |
| Chủ quầy "Vườn Xanh — Chay & Salad" | `tam.vuonxanh@quickbite.test` |
| Sinh viên | `an.nguyen@quickbite.test`, `binh.tran@quickbite.test`, `cuong.le@quickbite.test`, `dung.pham@quickbite.test` |
| Sinh viên bị khoá (để thử) | `em.vo@quickbite.test` |

> ⚠️ Seed **xoá toàn bộ dữ liệu** rồi tạo lại và bị chặn khi `NODE_ENV=production`. Không bao giờ dùng các tài khoản / mật khẩu này trên môi trường thật.

### 💾 Sao lưu & khôi phục database

```bash
cd backend
npm run db:backup
```

Tạo file nén `database/quickbite_backup_<ngày>_<giờ>.sql.gz` kèm file kiểm tra `.json` (mã SHA-256, số dòng từng bảng, migration). Chạy được cả với MySQL máy local lẫn Aiven / cloud (tự bật SSL), không khoá bảng khi hệ thống đang chạy, chỉ giữ 14 bản định kỳ mới nhất (`--keep=<n>`, `BACKUP_KEEP`).

Khôi phục (sẽ **ghi đè** dữ liệu hiện tại, phải thêm `--yes`):

```bash
npm run db:restore -- "../database/quickbite_backup_2026-11-20_020000.sql.gz" --yes
```

- Trước khi ghi đè: kiểm tra mã SHA-256 (file hỏng → dừng) và **tự sao lưu database đích** (nhãn `truoc-khoi-phuc`).
- Sau khi khôi phục: so số dòng từng bảng và migration với lúc sao lưu.
- Ghi đè database chính khi `NODE_ENV=production` hoặc database trên cloud → phải thêm `--confirm=<tên database>`.
- Muốn thử trước mà không động tới dữ liệu đang dùng: thêm `--database=quickbite_restore_test` để khôi phục vào database khác.
- Script tự tìm `mysqldump` / `mysql` trong PATH hoặc `C:Program FilesMySQLMySQL Server *in` (có thể đặt `MYSQL_BIN_DIR`).
- Lịch sao lưu tự động, quy trình khôi phục sự cố: xem [docs/deployment.md](docs/deployment.md#7-sao-lưu--khôi-phục).
- ⚠️ File sao lưu chứa email, số điện thoại, hash mật khẩu → **đã chặn trong `.gitignore`**, không đưa lên GitHub. Hãy cất ở nơi an toàn, kèm bản sao thư mục `backend/uploads/` (ảnh tải lên).

### 🐳 (Tuỳ chọn) MySQL bằng Docker

```bash
docker compose up -d
```

Rồi đặt trong `backend/.env`: `DATABASE_URL="mysql://quickbite:quickbite_dev_pass@localhost:3306/quickbite"`.
Nếu máy đã có MySQL ở cổng 3306, đổi `ports` trong `docker-compose.yml` thành `"3307:3306"` và dùng cổng 3307.

---

## ⚙️ Biến môi trường

### Backend (`backend/.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `4000` | Cổng API |
| `DATABASE_URL` | — (bắt buộc) | Chuỗi kết nối MySQL |
| `JWT_SECRET` | — (bắt buộc, ≥ 32 ký tự) | Khoá ký phiên đăng nhập. Production từ chối giá trị mẫu |
| `JWT_EXPIRES_IN` | `7d` | Thời hạn phiên (`45s`, `30m`, `12h`, `7d`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Origin được phép, cách nhau dấu phẩy |
| `LOG_LEVEL` | `info` | Mức log |
| `UPLOAD_DIR` | `uploads` | Thư mục lưu ảnh tải lên |
| `MAX_UPLOAD_MB` | `2` | Dung lượng ảnh tối đa |
| `AUTH_RATE_LIMIT_MAX` | `10` | Số lần thử sai đăng nhập / 15 phút / IP |
| `TRUST_PROXY` | `0` | Số reverse proxy phía trước (`1` khi có nginx) |
| `IMAGE_HOSTS` | `images.unsplash.com` | Tên miền ảnh ngoài (https) được phép, ngoài ảnh có sẵn `/images/...` và ảnh tải lên `/uploads/...` |
| `API_DOCS` | tự động | `true` / `false` để ép bật / tắt Swagger (mặc định tắt ở production) |
| `BACKUP_DIR` · `BACKUP_KEEP` | `../database` · `14` | Thư mục lưu bản sao lưu · số bản định kỳ giữ lại |
| `DB_SSL` | tự động | `true` / `false` để ép bật / tắt SSL khi sao lưu / khôi phục (mặc định bật với database trên cloud) |
| `SEPAY_WEBHOOK_API_KEY` | — (tắt) | API key nhận webhook SePay để tự xác nhận chuyển khoản. Bỏ trống = chủ quầy tự bấm "Đã nhận tiền". Xem [docs/payments.md](docs/payments.md) |

Mẫu cấu hình production: [backend/.env.production.example](backend/.env.production.example).

`backend/.env.test` dùng cho bộ test (xem [.env.test.example](backend/.env.test.example)); tên database **bắt buộc kết thúc bằng `_test`**.

### Frontend (`frontend/.env`, không bắt buộc)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `API_PROXY_TARGET` | `http://localhost:4000` | Backend mà Vite dev server chuyển tiếp `/api`, `/uploads` |
| `VITE_API_URL` | `/api/v1` | Đường dẫn API trong trình duyệt (khi frontend & backend khác domain) |

---

## 📜 Các lệnh

### Backend (`cd backend`)

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Chạy API, tự khởi động lại khi sửa code |
| `npm run build` · `npm start` | Build TypeScript → `dist/` · chạy bản build |
| `npm run typecheck` · `npm run lint` · `npm run format` | Kiểm tra kiểu · ESLint · Prettier |
| `npm run db:check` | Kiểm tra kết nối & số lượng dữ liệu |
| `npm run db:migrate` | Áp dụng migration (phát triển; tạo migration mới nếu sửa schema) + seed |
| `npm run db:deploy` | Áp dụng migration (production / CI) |
| `npm run db:seed` · `npm run db:reset` | Nạp lại dữ liệu mẫu · xoá sạch DB rồi migrate + seed |
| `npm run db:studio` | Prisma Studio |
| `npm run db:backup` | Sao lưu database ra `database/quickbite_backup_<ngày>_<giờ>.sql.gz` (+ file kiểm tra `.json`) |
| `npm run db:restore -- "<file>" --yes` | Khôi phục từ file sao lưu (**ghi đè** dữ liệu hiện tại, tự sao lưu trước); thêm `--database=<tên>` để khôi phục vào database khác |
| `npm run prod:check` | Kiểm tra cấu hình production (biến môi trường + database); thêm `-- --env-file=<file>` để kiểm tra file khác |
| `npm run smoke -- --api=<URL> --web=<URL>` | Smoke test sau triển khai (chỉ đọc, thoát mã 1 nếu có lỗi) |
| `npm run docs:openapi` | Xuất tài liệu API ra `docs/openapi.json` (chạy lại sau khi sửa API) |
| `npm test` | Chạy toàn bộ test (database `*_test`) |

### Frontend (`cd frontend`)

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Giao diện ở http://localhost:5173 |
| `npm run build` · `npm run preview` | Build production (`dist/`) · xem thử bản build |
| `npm run typecheck` · `npm run lint` · `npm run format` | Kiểm tra kiểu · oxlint · Prettier |
| `npm test` | Test giao diện |

---

## 🧪 Kiểm thử

| | Số test | Bao phủ chính |
|---|---|---|
| Backend | **383** (25 file) | Đăng ký / đăng nhập / phiên / CSRF; phân quyền vai trò & quyền sở hữu quầy; tìm kiếm & lọc; giỏ hàng; tạo đơn bằng transaction (giá ở server, snapshot, chống đặt trùng **kể cả gửi đồng thời**); máy trạng thái & bấm đồng thời; thanh toán VietQR & webhook SePay; thực đơn; tải ảnh giả mạo; báo cáo theo ngày / theo ca; thông báo; quản trị & nhật ký; đánh giá & kiểm duyệt; sao lưu / khôi phục / cấu hình production / smoke test; **tài liệu Swagger khớp 2 chiều với route và khớp dữ liệu trả về thật**; link trong tài liệu không hỏng |
| Frontend | **148** (32 file) | Form đăng nhập; route bảo vệ & chuyển hướng an toàn; header theo vai trò; thẻ & chi tiết món; bộ lọc đồng bộ URL; giỏ hàng & giỏ mini; checkout (idempotencyKey); xung đột quầy khi thêm giỏ; nút xử lý đơn; thông báo (của tôi / của quầy); doanh thu theo ca; quản lý người dùng & xác nhận khoá; bảng dữ liệu; form đánh giá |

Test backend chạy trên database riêng (`.env.test`) và **từ chối chạy** nếu tên database không kết thúc bằng `_test`, để không bao giờ xoá nhầm dữ liệu thật.

---

## ✅ Tiến độ & Definition of Done

- [x] **Phase 1** — Kiến trúc, Prisma schema & migration, seed, kết nối MySQL
- [x] **Phase 2** — Đăng ký / đăng nhập, bcrypt, JWT cookie, phân quyền vai trò & theo quầy
- [x] **Phase 3** — Trang chủ, tìm kiếm không dấu, bộ lọc, trang quầy, chi tiết món
- [x] **Phase 4** — Giỏ hàng lưu DB, checkout, tạo đơn transaction, xác nhận, theo dõi & lịch sử đơn
- [x] **Phase 5** — Dashboard chủ quầy, thực đơn & tải ảnh, xử lý đơn theo trạng thái, báo cáo, thông báo
- [x] **Phase 6** — Dashboard quản trị, người dùng, quầy & nhân sự, danh mục, điểm nhận, đơn toàn hệ thống, kiểm duyệt, nhật ký; đánh giá của sinh viên
- [x] **Phase 7** — Swagger/OpenAPI (đối chiếu 2 chiều với code), rà soát bảo mật & sửa lỗi, `npm audit` 0 lỗ hổng, cài đặt mới từ đầu theo README, kiểm tra responsive, tài liệu
- [x] **Release v1.0.0** — sao lưu / khôi phục database, kiểm tra cấu hình production, triển khai Vercel + Aiven, smoke test đạt
- [x] **Release v1.0.1** — sửa 4 lỗi UAT (tải ảnh khi mạng yếu, bộ lọc trên điện thoại, nút "Nhận đơn", xác nhận lưu thông tin quầy), Swagger & tài liệu kỹ thuật

| Tiêu chí | Kết quả |
|---|---|
| Frontend, backend chạy được; backend kết nối MySQL | ✅ |
| Migration & seed chạy được từ database trống | ✅ (kiểm chứng trên bản sao sạch) |
| Đăng ký / đăng nhập; duyệt món, giỏ hàng, đặt đơn; đơn lưu trong MySQL | ✅ |
| Chủ quầy quản lý thực đơn & xử lý đơn của mình; admin quản lý hệ thống | ✅ |
| Trạng thái đơn theo đúng quy tắc; thao tác trái phép bị backend từ chối | ✅ (có test) |
| Luồng chính có test tự động | ✅ 383 + 148 test |
| Responsive, có trạng thái đang tải / trống / lỗi | ✅ (14 trang không tràn ngang ở 375px) |
| Không phụ thuộc dữ liệu giả cố định trong giao diện | ✅ mọi dữ liệu lấy từ API |

### Giới hạn đã biết

- Thanh toán: **tiền mặt khi nhận** và **chuyển khoản VietQR** (xác nhận tự động qua webhook SePay hoặc quầy xác nhận). Cổng thanh toán thẻ / ví điện tử chưa tích hợp.
- Thông báo & trạng thái đơn cập nhật bằng **polling** (15–30 giây), chưa dùng WebSocket.
- Bộ đếm giới hạn tần suất lưu trong bộ nhớ (một tiến trình). Xem [docs/security.md](docs/security.md#8-giới-hạn-đã-biết--hướng-cải-thiện).
- Trên Vercel, ổ đĩa không lưu lâu dài: ảnh chủ quầy tự tải lên có thể mất sau mỗi lần triển khai lại (ảnh mẫu trong `frontend/public/images` không bị ảnh hưởng).

---

## 📁 Cấu trúc thư mục

```
quickbite/
├── backend/
│   ├── prisma/                  # schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── config/              # env (kiểm tra bằng Zod), logger, khuyến mãi
│   │   ├── docs/openapi.ts      # Đặc tả OpenAPI (Swagger)
│   │   ├── lib/                 # prisma, jwt, password
│   │   ├── middlewares/         # auth, stall-access, csrf, rate-limit, error-handler
│   │   ├── modules/             # auth, users, catalog, categories, stalls, menu-items, pickup-locations,
│   │   │                        # cart, orders, reviews, notifications, vendor, admin, home
│   │   ├── routes/index.ts      # Gắn module vào /api/v1
│   │   ├── utils/               # lỗi, phản hồi, ngày giờ, giờ mở cửa, slug, mã đơn
│   │   ├── app.ts · server.ts
│   ├── api/index.js · vercel.json  # Điểm vào hàm serverless & cấu hình build trên Vercel
│   ├── scripts/                 # check-db, backup-db, restore-db, check-production, smoke-test, export-openapi
│   └── tests/                   # Test tích hợp & đơn vị
├── frontend/src/
│   ├── app/                     # App, router (tải trang theo nhu cầu)
│   ├── components/              # layout (Header, Public/Vendor/Admin layout), ui (Button, Dialog, DataTable...)
│   ├── features/                # auth, food-discovery, cart, orders, vendor, admin, reviews, notifications
│   ├── pages/                   # Trang sinh viên · pages/vendor · pages/admin
│   ├── services/                # Lớp gọi API (Axios)
│   ├── lib/ · hooks/ · types/ · test/
├── frontend/vercel.json         # Chuyển /api sang backend, SPA về index.html
├── database/                    # SQL hỗ trợ (tạo user, init Docker); bản sao lưu (không đưa lên Git)
├── docs/                        # api, openapi.json, database, business-rules, payments, security, deployment, release-v1.0, cong-nghe
└── docker-compose.yml           # MySQL tuỳ chọn
```

---

## 🛠️ Xử lý sự cố

| Lỗi | Cách khắc phục |
|---|---|
| `Authentication failed against database server` | Sai user / mật khẩu trong `DATABASE_URL`; nhớ mã hoá ký tự đặc biệt. |
| `Can't reach database server at localhost:3306` | MySQL chưa chạy: mở `services.msc`, Start dịch vụ MySQL. |
| `db:check` báo *database chưa tồn tại* | Bình thường ở lần đầu — chạy `npm run db:migrate`. |
| `@prisma/client did not initialize yet` | Chạy `npm run prisma:generate` trong `backend` (thường do cài thư viện bị gián đoạn). |
| `Cấu hình môi trường (.env) không hợp lệ` | Đọc danh sách biến sai được in ra và sửa `backend/.env`. |
| `P3014 ... shadow database` khi migrate | User MySQL thiếu quyền tạo database; dùng root hoặc quyền như `database/create-dev-user.sql`. |
| `EADDRINUSE: 4000` / `5173` | Cổng đang bị dùng: tắt tiến trình cũ hoặc đổi `PORT` (và `API_PROXY_TARGET` ở frontend). |
| Giao diện báo *"Không kết nối được máy chủ"* | Backend chưa chạy, hoặc chạy khác cổng với `API_PROXY_TARGET`. |
| Sửa code nhưng giao diện không đổi / lỗi lạ | Trình theo dõi file của Vite trên Windows đôi khi bỏ lỡ thay đổi: tắt frontend (`Ctrl + C`), chạy lại `npm run dev`, tải lại trang. |
| *"Bạn đã thử quá nhiều lần"* | Sai quá 10 lần / 15 phút; đợi hoặc khởi động lại backend. |
| Ảnh món không hiện / *"Ảnh phải là ảnh đã tải lên..."* | Ảnh hợp lệ: `/images/...` (có sẵn trong `frontend/public/images`), `/uploads/...` (tải lên), hoặc https thuộc `IMAGE_HOSTS`. |
| Ảnh tải lên bị mất khi chuyển máy | Thư mục `backend/uploads/` không lên GitHub — copy riêng cùng bản sao lưu database. |
| `npm test` báo *Từ chối chạy test* | Tạo `backend/.env.test` với database tên kết thúc bằng `_test`. |
