# Kiến trúc kỹ thuật đề xuất

**Trạng thái:** Đã xác nhận Next.js, PWA, PostgreSQL và Vercel

## 1. Nền tảng

- Next.js với App Router.
- TypeScript.
- Responsive web app.
- PWA có thể cài lên màn hình chính.
- Giao diện và dữ liệu mặc định bằng tiếng Việt.

Không chốt số phiên bản trong tài liệu. Khi khởi tạo dự án sẽ dùng bản ổn định phù hợp tại thời điểm triển khai và khóa phiên bản trong lockfile.

## 2. PWA

Next.js App Router hỗ trợ khai báo Web App Manifest bằng `app/manifest.ts`.

PWA của FCFUND dự kiến có:

- tên ứng dụng và tên rút gọn;
- icon 192×192 và 512×512;
- chế độ hiển thị `standalone`;
- màu nền và màu chủ đề;
- service worker;
- màn hình thông báo mất kết nối;
- khả năng cài lên màn hình chính.

### Phạm vi offline

MVP ưu tiên:

- mở được giao diện khung khi mất mạng;
- cache tài nguyên tĩnh;
- hiển thị trạng thái offline rõ ràng.

Không cho phép ghi giao dịch tài chính offline trong MVP để tránh xung đột và ghi trùng. Các thao tác ghi yêu cầu kết nối mạng.

Tài liệu chính thức:

- <https://nextjs.org/docs/app/guides/progressive-web-apps>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest>

## 3. Font Awesome

Sử dụng gói React chính thức:

- `@fortawesome/react-fontawesome`;
- `@fortawesome/fontawesome-svg-core`;
- gói icon Free cần dùng.

Chỉ import danh sách icon được cho phép để:

- giảm kích thước bundle;
- bảo đảm icon lưu trong CSDL luôn tồn tại;
- tránh cho admin nhập tùy ý tên icon không hợp lệ.

CSDL chỉ lưu khóa icon, ví dụ `faCalendar`, `faGlassWater`, không lưu SVG.

Tài liệu chính thức:

- <https://docs.fontawesome.com/web/use-with/react/>
- <https://docs.fontawesome.com/web/use-with/react/use-with/>

## 4. Hệ quản trị CSDL

Sử dụng PostgreSQL vì dữ liệu có nhiều quan hệ và cần giao dịch nhất quán:

- thành viên;
- cấu hình khoản thu;
- khoản phải đóng;
- tiền đã nộp;
- trận;
- thu/chi;
- người dùng và quyền.

Triển khai Vercel sẽ kết nối PostgreSQL qua Vercel Marketplace. Neon là nhà cung cấp mặc định đề xuất; connection string được quản lý bằng biến môi trường.

Tài liệu:

- <https://vercel.com/docs/postgres>
- <https://vercel.com/docs/marketplace-storage>

## 5. Xác thực

- Đăng nhập bằng số điện thoại và mật khẩu.
- Số điện thoại là chuỗi, có unique index trên giá trị đã chuẩn hóa.
- Mật khẩu chỉ lưu dưới dạng hash mạnh, tuyệt đối không lưu dạng rõ.
- Mật khẩu mặc định được hash khi tạo tài khoản.
- Không bắt buộc đổi mật khẩu ở lần đăng nhập đầu theo yêu cầu nghiệp vụ.
- Admin có thể đặt lại mật khẩu về giá trị mặc định.
- Phiên đăng nhập dùng cookie `HttpOnly`, `Secure` trong production và `SameSite`.

## 6. Sinh khoản thu đầu tháng

Cần một tác vụ định kỳ chạy ngày đầu tháng:

1. Tìm các cấu hình khoản thu tháng đang có hiệu lực.
2. Lấy đơn giá riêng của thành viên nếu có, nếu không dùng giá mặc định hiện hành.
3. Tạo khoản phải đóng với bản chụp đơn giá.
4. Bỏ qua nếu khoản tương ứng đã tồn tại.

Tác vụ phải idempotent: chạy lại nhiều lần không được sinh trùng.

Trên Vercel:

- cấu hình Cron Job gọi một Route Handler;
- bảo vệ endpoint bằng `CRON_SECRET`;
- cron chạy mỗi ngày;
- handler tính ngày hiện tại theo `Asia/Ho_Chi_Minh`;
- chỉ sinh khoản định kỳ khi ngày địa phương là ngày `01`;
- unique constraint trong PostgreSQL ngăn chạy trùng.

Vercel Cron dùng UTC. Việc chạy hàng ngày rồi kiểm tra ngày địa phương giúp tránh sai kỳ do chênh lệch múi giờ.

Tài liệu:

- <https://vercel.com/docs/cron-jobs>
- <https://vercel.com/docs/cron-jobs/manage-cron-jobs>

## 7. Ranh giới server và client

### Server

- xác thực và phân quyền;
- truy vấn CSDL;
- tính số dư;
- tạo giao dịch;
- sinh khoản định kỳ;
- kiểm tra dữ liệu đầu vào.

### Client

- giao diện;
- validation hỗ trợ trải nghiệm;
- PWA/service worker;
- hiển thị dashboard và báo cáo.

Mọi quy tắc tài chính phải được kiểm tra lại ở server, không tin dữ liệu do frontend gửi lên.

## 8. Tệp tải lên

Ảnh QR và logo cần:

- giới hạn loại MIME;
- giới hạn kích thước;
- tên file ngẫu nhiên;
- không cho thực thi;
- lưu URL/khóa tệp trong CSDL.

Logo và ảnh QR được lưu trên Vercel Blob. CSDL chỉ lưu URL và metadata cần thiết.

Tài liệu:

- <https://vercel.com/docs/vercel-blob>

## 9. Bảo mật tối thiểu

- Kiểm tra quyền trên mọi thao tác server.
- Chống brute-force đăng nhập bằng rate limit.
- Không đưa dữ liệu công nợ vào cache công khai.
- Kiểm tra CSRF/nguồn request cho thao tác ghi.
- Security headers.
- Sao lưu CSDL.
- Nhật ký lỗi không chứa mật khẩu hoặc dữ liệu nhạy cảm.
