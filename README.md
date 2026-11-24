# QuickBite – Hệ Thống Web Đặt Món & Quản Lý Đơn Hàng Căn Tin UEH

> Dự án đồ án môn học: **Quản lý dự án Công nghệ thông tin (26C1INF50901603)**  
> Giảng viên hướng dẫn: **TS. Nguyễn Mạnh Tuấn**  
> Nhóm thực hiện: **Nhóm 5** | Quản lý kiểm soát: **PCG (Nguyễn Đinh Thảo Nhi)**

---

## 1. Giới thiệu tổng quan
**QuickBite** là giải pháp Web Application hỗ trợ đặt món trước (Pre-order) và quản lý luồng đơn hàng trực tuyến dành riêng cho khu vực căn tin tại các cơ sở Đại học Kinh tế TP. Hồ Chí Minh (UEH). Hệ thống giúp giải quyết tình trạng ùn tắc giờ cao điểm, cắt giảm thời gian chờ đợi của sinh viên từ 15 phút xuống dưới 3 phút và số hóa quy trình bán hàng cho quầy căn tin.

**Trạng thái:** đã phát hành **v1.0.1** (24/11/2026: sửa lỗi UAT Sprint 7), đang chạy production. Bản đầu tiên v1.0.0 phát hành 19/11/2026.

## 2. Thành viên nhóm & Phân vai
| STT | Họ và Tên | MSSV | Vai trò chính |
|:---:|:---|:---:|:---|
| 1 | **Hồ Gia Bảo** | 31241023360 | Project Manager (PM) |
| 2 | **Trần Gia Bảo** | 31241026999 | Business Analyst (BA) |
| 3 | **Lê Bảo Ngọc** | 31241025411 | UI/UX Designer |
| 4 | **Đặng Xuân Huy** | 35254020075 | Developer |
| 5 | **Lê Nguyễn Khánh Trình** | 31241026087 | QA / Documentation |

## 3. Sản phẩm (v1.0.1)

| | Địa chỉ |
|---|---|
| **Ứng dụng** | https://quickbite-coral.vercel.app |
| **API** | https://backend-henna-iota-13.vercel.app/api/v1 (kiểm tra: `/api/v1/health`) |
| **Tài liệu API** | [src/quickbite/docs/openapi.json](src/quickbite/docs/openapi.json) (mở bằng https://editor.swagger.io) |
| **Ghi chú phát hành** | [src/quickbite/docs/release-v1.0.md](src/quickbite/docs/release-v1.0.md) |

Chức năng chính theo vai trò:

| Vai trò | Chức năng |
|---|---|
| **Sinh viên** | Tìm món không dấu, lọc, xem quầy; giỏ hàng; đặt đơn chọn điểm & giờ nhận; trả tiền mặt hoặc chuyển khoản VietQR; theo dõi đơn, lịch sử, huỷ, đánh giá; thông báo |
| **Chủ quầy / nhân viên** | Tổng quan hôm nay; xử lý đơn theo trạng thái; thực đơn & ảnh; báo cáo doanh thu theo ngày và theo ca; thông báo của quầy; xác nhận chuyển khoản |
| **Quản trị viên** | Người dùng (khoá có xác nhận), quầy & nhân sự, danh mục, điểm nhận, đơn toàn hệ thống, kiểm duyệt đánh giá, nhật ký quản trị |

## 4. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| **Giao diện** | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5, React Hook Form + Zod, Axios |
| **API** | Node.js, Express 5, TypeScript, Prisma 6 (ORM), Zod, JWT trong cookie httpOnly, bcrypt, Helmet, Swagger UI |
| **Cơ sở dữ liệu** | MySQL 8 (production: Aiven, Singapore) |
| **Thanh toán** | Tiền mặt khi nhận; chuyển khoản **VietQR** vào tài khoản của quầy, xác nhận tự động qua webhook SePay |
| **Kiểm thử** | Vitest, Supertest (backend, database test riêng), React Testing Library (frontend) |
| **Triển khai** | Vercel (backend serverless + frontend tĩnh, vùng Singapore) |
| **Quản trị dự án** | Jira Software (board SCRUM), Microsoft Project 2016, GitHub (nhánh `feature/SCRUM-xx` → Pull Request vào `develop` → `release/x.y.z` → `master`) |

Chi tiết phiên bản thư viện: [src/quickbite/docs/cong-nghe.md](src/quickbite/docs/cong-nghe.md).

## 5. Chạy trên máy

Hướng dẫn đầy đủ (Windows, từng bước, tài khoản demo, xử lý sự cố) nằm trong **[src/quickbite/README.md](src/quickbite/README.md)**. Tóm tắt:

```bash
cd src/quickbite/backend
npm install
copy .env.example .env        # sửa DATABASE_URL, JWT_SECRET
npm run db:migrate            # tạo bảng + dữ liệu mẫu
npm run dev                   # API: http://localhost:4000 · Swagger: http://localhost:4000/api/docs

cd ../frontend
npm install
npm run dev                   # Giao diện: http://localhost:5173
```

## 6. Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `docs/` | Tài liệu quản lý dự án: tổng quan, product backlog, sprint, thiết kế, kiểm thử ([docs/README.md](docs/README.md)) |
| `planning/` | Kế hoạch theo từng Sprint tuần |
| `src/quickbite/backend/` | API Node.js + Express + Prisma (mã nguồn, migration, test, script sao lưu / kiểm tra production) |
| `src/quickbite/frontend/` | Giao diện React |
| `src/quickbite/docs/` | **Tài liệu kỹ thuật** (bảng dưới) |
| `src/quickbite/database/` | SQL hỗ trợ (tạo user, khởi tạo Docker) |
| `tests/` | Kịch bản kiểm thử (Test Cases) và tài liệu QA |

## 7. Tài liệu kỹ thuật

| Tài liệu | Nội dung |
|---|---|
| [README mã nguồn](src/quickbite/README.md) | Cài đặt, biến môi trường, các lệnh, kiểm thử, cấu trúc mã nguồn, xử lý sự cố |
| [api.md](src/quickbite/docs/api.md) · [openapi.json](src/quickbite/docs/openapi.json) | Quy ước API, mã lỗi, danh sách endpoint · đặc tả OpenAPI 3.1 |
| [database.md](src/quickbite/docs/database.md) | Sơ đồ ER, quyết định thiết kế, hành vi khi xoá |
| [business-rules.md](src/quickbite/docs/business-rules.md) | Máy trạng thái đơn, thanh toán, huỷ / hoàn tiền, giờ nhận, quyền trong quầy |
| [payments.md](src/quickbite/docs/payments.md) | Chuyển khoản VietQR, webhook SePay |
| [security.md](src/quickbite/docs/security.md) | Biện pháp bảo mật, kết quả rà soát |
| [deployment.md](src/quickbite/docs/deployment.md) | Triển khai production, sao lưu & khôi phục database |
| [release-v1.0.md](src/quickbite/docs/release-v1.0.md) | Lịch sử phiên bản v1.0.x, quy trình triển khai & smoke test |
| [cong-nghe.md](src/quickbite/docs/cong-nghe.md) | Công nghệ & phiên bản |
