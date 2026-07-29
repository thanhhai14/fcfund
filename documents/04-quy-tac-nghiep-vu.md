# Quy tắc nghiệp vụ đã xác nhận

**Trạng thái:** Đã xác nhận qua mô tả của người dùng ngày 29/07/2026

## BR-01 — Danh mục loại thu động

Admin được tạo nhiều loại thu. Mỗi loại thu có tên, icon, kiểu tính và đơn giá có thể chỉnh trong Cài đặt.

Các loại hiện có:

- Quỹ tháng, mặc định 200K.
- Quỹ lẻ theo số trận tham gia.
- Mời nước, hiện tại 36K/lần.

## BR-02 — Gán khoản thu theo từng thành viên

- Mỗi thành viên được gán nhiều loại thu.
- Không gán theo nhóm.
- Admin tự cân đối việc người đóng Quỹ tháng có hay không phát sinh Quỹ lẻ.

## BR-03 — Khoản thu theo tháng

- Được tự động lặp lại theo tháng.
- Có thời gian áp dụng từ ngày đến ngày hoặc vĩnh viễn.
- Khi sang tháng mới, hệ thống tự tạo khoản phải đóng và làm giảm số dư thành viên.

## BR-04 — Khoản thu theo số lần

- Admin cập nhật số lần thủ công.
- Số tiền bằng số lần nhân đơn giá.
- Quỹ lẻ và Mời nước là các trường hợp của cơ chế này.

## BR-05 — Quản lý trận tối giản

- Lưu ngày diễn ra và người tham gia.
- Có thể ghi các khoản thu theo lần của từng người.
- Không phải mọi người tham gia đều đóng Quỹ lẻ.
- Không quản lý chia đội hoặc đội thua.

## BR-06 — Công nợ và thanh toán

- Hệ thống hỗ trợ thanh toán một phần.
- Hệ thống hỗ trợ đóng dư.
- Không phân bổ thanh toán cho từng khoản phải đóng.
- Admin nhập số tiền thành viên đã nộp và ghi chú.
- Số dư được tính từ tổng đã đóng và tổng phải đóng.

## BR-07 — Khoản chi

Admin nhập các khoản chi, bao gồm tiền sân và tiền nước của từng trận.

## BR-08 — Số dư quỹ club

```text
Số dư cuối kỳ = Số dư đầu kỳ + Tiền thực thu - Tiền thực chi
```

## BR-09 — Minh bạch và tài khoản

- Mỗi thành viên có tài khoản đăng nhập.
- Thành viên được xem thu chi công khai.
- Thành viên được xem công nợ của mình.
- Phạm vi xem được cấu hình.

## BR-10 — Chuyển khoản

Giai đoạn đầu chỉ quản lý hình ảnh QR chuyển khoản. QR động theo số nợ nằm ngoài phạm vi hiện tại.

## BR-11 — Thông tin nhận diện

- `FCFUND` là tên ứng dụng.
- Tên đội bóng là dữ liệu cấu hình riêng.

## BR-12 — Không khóa kỳ

Không cần quy trình mở kỳ, chốt kỳ hoặc khóa sổ tháng.

## BR-13 — Quy ước số dư thành viên

```text
Số dư thành viên = Tổng tiền đã nộp - Tổng khoản phải đóng
```

- Số dư âm: còn nợ.
- Số dư bằng 0: đã đóng đủ.
- Số dư dương: đóng dư.

## BR-14 — Lưu giao dịch thay vì ghi đè số dư

Khi thành viên nộp tiền, admin tạo một giao dịch gồm số tiền, ngày và ghi chú. Hệ thống tự tính số dư; không nhập đè số dư thành viên.

## BR-15 — Thời điểm sinh khoản tháng

- Khoản thu định kỳ được sinh vào ngày đầu mỗi tháng.
- Mỗi cấu hình có khoảng hiệu lực từ ngày bắt đầu đến ngày kết thúc hoặc vĩnh viễn.
- Khi gán giữa tháng, admin chọn áp dụng ngay tháng hiện tại hoặc bắt đầu từ tháng sau.

## BR-16 — Bảo toàn đơn giá lịch sử

Mỗi khoản phải đóng lưu lại đơn giá tại thời điểm phát sinh. Thay đổi giá trong Cài đặt không làm thay đổi khoản cũ.

## BR-17 — Đơn giá riêng theo thành viên

Admin được ghi đè đơn giá mặc định khi gán loại thu cho một thành viên.

## BR-18 — Ngừng khoản thu định kỳ

Khi thành viên tạm nghỉ hoặc rời đội, admin điều chỉnh ngày kết thúc hiệu lực. Từ tháng tiếp theo hệ thống không tạo khoản thu đó.

## BR-19 — Cách nhập khoản thu trong trận

Trong một trận, admin chọn người tham gia và có thể gán cho từng người:

- không có khoản thu;
- Quỹ lẻ;
- Mời nước;
- hoặc đồng thời nhiều khoản thu.

## BR-20 — Thu khác

Hệ thống hỗ trợ khoản thu thực tế không gắn thành viên, ví dụ tài trợ, hoàn tiền sân hoặc bán áo.

## BR-21 — Quyền xem

Hệ thống có cấu hình các quyền:

- xem giao dịch thu;
- xem giao dịch chi;
- xem số dư quỹ club;
- xem công nợ thành viên khác;
- xem tên người nộp/người thực hiện giao dịch.

## BR-22 — Đăng nhập

- Thành viên đăng nhập bằng số điện thoại.
- Số điện thoại được lưu dưới dạng chuỗi để bảo toàn số `0` đầu.
- Giao diện chỉ chấp nhận ký tự số.
- Mật khẩu mặc định: `Trailang123`.

## BR-23 — Thông tin chuyển khoản

Cài đặt chuyển khoản gồm:

- ảnh QR;
- tên ngân hàng;
- số tài khoản;
- tên chủ tài khoản.

## BR-24 — Icon

Icon của loại thu được chọn từ thư viện Font Awesome.

## BR-25 — Nền tảng ứng dụng

Ứng dụng được xây bằng Next.js và hỗ trợ PWA.

## BR-26 — Quản lý tài khoản

- Tài khoản do admin tạo.
- Không có chức năng thành viên tự đăng ký.
- Thành viên không bắt buộc đổi mật khẩu mặc định trong lần đăng nhập đầu.
- Khi quên mật khẩu, admin đặt lại mật khẩu.

## BR-27 — Một đội bóng

Một bản cài đặt FCFUND quản lý một đội bóng, gồm tên và logo cấu hình.

## BR-28 — Vai trò

Hệ thống có ba vai trò:

- Admin.
- Thủ quỹ.
- Thành viên.

## BR-29 — Policy

- Quyền mặc định được cấu hình theo vai trò.
- Có thể ghi đè quyền theo từng tài khoản.
- Quyền hiệu lực của một tài khoản ưu tiên giá trị ghi đè, nếu không có thì dùng policy của vai trò.

## BR-30 — Chatter và tracking

- Admin được sửa/xóa giao dịch.
- Mọi thao tác tạo, sửa, xóa dữ liệu tài chính phải được ghi lịch sử.
- Chatter hiển thị người thao tác, thời gian và nội dung thay đổi.
- Dữ liệu tài chính sử dụng xóa mềm để không làm mất lịch sử.
