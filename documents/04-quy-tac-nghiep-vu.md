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
- Không quản lý hai đội cố định, tỷ số hoặc diễn biến trận.
- Có quản lý chia đội theo từng trận và suy luận phong độ từ khoản phạt thua theo BR-31 đến BR-40.

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

## BR-31 — Seed thành viên

- Seed được đánh giá lại riêng cho từng người tham gia ở mỗi trận, gồm Tier 1, Tier 2, Tier 3, Tier 4 hoặc Thủ môn.
- Thủ môn là tier riêng, không phải một vị trí bổ sung cho Tier 1–4.
- Seed không phải thuộc tính cố định của hồ sơ thành viên và không được tự động kế thừa sang trận mới.
- Seed trận gần nhất chỉ được hiển thị để tham khảo khi đánh giá lại.
- Người tham gia chưa có seed trong trận hiện tại không được đưa vào kết quả chia đội.
- Thành viên được xem seed của nhau theo trận; quyền sửa seed được kiểm soát bằng policy.

## BR-32 — Điều kiện số đội

- Admin nhập tay số đội và số đội luôn lớn hơn hoặc bằng 2.
- Phải có ít nhất 10 người tham gia mới được tạo hoặc xác nhận đội hình.
- Số đội không được vượt quá số người tham gia và không được có đội rỗng.
- Đội dưới 5 người chỉ hiển thị cảnh báo, không chặn thao tác.
- Quân số giữa các đội chênh nhau không quá 1.

## BR-33 — Cân bằng thủ môn

- Thủ môn được chia đều giữa các đội.
- Số thủ môn giữa hai đội bất kỳ chênh nhau không quá 1.
- Nếu số thủ môn ít hơn số đội, hệ thống cảnh báo có đội không có thủ môn nhưng chưa chặn chia đội.

## BR-34 — Workflow tạo đội

- Admin tạo trận và chọn người tham gia trước.
- Thao tác `Tạo đội` nằm cùng nhóm với Xem, Sửa và Xóa trận.
- Trong giao diện tạo đội, Admin nhập seed còn thiếu, lưu và khóa tier, chọn số đội rồi sinh đội hình.
- Thiếu seed hoặc không đủ tối thiểu 5 người/đội thì hệ thống chặn và báo rõ nguyên nhân.

## BR-35 — Chia đội cân bằng

- Hệ thống cân bằng quân số, thủ môn, tổng điểm Tier 1–4, phân bổ từng tier và phong độ gần đây.
- Random chỉ quyết định giữa các phương án có mức cân bằng tương đương.
- Admin được chỉnh thủ công trước khi xác nhận nhưng không được xác nhận đội hình vi phạm ràng buộc cứng.

## BR-36 — Khóa tier và snapshot

- Seed phải được lưu và khóa trước khi sinh đội.
- Khi mở khóa tier, đội hình nháp hiện tại mất hiệu lực.
- Phiên bản đội hình lưu snapshot seed và phong độ để đánh giá ở trận khác hoặc thay đổi sau này không làm đổi lịch sử.

## BR-37 — Phiên bản đội hình

- Các lần chia lại trước khi xác nhận chỉ ghi đè bản nháp hiện tại.
- Chỉ đội hình đã xác nhận được hiển thị mặc định cho thành viên.
- Sau khi xác nhận không sửa trực tiếp; thay đổi phải tạo phiên bản mới.
- Phiên bản xác nhận cũ được giữ ở trạng thái superseded để audit.

## BR-38 — Loại thu phạt thua

- Loại thu có checkbox `Tính là phạt thua khi chia đội`.
- Tên kỹ thuật đề xuất: `is_loss_penalty`.
- Khoản phạt khác không phản ánh thua trận không được bật cờ này.
- Khoản phải thu lưu snapshot cờ để việc sửa loại thu không làm đổi thống kê lịch sử.

## BR-39 — Phong độ suy luận

- Một người được tính một trận thua khi có ít nhất một khoản phải thu phạt thua gắn với trận đó.
- Nhiều lần phạt trong cùng trận vẫn chỉ tính một trận thua.
- Trận chưa ghi nhận kết quả và chưa có bất kỳ khoản phạt thua nào không được tính là trận thắng.
- Không dùng tiền đã nộp để xác định thắng/thua vì thanh toán không phân bổ vào từng khoản phải thu.
- Chỉ số cân bằng mặc định dùng 10 trận tham gia gần nhất, không dùng tổng tiền hoặc tổng thua trọn đời.
- Báo cáo phải ghi rõ đây là phong độ suy luận từ khoản phạt thua.

## BR-40 — Độc lập với tài chính

- Chia lại, kéo/thả hoặc đổi phiên bản đội hình không tự động thay đổi khoản thu.
- Xóa mềm trận làm ẩn đội hình nhưng vẫn bảo toàn phiên bản và activity log.
- Chi tiết thuật toán, schema và tiêu chí nghiệm thu nằm tại tài liệu 11.

## BR-41 — Nhập kết quả trận

- Chỉ nhập kết quả trên phiên bản đội hình đã xác nhận.
- Mỗi đội phải nhận một thứ hạng từ 1 đến số đội; nhiều đội được phép đồng hạng khi trận kết thúc mà không tranh hạng.
- Kết quả phải có ít nhất một đội hạng 1. Nhiều đội có thể đồng hạng 1 và đều không phát sinh khoản phạt kết quả.
- Đội hạng `N > 1` được ghi nhận thua; mỗi thành viên có tài khoản thành viên phát sinh `N - 1` lần của loại thu phạt được chọn.
- Các đội đồng hạng nhận cùng số lần phạt. Ví dụ hai đội cùng hạng 3 thì thành viên của cả hai đội đều nhận 2 lần phạt.
- Ghi lại kết quả thay thế các khoản phạt do kết quả trước sinh ra, nhưng không thay đổi loại khoản thu khác của trận.
- Kết quả, loại thu phạt, thời điểm và người thao tác được lưu cùng phiên bản đội hình; thao tác phải có activity log.
