# Báo cáo hoàn thành task

| Mục | Nội dung |
|---|---|
| **Task** | [Dev] State machine trạng thái đơn + API xử lý đơn cho chủ quầy |
| **Epic** | Tuần 5 — Chủ quầy & thông báo |
| **Vai trò** | Dev (lập trình fullstack: backend Node.js + frontend React + MySQL) |
| **Dự án** | QuickBite — đặt món ăn trong trường đại học |
| **Mã nguồn** | Máy trạng thái: `backend/src/modules/orders/order-status.ts`. Chuyển trạng thái: `orders/order-workflow.ts`. API chủ quầy: `vendor/vendor.routes.ts`, `vendor/vendor-orders.service.ts`. Giao diện: `frontend/src/features/vendor/order-actions.tsx`, `pages/vendor/VendorOrdersPage.tsx` |
| **Commit** | `ad6d6ae` (16/10/2026) và `352a6d5`, `ffc770e` (21/10/2026, bổ sung quy tắc thanh toán VietQR). Chi tiết theo từng dòng ở mục 5 |
| **Ngày báo cáo** | 06/11/2026 |
| **Trạng thái** | ✅ Hoàn thành. Test: **11 test backend** (5 máy trạng thái + 6 API xử lý đơn) và **6 test frontend** đều đạt. Kiểm tra thủ công trên API thật: **11/11** kịch bản cho kết quả đúng |

## 1. Kết quả

### 1.1 Máy trạng thái đơn hàng

![Sơ đồ máy trạng thái](anh/01-so-do-may-trang-thai.png)

Toàn bộ quy tắc nằm trong **một bảng** `ORDER_TRANSITIONS`. Bảng ghi: từ trạng thái nào được sang trạng thái nào, ai được làm, và có bắt buộc lý do không. Cả backend lẫn giao diện đều dựa vào bảng này, không viết `if/else` rải rác.

| Từ | Sang | Ai được làm | Ghi chú |
|---|---|---|---|
| PENDING | ACCEPTED | Nhân viên quầy, admin | Đơn VietQR **chưa có tiền** thì chưa được nhận |
| PENDING | REJECTED | Nhân viên quầy, admin | **Bắt buộc lý do** |
| PENDING | CANCELLED | Sinh viên chủ đơn, admin | Sinh viên không tự huỷ đơn đã chuyển khoản |
| ACCEPTED | PREPARING | Nhân viên quầy, admin | |
| ACCEPTED | CANCELLED | Nhân viên quầy, admin | **Bắt buộc lý do** |
| PREPARING | READY_FOR_PICKUP | Nhân viên quầy, admin | |
| READY_FOR_PICKUP | COMPLETED | Nhân viên quầy, admin | Đơn tiền mặt → thanh toán **PAID** |
| COMPLETED / CANCELLED / REJECTED | — | — | Trạng thái cuối, không đổi được nữa |

### 1.2 API xử lý đơn cho chủ quầy

Tất cả dưới `/api/v1/vendor/stalls/:stallId`.
- **Ai dùng được:** chỉ **chủ quầy và nhân viên của đúng quầy đó**, cùng admin.
- **Người không có quyền:** sinh viên nhận **403**; chủ quầy khác nhận **404** (không lộ đơn của quầy khác).

| Method | Endpoint | Chức năng |
|---|---|---|
| GET | `/orders?tab=&q=&from=&to=&page=` | Hàng đợi đơn theo 5 tab: **new** (mới), **in_progress** (đang làm), **ready** (chờ nhận), **completed**, **cancelled**. Tìm theo mã đơn / tên sinh viên, lọc theo ngày. Trả kèm **số đơn từng tab** và **`nextStatuses`** (các bước hợp lệ) của từng đơn |
| GET | `/orders/:orderId` | Chi tiết đơn kèm `nextStatuses` |
| PATCH | `/orders/:orderId/status` | Đổi trạng thái `{ status, reason? }` theo máy trạng thái |
| POST | `/orders/:orderId/confirm-payment` | Quầy xác nhận đã nhận chuyển khoản (khi không dùng webhook) |

### 1.3 Mỗi lần đổi trạng thái (trong **một transaction**)

1. **Kiểm tra hợp lệ:**
   - chuyển sai → **422**, kèm danh sách bước hợp lệ (`allowed`);
   - thiếu lý do → **400**.
