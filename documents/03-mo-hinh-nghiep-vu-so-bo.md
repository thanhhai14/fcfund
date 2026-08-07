# Mô hình nghiệp vụ sơ bộ

**Trạng thái:** Đã hiệu chỉnh sau vòng xác nhận thứ hai  
**Mục tiêu:** Làm rõ cách tính trước khi thiết kế bảng CSDL vật lý

## 1. Khái niệm trung tâm: sổ số dư thành viên

Mỗi thành viên có một sổ giao dịch gồm hai hướng:

```text
Khoản phải đóng  → làm giảm số dư thành viên
Tiền đã nộp      → làm tăng số dư thành viên
```

Công thức đề xuất:

```text
Số dư thành viên
= Tổng giao dịch nộp tiền
- Tổng các khoản phải đóng
+/- Các giao dịch điều chỉnh
```

Quy ước hiển thị:

- Số dư nhỏ hơn 0: thành viên đang nợ.
- Số dư bằng 0: đã thanh toán đủ.
- Số dư lớn hơn 0: thành viên đóng dư.

Hệ thống không cần biết một khoản thanh toán cụ thể dùng để trả loại quỹ hay tháng nào. Vì vậy không có nghiệp vụ phân bổ thanh toán vào từng khoản nợ.

## 2. Tách danh mục loại thu và khoản thu được gán

### 2.1. Loại thu

Là cấu hình dùng lại trong toàn hệ thống:

```text
Quỹ tháng
├── kiểu: định kỳ theo tháng
├── đơn giá: 200K
└── icon: lịch/quỹ

Mời nước
├── kiểu: theo số lần
├── đơn giá: 36K
└── icon: nước/phạt
```

Admin có thể tạo thêm loại thu và chọn icon nhận diện.

### 2.2. Khoản thu được gán cho thành viên

Một thành viên được gán nhiều loại thu. Mỗi lần gán có:

- thành viên;
- loại thu;
- ngày bắt đầu;
- ngày kết thúc hoặc vĩnh viễn;
- trạng thái đang áp dụng/ngừng áp dụng.

Không có nghiệp vụ nhóm thành viên. Admin quản lý trực tiếp trên từng người.

## 3. Hai cơ chế sinh khoản phải đóng

### 3.1. Theo tháng

Hệ thống tự động lặp lại và tạo khoản phải đóng cho thành viên trong thời gian cấu hình có hiệu lực.

Ví dụ:

```text
Thanh Hải — Quỹ tháng — tháng 7 — 1 × 200K
```

### 3.2. Theo số lần phát sinh

Admin cập nhật số lần thủ công. Số tiền được tính:

```text
Số lượng × đơn giá của loại thu
```

Áp dụng cho:

- số trận phải đóng Quỹ lẻ;
- số lần Mời nước;
- loại thu theo lần được tạo thêm sau này.

## 4. Quản lý trận và chia đội

Trận chỉ cần:

- ngày diễn ra;
- danh sách người tham gia;
- các khoản thu lẻ phát sinh cho từng người;
- các phiên bản đội hình được tạo từ người tham gia.

Không quản lý trực tiếp:

- tỷ số;
- diễn biến trận;
- đội thắng/đội thua được nhập tay.

Hệ thống có chia từ 2 đội trở lên theo seed Tier 1–4/Thủ môn và phong độ gần đây. Trận thắng/thua được suy luận từ loại khoản thu đánh dấu là phạt thua; chi tiết và giới hạn dữ liệu nằm tại tài liệu 11.

Không phải ai tham gia cũng phải đóng Quỹ lẻ. Admin tự chọn khoản thu áp dụng cho từng người.

Khoản thu định kỳ của thành viên có thể sửa thời hạn, đơn giá riêng hoặc tạm dừng. Việc thay đổi chỉ áp dụng cho phát sinh tương lai và không sửa các khoản đã tạo. Ví dụ thành viên chuyển từ Quỹ tháng sang đóng từng trận trong tháng 9 thì kết thúc assignment Quỹ tháng vào 31/08; khi quay lại có thể tạo assignment mới từ 01/10.

Các khoản chi như tiền sân và tiền nước có thể được gắn với trận. Các khoản chi chung không bắt buộc có trận.

## 5. Thanh toán

Khi thành viên đóng tiền, admin ghi nhận:

- thành viên;
- số tiền;
- ngày nộp;
- ghi chú;
- phương thức nếu cần.

Thanh toán một phần và đóng dư đều được hỗ trợ tự nhiên bởi công thức số dư. Không cần chọn đang trả khoản Quỹ tháng, Quỹ lẻ hay nợ của tháng nào.

## 6. Số dư quỹ club

Số dư của club khác hoàn toàn số dư của thành viên.

```text
Số dư quỹ cuối kỳ
= Số dư quỹ đầu kỳ
+ Tổng tiền thực thu
- Tổng tiền thực chi
```

Khoản phải đóng nhưng thành viên chưa nộp chỉ ảnh hưởng số dư thành viên, không làm tăng tiền quỹ club.

## 7. Công khai tài chính

Thành viên có tài khoản đăng nhập để:

- xem thu chi của club;
- xem công nợ/số dư của chính mình;
- xem ảnh QR chuyển khoản.

Phạm vi dữ liệu công khai được điều khiển bằng cấu hình quyền xem.

## 8. Cấu hình club

`FCFUND` là tên sản phẩm, không phải tên đội bóng.

Cài đặt cần có tối thiểu:

- tên đội bóng;
- danh mục loại thu;
- đơn giá từng loại thu;
- icon từng loại thu;
- ảnh QR chuyển khoản;
- cấu hình quyền xem.

## 9. Điểm không còn nằm trong phạm vi

- Phân bổ một khoản thanh toán vào từng khoản nợ.
- Khóa sổ tháng.
- Quản lý hai đội trong một trận.
- Tự xác định đội thua.
- Tạo QR động trong giai đoạn đầu.
- Nhóm thành viên để gán khoản thu.
