# Web Push và thiết kế thông báo cho thành viên

**Trạng thái:** P0 đã triển khai; P1/P2 và scheduler nâng cao vẫn là thiết kế tiếp theo  
**Ngày cập nhật:** 21/09/2026  
**Phạm vi:** Push notification cho User đang hoạt động; ưu tiên User có liên kết `users.member_id`

## 1. Hiện trạng dự án

FCFUND hiện đã có các thành phần nền phù hợp để bổ sung Web Push:

- Next.js App Router + Server Actions.
- PostgreSQL/Drizzle.
- PWA với `manifest.ts`, `display: standalone`, `id: "/"`, `scope: "/"`.
- Service Worker tại `public/sw.js`.
- PWA install prompt trên mobile; khi chưa cài app, thông báo cài sẽ xuất hiện lại sau mỗi lần tải trang và người dùng vẫn có thể đóng.
- User có thể liên kết một Member qua `users.member_id`.
- Deep link nội bộ đã có các route như `/matches/[id]`, `/matches/[id]/teams`, `/charges`, `/reports`, `/members/[id]`.
- Vercel Cron đang dùng cho sinh khoản thu định kỳ.

Service Worker hiện chỉ xử lý install/activate/fetch/offline. Chưa có:

- `push`;
- `notificationclick`;
- đăng ký Push Subscription;
- VAPID keys;
- bảng lưu thiết bị/subscription;
- service gửi Web Push.

Do đó Web Push là phần mở rộng độc lập, không yêu cầu viết lại PWA hoặc các module nghiệp vụ hiện tại.

## 2. Nguyên tắc sản phẩm

### 2.1. Đối tượng nhận

Push được gắn với **User**, không gắn trực tiếp với Member.

Một User có thể có nhiều thiết bị:

```text
User
├── iPhone PWA
├── Android PWA
├── Laptop
└── Tablet
```

Mỗi thiết bị/subscription lưu một endpoint riêng.

Các thông báo mang nghĩa cá nhân như công nợ, khoản phải đóng, tiền nộp hoặc RSVP chỉ được gửi khi User có `member_id` phù hợp.

### 2.2. Không dùng Push làm nguồn sự thật

Push chỉ là kênh thông báo. Dữ liệu thật vẫn nằm trong PostgreSQL.

Nếu gửi Push thất bại:

- transaction nghiệp vụ vẫn phải thành công;
- không rollback nghiệp vụ chỉ vì Push lỗi;
- người dùng mở ứng dụng vẫn thấy dữ liệu đúng.

### 2.3. Không gửi dữ liệu nhạy cảm quá mức

Notification trên Lock Screen có thể bị người khác nhìn thấy.

V1 nên dùng nội dung ngắn, ví dụ:

```text
Trai Làng FC
Bạn có một khoản phải đóng mới.
```

thay vì đưa toàn bộ công nợ hoặc thông tin tài chính chi tiết vào body.

Chi tiết chỉ hiển thị sau khi user bấm notification và ứng dụng kiểm tra session/quyền.

### 2.4. Deep link

Mọi notification nên chứa URL nội bộ cùng origin:

```json
{
  "type": "MATCH_TEAM_CONFIRMED",
  "title": "Đội hình đã được chốt",
  "body": "Xem đội của bạn trong trận sắp tới.",
  "url": "/matches/<matchId>/teams",
  "entityId": "<matchId>"
}
```

Service Worker dùng `notificationclick` để focus cửa sổ hiện có hoặc `clients.openWindow(url)`.

## 3. Hành vi nền tảng

### Android

Chromium hỗ trợ Web Push. Khi PWA đã được cài, `clients.openWindow()` có thể mở URL trong standalone web app đã tồn tại.

FCFUND nên chỉ mời bật Push khi đang chạy ở chế độ PWA/standalone để tránh tạo subscription từ tab browser rồi làm trải nghiệm mở notification không nhất quán.

### iOS/iPadOS

Web Push được hỗ trợ cho Home Screen web app từ iOS/iPadOS 16.4. User phải:

1. thêm PWA vào Home Screen;
2. mở PWA;
3. thực hiện một thao tác trực tiếp như bấm **Bật thông báo**;
4. chấp nhận permission của hệ điều hành.

iOS không cho website tự yêu cầu permission tùy ý mà không có user interaction.

### Tài liệu nền tảng

