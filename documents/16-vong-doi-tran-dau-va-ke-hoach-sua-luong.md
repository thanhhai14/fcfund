# Vòng đời trận đấu và kế hoạch sửa luồng Matches

**Trạng thái:** Đã audit source và chốt nghiệp vụ ngày 24/09/2026; chưa triển khai source code của đợt sửa này.  
**Phạm vi:** Menu **Trận đấu (Matches)**, gồm danh sách trận, RSVP, Sửa/Hủy trận, chia đội, phiên bản đội hình, ghi kết quả, thay/bổ sung cầu thủ hậu kỳ và dữ liệu thống kê/phạt.  
**Tài liệu liên quan:** [11-chia-doi-random-va-seed-thanh-vien.md](./11-chia-doi-random-va-seed-thanh-vien.md)

---

## 1. Mục tiêu

Matches hiện không còn là CRUD đơn giản. Một Match đã có các bước: tạo trận, RSVP, chốt roster, đánh giá Seed, chia đội, xác nhận đội hình, thay/bổ sung người, ghi kết quả, sinh phạt, cập nhật phong độ và công khai lineup.

Đợt sửa này đưa toàn bộ các thao tác về **một lifecycle thống nhất** để:

1. UI và server action dùng cùng một rule.
2. Không cho generic edit phá đội hình hoặc kết quả đã chốt.
3. Không cho tạo Team Version mới sau khi result đã được ghi.
4. Nút **Tạo đội / Xem / Sửa / Xóa** phản ánh đúng trạng thái và đúng permission.
5. Match, Team Version, Result, Charges và Member Match Stats luôn đồng bộ.
6. Giữ các action hậu kỳ chuyên biệt thay vì mở generic edit.
7. Ưu tiên lifecycle + guard trước; chưa bắt buộc đổi schema lớn.

---

## 1.1. Quyết định nghiệp vụ đã chốt

Các quyết định dùng làm baseline implementation:

1. **Không thêm `matches.status` trong đợt đầu**; lifecycle được derive bằng helper chung.
2. TEAM_CONFIRMED/RESULT_RECORDED khóa generic edit đối với ngày và participants; vẫn cho sửa note và khoản thu thường an toàn.
3. TEAM_DRAFT chưa draw: sửa date/participants sẽ xóa Draft và quay về OPEN.
4. TEAM_DRAFT đã draw: chỉ Admin được sửa date/participants; thao tác này xóa Draft/draw và quay về OPEN.
5. TEAM_CONFIRMED chưa result được phép tạo Team Version mới.
6. RESULT_RECORDED cấm tạo Team Version mới.
7. Result được phép cập nhật; ngoài ra phải có **Hủy kết quả** để rollback hoàn toàn result. Hủy kết quả là thao tác rollback nhạy cảm, dành cho Admin.
8. RESULT_RECORDED cấm Replace/Add player kể cả Admin; muốn sửa người phải Hủy kết quả trước.
9. **Xóa** đổi thành **Hủy trận**.
10. Match đã hủy vẫn hiển thị trên UI với trạng thái **Đã hủy**.
11. Match đang RESULT_RECORDED không được Hủy trận trực tiếp; Admin phải Hủy kết quả trước.
12. Quyền tạo Team Version thuộc `MATCH_TEAMS_MANAGE`.
13. Các nút action vẫn hiển thị; thao tác không hợp lệ được disabled thay vì biến mất.
14. Hủy kết quả rollback stats + penalty do result sinh ra nhưng **giữ khoản thu thường**.
15. Hủy trận soft-delete **toàn bộ khoản thu/phạt của Match**.
16. Hủy kết quả gửi Push đính chính tới người dùng liên quan.

---

## 2. Hiện trạng kiến trúc

### 2.1. Match chưa có lifecycle status riêng

Bảng **matches** hiện có ngày thi đấu, note, public lineup, audit và soft-delete nhưng không có state nghiệp vụ kiểu:

~~~text
OPEN
TEAM_DRAFT
TEAM_CONFIRMED
RESULT_RECORDED
CANCELLED
~~~

Vì vậy từng khu vực đang tự suy ra trạng thái.

### 2.2. Team Version có state riêng

**match_team_versions.status**:

~~~text
DRAFT
CONFIRMED
SUPERSEDED
~~~

Database đang giới hạn mỗi Match tối đa một DRAFT và một CONFIRMED.

### 2.3. Kết quả đang nằm trong Team Version metrics

Result hiện lưu trong **match_team_versions.metrics**, gồm dữ liệu như:

~~~text
placements
penaltyQuantities
resultChargeTypeId
resultRecordedAt
resultRecordedBy
~~~

Khi ghi result, hệ thống đồng thời tạo/cập nhật:

