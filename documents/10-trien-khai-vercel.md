# Triển khai trên Vercel

**Trạng thái:** Phương án triển khai mục tiêu

## 1. Thành phần

```text
Vercel
├── Next.js App Router
├── Route Handlers / Server Actions
├── Cron Job
└── Vercel Blob

PostgreSQL
└── Neon qua Vercel Marketplace
```

Vercel không còn cung cấp sản phẩm Vercel Postgres riêng cho dự án mới. PostgreSQL được kết nối qua Marketplace.

## 2. CSDL

Mặc định:

- Neon PostgreSQL;
- region gần Vercel Functions;
- kết nối SSL;
- connection pooling/serverless driver;
- credentials tự động đưa vào biến môi trường;
- migration chạy riêng trong CI/deploy, không chạy tùy tiện trong request.

## 3. Logo và QR

Lưu trên Vercel Blob:

- chỉ admin được tải lên;
- PNG/JPEG/WebP;
- giới hạn kích thước;
- tên file ngẫu nhiên;
- CSDL lưu URL;
- khi thay ảnh, xóa blob cũ sau khi giao dịch CSDL thành công.

Source hiện tại lưu logo và QR bằng **private Vercel Blob**. Ứng dụng đọc chúng qua Route Handler có kiểm tra session/club; không phát URL Blob private trực tiếp cho client. Trang công khai có route logo riêng và chỉ trả dữ liệu trong phạm vi được phép. Chứng từ tài chính sau này cũng phải dùng private storage.

## 4. Cron đầu tháng

Vercel Cron luôn chạy theo UTC. Cấu hình đề xuất gọi endpoint một lần mỗi ngày.

Luồng endpoint:

1. Kiểm tra `Authorization` với `CRON_SECRET`.
2. Xác định ngày theo `Asia/Ho_Chi_Minh`.
3. Nếu không phải ngày 01 thì kết thúc.
4. Tạo một `monthly_job_runs` cho kỳ.
5. Tìm assignment `MONTHLY` có hiệu lực.
6. Tạo khoản tháng chưa tồn tại.
7. Ghi kết quả job.

Unique constraint bảo vệ việc Vercel gọi lặp hoặc admin chạy lại thủ công.

## 5. Biến môi trường

Tối thiểu:

```text
DATABASE_URL
AUTH_SECRET
CRON_SECRET
BLOB_READ_WRITE_TOKEN
APP_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Không commit giá trị thật vào Git.

## 6. Môi trường

### Local

- PostgreSQL local hoặc database development riêng.
- `.env.local`.
- Blob có thể dùng store development hoặc mock adapter.

### Preview

- database branch/schema riêng nếu nhà cung cấp hỗ trợ;
- không dùng chung production data;
- URL preview tự động.

### Production

- database production;
- Blob production;
- Cron chỉ chạy trên production;
- cookie Secure;
- backup và theo dõi lỗi.

## 7. PWA

Yêu cầu production:

- HTTPS do Vercel cung cấp;
- `app/manifest.ts` với `id: /`, `scope: /`, `start_url: /dashboard`, `display: standalone`;
- icon 192×192 và 512×512;
- service worker;
- service worker không cache response chứa dữ liệu tài chính riêng tư;
- logout xóa cache dữ liệu người dùng nếu có.

## 7.1. Web Push trong tương lai

Thiết kế Web Push nằm tại tài liệu 12. Khi triển khai production sẽ cần thêm VAPID keys, bảng Push Subscription và xử lý `push`/`notificationclick` trong Service Worker. Push failure không được làm rollback transaction nghiệp vụ.

## 7.2. Migration production

Migration schema phải được chạy như một bước riêng có kiểm soát. Với migration chỉ thêm bảng/cột tương thích ngược, ưu tiên migrate production DB **trước** khi deploy code mới dùng schema đó để tránh code mới query vào bảng chưa tồn tại. Không gắn `db:migrate` tùy tiện vào mọi Preview build của Vercel.

## 8. Seed lần đầu

Lệnh seed tạo:

- một club;
- các permission;
- policy mặc định cho bốn vai trò;
- loại thu mẫu: Quỹ tháng, Quỹ lẻ, Mời nước;
- loại chi mẫu: Tiền sân, Tiền nước;
- tài khoản Admin đầu tiên.

Mật khẩu admin ban đầu phải lấy từ biến môi trường hoặc bước thiết lập, không hard-code trong repository.

## 9. Tài liệu tham chiếu

- <https://vercel.com/docs/postgres>
- <https://vercel.com/docs/marketplace-storage>
- <https://vercel.com/docs/vercel-blob>
- <https://vercel.com/docs/cron-jobs>
- <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
