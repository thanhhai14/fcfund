# FCFUND

FCFUND là web app/PWA quản lý quỹ và hoạt động cho câu lạc bộ bóng đá, tập trung vào việc minh bạch thu chi, công nợ thành viên, quản lý trận đấu và hỗ trợ chia đội dựa trên dữ liệu cầu thủ.

Ứng dụng được xây dựng bằng **Next.js + TypeScript + PostgreSQL**, hỗ trợ cài đặt dưới dạng PWA và triển khai trên Vercel.

README này cũng đóng vai trò là tài liệu khởi động nhanh cho việc phát triển, kiểm thử và vận hành dự án.

---

## Tính năng chính

### Quản lý thành viên

- Quản lý danh sách thành viên câu lạc bộ.
- Tài khoản đăng nhập bằng số điện thoại.
- Theo dõi trạng thái hoạt động của thành viên.
- Hồ sơ cầu thủ.
- Chân thuận.
- Seed Tier.
- Khả năng bắt gôn.
- Lịch sử phong độ.

### Phân quyền

Hệ thống có ba vai trò chính:

- **Admin**
- **Thủ quỹ**
- **Thành viên**

Mỗi vai trò có policy mặc định và có thể ghi đè quyền cho từng tài khoản khi cần.

---

## Quản lý quỹ

Hệ thống hỗ trợ nhiều loại khoản thu.

### Thu định kỳ

Ví dụ:

- Quỹ tháng.

Khoản thu tháng có thể được tự động sinh vào đầu tháng.

### Thu theo sự kiện / trận đấu

Ví dụ:

- Quỹ lẻ.
- Mời nước.
- Các loại thu tùy chỉnh.

Đơn giá có thể:

- áp dụng chung;
- hoặc thiết lập riêng cho từng thành viên.

Hệ thống hỗ trợ:

- thanh toán một phần;
- đóng đủ;
- đóng dư;
- theo dõi công nợ;
- theo dõi số tiền thực thu.

---

## Quản lý chi

Hỗ trợ ghi nhận các khoản chi thực tế của câu lạc bộ.

Số dư quỹ được tính dựa trên dòng tiền thực tế:

```text
Số dư quỹ = Tổng tiền thực thu - Tổng tiền thực chi
```

Khoản thành viên phải đóng nhưng chưa thanh toán **không làm tăng số dư thực tế của quỹ**.

---

## Công nợ thành viên

Số dư của từng thành viên được tính theo:

```text
Số dư thành viên = Tổng tiền đã nộp - Tổng khoản phải đóng
```

Trong đó:

```text
Số dư < 0  → Thành viên còn nợ
Số dư = 0  → Đã cân bằng
Số dư > 0  → Thành viên đóng dư
```

---

## Quản lý trận đấu

FCFUND hỗ trợ:

- tạo trận đấu;
- quản lý danh sách người tham gia;
- bổ sung thành viên tham gia muộn;
- thay thế thành viên;
- lưu thông tin đội hình;
- theo dõi dữ liệu phục vụ chia đội;
- công khai đội hình thông qua public link.

---

## Chia đội

Hệ thống có bộ cân bằng đội riêng tại:

```text
src/lib/team-balancer.ts
```

Thuật toán có thể sử dụng:

- Seed Tier;
- vai trò cầu thủ;
- khả năng bắt gôn;
- phong độ;
- lịch sử thi đấu;
- số lượng đội;
- các quy tắc đội hình.

Hỗ trợ chia:

- 2 đội;
- 3 đội;
- 4 đội.

Một random key được sinh cho từng lần chia để có thể tái hiện lại chính xác cùng một kết quả khi cần.

---

## Báo cáo

Hệ thống hỗ trợ các báo cáo liên quan đến:

- công nợ;
- khoản phải thu;
- giao dịch thu/chi;
- số dư quỹ;
- số dư đầu kỳ;
- thành viên;
- hoạt động trận đấu.

Một số báo cáo có thể xuất thành hình ảnh để chia sẻ.

---

## Audit / Chatter

Các nghiệp vụ quan trọng có tracking log.

Hệ thống sử dụng cơ chế chatter để lưu lịch sử thay đổi và hỗ trợ kiểm tra lại thao tác trên dữ liệu.

Dữ liệu tài chính quan trọng ưu tiên cơ chế **soft delete** thay vì xóa vật lý ngay lập tức.