~~~text
member_match_stats
member_charges
~~~

Vì vậy result hiện gắn với **một confirmed team version cụ thể**.

---

## 3. Workflow hiện tại

~~~mermaid
flowchart TD
    A[Tạo Match] --> B[RSVP / chỉnh người tham gia]
    B --> C[Đánh giá Seed]
    C --> D[DRAFT Team Version]
    D --> E[Bốc thăm đội]
    E --> F[Xác nhận đội hình]
    F --> G[CONFIRMED Team Version]

    G --> H[Ghi kết quả]
    H --> I[Kết quả trong metrics]
    I --> J[member_match_stats]
    I --> K[Penalty member_charges]

    G --> L[Tạo Team Version mới]
    L --> M[DRAFT Version mới]
    M --> N[Xác nhận]
    N --> O[Version cũ SUPERSEDED]
~~~

Hai nhánh **Ghi kết quả** và **Tạo Version mới** hiện chưa loại trừ nhau. Đây là xung đột quan trọng nhất.

---

## 4. Các lỗi/xung đột đã xác nhận

### 4.1. Result có thể bị tách khỏi confirmed version hiện tại

Ví dụ:

~~~text
v1 CONFIRMED
→ ghi result vào v1.metrics
→ member_match_stats trỏ v1
→ penalty sinh theo v1

sau đó:
→ tạo v2 DRAFT
→ confirm v2
→ v1 = SUPERSEDED
→ v2 = CONFIRMED
~~~

Trang detail chỉ tìm version có status CONFIRMED, nên UI chuyển sang v2. Nhưng stats và penalty vẫn là dữ liệu của v1.

Kết quả có thể thành:

~~~text
UI:       chưa có kết quả
Stats:    vẫn có kết quả v1
Charges:  vẫn có penalty v1
~~~

**Rule cần sửa:** sau khi result được ghi nhận, không được tạo/xác nhận Team Version mới.

### 4.2. Generic Sửa Match có thể đổi participant sau khi đội CONFIRMED

**updateMatchAction()** hiện chủ yếu khóa khi có DRAFT đã bốc thăm. Sau khi Confirm thì DRAFT không còn, nên generic edit có thể thay roster.

Nếu xóa một participant đã có trong confirmed lineup, FK của team member dùng onDelete set null; snapshot đội hình vẫn tồn tại nhưng participant gốc biến mất.

**Rule cần sửa:** sau TEAM_CONFIRMED, generic edit không được thay participant.

### 4.3. Sửa ngày sau khi có result làm lệch member_match_stats

**member_match_stats** lưu riêng playedOn. Nếu sửa **matches.playedOn** sau khi result đã được ghi, stats hiện không được đồng bộ ngày.

Điều này có thể làm sai:

- lịch sử kết quả;
- career stats;
- lookback matches;
- form score.

**Rule cần sửa:** sau TEAM_CONFIRMED không cho generic edit ngày thi đấu.

### 4.4. RSVP và generic edit đang dùng hai policy khác nhau

RSVP đã khóa khi có confirmed version hoặc đã draw. Nhưng Organizer/Admin ở một số trạng thái vẫn có thể thay roster qua generic Sửa.

Nghịch lý hiện tại:

~~~text
Member: không được đổi RSVP
Organizer: vẫn có thể sửa roster
~~~

**Rule cần sửa:** roster phải có một policy duy nhất theo lifecycle.

### 4.5. Nút Tạo đội đang dùng sai permission để đặt label

Danh sách Match hiện dùng **MATCHES_MANAGE** để quyết định hiển thị chữ Tạo đội/Xem đội, trong khi quyền đúng của Team Builder là **MATCH_TEAMS_MANAGE**.

Có thể xảy ra:

~~~text
MATCHES_MANAGE = true
MATCH_TEAMS_MANAGE = false
→ UI vẫn ghi "Tạo đội"
~~~

hoặc trường hợp ngược lại.

### 4.6. Label Tạo đội không phản ánh trạng thái

Cần đổi theo lifecycle:

| Trạng thái | Label mục tiêu |
|---|---|
| Chưa có version | Chia đội |
| Có Draft | Tiếp tục chia đội |
| Đã Confirmed | Xem / chỉnh đội |
| Đã có Result | Xem đội hình |
| Chỉ có quyền xem | Xem đội |

### 4.7. Generic Xóa chưa có lifecycle guard

**deleteMatchAction()** hiện có thể soft-delete cả Match đã có confirmed lineup, result, penalty và stats.

Runtime hiện tương đối tránh tính stats của Match đã deleted vì các query filter matches.deletedAt IS NULL, nhưng nghiệp vụ **Xóa** ở đây thực chất là rollback/hủy cả lịch sử Match.

**Rule cần sửa:**

