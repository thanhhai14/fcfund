# Compact Chat 01 — FCFUND / Zalo Login

**Ngày:** 2026-09-22  
**Project:** FCFund  
**Path:** `/home/thanhhai14/Data/Code/FCFund`

## 1. Bối cảnh project

Stack chính:
- Next.js 16.3.5 App Router + TypeScript
- PostgreSQL + Drizzle ORM
- PWA + Web Push
- Vercel Blob / Cron
- Role: `ADMIN / TREASURER / ORGANIZER / MEMBER`
- Session FCFUND: JWT cookie HttpOnly, Secure production, SameSite=Lax, 14 ngày
- Login cũ: `phoneNormalized + passwordHash`

Quy ước:
- Sơ đồ luôn dùng Mermaid.
- Không tự đoán schema field; đọc source trước khi sửa.
- Git write không dùng tool; khi cần commit thì chỉ đưa lệnh.
- Build có warning npm:
  `Unknown builtin config "globalignorefile"`.

## 2. Zalo OAuth đã triển khai trước đó

Env:
```env
ZALO_APP_ID=...
ZALO_APP_SECRET=...
ZALO_REDIRECT_URI=https://www.trailang.io.vn/api/auth/zalo/callback
ZALO_LOGIN_ENABLED=true
ZALO_CLUB_ID=
```

`ZALO_APP_SECRET` chỉ server-side, không dùng `NEXT_PUBLIC_`.

Routes:
- `/api/auth/zalo/start`
- `/api/auth/zalo/callback`

OAuth:
- state
- PKCE
- authorization code exchange
- lấy profile qua `https://graph.zalo.me/v2.0/me`
- không lưu access/refresh token lâu dài

File chính:
- `src/lib/zalo-auth.ts`
- `src/app/api/auth/zalo/start/route.ts`
- `src/app/api/auth/zalo/callback/route.ts`

## 3. Account linking — nghiệp vụ đã chốt

Nguyên tắc:
1. Zalo ID đã link → resolve `users.id` → login.
2. Zalo ID chưa link → fuzzy-match **chỉ với user/member chưa có Zalo identity**.
3. Nếu match được candidate đủ rõ → hỏi “Có phải bạn là thành viên A?”.
4. Nếu đúng → chỉ nhập mật khẩu FCFUND của candidate.
5. Nếu user bấm “Không phải tôi” → tạo request `PENDING`.
6. Nếu không match tên → tạo request `PENDING` ngay.
7. Tất cả active `role = ADMIN` (“Chủ Tịch Fifa”) được thông báo.
8. Request PENDING không tự hết hạn.
9. OAuth lại cùng Zalo ID khi đang PENDING → dùng request cũ, không tạo mới.
10. Admin có thể:
   - link request vào user hiện có chưa link Zalo;
   - tạo mới **member + user** rồi link Zalo ID;
   - reject.
11. Khi Admin approve, user đang ở trang chờ tự login và redirect Dashboard.
12. Không overwrite user đã link Zalo hoặc Zalo ID đã thuộc user khác.

Flow:

```mermaid
flowchart TD
    A[Zalo OAuth thành công] --> B{Zalo ID đã link?}
    B -->|Có| C[Resolve users.id]
    C --> D[createSession]
    D --> DASH[Dashboard]

    B -->|Chưa| E{Đã có request PENDING?}
    E -->|Có| PENDING[/zalo/pending]

    E -->|Chưa| F[Candidate pool = user/member chưa link Zalo]
    F --> G[Fuzzy match tên]
    G --> H{Có candidate đủ rõ?}

    H -->|Có| I[Hỏi Có phải bạn là A?]
    I -->|Đúng| J[Nhập mật khẩu]
    J --> K{Đúng password?}
    K -->|Có| L[Link identity]
    L --> D
    K -->|Không| J

    I -->|Không phải| M[Tạo PENDING]
    H -->|Không match| M

    M --> N[Push tất cả ADMIN]
    N --> O[/settings/zalo-requests]
    M --> PENDING
```