---

# Công nghệ

## Frontend / Backend

- Next.js App Router
- React
- TypeScript
- Font Awesome

## Database

- PostgreSQL
- Drizzle ORM
- Drizzle Kit

## Infrastructure

- Vercel
- Vercel Blob
- Vercel Cron

## PWA

- Web App Manifest
- Service Worker
- Responsive UI
- Có thể cài lên màn hình chính

---

# Cấu trúc project

```text
FCFund/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API routes
│   │   ├── login/            # Đăng nhập
│   │   ├── lineup/           # Đội hình
│   │   ├── public/           # Public pages
│   │   ├── offline/          # PWA offline page
│   │   └── (app)/            # Các màn hình ứng dụng chính
│   │
│   ├── components/           # React components
│   │
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   └── schema.ts         # Drizzle schema
│   │
│   └── lib/
│       ├── auth.ts
│       ├── permissions.ts
│       ├── team-balancer.ts
│       ├── team-roster-rules.ts
│       ├── match-form-stats.ts
│       ├── monthly-charges.ts
│       ├── opening-balance.ts
│       ├── balance-report.ts
│       └── ...
│
├── scripts/
│   ├── seed.ts
│   ├── test-team-balancer.ts
│   └── test-team-balancer-live.ts
│
├── drizzle/                  # Database migrations
├── documents/                # Tài liệu nghiệp vụ
├── public/                   # Static assets
├── drizzle.config.ts
├── next.config.ts
├── vercel.json
├── package.json
└── README.md
```

---

# Yêu cầu môi trường

Khuyến nghị:

```text
Node.js 20+
npm
PostgreSQL
```

Project hiện sử dụng Node.js/Next.js và npm làm package manager.

---

# Cài đặt

## 1. Clone repository

```bash
git clone <repository-url>
cd FCFund
```

## 2. Cài dependency

Đối với development:

```bash
npm install
```

Hoặc khi cần cài dependency chính xác theo lock file:

```bash
npm ci
```

---

# Cấu hình môi trường

Copy file mẫu:

```bash
cp .env.example .env.local
```

Các biến quan trọng gồm:

```env
DATABASE_URL=
AUTH_SECRET=
CRON_SECRET=
```

Nếu sử dụng upload logo hoặc ảnh QR:

```env
BLOB_READ_WRITE_TOKEN=
```

Thông tin tài khoản Admin khi seed:

```env
SEED_ADMIN_PHONE=
SEED_ADMIN_PASSWORD=
```

> Không commit `.env.local`, `.env.production.local` hoặc credential thật lên Git.

---

# Database

Schema chính:

```text
src/db/schema.ts
```

Database connection:

```text
src/db/index.ts
```

Migration:

```text
drizzle/
```

Seed:

```text
scripts/seed.ts
```

## Generate migration

```bash
npm run db:generate
```

## Apply migration

```bash
npm run db:migrate
```

## Push schema trực tiếp

```bash
npm run db:push
```

## Seed database

```bash
npm run db:seed
```

Seed ban đầu có thể tạo:

- Club mặc định.
- Role và policy.
- Quỹ tháng.
- Quỹ lẻ.
- Mời nước.
- Danh mục thu/chi.
- Tài khoản Admin.

---

# Chạy development

```bash
npm run dev
```

Mặc định truy cập:

```text
http://localhost:3000
```

---

# Build production

```bash
npm run build
```

Sau khi build:

```bash
npm run start
```

---

# Kiểm tra source

## ESLint

```bash
npm run lint
```

## TypeScript

```bash
npx tsc --noEmit
```

## Production build

```bash
npm run build
```

Một vòng kiểm tra trước khi deploy nên chạy:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

---

# Test chia đội

## Test logic

```bash
npm run test:teams
```

---

# Live test chia đội

Live test sử dụng dữ liệu thực trong PostgreSQL nhưng thiết lập transaction ở chế độ:

```text
READ ONLY
```

để tránh thay đổi dữ liệu.

Nạp biến môi trường:

```bash
set -a
source .env.production.local
set +a
```

Sau đó:

```bash
npm run test:teams:live
```

---

## Chế độ tự động

```bash
npm run test:teams:live -- --mode=auto
```

Hệ thống sử dụng dữ liệu thành viên đang hoạt động và tạo các trường hợp:

```text
10 người → 2 đội
15 người → 3 đội
19 người → 4 đội
```

---

## Test bằng trận có sẵn

Theo ngày:

```bash
npm run test:teams:live -- --mode=match --match=11/08/2026
```

Hoặc:

```bash
npm run test:teams:live -- --mode=match --match=2026-08-11
```

Theo UUID:

```bash
npm run test:teams:live -- --mode=match --match=<MATCH_UUID>
```

---

# Reproduce kết quả chia đội

Mỗi lần chia đội sinh một random key.

Để tái hiện chính xác kết quả:

```bash
npm run test:teams:live -- \
  --mode=match \
  --match=20/08/2026 \
  --random-key=<RANDOM_KEY>
```

---

# Chọn Club khi test

Nếu database có nhiều club:

```bash
TEST_CLUB_ID=<CLUB_UUID> \
npm run test:teams:live -- --mode=auto
```

---

# E2E

Có thể chạy E2E bằng Chrome đã cài trên máy.

Ví dụ:

```bash
E2E_BASE_URL=http://localhost:3000 \
npx tsx scripts/e2e.ts
```

> E2E có thể tạo dữ liệu kiểm thử trong database được cấu hình. Không chạy trực tiếp trên production database nếu chưa kiểm tra script và môi trường.

---

# Scripts

Các npm scripts chính:

```text
npm run dev
npm run build
npm run start
npm run lint

npm run test:teams
npm run test:teams:live

npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

---

# Triển khai Vercel

## 1. Tạo project

Import repository vào Vercel.

## 2. PostgreSQL

Kết nối PostgreSQL phù hợp với `DATABASE_URL`.

Có thể sử dụng Neon PostgreSQL.

## 3. Blob Storage

Tạo Vercel Blob Store nếu sử dụng chức năng upload logo hoặc QR.

## 4. Environment Variables

Khai báo các biến theo:

```text
.env.example
```

trong Vercel Project Settings.

## 5. Migration

Chạy migration trên database production:

```bash
npm run db:migrate
```

Seed nếu cần:

```bash
npm run db:seed
```

## 6. Deploy

Sau khi build thành công:

```text
Deploy → Vercel
```

---

# Cron

Cron được cấu hình tại:

```text
vercel.json
```

Endpoint cron sử dụng:

```text
CRON_SECRET
```

và xử lý ngày tháng theo múi giờ Việt Nam.

Cron được sử dụng cho các nghiệp vụ định kỳ như sinh khoản thu tháng.

---

# PWA

Ứng dụng hỗ trợ Progressive Web App.

Manifest:

```text
src/app/manifest.ts
```

Các capability gồm:

- cài lên Home Screen;
- chạy như ứng dụng độc lập;
- responsive cho mobile;
- offline fallback.

Trang offline:

```text
src/app/offline/
```

---

# Security

Một số nguyên tắc cần tuân thủ:

- Không commit `.env` hoặc credential thật.
- `AUTH_SECRET` phải đủ mạnh.
- `CRON_SECRET` không được public.
- Không expose `DATABASE_URL`.
- Production database phải có backup.
- Kiểm tra migration trước khi chạy production.
- Không sử dụng tài khoản seed mặc định lâu dài.
- Thay đổi password Admin ngay khi triển khai thật.

---

# Tài liệu nghiệp vụ

Các tài liệu thiết kế nằm trong:

```text
documents/
```

Bắt đầu tại:

```text
documents/README.md
```

Tài liệu bao gồm:

- phân tích nghiệp vụ quỹ;
- quy tắc thu/chi;
- mô hình dữ liệu;
- PostgreSQL schema;
- phân quyền;
- chatter;
- kiến trúc kỹ thuật;
- triển khai Vercel;
- chia đội và Seed Tier.

---

# Development workflow

Workflow khuyến nghị:

```text
git status
    ↓
sửa source
    ↓
npx tsc --noEmit
    ↓
npm run lint
    ↓
npm run build
    ↓
test nghiệp vụ
    ↓
git diff
    ↓
commit
```

Đối với thay đổi database:

```text
sửa schema.ts
    ↓
npm run db:generate
    ↓
kiểm tra migration
    ↓
npm run db:migrate
    ↓
test
```

---

# License

Project hiện là ứng dụng private.

Không phân phối source code hoặc dữ liệu production khi chưa được chủ sở hữu cho phép.