- Match chưa hoàn tất: cho **Hủy trận**.
- TEAM_CONFIRMED: cần cảnh báo mạnh.
- RESULT_RECORDED: generic delete bị chặn; nếu cần phải có Admin rollback riêng.

---

## 5. Phần hiện tại nên giữ

Sau khi đội đã Confirmed, source đã có flow chuyên biệt:

~~~text
replaceConfirmedMatchMemberAction()
addConfirmedMatchMemberAction()
~~~

Các action này đã xử lý nhiều dữ liệu liên quan:

~~~text
matchParticipants
matchTeamMembers
memberCharges
memberMatchStats
placement
penalty
activityLogs
~~~

~~~mermaid
flowchart LR
    A[CONFIRMED lineup] --> B[Thay / bổ sung người]
    B --> C[Participant]
    B --> D[Team member]
    B --> E[Charges]
    B --> F[Member stats]
    B --> G[Audit log]
~~~

Đây là hướng đúng cho hậu kỳ. Không mở generic edit để thay thế các action này.

---

## 6. Lifecycle mục tiêu

Trong đợt đầu chưa bắt buộc thêm cột matches.status. Lifecycle có thể derive từ dữ liệu hiện tại bằng một helper duy nhất.

~~~text
OPEN
TEAM_DRAFT
TEAM_CONFIRMED
RESULT_RECORDED
CANCELLED
~~~

### OPEN

Cho phép RSVP, sửa ngày, roster, note, khoản thu, bắt đầu chia đội và hủy.

### TEAM_DRAFT

Có DRAFT version. Tách capability:

~~~text
Draft chưa draw
Draft đã draw
~~~

Quy tắc đã chốt:

- Draft chưa draw: người có quyền sửa Match được đổi ngày/participants; hệ thống xóa Draft và đưa Match về OPEN.
- Draft đã draw: chỉ Admin được đổi ngày/participants; nếu Admin xác nhận sửa thì xóa toàn bộ Draft/draw hiện tại và đưa Match về OPEN.
- Non-Admin không được sửa structural data sau khi Draft đã draw.

### TEAM_CONFIRMED

Có CONFIRMED, chưa có result.

Cho phép:

- xem đội;
- tạo version mới nếu cần chia lại;
- Replace/Add người;
- ghi result;
- sửa note.

Không generic edit date/participants.

### RESULT_RECORDED

Confirmed version đã có result.

Cho phép:

- xem/cập nhật result;
- **Hủy kết quả** để rollback toàn bộ dữ liệu do result sinh ra và quay về TEAM_CONFIRMED;
- sửa metadata an toàn.

Không cho:

- tạo Team Version mới;
- Replace/Add cầu thủ, kể cả Admin;
- generic edit date/participants;
- hủy trận trực tiếp.

Muốn chia lại đội, thay/bổ sung người hoặc hủy trận thì bắt buộc **Hủy kết quả trước**.

### CANCELLED

Match đã hủy vẫn **hiển thị trên UI** với trạng thái **Đã hủy**.

Trong phase đầu có thể tiếp tục dùng `matches.deletedAt != null` làm marker lifecycle thay vì thêm `matches.status`.

Khi hủy trận:

- soft-delete toàn bộ `member_charges` gắn với Match, gồm cả phạt từ result và các khoản thu thường;
- Match không còn ảnh hưởng công nợ/thống kê/phong độ;
- public lineup không còn hoạt động;
- Match vẫn xem được như lịch sử đã hủy;
- không cho thao tác nghiệp vụ mới.

---

## 7. State machine mục tiêu

~~~mermaid
stateDiagram-v2
    [*] --> OPEN: Tạo trận
    OPEN --> TEAM_DRAFT: Khóa Seed / tạo Draft

    TEAM_DRAFT --> OPEN: Sửa roster/ngày và xóa Draft
    TEAM_DRAFT --> TEAM_DRAFT: Seed / draw / chỉnh đội
    TEAM_DRAFT --> TEAM_CONFIRMED: Xác nhận đội hình

    TEAM_CONFIRMED --> TEAM_DRAFT: Tạo phiên bản mới
    TEAM_CONFIRMED --> RESULT_RECORDED: Ghi kết quả

    RESULT_RECORDED --> RESULT_RECORDED: Cập nhật kết quả
    RESULT_RECORDED --> TEAM_CONFIRMED: Hủy kết quả

    OPEN --> CANCELLED: Hủy trận
    TEAM_DRAFT --> CANCELLED: Hủy trận
    TEAM_CONFIRMED --> CANCELLED: Hủy trận
~~~

Các invariant bắt buộc:

~~~text
RESULT_RECORDED -X-> TEAM_DRAFT
RESULT_RECORDED -X-> Replace/Add player
RESULT_RECORDED -X-> CANCELLED
~~~