## 4. Data model đã thêm

Trong `src/db/schema.ts` có:

### `auth_identities`
- id
- user_id
- provider
- provider_user_id
- display_name
- avatar_url
- linked_at
- last_login_at
- created_at / updated_at

Constraints:
- unique `(provider, provider_user_id)`
- unique `(user_id, provider)`

### `zalo_link_requests`
- id
- club_id
- provider_user_id
- display_name
- avatar_url
- status = `PENDING / APPROVED / REJECTED`
- approved_user_id
- resolved_by
- resolved_at
- rejection_reason
- created_at / updated_at

Migration:
- `drizzle/0016_panoramic_vanisher.sql`
- `drizzle/meta/0016_snapshot.json`
- `drizzle/meta/_journal.json` đã cập nhật

## 5. Candidate matching đã triển khai

File:
- `src/lib/zalo-linking.ts`

Candidate phải:
- cùng club
- `users.isActive = true`
- có member
- `members.status = ACTIVE`
- chưa có `auth_identities.provider = ZALO`

Tên được normalize:
- Đ/đ → D/d
- bỏ dấu
- lowercase
- bỏ ký tự đặc biệt
- collapse whitespace
- Levenshtein + token-sorted

Ngưỡng:
```text
bestScore >= 0.90
AND
bestScore - secondScore >= 0.08
```

## 6. Pending/Admin flow đã triển khai

Routes/pages:
- `/zalo/link`
- `/zalo/pending`
- `/api/auth/zalo/pending/status`
- `/settings/zalo-requests`

Files:
- `src/app/zalo/link/page.tsx`
- `src/app/zalo/link/actions.ts`
- `src/app/zalo/pending/page.tsx`
- `src/components/zalo-pending-status.tsx`
- `src/app/api/auth/zalo/pending/status/route.ts`
- `src/app/(app)/settings/zalo-requests/page.tsx`
- `src/app/(app)/settings/zalo-requests/actions.ts`

Pending cookie:
- signed JWT
- HttpOnly
- Secure production
- SameSite=Lax
- path `/`
- tối đa 30 ngày

Candidate link context:
- signed HttpOnly JWT cookie
- khoảng 10 phút

Polling:
- trang `/zalo/pending` poll mỗi 5 giây
- khi `APPROVED` → API tạo FCFUND session → redirect `/dashboard`
- khi `REJECTED` → hiện lý do

Admin deep link:
```text
/settings/zalo-requests
```

Admin có 3 lựa chọn:
1. Link vào user hiện có chưa link Zalo.
2. Tạo member + user mới rồi link.
3. Reject.

Tạo member + user mới hiện dùng password fallback mặc định:
```text
Trailang123
```
Đây là policy cũ hiện có; về sau nên cân nhắc random/force-change.

## 7. Push notification

File:
- `src/lib/push-notifications.ts`

Event:
```text
ZALO_LINK_REQUEST
```

Recipients:
- same club
- active
- role ADMIN

Deep link:
```text
/settings/zalo-requests
```

Push failure không được làm fail request/link flow.

## 8. Settings

`src/app/(app)/settings/page.tsx`:
- Admin thấy card “Liên kết Zalo”
- có badge số request PENDING
- link tới `/settings/zalo-requests`

## 9. Tài liệu đã cập nhật

- `documents/08-schema-postgresql.md`
- `documents/10-trien-khai-vercel.md`
- `documents/13-dang-nhap-zalo-cho-pwa.md`
- `documents/README.md`

Tài liệu 13 là nguồn thiết kế chính cho Zalo Login.

## 10. Release checks đã chạy

Đã pass:
```text
git diff --check ✅
npm run lint ✅
npm run build ✅
npm run test:teams ✅
```

Build routes có:
- `/api/auth/zalo/callback`
- `/api/auth/zalo/pending/status`
- `/api/auth/zalo/start`
- `/settings/zalo-requests`
- `/zalo/link`
- `/zalo/pending`

