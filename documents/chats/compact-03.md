# Compact 03 — Zalo Login Android/PWA hoàn thiện

Ngày lưu: 2026-09-23

## Phạm vi
Tiếp nối `documents/chats/compact-02.md`. Phần này ghi lại quá trình hoàn thiện đăng nhập Zalo cho FCFund, tập trung vào Android PWA, Chrome, Zalo App, lỗi `-14019`, và logic chờ duyệt.

## Trạng thái cuối cùng
User xác nhận: **coi như đã hoàn thiện phần đăng nhập Zalo**.

Kiến trúc cuối:
- Browser thường: standard Zalo OAuth bằng cookie state + PKCE.
- Android standalone PWA: **không dùng handoff**.
- iOS standalone PWA: **vẫn dùng server-side handoff** + Safari.
- Android có popup hướng dẫn trước khi mở Zalo OAuth.
- Android có recovery riêng khi token exchange trả lỗi `-14019`.
- Khi đã có yêu cầu Zalo đang `PENDING`, user không được khởi động OAuth mới ngoài ý muốn.

---

# 1. Vấn đề Android ban đầu

Test thực tế trước khi sửa:
- Mở FCFund bằng Chrome Android.
- Zalo OAuth trong full Chrome có nút **“Đăng nhập bằng ứng dụng”**.
- Nếu cài PWA trước rồi login:
  - OAuth mở trong PWA/WebAPK.
  - Zalo không hiện nút **“Đăng nhập bằng ứng dụng”**.
  - User có thể dùng menu `⋮` → **Mở bằng Chrome**.
  - Trong full Chrome, nút đăng nhập bằng Zalo App xuất hiện.
  - Sau khi xác thực bằng Zalo App, Android có thể tự route callback về FCFund PWA.

Quan sát quan trọng:
- Android PWA và Chrome phối hợp đủ tốt để standard OAuth cookie flow hoạt động.
- Nút đăng nhập bằng Zalo App phụ thuộc việc user đang ở full Chrome, không phải PWA/Custom Tab.

---

# 2. Các phương án đã thử để ép mở Chrome

## 2.1 `intent://...package=com.android.chrome`
Đã thử từ Android PWA:
- Có lúc navigation vẫn bị giữ trong WebAPK/PWA.
- Không đảm bảo bật full Chrome.

Kết luận: bỏ.

## 2.2 `googlechrome://navigate?url=...`
Đã thử:
- Trên máy test bấm vào không mở gì.
- UI chỉ còn báo “Đang chờ hoàn tất xác thực Zalo trong Chrome”.

Kết luận: bỏ.

## 2.3 `target="_blank"`
Đã thử:
- Mở được **Chrome Custom Tab**.
- Nhưng Custom Tab không phải full Chrome.
- Zalo vẫn không hiện nút **“Đăng nhập bằng ứng dụng”**.

Kết luận:
- Không thể dùng web/PWA thuần để ép một cách đáng tin cậy mở full Chrome app.
- Thay vì hack thêm, chuyển sang UX hướng dẫn người dùng.

---

# 3. UX Android cuối cùng: popup hướng dẫn

Khi Android PWA user bấm **Đăng nhập bằng Zalo**:
1. Không mở OAuth ngay.
2. Hiện modal hướng dẫn.
3. User bấm **“Đã hiểu – Mở Zalo”**.
4. App đi tới standard route:
   `/api/auth/zalo/start`
5. Zalo OAuth mở.
6. User dùng menu:
   `⋮` → **Mở bằng Chrome**
7. Trong Chrome chọn:
   **Đăng nhập bằng ứng dụng Zalo**
8. Zalo App xác thực.
9. Callback về FCFund/PWA.

Popup được thiết kế trực quan với 3 bước:
- Bước 1: minh họa thanh browser, highlight dấu `⋮`.
- Bước 2: minh họa menu và dòng **Mở bằng Chrome**.
- Bước 3: minh họa nút xanh **Đăng nhập bằng ứng dụng Zalo**.

Modal hỗ trợ:
- nút chính **Đã hiểu – Mở Zalo**
- nút **Hủy**
- nút `×`
- click backdrop để đóng
- khóa scroll khi modal đang mở
- responsive kiểu bottom sheet trên mobile.

Các file đã dùng cho UI này:
- `src/app/login/zalo-login-link.tsx`
- `src/app/globals.css`

---

# 4. Quyết định kiến trúc Android: bỏ handoff

Ban đầu Android cũng được thử với server-side handoff giống iOS:
- PWA lưu handoff vào localStorage.
- OAuth dùng authorization URL có state/PKCE server-side.
- Callback cập nhật handoff.
- PWA poll `/api/auth/zalo/handoff/status`.

