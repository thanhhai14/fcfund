# Compact conversation 02 — Zalo OAuth, PWA Safari handoff, matching, proxy

**Ngày cập nhật:** 2026-09-22  
**Project:** FCFund  
**Repo:** `/home/thanhhai14/Data/Code/FCFund`

## 1. Bối cảnh trước compact này

- Zalo OAuth v4 đã hoạt động.
- Production Vercel bị Zalo Graph từ chối do outbound IP ngoài Việt Nam với lỗi `-501`.
- Đã triển khai PHP profile proxy tại Việt Nam:
  - `deploy/zalo-profile-proxy/index.php`
  - HMAC-SHA256 với timestamp.
  - env:
    - `ZALO_PROFILE_PROXY_URL`
    - `ZALO_PROFILE_PROXY_SECRET`
- Đã fix bug proxy coi Zalo response `error: 0, message: "Success"` là lỗi.
- Production sau fix lấy được Zalo profile và vào flow linking/PENDING.
- Đã cải tiến matcher + preset cho danh sách Zalo thật:
  - `src/lib/zalo-name-matching.ts`
  - `src/lib/zalo-name-presets.ts`
  - `scripts/test-zalo-name-matching-live.ts`
- Kết quả production read-only:
  - matcher cũ: 7/26
  - fuzzy mới: 13/26
  - fuzzy + preset: 18/26
  - 8 còn lại đều là member chưa có user.
- Preset chỉ chọn candidate; user vẫn phải nhập đúng mật khẩu FCFUND.
- Commit liên quan:
  - `95c496f feat: improve Zalo name matching with presets`
  - `94d87a5 feat: add Vietnam PHP proxy for Zalo profile`

## 2. Hành vi khi Admin reject request Zalo

Đã kiểm tra source:

- `rejectZaloRequestAction()` đổi request `PENDING -> REJECTED`.
- Callback chỉ dùng `findPendingZaloRequest()`, tức chỉ tìm `status=PENDING`.
- Vì vậy request bị reject **không khóa Zalo ID vĩnh viễn**.
- User đăng nhập Zalo lại sẽ chạy lại flow:
  - linked identity nếu có;
  - pending request nếu có;
  - candidate matching;
  - nếu không match thì tạo PENDING mới.
- Trường hợp `Nguyễn Thanh Hải` sau matcher preset mới sẽ map:
  - Zalo: `Nguyễn Thanh Hải`
  - member code: `38`
  - member: `Thanh Hải`
  - đi `/zalo/link` và nhập mật khẩu nếu chưa link.

## 3. Bug PWA iOS với Zalo Login

Phát hiện thực tế:

- Safari/Chrome bình thường trên iPhone có thể hiện lựa chọn **“Đăng nhập qua ứng dụng Zalo”**.
- Safari Private / Chrome Incognito không hiện.
- PWA installed/standalone cũng không hiện.
- Nếu user đã login FCFund trước khi cài PWA thì PWA mới cài có thể vẫn có session FCFund ban đầu; điều này không có nghĩa Zalo/Safari state được share liên tục.

Kết luận quan trọng:

- Zalo login page phụ thuộc browser context/trusted state.
- iOS PWA standalone không có cùng browsing context với Safari.
- `window.open(..., "_blank")` từ Home Screen PWA **không đảm bảo mở Safari thật**.

## 4. Phase 1 test — window.open external URL

Đã tạo test để PWA mở trực tiếp Zalo OAuth bằng `window.open(..., "_blank")`.

File:
- `src/app/login/zalo-login-link.tsx`

Kết quả trên iPhone:
- **Không thoát sang Safari thật**.
- Phase 1 fail.

Commit phase 1:
- `ba141c6 Fix login zalo pwa phase 1`

## 5. Phase 2 test — x-safari-https

Đổi PWA iOS sang custom scheme:

```text
x-safari-https://oauth.zaloapp.com/...
```

Thay vì `window.open()`.

Kết quả thực tế trên iPhone:
- **PWA mở sang Safari thật thành công.**
- Safari của user đã có Zalo session nên Zalo callback ngay.
- Callback lúc đó báo:
  - `Phiên Zalo OAuth không hợp lệ`
  - state không khớp / phiên hết hạn.

Lỗi này là expected ở phase 2 vì:
- state/PKCE trước đó nằm ở PWA cookie;
- callback chạy trong Safari;
- Safari không có cookie OAuth của PWA.

Kết luận:
- `x-safari-https` giải quyết được bước **PWA -> Safari thật**.
- Cần server-side handoff để giải quyết cookie/session cross-context.