2. **Cập nhật có điều kiện** `WHERE status = <cũ> AND paymentStatus = <cũ>`. Hai người bấm cùng lúc thì **chỉ một người thành công**, người còn lại nhận **409**.
3. **Ghi mốc thời gian** `acceptedAt`, `readyAt`, `completedAt`, `cancelledAt`.
4. **Cập nhật thanh toán:**
   - hoàn thành đơn tiền mặt → **PAID**, ghi người thu tiền;
   - huỷ / từ chối đơn chưa trả → **VOIDED**.
5. **Hoàn thành:** cộng **số phần đã bán** cho từng món (dùng cho sắp xếp "bán chạy").
6. **Ghi lịch sử** vào `order_status_history`, và **gửi thông báo** tiếng Việt cho sinh viên.

### 1.4 Giao diện chủ quầy (`/quan-ly/don-hang`)

- 5 tab có số đếm; mỗi thẻ đơn hiện món, ghi chú, sinh viên, điểm nhận, giờ nhận, cách thanh toán.
- **Chỉ hiện nút của bước hợp lệ** do server trả về: Nhận đơn / Từ chối → Bắt đầu làm / Huỷ đơn → Món đã xong → Đã giao món.
- Từ chối / huỷ mở hộp thoại **bắt buộc nhập lý do**. Đơn VietQR chưa có tiền chỉ có "Đã nhận tiền" và "Từ chối".

## 2. Kiểm thử tự động

### 2.1 Backend (Vitest + Supertest): **11 test liên quan, đều đạt**

| File | Test | Kết quả |
|---|---|---|
| `order-status.test.ts` | Luồng chuẩn của quầy | ✅ |
| | Không được nhảy cóc hoặc quay lui | ✅ |
| | Sinh viên chỉ huỷ được khi đơn còn chờ xác nhận | ✅ |
| | Từ chối đơn bắt buộc có lý do | ✅ |
| | Xác định vai trò thực hiện | ✅ |
| `vendor.test.ts` › Xử lý đơn theo trạng thái | Luồng đầy đủ: nhận → chuẩn bị → sẵn sàng → hoàn thành (PAID, cộng số đã bán, báo sinh viên) | ✅ |
| | Không cho nhảy cóc trạng thái (422) và trả về các bước hợp lệ | ✅ |
| | Từ chối đơn bắt buộc có lý do; từ chối xong thanh toán VOIDED | ✅ |
| | Hai nhân viên bấm cùng lúc: chỉ một lần chuyển trạng thái thành công | ✅ |
| | Không xử lý được đơn của quầy khác (404) | ✅ |
| | Danh sách đơn theo tab, kèm số lượng từng tab và tìm theo mã đơn | ✅ |

Cùng lần chạy còn có các test phân quyền khu vực chủ quầy (sinh viên 403, quầy khác 404, nhân viên xử lý được đơn), cũng đạt. Toàn dự án: backend **279/279** đạt.

![Test backend](anh/13-unit-test-backend.png)

### 2.2 Frontend (Vitest + React Testing Library): `order-actions.test.tsx` **6/6 đạt**

Nút hiển thị đúng theo `nextStatuses` · đơn đã kết thúc không có nút · "Nhận đơn" gọi API ACCEPTED · từ chối bắt buộc lý do · đơn chuyển khoản chưa có tiền: "Đã nhận tiền" hỏi xác nhận · đơn đã chuyển khoản: bước cuối là "Đã giao món".

![Test frontend](anh/14-unit-test-frontend.png)

## 3. Kiểm tra thủ công trên API thật

- **Cách làm:** gọi API thật tại `http://localhost:4000`, dùng 1 **sinh viên tạm** (đã xoá sau khi chụp cùng 6 đơn của họ) và các tài khoản quầy mẫu (`hanh.bepnha`, `tai.bepnha`, `ba.phomi`).
- **Kết quả:** cả 11 kịch bản cho kết quả đúng như mong đợi.

| Kịch bản | Kết quả |
|---|---|
| Luồng chuẩn: nhận → chuẩn bị (chủ quầy) → sẵn sàng → hoàn thành (nhân viên) | 200 × 4; hoàn thành → tiền mặt **PAID** |
| Nhảy cóc PENDING → COMPLETED | **422**, kèm `allowed: ["ACCEPTED","REJECTED"]` |
| Đổi trạng thái đơn đã hoàn thành | **422** |
| Từ chối không lý do / có lý do | **400** / 200 (REJECTED, VOIDED) |
| Chủ quầy và nhân viên cùng bấm "Nhận đơn" | **200 + 409**, chỉ 1 lần chuyển |
| Sinh viên gọi API quầy / chủ quầy khác | **403** / **404** |
| Nhận đơn VietQR chưa có tiền | **422** |
| Trạng thái không hợp lệ (`PENDING`) | **400** |

