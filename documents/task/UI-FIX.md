# UI-FIX — Chuẩn hóa giao diện dữ liệu và responsive

## 1. Mục tiêu

- Tăng khả năng đọc trên desktop, đặc biệt tên thành viên và dữ liệu trong danh sách.
- Dùng List cho dữ liệu dày trên desktop và Card cho thao tác thuận tiện trên mobile.
- Chuẩn hóa tìm kiếm, bộ lọc, sắp xếp và chuyển kiểu hiển thị giữa các màn hình.
- Đổi nhận diện sang hồng là màu thương hiệu chính; xanh navy chỉ đóng vai trò đường viền, bóng và chi tiết trang trí.
- Giữ phong cách sắc cạnh, border radius từ 0 đến 2px.
- Từ chiều rộng 1024px trở xuống mặc định sử dụng giao diện mobile/card.

## 2. Typography

- Nội dung cơ bản: 14–15px.
- Tên thành viên và dữ liệu chính: 13–14px, font-weight từ 700.
- Ô dữ liệu bảng: 12–13px.
- Nội dung phụ: tối thiểu 11px.
- Badge và tiêu đề cột: tối thiểu 10px.
- Không dùng kích thước 7–9px cho thông tin người dùng cần đọc hoặc thao tác.
- Kích thước chữ trên mobile không bị giảm so với desktop; ưu tiên xuống dòng và Card.

## 3. Hệ màu thương hiệu

Không hoán đổi trực tiếp các biến màu cũ. Tạo token theo vai trò:

- `brand-primary`: hồng chủ đạo.
- `brand-primary-strong`: hồng đậm đủ tương phản cho sidebar, nút chính và tab active.
- `brand-surface`: nền hồng nhạt cho hover, focus và vùng nhấn nhẹ.
- `brand-decoration`: xanh navy dùng cho viền dày, gạch chân, bóng vuông và chi tiết trang trí.
- `success`, `danger`, `warning`: màu ngữ nghĩa riêng, không phụ thuộc màu thương hiệu.
- `text`, `muted`, `line`, `background`: màu trung tính cho nội dung và cấu trúc.

Quy tắc sử dụng:

- Sidebar dùng gradient hồng đậm, viền phải navy.
- Nút primary và tab active dùng hồng; bóng hoặc viền trang trí dùng navy.
- Focus input dùng hồng.
- Hero ưu tiên nền hồng; navy chỉ tạo mảng hoặc đường trang trí.
- Trạng thái thu, chi, nợ, thắng và lỗi tiếp tục dùng màu ngữ nghĩa.

## 4. Component dùng chung

### 4.1. Collection toolbar

Một toolbar thống nhất gồm:

1. Textbox tìm kiếm.
2. Các bộ lọc theo màn hình.
3. Select sắp xếp.
4. Nút List/Card khi màn hình hỗ trợ cả hai.
5. Số lượng kết quả sau khi lọc.

Lựa chọn view được ghi nhớ trên thiết bị. Nếu chưa có lựa chọn:

- Trên 1024px: List.
- Từ 1024px trở xuống: Card.

### 4.2. Searchable member combobox

- Textbox cho phép tìm theo tên, mã hoặc số điện thoại.
- Tìm kiếm không phân biệt hoa thường và hỗ trợ chuỗi tiếng Việt không dấu.
- Hỗ trợ bàn phím, đóng khi click ra ngoài và có nút xóa lựa chọn.
- Giá trị submit là `memberId`; tên chỉ dùng hiển thị.
- Cho phép cấu hình lựa chọn rỗng như “Không gắn thành viên”.

### 4.3. Responsive collection

- Không nhân đôi form chỉnh sửa trong cả List và Card.
- Dùng một nguồn dữ liệu và một trạng thái filter/sort.
- Desktop ưu tiên bố cục dạng hàng/bảng.
- Mobile chuyển thành Card, các thao tác vẫn đầy đủ và không cần cuộn ngang.

## 5. Màn hình Thành viên

### Desktop

- Mặc định List; cho phép chuyển Card.
- Cột: Thành viên, điện thoại, trạng thái, tài khoản và công nợ.

### Mobile

- Mặc định Card.
- Card hiển thị tên, mã, điện thoại, trạng thái tài khoản và số dư/nợ.

### Tìm kiếm, filter và sort