Sau nhiều test, user nhận ra Android không cần cơ chế này vì:
- Chrome/PWA chia sẻ đủ context cho standard OAuth.
- Lần test đầu đã chứng minh callback có thể tự quay về PWA.
- Vấn đề thực sự chỉ là cần mở full Chrome để Zalo hiện nút login bằng app.

Kiến trúc cuối:

### Android standalone PWA
Không dùng:
- `zalo_auth_handoffs`
- localStorage handoff
- handoff polling

Dùng:
- `/api/auth/zalo/start`
- standard OAuth cookies:
  - `zalo_oauth_state`
  - `zalo_pkce_verifier`
- PKCE verifier do server tạo.

### iOS standalone PWA
Vẫn dùng:
- server-side handoff
- `x-safari-https`
- localStorage handoff
- polling handoff status

### Browser thường
Dùng standard OAuth:
- `/api/auth/zalo/start`

File chính đã sửa:
- `src/app/login/zalo-login-link.tsx`

Commit message đã dùng/gợi ý:
`fix: use standard Zalo OAuth flow on Android PWA`

---

# 5. Bug: user đã PENDING nhưng lại chạy OAuth lần 2

Observed flow:
1. Zalo OAuth thành công.
2. FCFund tạo/reuse link request.
3. UI PWA hiển thị **Đang chờ duyệt**.
4. User bấm quay lại trang login.
5. Login page vẫn hiện nút Zalo.
6. User login Zalo lần nữa.
7. Có thể gặp `-14019`.

Phân tích:
- Khi đã có `zalo_pending` hợp lệ và request còn `PENDING`, OAuth đã hoàn tất.
- Không cần chạy Zalo OAuth thêm lần nữa.

Fix:
Trong `src/app/login/page.tsx`:
- đọc `readZaloPendingSession()`
- query đúng `zalo_link_requests`
- nếu status:
  - `PENDING`
  - hoặc `APPROVED`
  thì redirect:
  `/zalo/pending`

Trong `src/app/zalo/pending/page.tsx`:
- khi PENDING không còn nút quay lại login.
- chỉ khi `REJECTED` mới hiện:
  **Thử đăng nhập lại**

Flow mới:
```text
OAuth thành công
→ /zalo/pending
→ user cố về /login
→ tự redirect lại /zalo/pending
→ không tạo OAuth mới
```

Commit message đã dùng/gợi ý:
`fix: prevent duplicate Zalo OAuth while approval is pending`

---

# 6. Lỗi Zalo token exchange `-14019`

Behavior thực tế sau khi Android chuyển về standard OAuth:
- OAuth/Zalo App xác thực thành công.
- Callback quay về FCFund.
- Lần đầu đôi khi token exchange trả:
  `-14019`
- Nếu user thử OAuth lại ngay, lần sau thường thành công và vào màn hình chờ duyệt.

Không có tài liệu Zalo công khai đáng tin cậy được xác nhận để định nghĩa chính xác `-14019`.
Không nên hard-code ý nghĩa kiểu “code reused” hoặc “PKCE mismatch” như một fact.

Quyết định:
- Nhận diện `-14019` có cấu trúc.
- Xử lý như transient Android OAuth failure.
- Recovery đúng 1 lần.
- Không retry lại cùng authorization code.
- Phải bắt đầu **OAuth transaction mới hoàn toàn**.

---

# 7. Typed error cho Zalo token exchange

Trong:
`src/lib/zalo-auth.ts`

Đã thêm:
```ts
export class ZaloTokenExchangeError extends Error {
  code: number | string;
  errorName: string | null;
  httpStatus: number;
}
```

`exchangeZaloCode()` khi thất bại không còn throw generic Error mà throw:
`ZaloTokenExchangeError`

Response type Zalo đã có:
```ts
error?: number | string;
error_name?: string;
```

Giờ callback có thể phân biệt:
- code
- error_name
- HTTP status

Server log thêm:
```text
Zalo token exchange failed
code
errorName
httpStatus
android
```

---

# 8. Recovery riêng cho `-14019`

Trong:
`src/app/api/auth/zalo/callback/route.ts`

Constants:
```ts
const ZALO_14019_RETRY_COOKIE = "zalo_14019_retry";
const ZALO_14019_RETRY_MAX_AGE = 2 * 60;
```

Điều kiện recovery:
- lỗi là `ZaloTokenExchangeError`
- Android user-agent
- không phải handoff
- code chính xác `-14019`
- chưa từng retry trong cửa sổ 2 phút

Khi match:
- không hiển thị trang lỗi 502
- redirect:
  `/login?zaloRetry=14019`
- set HttpOnly cookie:
  `zalo_14019_retry=1`
- cookie:
  - Secure production
  - SameSite=Lax
  - Path=/
  - Max-Age=120

