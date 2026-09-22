# Nghiên cứu đăng nhập Zalo cho PWA FCFUND

**Ngày nghiên cứu:** 2026-09-22  
**Trạng thái:** Nghiên cứu khả thi, chưa triển khai  
**Phạm vi:** Đăng nhập FCFUND bằng tài khoản Zalo trên Web/PWA, giữ nguyên cơ chế tài khoản nội bộ hiện có.

## 1. Kết luận nhanh

**Mức độ khả thi: cao về kỹ thuật.**

Zalo hiện có Zalo Social OAuth 2.0 v4 dành cho Web. Web app có thể chuyển người dùng tới Zalo để cấp quyền, nhận authorization code qua callback, đổi code lấy access token và dùng token để lấy profile Zalo. FCFUND đang chạy Next.js App Router trên HTTPS/Vercel nên kiến trúc hiện tại phù hợp.

Đăng nhập Zalo nên là một phương thức xác thực bổ sung, không thay thế mô hình tài khoản FCFUND.

~~~text
Tài khoản FCFUND hiện có
        │
        ├── SĐT + mật khẩu
        │
        └── Zalo identity đã liên kết
                 │
                 └── Zalo user id
~~~

Người dùng phải liên kết Zalo với tài khoản FCFUND một lần. Sau khi liên kết, các lần sau có thể nhấn **Đăng nhập bằng Zalo** mà không cần nhập mật khẩu FCFUND.

### Không nên làm

Không nên:

- tự tạo tài khoản FCFUND mới chỉ vì người dùng đăng nhập Zalo thành công;
- tự ghép tài khoản bằng tên hoặc avatar;
- giả định Zalo Social OAuth luôn trả số điện thoại;
- lưu access token/refresh token Zalo lâu dài nếu chỉ dùng Zalo để đăng nhập;
- đưa App Secret xuống client.

FCFUND là hệ thống thành viên đóng, tài khoản do Admin quản lý. Zalo chỉ nên chứng minh danh tính của một tài khoản đã tồn tại.

## 2. Khả năng chính thức từ Zalo

Zalo Social hỗ trợ OAuth cho Web qua endpoint:

~~~text
https://oauth.zaloapp.com/v4/permission
~~~

Luồng chính thức:

~~~text
FCFUND
  │
  │ 1. Redirect
  ▼
Zalo OAuth
  │
  │ 2. User đăng nhập + cấp quyền
  ▼
FCFUND callback
  │
  │ 3. authorization code
  ▼
POST /v4/access_token
  │
  │ 4. access token
  ▼
GET graph.zalo.me/v2.0/me
  │
  │ 5. Zalo user id + profile
  ▼
Map sang users.id của FCFUND
  │
  ▼
createSession()
~~~

Zalo OAuth v4 hỗ trợ:

- Web callback URL;
- OAuth state để chống CSRF;
- PKCE với code_verifier / code_challenge;
- App Secret trong request server-side;
- user access token;
- refresh token.

Theo tài liệu hiện tại, authorization code chỉ dùng một lần và có thời gian sống ngắn; user access token có thời hạn ngắn, refresh token dài hơn; ứng dụng nên ở trạng thái **Đang hoạt động**.

Đối với FCFUND, refresh token không cần thiết nếu mục tiêu duy nhất là xác thực đăng nhập.

## 3. Profile Zalo và vấn đề số điện thoại

Sau OAuth, Social API có thể lấy profile người dùng qua:

~~~text
GET https://graph.zalo.me/v2.0/me
~~~

Tài liệu Zalo minh họa các trường như:

- id;
- name;
- picture;
- một số thông tin profile khác tùy quyền/API.

### Điểm quan trọng

Không nên xây thiết kế theo giả định:

~~~text
Zalo login
→ lấy số điện thoại
→ tìm users.phoneNormalized
→ login
~~~

Tài liệu Social profile công khai hiện mô tả định danh, tên và ảnh đại diện; số điện thoại không phải dữ liệu cơ bản có thể mặc định dựa vào trong Web Social OAuth.