Muốn chia lại đội, thay/bổ sung cầu thủ hoặc hủy trận sau khi đã ghi result:

~~~text
RESULT_RECORDED
→ Hủy kết quả
→ TEAM_CONFIRMED
→ thực hiện thao tác tiếp theo
~~~

---

## 8. Ma trận hành động mục tiêu

| Action | OPEN | TEAM_DRAFT | TEAM_CONFIRMED | RESULT_RECORDED |
|---|---:|---:|---:|---:|
| Xem chi tiết | ✅ | ✅ | ✅ | ✅ |
| RSVP | ✅ | ❌ sau draw | ❌ | ❌ |
| Sửa note | ✅ | ✅ | ✅ | ✅ |
| Sửa ngày | ✅ | ⚠️ xóa Draft; sau draw chỉ Admin | ❌ | ❌ |
| Sửa participant | ✅ | ⚠️ xóa Draft; sau draw chỉ Admin | ❌ | ❌ |
| Sửa khoản thu thường | ✅ | ✅ | ✅ | ✅ metadata/charge an toàn |
| Chia đội | ✅ | ✅ | — | ❌ |
| Tạo Team Version mới | — | — | ✅ | ❌ |
| Thay/bổ sung cầu thủ | — | — | ✅ | ❌ |
| Ghi kết quả | — | — | ✅ | ✅ cập nhật |
| Hủy kết quả | — | — | — | ✅ |
| Hủy trận | ✅ | ✅ | ✅ có cảnh báo | ❌, phải hủy kết quả trước |
| Công khai lineup | — | tùy policy | ✅ | ✅ |

---

## 9. Lifecycle helper cần tạo

Đề xuất file:

~~~text
src/lib/match-lifecycle.ts
~~~

API khái niệm:

~~~ts
type MatchLifecycle =
  | "OPEN"
  | "TEAM_DRAFT"
  | "TEAM_CONFIRMED"
  | "RESULT_RECORDED"
  | "CANCELLED";

type MatchLifecycleContext = {
  lifecycle: MatchLifecycle;
  draftId: string | null;
  confirmedId: string | null;
  hasDraftDraw: boolean;
  hasResult: boolean;
};

getMatchLifecycle(matchId, clubId)
~~~

Không để page/action tự suy luận riêng.

Cách derive:

~~~text
if deletedAt:
    CANCELLED
else if confirmed version có result hợp lệ:
    RESULT_RECORDED
else if có DRAFT:
    TEAM_DRAFT
else if có CONFIRMED:
    TEAM_CONFIRMED
else:
    OPEN
~~~

Nên có pure capability helpers để dễ test:

~~~text
canEditRoster
canEditPlayedOn
canCreateTeamVersion
canReplaceOrAddPlayer
canRecordResult
canCancelResult
canCancelMatch
~~~

---

# 10. Kế hoạch sửa chữa

## Phase 0 — Chốt invariant trước khi code

Chốt các quy tắc:

1. Một Match tối đa một Draft và một Confirmed như hiện tại.
2. Result chỉ thuộc Confirmed Version hiện hành.
3. Result đã ghi thì không tạo Team Version mới.
4. Generic edit không thay participant/date sau Confirm.
5. TEAM_DRAFT chưa draw: sửa date/participants sẽ xóa Draft và quay về OPEN.
6. TEAM_DRAFT đã draw: chỉ Admin được sửa date/participants; thao tác này xóa Draft/draw và quay về OPEN.
7. Replace/Add chỉ được dùng ở TEAM_CONFIRMED; RESULT_RECORDED phải Hủy kết quả trước, kể cả Admin.
8. Hủy kết quả rollback result + result penalty nhưng giữ khoản thu thường và confirmed lineup.
9. Hủy trận chỉ thực hiện khi không còn Result; hủy toàn bộ khoản thu/phạt của Match nhưng Match vẫn hiển thị là Đã hủy.
10. Generic delete không được hủy Match đã có Result.
11. UI giữ các nút action nhưng disable những nút không hợp lệ theo lifecycle.
12. UI và server action dùng cùng lifecycle helper.

**Không sửa UI trước server guard.**

---

## Phase 1 — Tạo lifecycle helper

Tạo:

~~~text
src/lib/match-lifecycle.ts
~~~

Helper phải:

- query Match + Draft + Confirmed;
- detect Draft đã draw;
- detect result;
- trả lifecycle context;
- cung cấp capability helper nếu cần.

Test tối thiểu:

~~~text
không version                -> OPEN
DRAFT chưa draw              -> TEAM_DRAFT
DRAFT đã draw                -> TEAM_DRAFT + hasDraftDraw
CONFIRMED                    -> TEAM_CONFIRMED
CONFIRMED + result marker    -> RESULT_RECORDED
deletedAt                    -> CANCELLED
~~~