Nếu lần retry thứ hai vẫn `-14019`:
- không recovery tiếp
- để generic error flow hiển thị lỗi
- tránh infinite loop.

Khi login thành công hoặc đi vào pending/link:
- xóa retry cookie.

---

# 9. UI recovery `-14019`

`src/app/login/page.tsx` đọc:
```text
?zaloRetry=14019
```

Truyền prop:
`androidRetry14019`
vào:
`ZaloLoginLink`

Android client khi có flag này:
- tự mở modal hướng dẫn.
- title đổi thành:
  **Xác thực lại Zalo một lần**
- mô tả:
  Zalo chưa hoàn tất bước cấp access token ở lần vừa rồi; cần mở lại bằng Chrome và xác thực thêm một lần.

User vẫn bấm:
**Đã hiểu – Mở Zalo**

Sau đó:
- `/api/auth/zalo/start`
- state mới
- PKCE verifier mới
- authorization code mới
- OAuth transaction mới hoàn toàn.

Điều này tránh reuse code/verifier cũ.

Các file của fix `-14019`:
- `src/lib/zalo-auth.ts`
- `src/app/api/auth/zalo/callback/route.ts`
- `src/app/login/page.tsx`
- `src/app/login/zalo-login-link.tsx`

Checks:
- `npm run lint` ✅
- `npm run build` ✅
- `git diff --check` ✅

Commit message đã dùng/gợi ý:
`fix: recover Android Zalo OAuth error 14019`

---

# 10. Flow cuối cùng theo platform

## Android standalone PWA
```text
/login
→ Đăng nhập bằng Zalo
→ popup hướng dẫn
→ Đã hiểu – Mở Zalo
→ /api/auth/zalo/start
→ server set state + PKCE cookie
→ Zalo OAuth
→ ⋮ → Mở bằng Chrome
→ Đăng nhập bằng ứng dụng Zalo
→ Zalo App
→ callback
→ thành công:
   linked → dashboard
   candidate → /zalo/link
   no match/pending → /zalo/pending
→ nếu -14019 lần đầu:
   /login?zaloRetry=14019
   → popup “Xác thực lại Zalo một lần”
   → OAuth mới
```

## iOS standalone PWA
```text
/login
→ precreated handoff
→ x-safari-https
→ Safari/Zalo OAuth
→ callback update handoff
→ PWA polling
→ consume result
→ dashboard/link/pending
```

## Browser thường
```text
/login
→ /api/auth/zalo/start
→ standard cookie OAuth
→ callback
→ dashboard/link/pending
```

---

# 11. Chờ duyệt

Nếu Zalo profile chưa map được vào user:
- tạo/reuse `zalo_link_requests`
- status `PENDING`
- Admin nhận notification.
- User vào `/zalo/pending`
- client poll mỗi 5 giây.

Khi Admin approve:
`/api/auth/zalo/pending/status`
- tìm user active
- update `lastLoginAt`
- `createSession()`
- xóa `zalo_pending`
- trả:
  `APPROVED + /dashboard`

Khi REJECTED:
- UI hiển thị lý do.
- user mới được **Thử đăng nhập lại**.

---

# 12. Source quan trọng

OAuth:
- `src/lib/zalo-auth.ts`
- `src/app/api/auth/zalo/start/route.ts`
- `src/app/api/auth/zalo/callback/route.ts`

Login UI:
- `src/app/login/page.tsx`
- `src/app/login/zalo-login-link.tsx`
- `src/app/globals.css`

Pending:
- `src/app/zalo/pending/page.tsx`
- `src/components/zalo-pending-status.tsx`
- `src/app/api/auth/zalo/pending/status/route.ts`

iOS handoff:
- `src/lib/zalo-handoff.ts`
- `src/app/api/auth/zalo/handoff/start/route.ts`
- `src/app/api/auth/zalo/handoff/status/route.ts`

Linking:
- `src/lib/zalo-linking.ts`
- `src/app/zalo/link/*`

DB:
- `auth_identities`
- `zalo_link_requests`
- `zalo_auth_handoffs`

---

# 13. Ghi chú vận hành

- Android không còn phụ thuộc handoff.
- Không xóa handoff code vì iOS vẫn đang dùng.
- Không coi `-14019` là lỗi có meaning đã được Zalo xác nhận; chỉ special-case theo observed behavior.
- Không retry cùng authorization code.
- Recovery `-14019` luôn tạo transaction OAuth mới.
- Nếu sau này `-14019` thay đổi behavior, xem log `errorName/httpStatus` trước khi sửa flow.
- Popup Android là một phần bắt buộc của UX hiện tại vì full Chrome mới hiển thị nút Zalo App trên thiết bị đã test.
- User đã xác nhận phần đăng nhập Zalo hiện được xem là hoàn thiện.