- Tìm theo tên, mã hoặc số điện thoại.
- Lọc trạng thái hoạt động/đã nghỉ.
- Lọc có tài khoản/chưa có tài khoản.
- Lọc đang nợ/có số dư/đã cân bằng.
- Sắp xếp theo tên, mã hoặc công nợ.

## 6. Màn hình Khoản phải thu

### Hiển thị

- Desktop mặc định List.
- Mobile mặc định Card.
- Card hiển thị thành viên, loại thu, ngày, số lần, đơn giá, tổng tiền và thao tác sửa/xóa.

### Tìm kiếm, filter và sort

- Tìm theo thành viên hoặc ghi chú.
- Lọc loại khoản thu.
- Lọc nguồn phát sinh: tháng, trận, nhập tay hoặc điều chỉnh.
- Lọc khoảng ngày.
- Sắp xếp theo ngày, tên thành viên, tổng tiền hoặc số lần.

## 7. Màn hình Thu & chi

### Hiển thị

- Hỗ trợ List và Card.
- Desktop mặc định List; mobile mặc định Card.
- Card hiển thị nội dung, Thu/Chi, danh mục, ngày, thành viên, trận liên quan và số tiền.

### Tìm kiếm, filter và sort

- Tìm theo nội dung, thành viên hoặc danh mục.
- Lọc Thu/Chi.
- Lọc loại giao dịch và danh mục.
- Lọc thành viên và khoảng ngày.
- Sắp xếp theo ngày, số tiền hoặc thành viên.

### Form Thêm giao dịch

- Thay select thành viên bằng Searchable member combobox.
- Cho phép chọn “Không gắn thành viên”.
- Không thay đổi cấu trúc dữ liệu hoặc server action.

## 8. Màn hình Trận đấu

### Form Tạo/Sửa trận

- Có ô tìm thành viên theo tên.
- Lọc tất cả/đã chọn/chưa chọn.
- Sắp xếp tên tăng/giảm.
- Hiển thị số người đang được chọn.
- Filter chỉ ẩn hàng; checkbox và số lần khoản thu đã nhập phải được giữ nguyên.
- Nhập số lần khoản thu lớn hơn 0 tiếp tục tự đánh dấu người tham gia.

### Bước 1 — Đánh giá Seed

- Tìm thành viên theo tên.
- Lọc chưa có Seed, Tier 1–4 hoặc Thủ môn.
- Sắp xếp theo tên, Tier, số trận gần đây hoặc tỷ lệ thua.
- Filter không làm mất giá trị Seed đã nhập.
- Hiển thị số người đang thấy và tổng số người tham gia.

## 9. Màn hình Báo cáo

### 9.1. Báo cáo tháng

- Desktop mặc định bảng; mobile mặc định Card theo thành viên.
- Card chỉ hiển thị các loại khoản thu có phát sinh.
- Tìm theo tên hoặc mã thành viên.
- Lọc trạng thái hoạt động và có/không có phát sinh.
- Sắp xếp theo tên hoặc tổng phát sinh tháng.
- Tổng tháng và tổng theo loại luôn tính trên toàn bộ dữ liệu của tháng; toolbar hiển thị số thành viên đang xem.

### 9.2. Công nợ lũy kế

- Desktop List, mobile Card.
- Tìm theo tên hoặc mã.
- Lọc đang nợ, cân bằng hoặc đóng dư.
- Sắp xếp theo tên, phải đóng, đã nộp hoặc số dư.
- Card hiển thị đủ phải đóng, đã nộp và số dư.

## 10. Breakpoint và kiểm thử

- `> 1024px`: desktop, List mặc định.
- `<= 1024px`: mobile/tablet, Card mặc định và sidebar dạng drawer.
- Kiểm tra tối thiểu tại 375px, 768px, 1024px và 1440px.
- Không xuất hiện cuộn ngang toàn trang; bảng desktop chỉ cuộn trong vùng dữ liệu khi thật sự cần.
- Kiểm tra thao tác bàn phím, focus, click ra ngoài, trạng thái empty và quyền xem/quản lý.
- Chạy TypeScript, ESLint, team-balancer test và Next.js production build trước khi bàn giao.

## 11. Phạm vi kỹ thuật

- Không thay đổi schema PostgreSQL.
- Filter và sort chạy phía client vì quy mô dữ liệu club hiện tại nhỏ.
- Các server action và policy hiện tại tiếp tục là lớp kiểm tra quyền cuối cùng.
- Component dùng chung phải nhận dữ liệu đã được lọc theo quyền từ server; không gửi dữ liệu ngoài quyền xuống client.