- Next.js PWA/Web Push: https://nextjs.org/docs/app/guides/progressive-web-apps
- WebKit Web Push trên iOS/iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- MDN `notificationclick`: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event
- MDN `clients.openWindow()`: https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow

## 4. Sự kiện Push đề xuất

### 4.1. Ưu tiên P0 — nên có ngay trong bản Web Push đầu tiên

| Event | Trigger hiện có | Người nhận | Deep link | Ghi chú |
|---|---|---|---|---|
| `MATCH_CREATED` | `createMatchAction` | User ACTIVE có Member ACTIVE trong club | `/matches` hoặc `/matches/{id}` | Mời thành viên bình chọn tham gia |
| `MATCH_UPDATED` | `updateMatchAction` | Người GOING/NOT_GOING; có thể mở rộng toàn club khi đổi ngày | `/matches/{id}` | Chỉ push nếu ngày/nội dung quan trọng thay đổi |
| `MATCH_CANCELLED` | `deleteMatchAction` | Người đã GOING hoặc đã RSVP | `/matches` | Cần thông báo vì lịch đã thay đổi |
| `MATCH_TEAM_CONFIRMED` | `confirmMatchTeamsAction` | Thành viên nằm trong đội hình xác nhận và có User | `/matches/{id}/teams` | Không push khi mới random DRAFT |
| `MATCH_RESULT_RECORDED` | `recordMatchResultAction` | Thành viên thuộc phiên bản đội hình | `/matches/{id}` | Có thể chứa “Kết quả trận đã cập nhật” |
| `MEMBER_CHARGE_CREATED` | `createMemberChargeAction`; kết quả trận; monthly job | User liên kết đúng member | `/charges` hoặc `/reports` | Gom batch khi sinh nhiều khoản cùng lúc |
| `MEMBER_PAYMENT_RECORDED` | `createFundTransactionAction` với `MEMBER_PAYMENT` | User liên kết đúng member | `/reports` hoặc member detail | Xác nhận tiền nộp đã được ghi nhận |

### 4.2. Ưu tiên P1 — nên triển khai sau P0

| Event | Trigger | Người nhận | Deep link | Quy tắc |
|---|---|---|---|---|
| `RSVP_REMINDER` | Cron | User có Member ACTIVE chưa RSVP | `/matches` | Nhắc trước trận; cần chống gửi lặp |
| `MATCH_DAY_REMINDER` | Cron | Người GOING | `/matches/{id}` | Ví dụ sáng ngày thi đấu |
| `MEMBER_CHARGE_UPDATED` | `updateMemberChargeAction` | Member bị ảnh hưởng | `/charges` | Chỉ push khi số tiền/ngày thay đổi thực sự |
| `MEMBER_CHARGE_DELETED` | `softDeleteFinancialAction` | Member bị ảnh hưởng | `/charges` | Thông báo nghĩa vụ đã được hủy |
| `MEMBER_PAYMENT_UPDATED` | `updateFundTransactionAction` | Member của payment | `/reports` | Chỉ áp dụng MEMBER_PAYMENT |
| `MEMBER_PAYMENT_DELETED` | `softDeleteFinancialAction` | Member của payment | `/reports` | Quan trọng vì làm thay đổi số dư |
| `MATCH_MEMBER_REPLACED` | `replaceConfirmedMatchMemberAction` | Người bị thay và người thay | `/matches/{id}` | Nội dung khác nhau theo recipient |
| `MATCH_MEMBER_ADDED` | `addConfirmedMatchMemberAction` | Người vừa được thêm | `/matches/{id}` | Có thể báo đội được xếp |

### 4.3. P2 — cân nhắc, mặc định không bật

- Chatter/comment mới.
- Admin đổi Seed.
- Lock/unlock Seed.
- Random DRAFT mới.
- Admin thay cấu hình loại thu.
- Admin thay logo/QR.
- Member cập nhật CV/avatar.
- Thay đổi policy nội bộ.

Các event này dễ gây nhiều notification nhưng ít giá trị tức thời cho thành viên.

## 5. Quy tắc chống spam

### 5.1. Không push cho chính thao tác của user khi không cần

Ví dụ user tự RSVP:

```text
User bấm "Tham gia"
→ UI đã xác nhận thành công
→ không cần Push lại cho chính user
```

### 5.2. Batch khoản tháng

Monthly Cron có thể sinh nhiều khoản.

