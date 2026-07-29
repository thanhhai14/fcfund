# FCFUND

Web app/PWA quản lý tiền quỹ minh bạch cho một câu lạc bộ bóng đá.

## Chức năng

- Đăng nhập bằng số điện thoại
- Ba vai trò: Admin, Thủ quỹ và Thành viên
- Policy mặc định theo vai trò, có thể ghi đè từng tài khoản
- Thành viên và tài khoản đăng nhập
- Loại thu động: theo tháng hoặc theo số lần
- Đơn giá chung hoặc riêng cho từng thành viên
- Tự sinh khoản thu tháng vào ngày đầu tháng
- Khoản thu theo trận: Quỹ lẻ, Mời nước và loại tự tạo
- Thanh toán một phần và đóng dư
- Thu, chi và số dư tiền quỹ thực tế
- Trận đấu tối giản với danh sách người tham gia
- Báo cáo công nợ
- Chatter/tracking log và xóa mềm dữ liệu tài chính
- Logo, ảnh QR và thông tin chuyển khoản
- PWA responsive, có thể cài lên màn hình chính

## Công thức

```text
Số dư thành viên = Tổng tiền đã nộp - Tổng khoản phải đóng
Số dư quỹ club   = Tổng tiền thực thu - Tổng tiền thực chi
```

- Số dư thành viên âm: còn nợ.
- Số dư thành viên dương: đóng dư.
- Khoản phải đóng chưa được nộp không làm tăng số dư quỹ club.

## Công nghệ

- Next.js App Router + TypeScript
- PostgreSQL + Drizzle ORM
- Font Awesome
- Vercel Blob
- Vercel Cron
- PWA manifest + service worker

## Chạy local

### 1. Cài dependency

```bash
npm install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env.local
```

Các biến bắt buộc:

```text
DATABASE_URL
AUTH_SECRET
CRON_SECRET
```

`BLOB_READ_WRITE_TOKEN` cần khi tải logo hoặc QR.

### 3. Tạo CSDL

```bash
npm run db:migrate
npm run db:seed
```

Seed tạo:

- Club ban đầu
- Ba vai trò và policy
- Quỹ tháng: 200.000đ
- Quỹ lẻ: 50.000đ
- Mời nước: 36.000đ
- Danh mục thu/chi cơ bản
- Tài khoản Admin

Thông tin Admin lấy từ:

```text
SEED_ADMIN_PHONE
SEED_ADMIN_PASSWORD
```

### 4. Chạy ứng dụng

```bash
npm run dev
```

Truy cập <http://localhost:3000>.

## Database

Schema: [`src/db/schema.ts`](./src/db/schema.ts)  
Migration: [`drizzle/`](./drizzle/)  
Seed: [`scripts/seed.ts`](./scripts/seed.ts)

Các lệnh:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

## Kiểm tra

```bash
npx tsc --noEmit
npm run lint
npm run build
```

E2E dùng Chrome đã cài:

```bash
E2E_BASE_URL=http://localhost:3000 npx tsx scripts/e2e.ts
```

E2E tạo dữ liệu kiểm thử trong database được cấu hình.

## Triển khai Vercel

1. Tạo project Vercel từ repository.
2. Kết nối Neon PostgreSQL qua Vercel Marketplace.
3. Tạo Vercel Blob store.
4. Khai báo các biến trong `.env.example`.
5. Chạy migration và seed trên database production.
6. Deploy.

Cron đã được cấu hình trong [`vercel.json`](./vercel.json). Endpoint dùng `CRON_SECRET` và tự kiểm tra ngày theo múi giờ Việt Nam.

## Tài liệu nghiệp vụ

Xem [`documents/README.md`](./documents/README.md).
