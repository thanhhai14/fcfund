# Mô hình dữ liệu khái niệm

**Trạng thái:** Đã chốt ở mức khái niệm; schema vật lý nằm tại tài liệu 08  
**Lưu ý:** Đây chưa phải schema SQL

## 1. ClubSetting

Thông tin chung của bản cài đặt:

- tên đội bóng;
- ảnh/logo nếu có;
- ảnh QR chuyển khoản;
- tên ngân hàng;
- số tài khoản;
- tên chủ tài khoản;
- cấu hình quyền xem;
- số dư quỹ ban đầu.

## 2. UserAccount

Tài khoản đăng nhập:

- thông tin đăng nhập;
- mật khẩu đã mã hóa;
- vai trò;
- trạng thái;
- cờ yêu cầu đổi mật khẩu ở lần đăng nhập đầu;
- liên kết hồ sơ thành viên nếu có.

Số điện thoại đăng nhập:

- lưu bằng `varchar`, không dùng kiểu số;
- chuẩn hóa trước khi kiểm tra trùng;
- có ràng buộc duy nhất;
- frontend chỉ nhận ký tự `0–9`.

## 3. Member

Hồ sơ thành viên:

- mã thành viên;
- tên;
- thông tin liên hệ;
- trạng thái hoạt động;
- tài khoản đăng nhập liên kết.

Số dư không nên lưu như một giá trị nhập tay. Nó được tính từ sổ giao dịch thành viên.

## 4. ChargeType

Danh mục loại thu:

- tên;
- tên icon Font Awesome;
- họ/style của icon nếu cần;
- kiểu tính: theo tháng hoặc theo số lần;
- đơn giá hiện hành;
- trạng thái.

## 5. MemberChargeAssignment

Cấu hình loại thu cho một thành viên:

- thành viên;
- loại thu;
- ngày bắt đầu;
- ngày kết thúc hoặc vĩnh viễn;
- đơn giá riêng nếu có;
- trạng thái.

Lựa chọn “tính từ tháng hiện tại hay tháng sau” được quy đổi thành ngày bắt đầu hiệu lực phù hợp, không nhất thiết lưu thêm một trạng thái lâu dài.

## 6. MemberCharge

Khoản phải đóng đã phát sinh:

- thành viên;
- loại thu;
- ngày/kỳ phát sinh;
- số lượng;
- đơn giá tại thời điểm phát sinh;
- tổng tiền;
- trận liên quan nếu có;
- ghi chú;
- nguồn tạo: tự động hoặc admin.

Ràng buộc chống sinh trùng cần bảo đảm cùng một cấu hình định kỳ không tạo hai khoản cho cùng thành viên và cùng tháng.

Khoản này tạo một biến động âm trong sổ số dư thành viên.

## 7. MemberPayment

Tiền thực tế thành viên đã nộp:

- thành viên;
- ngày nộp;
- số tiền;
- ghi chú;
- người nhập;
- phương thức thanh toán nếu cần.

Khoản này tạo một biến động dương trong sổ số dư thành viên và đồng thời là tiền thực thu của quỹ club.

Không có bảng phân bổ thanh toán vào từng `MemberCharge`.

## 8. Match

Thông tin trận tối giản:

- ngày diễn ra;
- ghi chú;
- danh sách người tham gia.

## 9. MatchParticipant

Liên kết người tham gia trận:

- trận;
- thành viên hoặc khách;
- ghi chú.

Các `MemberCharge` theo lần có thể liên kết người tham gia này.

## 10. ExpenseType

Danh mục loại chi, ví dụ:

- tiền sân;
- tiền nước;
- dụng cụ;
- chi khác.

## 11. Expense

Khoản thực chi:

- ngày;
- loại chi;
- số tiền;
- nội dung;
- trận liên quan nếu có;
- người nhập;
- ghi chú/chứng từ nếu cần.

## 12. OtherIncome

Khoản thu thực tế không phải tiền thành viên nộp, nếu nghiệp vụ xác nhận có nhu cầu:

- ngày;
- loại/nội dung;
- số tiền;
- người nhập;
- ghi chú.

Khoản này làm tăng quỹ club nhưng không làm thay đổi số dư của bất kỳ thành viên nào.

## 13. MemberBalance

Không nhất thiết là một bảng riêng. Có thể là giá trị tổng hợp:

```text
SUM(MemberPayment.amount)
- SUM(MemberCharge.total_amount)
+ SUM(Adjustment.amount)
```

## 14. ClubFundBalance

Không nhất thiết là một bảng riêng. Có thể là giá trị tổng hợp:

```text
Số dư ban đầu
+ SUM(MemberPayment.amount)
+ SUM(OtherIncome.amount)
- SUM(Expense.amount)
+/- SUM(FundAdjustment.amount)
```

## 15. Quan hệ chính

```text
Member
├── UserAccount
├── MemberChargeAssignment ── ChargeType
├── MemberCharge ──────────── ChargeType
├── MemberPayment
└── MatchParticipant ──────── Match

Match
├── MatchParticipant
├── MemberCharge
└── Expense
```

## 16. Trường kiểm toán dùng chung

Các bảng nghiệp vụ nên có:

- mã định danh;
- thời điểm tạo;
- người tạo;
- thời điểm cập nhật;
- người cập nhật;
- trạng thái xóa mềm nếu quyết định sử dụng.

Giao dịch tài chính được sửa/xóa mềm; mọi thay đổi được ghi vào activity log/chatter.