Zalo Mini App có API và scope riêng cho số điện thoại, nhưng **Zalo Mini App là sản phẩm khác với một PWA/Web app thông thường**. Không nên trộn hai cơ chế này.

Khóa liên kết đúng phải là:

~~~text
Zalo provider user id
        ↕
FCFUND users.id
~~~

## 4. Kiến trúc xác thực hiện tại của FCFUND

Hiện FCFUND đăng nhập bằng:

~~~text
phoneNormalized + passwordHash
~~~

Sau khi xác thực thành công, source hiện gọi:

~~~text
createSession({
  sub: user.id,
  clubId,
  memberId,
  role
})
~~~

Session dùng JWT trong cookie:

- HttpOnly;
- Secure ở production;
- SameSite=Lax;
- thời hạn 14 ngày.

Điều này thuận lợi cho Zalo Login. Zalo chỉ thay bước verifyPassword bằng verifyZaloOAuth → resolve users.id. Phần session, role, club và permission sau đó không phải thay đổi.

## 5. Mô hình dữ liệu đề xuất

Không nên thêm riêng cột zaloId vào users nếu tương lai có thể bổ sung provider khác.

Đề xuất bảng:

~~~text
auth_identities
────────────────────────────────
id
user_id                FK users.id
provider               "ZALO"
provider_user_id       Zalo user id
display_name           nullable snapshot
avatar_url             nullable snapshot
linked_at
last_login_at
created_at
updated_at
~~~

Constraint:

~~~text
UNIQUE(provider, provider_user_id)
UNIQUE(user_id, provider)
~~~

Ý nghĩa:

- một Zalo account không được liên kết với hai tài khoản FCFUND;
- một tài khoản FCFUND chỉ có một identity Zalo;
- password vẫn giữ để fallback;
- xóa user thì identity cascade.

### Có cần lưu Zalo token không?

**Không, nếu chỉ dùng để login.**

Flow:

1. đổi authorization code lấy access token;
2. gọi profile;
3. lấy Zalo user id;
4. map user;
5. tạo FCFUND session;
6. bỏ access token và refresh token.

Không lưu token giúp giảm dữ liệu nhạy cảm và loại bỏ toàn bộ logic refresh token khỏi FCFUND.

## 6. Flow đăng nhập đã liên kết

Trang login có thể thành:

~~~text
┌─────────────────────────────┐
│ Số điện thoại               │
│ Mật khẩu                    │
│ [ Đăng nhập ]               │
│                             │
│ ───────── hoặc ───────────  │
│                             │
│ [ Đăng nhập bằng Zalo ]     │
└─────────────────────────────┘
~~~

Flow:

~~~text
/login
  │
  └─ Đăng nhập bằng Zalo
          │
          ▼
/api/auth/zalo/start
          │
          ▼
Zalo permission
          │
          ▼
/api/auth/zalo/callback
          │
          ├─ verify state
          ├─ exchange code
          ├─ get Zalo profile
          ├─ find auth_identities
          ├─ find active user
          ├─ update lastLoginAt
          └─ createSession()
                  │
                  ▼
             /dashboard
~~~

Nếu Zalo OAuth thành công nhưng users.isActive = false thì vẫn phải từ chối đăng nhập.

## 7. Liên kết lần đầu

Đây là phần quyết định của thiết kế.

### Phương án A — liên kết trong Settings

1. user đăng nhập FCFUND bằng SĐT + mật khẩu;
2. vào Settings;
3. bấm **Liên kết tài khoản Zalo**;
4. OAuth Zalo;
5. callback thấy user FCFUND đang có session;
6. tạo auth_identities.

Ưu điểm:

- an toàn;
- đơn giản;
- gần như không có nguy cơ ghép nhầm account.

Nhược điểm:

- user phải đăng nhập bằng password ít nhất một lần.

### Phương án B — liên kết ngay lần đầu bấm Login Zalo