## 6. Kiến trúc handoff đã triển khai

Thiết kế production cho iOS PWA:

```text
PWA
  -> handoff ID + client verifier
  -> x-safari-https:// Zalo OAuth
Safari
  -> Zalo OAuth
  -> callback FCFund
Server
  -> tìm handoff bằng OAuth state
  -> dùng PKCE verifier server-side
  -> resolve linked / candidate / pending
PWA
  -> poll bằng handoffId + client verifier
  -> server tạo cookie/session ngay trong PWA context
```

Browser Safari/Chrome bình thường vẫn dùng OAuth cookie flow cũ.

### Các status handoff

- `PENDING`
- `LINK_REQUIRED`
- `APPROVAL_PENDING`
- `READY`
- `CONSUMED`
- `FAILED`

### TTL

- handoff mới: 10 phút.
- sau callback thành công: kết quả giữ 30 phút để user quay lại PWA.
- bản ghi cũ được cleanup theo retention 24h khi tạo handoff mới.

### Bảo mật

PWA giữ:
- `handoffId`
- random client verifier.

DB chỉ giữ:
- SHA-256 của client verifier.
- OAuth `state`.
- PKCE verifier server-side.
- kết quả resolve tạm thời.

Client verifier không lưu plaintext trong DB.

## 7. Schema / migration mới

Đã thêm bảng:

```text
zalo_auth_handoffs
```

Các field chính:

```text
id
client_secret_hash
oauth_state
pkce_verifier
status
provider_user_id
display_name
avatar_url
club_id
candidate_user_id
link_request_id
user_id
failure_message
expires_at
consumed_at
created_at
updated_at
```

Migration:

```text
drizzle/0017_sudden_captain_britain.sql
```

Metadata:
- `drizzle/meta/0017_snapshot.json`
- `drizzle/meta/_journal.json` updated.

## 8. Source handoff mới

### `src/lib/zalo-handoff.ts`

Có:
- `createZaloAuthHandoff()`
- `findPendingZaloAuthHandoffByState()`
- `readZaloAuthHandoffForClient()`
- `markZaloHandoffReady()`
- `markZaloHandoffLinkRequired()`
- `markZaloHandoffApprovalPending()`
- `markZaloHandoffFailed()`
- `markZaloHandoffConsumed()`

### API mới

```text
POST /api/auth/zalo/handoff/start
POST /api/auth/zalo/handoff/status
```

Lưu ý:
- route `/handoff/start` có tồn tại, nhưng UI hiện tại chuẩn bị handoff ngay lúc server render login page để tránh iOS chặn navigation sau async fetch.
- status route dùng `handoffId + verifier` để đọc kết quả.

### `src/app/api/auth/zalo/callback/route.ts`

Callback giờ hỗ trợ hai mode:

1. Browser thường:
   - validate state từ cookie như cũ;
   - PKCE verifier từ cookie.

2. iOS PWA handoff:
   - tra handoff bằng `returnedState`;
   - PKCE verifier lấy từ DB;
   - không cần Safari có OAuth cookies của PWA.

Sau khi lấy profile:

- Zalo đã linked:
  - handoff -> `READY(userId)`.
- đã có pending request:
  - handoff -> `APPROVAL_PENDING`.
- match candidate:
  - handoff -> `LINK_REQUIRED`.
- không match:
  - tạo/reuse request PENDING;
  - handoff -> `APPROVAL_PENDING`.

Safari callback page hiển thị message kiểu:
- đã xác thực Zalo;
- quay lại app Trại Làng FC;
- app sẽ tự tiếp tục.

## 9. PWA client flow

File:

```text
src/app/login/zalo-login-link.tsx
```

Detect iOS standalone bằng:
- `matchMedia("(display-mode: standalone)")`
- hoặc `navigator.standalone === true`
- cộng iOS UA/touch detection.

Nếu **không phải iOS standalone**:
- giữ link cũ `/api/auth/zalo/start`.

Nếu **iOS standalone**:
- lưu handoff vào `localStorage` với key:
  - `fcfund_zalo_handoff_v1`
- gọi:
  - `x-safari-https://...`
- Safari mở Zalo OAuth.
- Khi PWA quay lại foreground:
  - poll `/api/auth/zalo/handoff/status` mỗi ~2 giây.
  - `visibilitychange` và `pageshow` trigger check ngay.

Kết quả:

### READY
- status API tạo `fcfund_session` ngay trong PWA.
- redirect `/dashboard`.

