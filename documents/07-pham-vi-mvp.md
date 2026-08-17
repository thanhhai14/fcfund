# Phạm vi MVP

**Trạng thái:** Bản đề xuất  
**Mục tiêu:** Phiên bản đầu đủ dùng cho vận hành quỹ club

## 1. Đăng nhập

- Đăng nhập bằng số điện thoại và mật khẩu.
- Đăng xuất.
- Đổi mật khẩu.
- Admin tạo/đặt lại tài khoản thành viên.
- Không có tự đăng ký hoặc OTP.

## 2. Dashboard

### Admin

- Số dư quỹ hiện tại.
- Tổng thực thu và thực chi theo thời gian.
- Tổng công nợ thành viên.
- Danh sách người còn nợ/đóng dư.
- Giao dịch gần đây.

### Thành viên

- Số dư cá nhân.
- Tổng phải đóng.
- Tổng đã nộp.
- Lịch sử khoản thu và nộp tiền.
- Thu chi công khai theo quyền.
- Thông tin chuyển khoản và QR.

## 3. Thành viên

- Danh sách, tìm kiếm và lọc.
- Thêm/sửa/ngừng hoạt động.
- Số điện thoại và tài khoản đăng nhập.
- Gán nhiều loại thu.
- Đơn giá riêng.
- Khoảng hiệu lực.
- Chọn bắt đầu từ tháng hiện tại hoặc tháng sau.

## 4. Loại thu

- Thêm/sửa/ngừng dùng.
- Tên và icon Font Awesome.
- Kiểu theo tháng hoặc theo số lần.
- Đơn giá mặc định.
- Đánh dấu loại thu là phạt thua dùng cho báo cáo phong độ và chia đội.

## 5. Khoản phải đóng

- Tự sinh khoản tháng vào ngày đầu tháng.
- Admin tạo khoản theo số lần.
- Cho phép số lượng lớn hơn một.
- Gắn trận nếu có.
- Ghi chú và điều chỉnh khi được phép.

## 6. Nộp tiền

- Admin ghi nhận số tiền thành viên nộp.
- Ngày và ghi chú.
- Thanh toán một phần.
- Đóng dư.
- Không phân bổ vào khoản nợ cụ thể.

## 7. Trận

- Tạo trận theo ngày.
- Chọn người tham gia.
- Gán không, một hoặc nhiều khoản thu cho từng người.
- Xem tổng khoản thu phát sinh từ trận.
- Đánh giá lại Seed Tier 1–7 và khả năng bắt gôn cho người tham gia ở từng trận; không tự kế thừa xác nhận sang trận mới.
- Chia từ 2 đội trở lên, mỗi đội tối thiểu 5 người.
- Cân bằng quân số, thủ môn, tier và phong độ suy luận gần đây.
- Chỉnh thủ công, khóa người, chia lại và xác nhận đội hình.
- Sau xác nhận, thay đổi qua phiên bản mới.

## 8. Thu và chi

- Thu thành viên.
- Thu khác không gắn thành viên.
- Khoản chi và loại chi.
- Khoản chi có thể gắn trận.
- Lọc theo ngày, loại và người.

## 9. Báo cáo

- Báo cáo quỹ: số dư đầu, thu, chi và số dư cuối.
- Báo cáo công nợ theo thành viên.
- Chi tiết sổ số dư thành viên.
- Báo cáo khoản thu theo loại.
- Báo cáo phong độ suy luận từ khoản phạt thua theo trận.
- Xuất CSV/Excel được xem là tính năng nên có sau luồng lõi.

## 10. Cài đặt

- Tên đội bóng.
- Logo nếu cần.
- Ảnh QR.
- Logo đội bóng.
- Ngân hàng, số tài khoản, chủ tài khoản.
- Quyền xem của thành viên.
- Số dư quỹ ban đầu.

## 11. PWA

- Cài lên màn hình chính.
- Responsive cho điện thoại.
- Cache giao diện/tài nguyên tĩnh.
- Cảnh báo offline.
- Không ghi giao dịch khi offline trong MVP.

## Ngoài phạm vi MVP

- QR động theo số nợ.
- Đối soát giao dịch ngân hàng tự động.
- OTP SMS.
- Push notification nhắc nợ.
- Quản lý tỷ số và diễn biến trận đấu. MVP đã hỗ trợ nhập thứ hạng đội và tự sinh khoản phạt kết quả, nhưng không lưu tỷ số.
- Phân bổ thanh toán vào từng khoản phải đóng.
- Khóa sổ kỳ kế toán.
- Cấu hình nhóm thành viên.
- Thành viên tự đăng ký.
- Bắt buộc đổi mật khẩu trong lần đăng nhập đầu.