## 11. Deploy flow đã thống nhất

Thứ tự:
1. Backup production DB.
2. Kiểm tra env Vercel.
3. Chạy migration production:
   ```bash
   set -a
   source .env.production.local
   set +a

   npm run db:migrate
   ```
4. Kiểm tra:
   ```sql
   SELECT to_regclass('public.auth_identities');
   SELECT to_regclass('public.zalo_link_requests');
   ```
5. Commit/push source.
6. Vercel deploy.
7. Smoke test Zalo match / pending / approve / create new / reject.

Không dùng `db:push` cho production.

## 12. Git status trước thời điểm compact

Có thay đổi chưa commit gồm:
- `.env.example`
- docs 08/10/13/README
- migration 0016 + meta
- settings page
- Zalo callback
- globals CSS
- login page
- schema
- push notifications
- thư mục/page/action mới cho Zalo linking/pending/admin
- `src/lib/zalo-linking.ts`

Commit message đã gợi ý:
```bash
git commit -m "feat: add Zalo account linking and admin approval"
```

## 13. Lỗi production hiện tại cần debug tiếp

Sau khi quét QR Zalo:
- OAuth nhận diện được profile/tên ở màn hình Zalo.
- Callback FCFUND fail với HTTP 502.
- Nội dung:
  ```text
  Không hoàn tất được Zalo OAuth

  Không lấy được Zalo profile (code: -501).
  ```

Điều này cho thấy:
- authorization flow đã chạy;
- authorization code exchange có vẻ thành công;
- fail xảy ra ở bước:
  ```text
  GET https://graph.zalo.me/v2.0/me
  ```

Current implementation trong `src/lib/zalo-auth.ts`:

```ts
export async function fetchZaloProfile(accessToken: string): Promise<ZaloProfile> {
  const response = await fetch("https://graph.zalo.me/v2.0/me", {
    headers: {
      access_token: accessToken,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => null);

  const id = data?.id?.trim();
  const name = data?.name?.trim();
  if (!response.ok || !id || !name) {
    const errorCode = data?.error ?? response.status;
    throw new Error(`Không lấy được Zalo profile (code: ${errorCode}).`);
  }
}
```

## 14. Debug direction hiện tại

Đang nghi ngờ vấn đề có thể liên quan request profile từ Vercel/IP/geo hoặc cách gọi profile API.

User muốn lấy **access token** mới để test bằng `curl` từ máy/VPS Việt Nam.

Test mong muốn:

```bash
curl -i \
  -H "access_token: YOUR_ACCESS_TOKEN" \
  "https://graph.zalo.me/v2.0/me"
```

Cần so sánh:
- request từ máy/VPS Việt Nam
- request từ production/Vercel

Cách đọc:
- VN thành công, Vercel -501 → nghi mạnh IP/geo/egress.
- Cả hai -501 → xem lại token/app permission/profile API.
- Cả hai thành công → xem lại request thực tế trong FCFUND.

## 15. Việc đang chuẩn bị làm ngay trước khi compact

User yêu cầu:
> “ok hãy cho lấy access token để test đi”

Hướng dự kiến:
- thêm **debug mode tạm thời**;
- sau khi `exchangeZaloCode()` thành công, callback hiển thị access token thay vì gọi profile;
- debug mode chỉ bật khi env riêng bật;
- không log/persist token lâu dài;
- sau khi test xong phải tắt/xóa debug mode.

Chưa triển khai phần debug access token tại thời điểm compact này.

## 16. File quan trọng để tiếp tục ngay

Đọc trước:
- `src/lib/zalo-auth.ts`
- `src/app/api/auth/zalo/callback/route.ts`

Mục tiêu tiếp theo:
1. thêm flag debug access token an toàn;
2. deploy tạm;
3. OAuth lấy token;
4. test `curl` từ máy/VPS VN;
5. xác định nguyên nhân mã Zalo `-501`;
6. xóa/tắt debug mode sau khi xong.