### LINK_REQUIRED
- status API tạo signed `zalo_link_context` cookie ngay trong PWA.
- redirect `/zalo/link`.
- flow xác nhận candidate + password giữ nguyên.

### APPROVAL_PENDING
- status API tạo signed `zalo_pending` cookie ngay trong PWA.
- redirect `/zalo/pending`.
- flow chờ Admin giữ nguyên.

## 10. Login page

`src/app/login/page.tsx` hiện tạo handoff trước khi render nếu Zalo Login bật.

Lý do:
- iOS custom scheme navigation cần chạy trực tiếp trong user click gesture.
- Nếu click -> await fetch -> rồi mới mở Safari, có nguy cơ iOS block/không coi là user initiated.

Nếu prepare handoff lỗi:
- login bằng số điện thoại vẫn còn.
- nút Zalo báo cần reload/thử lại.

## 11. Production test sau deploy

User đã migrate/deploy và xác nhận:

- iOS PWA handoff **hoạt động được**.
- PWA mở Safari thật.
- Zalo OAuth xử lý.
- handoff quay lại PWA dùng được.

Đây là trạng thái hiện tại: **production iOS flow đã chạy thực tế**.

## 12. Android

Hiện code **không bật handoff cho Android**.

Android PWA tiếp tục flow cũ:

```text
PWA Android
-> /api/auth/zalo/start
-> Zalo OAuth
-> callback
-> session
```

Lý do:
- Android Chrome/WebAPK thường xử lý external auth/custom tab + in-scope return tốt hơn iOS.
- Chưa có lý do để đưa workaround iOS sang Android trước khi test máy thật.

Việc cần test sau:
- Android Chrome PWA installed.
- logout.
- login Zalo.
- xem mở Custom Tab/Zalo app hay không.
- callback có tự quay lại PWA + dashboard hay không.

Nếu Android flow có bug tương tự, mới cân nhắc handoff riêng.

## 13. Safari -> tự mở lại iOS PWA

Hiện **PWA thuần trên iOS không có API chuẩn đáng tin cậy để Safari tự launch lại Home Screen PWA**.

Không thể dựa chắc chắn vào:
- HTTPS callback cùng domain;
- target blank;
- window.open;
- URL capture.

Universal Links là cơ chế cho native iOS app, không phải Home Screen PWA thuần.

UX hiện tại:
- Safari callback báo thành công.
- User quay lại PWA bằng App Switcher / icon.
- PWA detect foreground và poll handoff ngay.
- sau đó tự redirect dashboard/link/pending.

Nếu sau này muốn auto-return đáng tin cậy:
- cần native wrapper như Capacitor;
- Associated Domains / Universal Links hoặc `ASWebAuthenticationSession`.

## 14. Docs đã cập nhật

- `documents/13-dang-nhap-zalo-cho-pwa.md`
  - thêm iOS PWA Safari handoff;
  - data model handoff;
  - test matrix.
- `documents/10-trien-khai-vercel.md`
  - nhắc migration `0017_sudden_captain_britain.sql` phải chạy trước source mới.

## 15. Test/check hiện tại

Sau handoff implementation:

```text
npm run lint       PASS
npm run build      PASS
git diff --check   PASS
```

Known warning:
```text
npm warn Unknown builtin config "globalignorefile"
```

Không ảnh hưởng build.

## 16. Git / deploy notes

Tại thời điểm implement, working tree từng có:

```text
M documents/10-trien-khai-vercel.md
M documents/13-dang-nhap-zalo-cho-pwa.md
M drizzle/meta/_journal.json
M src/app/api/auth/zalo/callback/route.ts
M src/app/login/page.tsx
M src/app/login/zalo-login-link.tsx
M src/db/schema.ts
?? drizzle/0017_sudden_captain_britain.sql
?? drizzle/meta/0017_snapshot.json
?? src/app/api/auth/zalo/handoff/
?? src/lib/zalo-handoff.ts
```

Sau đó user đã deploy và xác nhận iOS hoạt động. Nếu cần kiểm tra commit/status tiếp thì phải đọc lại git hiện tại, không giả định working tree vẫn như trên.

## 17. Quyết định hiện tại

Tạm chốt:

- iOS: **Safari + server-side handoff**.
- Android: giữ flow chuẩn hiện tại, chờ test thực tế.
- Chưa chuyển sang native wrapper.
- Chưa cố auto-open lại iOS PWA từ Safari.
- UX iOS hiện chấp nhận user quay lại app thủ công, PWA tự nhận kết quả ngay khi foreground.
