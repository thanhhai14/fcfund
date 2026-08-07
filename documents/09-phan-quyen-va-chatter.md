# Phân quyền, policy và chatter

## 1. Nguyên tắc

Quyền hiệu lực:

```text
Policy ghi đè của tài khoản
→ nếu không có, dùng policy mặc định của vai trò
→ nếu vẫn không có, từ chối
```

Admin không được tự vô hiệu hóa các quyền tối thiểu cần để quản trị hệ thống.

## 2. Vai trò Admin

Mặc định:

- toàn quyền thành viên và tài khoản;
- quản lý loại thu, khoản thu và giao dịch;
- quản lý trận;
- quản lý seed theo trận, chia đội và phiên bản đội hình;
- quản lý cài đặt, logo và QR;
- xem chatter/audit;
- cấu hình policy;
- đặt lại mật khẩu;
- khôi phục dữ liệu xóa mềm.

## 3. Vai trò Thủ quỹ

Mặc định:

- xem dashboard tài chính;
- quản lý khoản phải đóng;
- ghi nhận tiền thành viên nộp;
- quản lý thu khác và khoản chi;
- quản lý trận và người tham gia;
- xem seed theo trận; quản lý seed/chia đội khi được policy cấp;
- xem chatter tài chính;
- xem danh sách và số dư thành viên.

Không mặc định:

- quản lý tài khoản đăng nhập;
- cấu hình policy;
- đổi thông tin hệ thống;
- đặt lại mật khẩu;

Admin có thể cấp thêm bằng policy ghi đè.

## 4. Vai trò Thành viên

Mặc định:

- xem dashboard thành viên;
- xem khoản phải đóng của mình;
- xem lịch sử nộp tiền của mình;
- xem số dư của mình;
- xem QR và thông tin chuyển khoản;
- xem dữ liệu công khai được policy cho phép;
- xem seed của người tham gia theo trận và đội hình đã xác nhận;
- đổi mật khẩu.

Không được tạo, sửa hoặc xóa dữ liệu tài chính.

## 5. Policy xem dữ liệu

Các quyền tách riêng:

- xem giao dịch thu;
- xem giao dịch chi;
- xem số dư quỹ club;
- xem tên người nộp tiền;
- xem số dư thành viên khác;
- xem chi tiết khoản phải đóng của người khác;
- xem chatter;
- xem báo cáo phong độ suy luận từ khoản phạt thua.

Policy server phải lọc dữ liệu trước khi trả về. Không chỉ ẩn cột bằng frontend.

User không liên kết Member vẫn sử dụng đầy đủ các quyền quản trị/toàn đội được policy cấp. Các quyền mang nghĩa "của mình" như xem khoản phải thu, tiền nộp hoặc công nợ cá nhân chỉ có hiệu lực khi `users.member_id` tồn tại. Nếu thiếu liên kết, server phải trả về rỗng hoặc điều hướng khỏi màn hình cá nhân; tuyệt đối không được bỏ điều kiện lọc và chuyển thành xem toàn đội.

Role và liên kết Member độc lập:

- User role Thủ quỹ có thể có hoặc không có hồ sơ thành viên;
- User role Thành viên nhưng chưa liên kết không có dữ liệu tài chính cá nhân;
- khóa User không làm Member ngừng hoạt động;
- Member ngừng hoạt động không tự động khóa User.

## 6. Chatter

Các màn hình có chatter:

- thành viên;
- khoản phải đóng;
- giao dịch thu/chi;
- trận;
- seed người tham gia trận và phiên bản đội hình;
- loại thu;
- cài đặt club;
- tài khoản.

Chatter hiển thị theo thời gian:

```text
29/07/2026 10:15 — Nguyễn A tạo khoản thu 272.000đ
29/07/2026 10:20 — Nguyễn A đổi số tiền 272.000đ → 236.000đ
29/07/2026 10:21 — Nguyễn A: "Điều chỉnh do nhập dư một lần mời nước"
```

## 7. Dữ liệu tracking

Với CREATE/UPDATE/DELETE/RESTORE:

- actor;
- thời gian;
- loại và ID bản ghi;
- dữ liệu trước thay đổi;
- dữ liệu sau thay đổi;
- ghi chú nếu có.

Password hash, token, cookie và bí mật không được ghi vào chatter.

## 8. Xóa mềm

Khi admin xóa:

- đặt `deleted_at`, `deleted_by`;
- loại bản ghi khỏi công thức số dư hiện tại;
- ghi action DELETE;
- không xóa activity log;
- admin có thể RESTORE và hệ thống tính lại số dư.

## 9. Bảo vệ audit

- Activity log chỉ được thêm, không được sửa/xóa từ giao diện.
- Mọi thay đổi dữ liệu tài chính và activity log nằm trong cùng CSDL transaction.
- API phải kiểm tra policy ở server.