---

## Phase 2 — Vá server guard

Đây là phase quan trọng nhất.

### updateMatchAction

Trước transaction:

- load lifecycle;
- so sánh request với dữ liệu before;
- phân loại metadata/date/participants/charges;
- reject thay đổi structural không hợp lệ.

Bắt buộc:

~~~text
OPEN
→ sửa đầy đủ

TEAM_DRAFT chưa draw + đổi date/participants
→ cho phép
→ xóa Draft
→ lifecycle về OPEN

TEAM_DRAFT đã draw + đổi date/participants
→ chỉ Admin
→ xóa toàn bộ Draft/draw
→ lifecycle về OPEN

TEAM_CONFIRMED + đổi date/participants
→ reject

RESULT_RECORDED + đổi date/participants
→ reject
~~~

Ở TEAM_CONFIRMED/RESULT_RECORDED vẫn cho sửa note và các khoản thu thường nếu thao tác đó không đụng dữ liệu result.

### cancelMatchAction / deleteMatchAction

Đổi generic delete thành lifecycle-aware cancellation.

~~~text
OPEN / TEAM_DRAFT:
    cho Hủy trận

TEAM_CONFIRMED:
    cho Hủy trận với cảnh báo mạnh

RESULT_RECORDED:
    reject
    yêu cầu Admin Hủy kết quả trước
~~~

Khi Hủy trận:

- Match chuyển lifecycle sang CANCELLED nhưng vẫn hiển thị trên UI;
- soft-delete **toàn bộ member_charges gắn với Match**, gồm cả phạt và khoản thu thường;
- Match không còn ảnh hưởng công nợ/thống kê/phong độ;
- public lineup phải bị vô hiệu;
- ghi audit log và notification phù hợp.

Không hard-delete Match.

### Team actions

Thêm lifecycle guard vào:

~~~text
createMatchTeamVersionAction
saveAndLockMatchSeedsAction
unlockMatchSeedsAction
generateMatchTeamsAction
saveManualTeamsAction
confirmMatchTeamsAction
~~~

Quan trọng nhất:

~~~text
createMatchTeamVersionAction
→ reject khi RESULT_RECORDED
~~~

### recordMatchResultAction

Phải xác nhận:

- versionId là current confirmed version;
- lifecycle là TEAM_CONFIRMED hoặc RESULT_RECORDED;
- nếu đang RESULT_RECORDED thì update đúng version đang giữ result;
- cập nhật result phải thay thế đúng stats/penalty cũ, không cộng chồng.

### cancelMatchResultAction — mới

Chỉ cho ở RESULT_RECORDED và chỉ Admin được thực hiện.

Hủy kết quả phải:

~~~text
xóa/rollback member_match_stats của Match
soft-delete các khoản phạt sinh từ result
xóa placements / penaltyQuantities / resultChargeTypeId /
resultRecordedAt / resultRecordedBy khỏi Team Version metrics
giữ nguyên confirmed lineup
giữ nguyên participants
giữ nguyên các khoản thu thường của Match
ghi audit log
gửi Push đính chính "Kết quả trận đã được hủy"
lifecycle -> TEAM_CONFIRMED
~~~

Sau khi về TEAM_CONFIRMED mới enable lại:

- Tạo Team Version mới;
- Replace/Add player;
- Hủy trận.

**Không chỉ test qua UI; server phải tự chặn request trực tiếp.**

---

## Phase 3 — Sửa permission và label danh sách Match

File chính:

~~~text
src/app/(app)/matches/page.tsx
~~~

Tách rõ:

~~~text
canManageMatches
canManageTeams
canManageSeeds
canViewTeams
~~~

Không dùng biến canManage chung cho tất cả action.

Label mục tiêu:

~~~text
OPEN             -> Chia đội
TEAM_DRAFT       -> Tiếp tục chia đội
TEAM_CONFIRMED   -> Xem / chỉnh đội
RESULT_RECORDED  -> Xem đội hình
CANCELLED        -> Đã hủy
~~~

Theo quyết định nghiệp vụ, các action chính vẫn được **hiển thị** để người dùng hiểu trạng thái, nhưng những action không hợp lệ phải ở trạng thái disabled và có giải thích/tooltip phù hợp.

Ví dụ ở RESULT_RECORDED:

~~~text
[Bình chọn disabled]
[Xem đội hình]
[Xem]
[Sửa giới hạn]
[Hủy trận disabled]
~~~

Trong trang chi tiết phải có:

~~~text
[Cập nhật kết quả]
[Hủy kết quả]
~~~

---

## Phase 4 — Sửa form Edit Match

