# Cài đặt nhận tiền qua Gmail ACB

## 1. Chuẩn bị ứng dụng

- Deploy source có tích hợp ACB và áp dụng migration `0023_unusual_edwin_jarvis` theo quy trình migration hiện tại. Không chạy migration từ Apps Script.
- Không cần Google Pub/Sub, dịch vụ nhận email riêng hoặc Vercel Cron cho luồng này.
- Admin mở **Cài đặt → Tích hợp email ACB**. Nhập Gmail nhận email, người gửi `mailalert@acb.com.vn`, Subject `ACB-Dich vu bao so du tu dong`, và chuỗi tài khoản đúng như email ACB hiển thị.
- Chọn **Mô phỏng**, chọn tạo API key, bấm Lưu. Sao chép key ngay từ kết quả; trang không hiển thị lại key đầy đủ. Mất key thì tạo lại và cập nhật Script Properties.
- Khi cấu hình đang tắt, API trả 403 và không xử lý email.

## 2. Google Apps Script

1. Dùng đúng Gmail nhận email ACB truy cập <https://script.google.com> và tạo project riêng.
2. Sao chép nội dung [script](../scripts/acb-gmail-apps-script.gs) vào `Code.gs`.
3. Trong **Services → +**, thêm **Gmail API** (advanced service). Nếu dùng Google Cloud project riêng thì bật Gmail API trong Cloud Console tương ứng.
4. Trong **Project Settings → Script Properties**, khai báo:

| Property | Giá trị |
|---|---|
| `FCFUND_ENDPOINT` | `https://<ten-mien-app>/api/integrations/acb-email` |
| `FCFUND_API_KEY` | Key Admin vừa tạo |
| `FCFUND_MAILBOX` | Địa chỉ Gmail đúng với cấu hình Admin |
| `ACB_SENDER` | `mailalert@acb.com.vn` |
| `ACB_SUBJECT` | `ACB-Dich vu bao so du tu dong` |

5. Chạy `syncAcbEmails`, cấp quyền đọc Gmail và gửi HTTP. Script không yêu cầu mật khẩu ngân hàng, không thay đổi trạng thái đã đọc của thư.
6. Kiểm tra kết quả tại lịch sử xử lý trong Cài đặt FCFund.
7. Chạy `installAcbTrigger` một lần để tạo lịch mỗi 5 phút. Hàm xóa trigger trùng của chính chức năng này, không đụng trigger khác.
8. Theo dõi **Executions** để phát hiện lỗi kết nối/cấp quyền; key và nội dung email không được ghi log.

## 3. Kiểm thử rồi bật thật

- Mô phỏng đọc email ACB trong 30 ngày gần nhất; chỉ hiển thị kết quả nhận diện, không tạo tiền nộp.
- Cần có email chứa nội dung mới `FCF <mã thanh toán> <tên>`. QR mới tự dùng mã thanh toán của thành viên. Nội dung cũ hoặc lương không tự ghi nhận.
- Email phải đạt kiểm tra DKIM và DMARC domain ACB từ header Gmail. Nếu thực tế ACB dùng domain ký khác, giữ mô phỏng và kiểm tra header gốc trước khi điều chỉnh quy tắc; không bỏ kiểm tra để bật thật.
- Khi các kết quả phù hợp, đổi sang **Tự động ghi nhận**. Server lưu mốc bắt đầu tại lần đầu bật LIVE. Chỉ email mới nhận từ mốc này trở đi được ghi tiền; email mô phỏng cũ không được chuyển thành tiền nộp.
- Kiểm thử một lần chuyển khoản mới, xác nhận số tiền và tên thành viên, cột Nguồn `API tự động · ACB`, số dư và Hộp thư.
- Script thử lại sau lỗi 429/5xx vào lượt kế tiếp, không đánh dấu hoàn tất trước khi nhận HTTP 200. ID email đã ghi nhận/hủy vẫn được server giữ để chống tạo lại.
- Email khác ID nhưng có dấu hiệu trùng hoặc đã có tiền nhập tay cùng ngày/số tiền/thành viên sẽ hiện `Cần đối chiếu`. Đối chiếu và nhập tay nếu thực tế đó là giao dịch khác; không tự chuyển trạng thái thành tiền nộp.

## 4. Sửa, hủy và khắc phục

- **Thu & chi → giao dịch → •••**: sửa số tiền/ngày/ghi chú; giao dịch ACB cho phép chọn lại thành viên đúng CLB. Dữ liệu email gốc vẫn giữ.
- Hủy giao dịch API cần nhập lý do. Hệ thống xóa mềm tiền nộp, lưu chatter và chuyển email sang `Đã hủy`; không tự ghi nhận lại khi script gửi lại.
- Thu hồi key sẽ tắt tích hợp. Thay key thì phải cập nhật Script Properties.
- Tạm dừng bằng chế độ Tắt. Bật lại giữ mốc đầu tiên; các email chưa xử lý trong cửa sổ tìm kiếm sẽ được đối chiếu, vì vậy kiểm tra log khi bật lại sau thời gian dài.
- Nếu dừng hơn 30 ngày, script không tự quét email cũ hơn cửa sổ. Đối chiếu thủ công để tránh bỏ sót; giai đoạn đầu không hỗ trợ nhập lịch sử tự động.