## 4. Ảnh chụp màn hình

### 4.1 Hàng đợi đơn của quầy: `nextStatuses` từng đơn, số đơn từng tab
![Danh sách đơn](anh/02-api-danh-sach-don-quay.png)

### 4.2 Luồng chuẩn của một đơn tiền mặt
![Luồng chuẩn](anh/03-api-luong-chuan.png)

### 4.3 Chặn chuyển sai; từ chối bắt buộc lý do
![Chuyển sai](anh/04-api-chuyen-sai-ly-do.png)

### 4.4 Hai người bấm cùng lúc: chỉ một lần thành công (409)
![Bấm cùng lúc](anh/05-api-bam-cung-luc.png)

### 4.5 Phân quyền và quy tắc thanh toán VietQR
![Phân quyền](anh/06-api-phan-quyen-vietqr.png)

### 4.6 Sinh viên nhận thông báo; đơn ghi lịch sử trạng thái
![Thông báo và lịch sử](anh/07-thong-bao-lich-su.png)

### 4.7 Database của đơn sau khi hoàn thành
![Database](anh/08-db-don-hoan-thanh.png)

### 4.8 Màn hình xử lý đơn của chủ quầy
![Trang xử lý đơn](anh/09-trang-xu-ly-don.png)

### 4.9 Từ chối đơn: chưa nhập lý do thì không gửi được
![Bắt buộc lý do](anh/10-tu-choi-bat-buoc-ly-do.png)

### 4.10 Sau khi "Nhận đơn": đơn sang tab "Đang làm", nút tiếp theo là "Bắt đầu làm"
![Tab đang làm](anh/11-tab-dang-lam.png)

### 4.11 Phía sinh viên: tiến trình đơn theo các bước quầy đã bấm
![Sinh viên theo dõi đơn](anh/12-sinh-vien-theo-doi-don.png)

## 5. Mã nguồn và commit

Ảnh chụp từ repo nhóm `lnktrinh92-boom/QLDA-Group5`, nhánh `develop` (commit `035c64c`):
- cột màu bên trái là **commit của từng dòng** (theo `git blame`);
- dòng tô vàng là phần chính của yêu cầu.

| Commit | Nội dung | Thời gian | Số dòng trong ảnh |
|---|---|---|---|
| `ad6d6ae` | feat: add QuickBite project | 16/10/2026 15:59 | 534 |
| `352a6d5` | Add VietQR payment and stall payment timeout | 21/10/2026 09:56 | 103 |
| `ffc770e` | Add VietQR payment and stall payment timeout | 21/10/2026 12:57 | 3 |

**Ghi chú về quy trình:** code của task này đã nằm sẵn trên `develop` từ commit ban đầu `ad6d6ae`, được push thẳng chứ không qua Pull Request. Báo cáo này được đưa lên qua **một Pull Request riêng** vào `develop` để nhóm review, đúng quy trình.

### 5.1 Bảng chuyển trạng thái
![order-status 1](anh/code-01-order-status.png)

### 5.2 Quy tắc thanh toán, vai trò, nhãn
![order-status 2](anh/code-02-order-status.png)

### 5.3 transitionOrder: kiểm tra hợp lệ
![order-workflow 1](anh/code-03-order-workflow.png)

### 5.4 transitionOrder: transaction
![order-workflow 2](anh/code-04-order-workflow.png)

### 5.5 Hàng đợi đơn: tab và schema
![vendor-orders 1](anh/code-05-vendor-orders.service.png)

### 5.6 Hàng đợi đơn: danh sách, chi tiết
![vendor-orders 2](anh/code-06-vendor-orders.service.png)

### 5.7 Route API chủ quầy
![vendor.routes](anh/code-07-vendor.routes.png)

### 5.8 Test máy trạng thái
![test order-status](anh/code-08-order-status.test.png)

### 5.9 Test API xử lý đơn
![test vendor](anh/code-09-vendor.test.png)

### 5.10 Giao diện: nút theo bước hợp lệ
![order-actions 1](anh/code-10-order-actions.png)

### 5.11 Giao diện: hộp thoại lý do, xác nhận nhận tiền
![order-actions 2](anh/code-11-order-actions.png)