Hiện MatchFields có lockParticipants nhưng đang khóa theo generated Draft.

Cần tách capability rõ hơn, ví dụ:

~~~ts
lockPlayedOn
lockParticipants
allowChargeEdit
~~~

UI phải giải thích:

~~~text
Đội hình đã xác nhận.
Ngày thi đấu và danh sách người tham gia không thể sửa tại đây.
Dùng Chi tiết trận để thay/bổ sung cầu thủ.
~~~

Sau RESULT_RECORDED:

~~~text
Kết quả đã được ghi nhận.
Chỉ có thể sửa thông tin không ảnh hưởng lịch sử trận.
~~~

---

## Phase 5 — Chuẩn hóa Team Version UX

Trong:

~~~text
src/app/(app)/matches/[id]/teams/page.tsx
~~~

Giữ flow:

~~~text
Seed
→ Draft
→ Draw
→ Manual adjust
→ Confirm
~~~

Nhưng:

- chỉ hiện **Tạo phiên bản mới** ở TEAM_CONFIRMED;
- không hiện ở RESULT_RECORDED;
- quyền tạo version phải phù hợp MATCH_TEAMS_MANAGE;
- MATCH_SEED_MANAGE vẫn kiểm soát bước Seed;
- không hiển thị thông điệp "thay đổi tiếp theo sẽ tạo phiên bản mới" khi result đã có.

---

## Phase 6 — Hủy kết quả và Hủy trận

Tách thành **hai nghiệp vụ khác nhau**.

### 6.1. Hủy kết quả

Chỉ thực hiện ở RESULT_RECORDED.

Hủy kết quả:

- rollback `member_match_stats` của Match;
- soft-delete **chỉ các khoản phạt do result sinh ra**;
- xóa result fields khỏi Team Version metrics;
- giữ confirmed lineup;
- giữ participants;
- giữ các khoản thu thường của Match;
- ghi audit log;
- gửi Push đính chính rằng kết quả đã bị hủy;
- lifecycle trở lại TEAM_CONFIRMED.

Sau đó mới enable lại Tạo Version mới, Replace/Add và Hủy trận.

### 6.2. Hủy trận

Đổi wording UI:

~~~text
Xóa
→ Hủy trận
~~~

Hủy trận không có nghĩa Match biến mất.

Khi Hủy trận:

- Match chuyển CANCELLED / **Đã hủy** và vẫn hiển thị trên danh sách;
- soft-delete **toàn bộ member_charges gắn với Match**, cả phạt và khoản thu thường;
- public lineup bị vô hiệu;
- Match không còn ảnh hưởng thống kê/phong độ/công nợ;
- ghi audit log;
- gửi notification hủy trận theo policy hiện tại.

Nếu Match đang RESULT_RECORDED thì nút Hủy trận phải disabled. Admin bắt buộc:

~~~text
Hủy kết quả
→ TEAM_CONFIRMED
→ Hủy trận
~~~

Không hard-delete Match và không cho bypass chuỗi này kể cả Admin.

---

## Phase 7 — Regression test toàn flow

### Case A — Match mới

~~~text
Tạo
→ RSVP
→ sửa participant/date
→ OK
~~~

### Case B — Draft chưa draw

~~~text
Tạo Draft
→ sửa participant/date
→ Draft bị invalidate/rebuild đúng policy
~~~

### Case C — Draft đã draw

~~~text
draw
→ RSVP khóa
→ non-Admin không được sửa roster/date
→ Admin sửa roster/date được sau xác nhận cảnh báo
→ nếu Admin sửa thì Draft/draw bị xóa và lifecycle về OPEN
→ manual team edit vẫn hoạt động nếu không sửa structural data
~~~

### Case D — Confirmed chưa result

~~~text
Confirm v1
→ generic participant/date edit bị chặn
→ Replace/Add hoạt động
→ có thể tạo v2
~~~

### Case E — Tạo version mới trước result

~~~text
Confirm v1
→ create v2
→ confirm v2
→ v1 SUPERSEDED
→ v2 CONFIRMED
→ result ghi trên v2
~~~

### Case F — Result recorded

~~~text
Confirm v1
→ record result
→ create version mới bị chặn
→ generic participant/date edit bị chặn
→ Replace/Add bị chặn kể cả Admin
→ update result vẫn được
→ Hủy trận bị disabled
~~~

### Case G — Hủy kết quả

~~~text
RESULT_RECORDED
→ Hủy kết quả
→ member_match_stats của result được rollback
→ penalty sinh từ result được soft-delete
→ khoản thu thường vẫn giữ
→ confirmed lineup vẫn giữ
→ Push đính chính được gửi
→ lifecycle = TEAM_CONFIRMED
→ Replace/Add / create version / Hủy trận được enable lại
~~~