Nếu callback nhận Zalo user id chưa tồn tại:

~~~text
Zalo login thành công
        │
        ▼
Chưa liên kết FCFUND
        │
        ▼
Yêu cầu:
SĐT + mật khẩu FCFUND
        │
        ▼
verifyPassword()
        │
        ▼
link Zalo identity
        │
        ▼
createSession()
~~~

Khuyến nghị cuối cùng là **UX theo phương án B**, nhưng bảo mật phải giống A:

> Zalo chưa liên kết không được tự tạo tài khoản. Người dùng phải chứng minh tài khoản FCFUND hiện có bằng SĐT + mật khẩu đúng một lần.

Sau đó những lần tiếp theo chỉ cần Zalo.

## 8. Route đề xuất

### Start OAuth

~~~text
GET /api/auth/zalo/start
~~~

Server:

1. tạo state ngẫu nhiên;
2. tạo PKCE code_verifier;
3. tính SHA-256 → code_challenge;
4. lưu verifier/state vào cookie ngắn hạn;
5. redirect tới Zalo.

Cookie tạm:

~~~text
zalo_oauth_state
zalo_pkce_verifier
zalo_oauth_next
~~~

Nên có:

~~~text
HttpOnly
Secure
SameSite=Lax
Max-Age≈600
Path=/api/auth/zalo
~~~

### Callback

~~~text
GET /api/auth/zalo/callback
~~~

Callback:

1. kiểm tra code;
2. so state;
3. lấy verifier từ cookie;
4. POST code đến Zalo token endpoint;
5. gọi Social profile API;
6. lấy providerUserId;
7. tìm identity;
8. tạo FCFUND session nếu đã liên kết;
9. nếu chưa liên kết, chuyển sang flow xác minh account nội bộ;
10. xóa cookie OAuth tạm.

## 9. Biến môi trường

Đề xuất:

~~~env
ZALO_APP_ID=
ZALO_APP_SECRET=
ZALO_REDIRECT_URI=https://www.trailang.io.vn/api/auth/zalo/callback
ZALO_LOGIN_ENABLED=true
~~~

App Secret tuyệt đối không có prefix NEXT_PUBLIC.

Thậm chí ZALO_APP_ID cũng không cần đưa xuống client nếu nút login chỉ mở route nội bộ /api/auth/zalo/start.

## 10. PKCE và CSRF

Nên dùng cả PKCE và state.

~~~text
code_verifier = random
code_challenge = BASE64URL(SHA256(code_verifier))
~~~

State phải là giá trị ngẫu nhiên có entropy mạnh, không dùng userId, timestamp hay clubId làm state.

State chống login CSRF; PKCE làm authorization code bị đánh cắp khó đổi thành token nếu không có verifier.

## 11. Tương thích với PWA

OAuth Web không yêu cầu SDK Android/iOS.

FCFUND phải dùng flow Web:

~~~text
https://oauth.zaloapp.com/v4/permission
~~~

Không dùng pkg_name, bndl_id hay native Zalo SDK vì FCFUND vẫn là Web/PWA.

Installed PWA sẽ điều hướng ra ngoài origin:

~~~text
www.trailang.io.vn
→ oauth.zaloapp.com
→ www.trailang.io.vn/api/auth/zalo/callback
~~~

Các tài liệu PWA mô tả OAuth bằng out-of-scope in-app browser rồi quay lại scope của PWA. Tuy nhiên hành vi thực tế vẫn phải test riêng trên iOS và Android.

## 12. Service Worker hiện tại