Không gửi một notification cho mỗi row nếu một user nhận nhiều khoản cùng lúc. Nên gom thành:

```text
Khoản phải đóng tháng 10 đã được cập nhật
Bạn có 2 khoản mới. Mở ứng dụng để xem chi tiết.
```

### 5.3. Deduplication

Nên có `notification_events` hoặc outbox với `dedupe_key`.

Ví dụ:

```text
MATCH_CREATED:<matchId>:<userId>
MATCH_TEAM_CONFIRMED:<versionId>:<userId>
MONTHLY_CHARGES:<periodMonth>:<userId>
RSVP_REMINDER:<matchId>:<userId>:<yyyy-mm-dd>
```

Unique trên `dedupe_key` giúp cron/retry không gửi lặp.

## 6. Mô hình dữ liệu đề xuất

### 6.1. `push_subscriptions`

```text
id                  uuid PK
user_id             uuid FK users
endpoint            text UNIQUE
p256dh               text
auth                 text
expiration_time      bigint NULL
platform             varchar NULL
user_agent           text NULL
device_label         varchar NULL
enabled              boolean DEFAULT true
last_seen_at         timestamptz
last_success_at      timestamptz NULL
last_failure_at      timestamptz NULL
failure_count        integer DEFAULT 0
created_at           timestamptz
updated_at           timestamptz
```

Không lưu subscription trên `members`, vì push permission thuộc User + browser/device.

### 6.2. `notification_events` — khuyến nghị

Dùng làm outbox/audit gửi thông báo:

```text
id                  uuid PK
club_id             uuid FK clubs
user_id             uuid FK users
type                varchar
title               varchar
body                text
url                 text
entity_type         varchar NULL
entity_id           uuid NULL
dedupe_key          varchar UNIQUE
status              PENDING | SENT | PARTIAL | FAILED | SKIPPED
created_at          timestamptz
sent_at             timestamptz NULL
```

Có thể thêm bảng delivery riêng ở giai đoạn lớn hơn, nhưng V1 chưa bắt buộc.

## 7. Kiến trúc gửi

Khuyến nghị không gọi Web Push trực tiếp bên trong transaction nghiệp vụ.

Luồng:

```text
Server Action
    │
    ├── PostgreSQL transaction
    │      ├── cập nhật nghiệp vụ
    │      └── insert notification_event
    │
    └── transaction commit
              │
              ▼
       dispatch notification
              │
       ┌──────┴──────┐
       ▼             ▼
 subscription A   subscription B
```

### V1 đơn giản

Sau khi transaction commit:

1. resolve recipient;
2. tạo event/dedupe;
3. gọi service Web Push;
4. nếu Push lỗi thì ghi failure nhưng không làm action nghiệp vụ lỗi.

### Khi cần độ tin cậy cao hơn

Dùng Outbox + Cron dispatcher:

```text
PENDING notification_events
       ↓
/api/cron/push-dispatch
       ↓
send
       ↓
SENT / FAILED
```

Cách này xử lý tốt retry và timeout của Server Action.

## 8. Service Worker

Cần bổ sung vào `public/sw.js`:

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Trai Làng FC", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/dashboard" },
      tag: data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    const existing = windows.find((client) => client.url === target);
    if (existing) return existing.focus();

    return clients.openWindow(target);
  })());
});
```

URL nhận từ payload phải được validate cùng origin trước khi mở.

## 9. Đăng ký Push

Chỉ hiện nút **Bật thông báo** khi:

```text
PWA standalone
+ serviceWorker available
+ PushManager available
+ Notification API available
```

Flow:

```text
Mở PWA
  ↓
Cài đặt / profile
  ↓
"Bật thông báo"
  ↓
Notification.requestPermission()
  ↓
serviceWorker.ready
  ↓
pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  ↓
Server Action lưu subscription theo current user
```

Không dựa vào User-Agent để quyết định hỗ trợ; dùng feature detection.

## 10. VAPID và biến môi trường

Bổ sung production env:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Ví dụ `VAPID_SUBJECT`:

```text
mailto:admin@example.com
```

Private key chỉ dùng server-side, tuyệt đối không dùng prefix `NEXT_PUBLIC_`.

## 11. Xử lý subscription hỏng

Push endpoint có thể hết hạn hoặc bị revoke.

Khi provider trả trạng thái tương đương gone/not found:

- disable hoặc xóa subscription đó;
- không retry vô hạn;
- giữ các subscription khác của user.

User đăng xuất không nhất thiết xóa Push Subscription. Tuy nhiên app cần có UI **Tắt thông báo trên thiết bị này** và **Tắt toàn bộ thiết bị**.

Nếu thiết bị có thể được dùng chung, khuyến nghị unsubscribe khi user chủ động chọn tắt notification; không tự chuyển subscription sang tài khoản khác sau lần đăng nhập mới.

## 12. Recipient resolver

Nên có các helper tập trung:

```text
usersForMembers(memberIds)
activeUsersForClub(clubId)
usersGoingToMatch(matchId)
usersWithoutRsvp(matchId)
usersInConfirmedLineup(versionId)
```

Không query recipient rải rác trong từng Server Action.

Recipient luôn cần:

- `users.is_active = true`;
- đúng `club_id`;
- nếu event theo Member thì `users.member_id` phải khớp;
- có ít nhất một Push Subscription enabled.

## 13. Mapping vào source hiện tại

Các integration point chính:

```text
src/app/(app)/mutations.ts
├── createMemberChargeAction
├── updateMemberChargeAction
├── createFundTransactionAction
├── updateFundTransactionAction
├── softDeleteFinancialAction
├── createMatchAction
├── updateMatchAction
└── deleteMatchAction

src/app/(app)/matches/actions.ts
└── setMyMatchRsvpAction
    └── không push lại cho chính user ở V1

src/app/(app)/matches/[id]/teams/actions.ts
└── confirmMatchTeamsAction

src/app/(app)/matches/[id]/actions.ts
├── recordMatchResultAction
├── replaceConfirmedMatchMemberAction
└── addConfirmedMatchMemberAction

src/lib/monthly-charges.ts
└── sinh charge tháng → batch notification
```

Không móc Push vào `generateMatchTeamsAction` vì DRAFT chưa phải thông tin chính thức.

## 14. Scheduled notification

Vercel Cron có thể dùng cho:

- RSVP reminder;
- match-day reminder;
- dispatch notification outbox;
- monthly charge notification batch.

Lưu ý Vercel Cron chạy theo UTC. Business time phải quy đổi theo `Asia/Ho_Chi_Minh`.

Nếu deployment dùng Vercel Hobby, cron có giới hạn tần suất/độ chính xác thấp hơn Pro; reminder không nên thiết kế phụ thuộc độ chính xác từng phút.

Tham khảo:

- https://vercel.com/docs/cron-jobs
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## 15. Lộ trình triển khai đề xuất

### Phase 1 — nền Push

1. Thêm dependency Web Push/VAPID.
2. Tạo `push_subscriptions`.
3. Generate VAPID keys.
4. Bổ sung env.
5. UI Bật/Tắt thông báo.
6. Bổ sung `push` + `notificationclick` vào Service Worker.
7. Test Android và iOS PWA.

### Phase 2 — P0 events

1. Match mới.
2. Đội hình xác nhận.
3. Kết quả trận.
4. Khoản phải đóng mới.
5. Ghi nhận tiền nộp.

### Phase 3 — scheduler/outbox

1. `notification_events`.
2. Retry/dedupe.
3. RSVP reminder.
4. Match-day reminder.
5. Batch khoản tháng.

### Phase 4 — preference

Cho user chọn:

```text
[✓] Trận đấu
[✓] Đội hình
[✓] Khoản phải đóng
[✓] Tiền nộp
[ ] Chatter
```

Các thông báo bảo mật/tài khoản quan trọng có thể tách khỏi preference thông thường nếu sau này cần.

## 16. Tiêu chí nghiệm thu

1. Một User có thể đăng ký nhiều thiết bị.
2. Không gửi Push cho User inactive.
3. Push tài chính chỉ đi tới User liên kết đúng Member.
4. Push lỗi không rollback nghiệp vụ.
5. Subscription invalid được tự loại khỏi danh sách active.
6. iOS chỉ yêu cầu permission trong Home Screen PWA và sau thao tác trực tiếp.
7. Tap notification mở đúng deep link hoặc focus cửa sổ PWA đang có.
8. Không gửi notification khi mới random DRAFT.
9. Cron/retry không tạo notification trùng.
10. Nội dung Lock Screen không lộ thông tin nhạy cảm không cần thiết.
11. Tất cả URL từ Push được validate cùng origin.
12. Có thể tắt notification trên thiết bị hiện tại.