### Case H — Hủy trận

~~~text
OPEN            -> Hủy được
TEAM_DRAFT      -> Hủy được
TEAM_CONFIRMED  -> Hủy được với cảnh báo
RESULT_RECORDED -> Hủy disabled, phải Hủy kết quả trước
CANCELLED       -> vẫn hiện trên UI với badge Đã hủy
~~~

Sau Hủy trận:

~~~text
mọi member_charges gắn Match -> soft-delete
Match -> vẫn tồn tại
stats/công nợ/phong độ -> không còn chịu ảnh hưởng Match
~~~

### Case I — Permission

Test riêng:

~~~text
MATCHES_MANAGE only
MATCH_TEAMS_MANAGE only
MATCH_SEED_MANAGE only
VIEW only
ADMIN
ORGANIZER
TREASURER
MEMBER
~~~

UI label và server authorization phải khớp.

---

## Phase 8 — Audit production data trước deploy

Trước deploy, kiểm tra các Match có dấu hiệu lệch dữ liệu:

1. SUPERSEDED version có result nhưng current CONFIRMED không có result.
2. member_match_stats.teamVersionId không phải current confirmed version.
3. Có result nhưng không có current confirmed version.
4. Participant hiện tại khác snapshot member của confirmed lineup.
5. member_match_stats.playedOn khác matches.playedOn.
6. Match soft-delete nhưng còn active charges.
7. Nhiều version cùng chứa result-like metrics.

**Không tự động repair production trước khi có báo cáo.**

Nếu có dữ liệu lệch, tạo script repair riêng và backup trước.

---

## 11. Permission mục tiêu

### MATCHES_MANAGE

- tạo Match;
- sửa metadata/roster khi lifecycle cho phép;
- hủy Match trước khi hoàn tất.

### MATCH_SEED_MANAGE

- đánh giá Seed;
- khóa/mở khóa Seed theo policy.

### MATCH_TEAMS_MANAGE

- tạo Team Version;
- generate teams;
- chỉnh Team;
- confirm Team;
- Replace/Add ở TEAM_CONFIRMED;
- ghi/cập nhật result;
- ghi/cập nhật result theo permission; Hủy kết quả là Admin-only rollback.

Không dùng MATCHES_MANAGE để quyết định label **Tạo đội**.

Lưu ý:

- RESULT_RECORDED không cho Replace/Add kể cả tài khoản có MATCH_TEAMS_MANAGE.
- Hủy trận sau khi từng có result chỉ được thực hiện theo chuỗi **Admin Hủy kết quả → TEAM_CONFIRMED → Hủy trận**.

---

## 12. Result data: hướng ngắn hạn và dài hạn

### Ngắn hạn

Giữ result trong match_team_versions.metrics nhưng áp invariant:

~~~text
Team Version đã có Result phải là version cuối cùng.
Không được supersede bằng version mới.
~~~

Đây là thay đổi ít rủi ro nhất.

### Dài hạn

Result là business data, không phải analytics metric. Về sau nên tách:

~~~text
match_results
match_result_teams
~~~