Service worker FCFUND hiện có điều kiện bỏ qua toàn bộ /api/*.

Do đó các route sau không bị cache/intercept:

~~~text
/api/auth/zalo/start
/api/auth/zalo/callback
~~~

Đây là behavior đúng cho OAuth callback. Không cần sửa service worker nếu route Zalo đặt dưới /api/.

## 13. Tương tác với Zalo In-App Browser Gate

Gate hiện tại chặn User-Agent Zalo khi người dùng mở link FCFUND trong browser bên trong Zalo. Nên giữ nguyên.

Hai trường hợp khác nhau:

~~~text
Link FCFUND mở từ chat Zalo
→ in-app-browser gate
→ hướng dẫn mở Safari/Chrome
~~~

và:

~~~text
FCFUND/PWA
→ OAuth Zalo
→ callback server-side
~~~

Callback nên là Route Handler server-side để session được tạo trước khi render UI.

Cần test trường hợp callback OAuth kết thúc trong context mang User-Agent Zalo. Nếu callback tạo session xong nhưng /dashboard vẫn nằm trong Zalo browser thì gate có thể xuất hiện. Đây là vấn đề UX, không phải lỗi xác thực.

## 14. Role và permission

Zalo không quyết định:

- club;
- member;
- role;
- permission;
- isActive.

Zalo chỉ trả identity.

~~~text
auth_identities.user_id
       │
       ▼
users
       │
       ├── clubId
       ├── memberId
       ├── role
       └── isActive
~~~

Sau đó gọi createSession hiện tại.

Như vậy Admin không gắn member vẫn đăng nhập Zalo bình thường và toàn bộ permission hiện tại được giữ nguyên.

## 15. Password có còn cần không?

Có.

Ít nhất ở giai đoạn đầu nên giữ password để:

- fallback khi Zalo lỗi;
- xác minh liên kết lần đầu;
- unlink/relink identity;
- khôi phục quyền truy cập nếu user đổi/mất Zalo;
- tránh phụ thuộc hoàn toàn vào nền tảng thứ ba.

Không nên xóa đăng nhập SĐT/mật khẩu.

## 16. Refresh Zalo token

Nếu chỉ login thì không cần refresh token.

~~~text
OAuth code
→ access token
→ GET /me
→ Zalo user id
→ discard token
~~~

Phiên sau đó vẫn là fcfund_session 14 ngày.

Access token Zalo hết hạn không làm user bị logout khỏi FCFUND.

## 17. Unlink

Settings nên có:

~~~text
Tài khoản Zalo
────────────────────────
Nguyễn Văn A
Đã liên kết

[ Hủy liên kết Zalo ]
~~~

Unlink:

- xóa auth_identities ZALO;
- không xóa user;
- không đổi password;
- không xóa member;
- không bắt buộc logout session hiện tại.

Có thể yêu cầu nhập lại mật khẩu trước khi unlink nếu muốn tăng bảo mật.

## 18. Account takeover cần ngăn chặn

Tuyệt đối không:

- link bằng displayName;
- link bằng avatar;
- auto-create user vì Zalo OAuth thành công;
- overwrite một identity đang thuộc user khác.

Unique constraint phải xử lý race condition ở DB.

## 19. Error handling

Các tình huống cần xử lý rõ:

- user hủy consent;
- state sai/hết hạn;
- authorization code hết hạn;
- code bị dùng lại;
- token endpoint timeout;
- Zalo API lỗi;
- identity chưa link;
- identity đã link user khác;
- FCFUND user inactive;
- callback bị reload.

Password login phải tiếp tục hoạt động khi Zalo lỗi.

## 20. Rate limit và audit

Nên rate limit:

~~~text
/api/auth/zalo/start
/api/auth/zalo/callback
flow xác minh SĐT + password khi link lần đầu
~~~

Audit có thể ghi:

~~~text
AUTH_ZALO_LINKED
AUTH_ZALO_UNLINKED
AUTH_ZALO_LOGIN
AUTH_ZALO_LOGIN_FAILED
~~~

Không log:

- App Secret;
- authorization code;
- access token;
- refresh token;
- PKCE verifier.

## 21. UX đề xuất

### Login

~~~text
Số điện thoại
Mật khẩu

[ Đăng nhập ]

──────── hoặc ────────

[ Zalo icon ] Đăng nhập bằng Zalo
~~~

### Lần đầu chưa link

~~~text
Đăng nhập Zalo thành công

Tài khoản Zalo này chưa được liên kết với FCFUND.
Xác minh tài khoản FCFUND một lần để hoàn tất.

Số điện thoại
Mật khẩu

[ Liên kết và đăng nhập ]
~~~

Sau khi link không hỏi lại mật khẩu FCFUND trong Zalo login thông thường.

## 22. Cấu hình Zalo Developer

Cần:

1. tạo Zalo Developer App;
2. cấu hình Đăng nhập;
3. thêm platform **Web**;
4. cấu hình callback URL chính xác;
5. lấy App ID và App Secret;
6. đưa app về trạng thái hoạt động theo yêu cầu Zalo.

Production callback đề xuất:

~~~text
https://www.trailang.io.vn/api/auth/zalo/callback
~~~

Nếu có UAT nên đăng ký callback riêng nếu Zalo Console cho phép.

Chính sách kích hoạt/kiểm duyệt có thể thay đổi nên phải đối chiếu Developer Console tại thời điểm rollout.

## 23. Local development

Nên test qua một URL HTTPS ổn định hoặc deployment UAT.

Nếu cần local có thể dùng tunnel:

~~~text
https://fcfund-dev.example.com
→ localhost:3000
~~~

Không nên giả định callback localhost luôn được Zalo Console chấp nhận.

## 24. So sánh các hướng

| Hướng | Phù hợp FCFUND | Nhận xét |
|---|---|---|
| Zalo Social OAuth Web | **Có** | Đúng sản phẩm cho Login Zalo vào Web/PWA |
| Zalo native Android/iOS SDK | Không cần | FCFUND không phải native app |
| Zalo Mini App | Không nên chỉ vì login | Là kiến trúc/phân phối khác; chỉ cân nhắc nếu muốn đưa FCFUND vào hệ sinh thái Mini App |

## 25. PWA iOS và Android

### Android

Khả năng tương thích cao với redirect OAuth web.

Test:

- Chrome browser;
- installed PWA;
- success/cancel/retry;
- Zalo account đã login/chưa login.

### iOS

OAuth trong installed PWA được hỗ trợ về nguyên tắc, nhưng đây vẫn là vùng phải test thiết bị thật.

Test:

- Safari browser;
- Add to Home Screen standalone;
- OAuth success;
- OAuth cancel;
- callback trở lại PWA/in-app browser;
- state và PKCE cookie;
- session cookie sau callback.

Không bao giờ bỏ state chỉ để chữa một lỗi Safari/PWA.

## 26. Test matrix bắt buộc

| Thiết bị | Context | Kịch bản |
|---|---|---|
| iPhone | Safari | success/cancel |
| iPhone | installed PWA | success/cancel/retry |
| Android | Chrome | success/cancel |
| Android | installed PWA | success/cancel/retry |
| Android/iPhone | Zalo in-app browser | xác nhận gate |
| Desktop | Chrome/Safari/Edge | fallback web flow |

Ngoài ra:

- identity chưa link;
- identity đã link;
- user inactive;
- identity thuộc user khác;
- state mismatch;
- callback reload;
- code reuse;
- token API timeout;
- DB race;
- logout rồi Zalo login lại.

## 27. Thay đổi source dự kiến

### DB

~~~text
src/db/schema.ts
drizzle/<new-migration>.sql
~~~

Thêm auth_identities.

### Auth

~~~text
src/lib/auth.ts
~~~

Nên thêm helper chung createSessionForUser(user) để password và Zalo dùng chung một đường.

### OAuth

~~~text
src/lib/zalo-auth.ts
src/app/api/auth/zalo/start/route.ts
src/app/api/auth/zalo/callback/route.ts
~~~

### UI

~~~text
src/app/login/page.tsx
src/app/login/login-form.tsx
/settings
~~~

## 28. Có cần thư viện OAuth không?

Không bắt buộc.

Flow Zalo chỉ cần:

- random;
- SHA-256;
- Base64URL;
- redirect;
- POST form-urlencoded;
- fetch profile.

Node/Next hiện có đủ primitive để triển khai rõ ràng. Không cần kéo Passport/Auth.js chỉ cho một provider.

Nếu tương lai thêm nhiều provider mới cân nhắc abstraction lớn hơn.

## 29. Độ phức tạp

MVP gồm:

- Zalo Developer app;
- DB identity;
- start/callback routes;
- PKCE/state;
- profile;
- account linking;
- login button;
- link/unlink;
- device tests.

**Độ phức tạp: trung bình.**

Không cần thay kiến trúc lõi.

Rủi ro chính:

1. cấu hình/kích hoạt Zalo Developer App;
2. UX liên kết lần đầu;
3. behavior OAuth trong iOS installed PWA;
4. tương tác với Zalo in-app-browser gate.

## 30. Rollout đề xuất

### Phase 1 — Proof of Concept

- tạo Zalo App;
- callback UAT;
- OAuth start/callback;
- lấy thành công id/name/picture;
- chưa ghi DB.

Mục tiêu: xác nhận OAuth trên iPhone PWA và Android PWA thật.

### Phase 2 — Account linking

- migration auth_identities;
- link/unlink;
- unique constraints;
- audit.

### Phase 3 — Login

- button Zalo;
- resolve identity;
- create FCFUND session;
- inactive guard;
- error UI.

### Phase 4 — First-login linking

- identity chưa liên kết;
- phone/password verification;
- link + login.

### Phase 5 — Hardening

- rate limit;
- telemetry;
- device matrix;
- feature flag ZALO_LOGIN_ENABLED.

## 31. Khuyến nghị cuối cùng

**Nên triển khai.**

Kiến trúc phù hợp:

~~~text
                       ┌─ Password ───────────────┐
FCFUND user ───────────┤                          ├─ createSession()
                       └─ Zalo auth identity ─────┘
~~~

Zalo không thay thế user database FCFUND; nó chỉ là identity provider.

Điểm quyết định:

> Không dùng số điện thoại Zalo để tự ghép account. Lưu Zalo user id ↔ FCFUND user id sau một lần xác minh tài khoản hiện có.

Cách này giữ nguyên role, permission, club, member link, trạng thái account, password fallback và session hiện tại.

## 32. Nguồn tham khảo

### Zalo

- Zalo Social:  
  https://docs.zaloplatforms.com/docs/Social

- User Access Token OAuth v4:  
  https://docs.zaloplatforms.com/docs/Social/social-api/tham-khao/user-access-token-v4

- Tài liệu Zalo For Developers — User Access Token v4:  
  https://stc-developers.zdn.vn/docs/v2/social-api/tham-khao/user-access-token-v4

- Cấu hình App Callback URL:  
  https://stc-developers.zdn.vn/docs/v2/social-api/tham-khao/cau-hinh-app-callback-url

- Tổng quan Social API:  
  https://stc-developers.zdn.vn/docs/v2/social-api/tai-lieu/tong-quan

- Profile API:  
  https://docs.zaloplatforms.com/docs/Social/sdk/android-sdk/open-api/lay-thong-tin-profile

- User Access Token v4 notes:  
  https://stc-developers.zdn.vn/docs/v2/social-api/tham-khao/mot-so-luu-y-voi-user-access-token-v4

- Refresh token lifecycle:  
  https://stc-developers.zdn.vn/docs/v2/social-api/tham-khao/co-che-het-han-cua-user-refresh-token

### PWA OAuth

- web.dev — Window management / authorization flows:  
  https://web.dev/learn/pwa/windows

- Chrome — Navigation management into installed PWAs:  
  https://developer.chrome.com/docs/capabilities/pwa-navigation-management

- Apple — Safari standalone web apps:  
  https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

> Chính sách, UI và yêu cầu kích hoạt Zalo có thể thay đổi. Trước khi triển khai production phải đối chiếu lại Zalo Developer Console và tài liệu chính thức tại thời điểm cấu hình.