~~~mermaid
erDiagram
    MATCH ||--o{ TEAM_VERSION : has
    MATCH ||--o| MATCH_RESULT : has
    TEAM_VERSION ||--o| MATCH_RESULT : used_for
    MATCH_RESULT ||--o{ MATCH_RESULT_TEAM : contains
    TEAM ||--o{ MATCH_RESULT_TEAM : result
~~~

Không đưa schema redesign này vào đợt sửa gấp.

---

## 13. File dự kiến cần review/sửa

### Core lifecycle

~~~text
src/lib/match-lifecycle.ts                 # mới
~~~

### Match list / generic edit

~~~text
src/app/(app)/matches/page.tsx
src/app/(app)/mutations.ts
src/components/match-fields.tsx
~~~

### RSVP

~~~text
src/app/(app)/matches/actions.ts
~~~

RSVP hiện có rule gần mục tiêu; nên refactor dùng lifecycle helper để tránh duplicate.

### Team Builder

~~~text
src/app/(app)/matches/[id]/teams/page.tsx
src/app/(app)/matches/[id]/teams/actions.ts
~~~

### Match detail / result / hậu kỳ

~~~text
src/app/(app)/matches/[id]/page.tsx
src/app/(app)/matches/[id]/actions.ts
src/components/match-detail-view.tsx
src/components/match-member-replacement.tsx
src/components/match-late-member-addition.tsx
~~~

### Permission / docs

~~~text
src/lib/constants.ts
scripts/seed.ts
documents/11-chia-doi-random-va-seed-thanh-vien.md
documents/16-vong-doi-tran-dau-va-ke-hoach-sua-luong.md
~~~

Đây là checklist review; không nhất thiết mọi file đều phải thay đổi.

---

## 14. Không làm trong đợt sửa đầu

Để giới hạn rủi ro, chưa làm đồng thời:

- đổi thuật toán cân bằng đội;
- đổi công thức form score;
- đổi Seed Tier;
- thêm tỷ số;
- tạo bảng result mới ngay;
- hard-delete lịch sử;
- redesign toàn bộ Match UI;
- thay permission model toàn hệ thống.

Đợt đầu chỉ tập trung:

~~~text
Lifecycle
+ server guard
+ permission correctness
+ UI action correctness
+ data consistency
~~~

---

## 15. Tiêu chí hoàn thành

1. Mỗi Match derive được đúng một lifecycle.
2. UI và server action dùng chung lifecycle rule.
3. TEAM_CONFIRMED/RESULT_RECORDED không cho generic edit participant/date.
4. TEAM_DRAFT chưa draw sửa structural data sẽ xóa Draft và về OPEN.
5. TEAM_DRAFT đã draw chỉ Admin được sửa structural data; nếu sửa phải xóa Draft/draw và về OPEN.
6. Có Result rồi thì không tạo Team Version mới.
7. RESULT_RECORDED không cho Replace/Add kể cả Admin.
8. Hủy kết quả rollback member_match_stats và penalty do result sinh ra, nhưng giữ khoản thu thường.
9. Sau Hủy kết quả lifecycle về TEAM_CONFIRMED và mới enable create version / Replace/Add / Hủy trận.
10. Hủy kết quả gửi Push đính chính.
11. Hủy trận soft-delete toàn bộ member_charges của Match.
12. Match đã hủy vẫn hiển thị với trạng thái Đã hủy.
13. Match đang RESULT_RECORDED không thể Hủy trận trực tiếp.
14. Result UI, member_match_stats và penalty phản ánh cùng một business state.
15. Nút Team dùng đúng MATCH_TEAMS_MANAGE.
16. Label/action phản ánh OPEN/DRAFT/CONFIRMED/RESULT/CANCELLED và action không hợp lệ được disabled.
17. RSVP không bị bypass bằng generic roster edit.
18. Update Result vẫn thay đúng penalty/stat cũ.
19. Public lineup vẫn dùng confirmed version đúng và bị vô hiệu khi Match bị hủy.
20. Audit log ghi các thay đổi quan trọng.
21. Không regression báo cáo công nợ/phong độ.
22. Lint, build và lifecycle tests đều pass.

---

## 16. Thứ tự triển khai

~~~mermaid
flowchart TD
    A[Phase 0: Chốt invariant] --> B[Phase 1: Lifecycle helper]
    B --> C[Phase 2: Server guards]
    C --> D[Phase 3: Permission + labels]
    D --> E[Phase 4: Edit form]
    E --> F[Phase 5: Team Version UX]
    F --> G[Phase 6: Hủy kết quả / Hủy trận]
    G --> H[Phase 7: Regression tests]
    H --> I[Phase 8: Audit production data]
    I --> J[Deploy]
~~~

**Không đảo Phase 2 và Phase 3.** Server guard phải sửa trước UI để tránh trường hợp chỉ ẩn nút nhưng action vẫn gọi trực tiếp được.

---

## 17. Quy tắc khi bắt đầu implementation

Trước mỗi phase:

1. kiểm tra git status;
2. đọc lại source hiện tại;
3. không đổi migration/schema nếu phase không yêu cầu;
4. chạy test/lint/build sau từng nhóm;
5. chạy git diff --check;
6. cập nhật tài liệu này nếu rule thay đổi.

Nên commit từng phase riêng để dễ rollback.

Gợi ý commit:

~~~text
refactor: centralize match lifecycle rules
fix: guard match edits by lifecycle
fix: align match team permissions and actions
fix: prevent team versions after recorded result
refactor: make match cancellation lifecycle-aware
test: cover match lifecycle transitions
docs: document match lifecycle and repair plan
~~~

---

## 18. Kết luận

Source hiện tại đã có phần lớn các khối cần thiết: RSVP, Team Version, Seed, Team Draw, Result, Penalties, Stats, Late Replacement/Addition và Audit Logs.

Không cần viết lại module Matches.

Phần cần sửa là **quy tắc điều phối giữa các khối**:

~~~text
Match lifecycle là nguồn sự thật
→ UI hỏi lifecycle để hiển thị action
→ server action hỏi lifecycle để cho/chặn thao tác
→ Team Version không thể phá Result
→ generic edit không thể phá Confirmed lineup
→ hậu kỳ đi qua action chuyên biệt
~~~

Đây là nền tảng cần hoàn thiện trước khi tiếp tục thêm tính năng mới cho menu Matches.
