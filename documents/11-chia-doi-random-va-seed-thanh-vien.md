# Chia đội random, seed và phong độ thành viên

**Trạng thái:** Nghiệp vụ nền đã xác nhận ngày 06/08/2026  
**Phạm vi:** Mở rộng module Trận đấu; tài liệu thiết kế trước khi triển khai

## 1. Mục tiêu

- Đánh giá lại seed của từng người tham gia theo Tier 1–4 hoặc Thủ môn ở mỗi trận.
- Chia từ 2 đội trở lên từ danh sách người tham gia trận.
- Mỗi đội có ít nhất 5 người, quân số và thủ môn được phân bổ đều.
- Cân bằng đồng thời trình độ và phong độ gần đây nhưng vẫn giữ tính ngẫu nhiên.
- Cho Admin chỉnh đội hình nháp rồi xác nhận bản cuối.
- Lưu phiên bản đã xác nhận để có lịch sử và tracking khi đội hình thay đổi.

Tính năng không yêu cầu quản lý hai đội thi đấu cố định, tỷ số hay diễn biến trận. Đội hình chỉ thuộc về từng trận.

## 2. Khái niệm

### 2.1. Seed tier

Mỗi người tham gia có đúng một seed trong phạm vi **một trận**:

| Seed | Ý nghĩa | Trọng số đề xuất |
|---|---|---:|
| Tier 1 | Nhóm mạnh nhất | 4 |
| Tier 2 | Nhóm khá | 3 |
| Tier 3 | Nhóm trung bình | 2 |
| Tier 4 | Nhóm còn lại | 1 |
| Thủ môn | Vị trí đặc biệt | Không cộng vào điểm cầu thủ sân |

Tier càng nhỏ thì trình độ càng cao. Thủ môn là một tier riêng và được cân bằng theo **số lượng thủ môn**, không dùng chung thang điểm Tier 1–4. Nếu sau này cần đánh giá trình độ thủ môn, phải bổ sung một thuộc tính riêng thay vì đổi ý nghĩa của tier Thủ môn.

Seed không được lưu như thuộc tính cố định của hồ sơ thành viên. Khi tạo trận mới, Admin phải đánh giá lại seed cho danh sách tham gia của chính trận đó. Seed của trận gần nhất có thể hiển thị ở một cột tham khảo, nhưng không được tự động điền hoặc tự động xác nhận cho trận mới.

Thành viên được xem seed của nhau theo từng trận. Chỉ Admin hoặc tài khoản có policy quản lý seed trận được thay đổi seed.

### 2.2. Random key

Mỗi lần hệ thống sinh đội hình có một `random_key`. Cùng dữ liệu đầu vào và cùng key phải cho cùng kết quả để có thể kiểm tra lại. `random_key` không phải seed trình độ của thành viên.

### 2.3. Khoản thu phạt thua

Loại thu bổ sung cờ:

```text
Tính là phạt thua khi chia đội: Có/Không
```

Tên kỹ thuật đề xuất là `is_loss_penalty`, thay vì `is_penalty`, vì các khoản phạt khác như đi trễ không phản ánh kết quả trận.

Một thành viên được suy luận là thua một trận khi có ít nhất một khoản phải thu của trận đó, thuộc loại thu được đánh dấu `is_loss_penalty`. Nhiều dòng hoặc số lượng lớn hơn 1 trong cùng trận vẫn chỉ tính là **một trận thua**.

Không dùng lịch sử nộp tiền để suy luận thắng/thua vì tiền nộp không được phân bổ vào từng khoản phải thu. Cũng không dùng số tiền phạt làm trọng số chính vì đơn giá có thể thay đổi theo thời gian.

### 2.4. Thắng/thua suy luận

Nếu club bảo đảm mọi người thuộc đội thua đều luôn phát sinh khoản phạt thua, có thể suy luận:

```text
Số trận thua = số trận tham gia có khoản phạt thua
Số trận thắng = số trận tham gia đã hoàn tất không có khoản phạt thua
Tỷ lệ thua = số trận thua / số trận tham gia hợp lệ
```

Một trận chỉ được xem là đã hoàn tất cho thống kê khi đã lưu thứ hạng đội hoặc có ít nhất một khoản phạt thua. Trận chưa nhập kết quả không được mặc định là thắng.

Nếu quy tắc phạt không được nhập đầy đủ, “không có khoản phạt” chỉ có nghĩa là **không bị ghi nhận phạt**, chưa chắc là thắng. UI và báo cáo phải ghi rõ đây là dữ liệu suy luận.

## 3. Điều kiện trước khi chia đội

Hệ thống chỉ cho bấm **Tạo đội** khi đồng thời thỏa mãn:

1. Trận đã được tạo và có danh sách người tham gia.
2. Số đội do người thao tác nhập là số nguyên và lớn hơn hoặc bằng 2.
3. `số người tham gia >= số đội × 5`.
4. Tất cả người tham gia đều đã có seed.
5. Tier đã được lưu và khóa cho phiên bản đội hình đang chuẩn bị.

Nếu thiếu seed, hệ thống không tự gán Tier 3. UI hiển thị danh sách cụ thể những người còn thiếu và đưa con trỏ đến ô seed đầu tiên cần nhập.

Quân số các đội phải chênh nhau không quá 1. Số thủ môn giữa hai đội bất kỳ cũng phải chênh nhau không quá 1.

Nếu số thủ môn ít hơn số đội, hệ thống vẫn có thể chia đều theo nghĩa chênh lệch không quá 1, nhưng phải cảnh báo rằng có đội không có thủ môn. Nếu nghiệp vụ thực tế yêu cầu mỗi đội bắt buộc có một thủ môn thì quy tắc này cần được nâng thành điều kiện chặn.

## 4. Workflow giao diện

### 4.1. Từ danh sách trận

Mỗi trận có các thao tác:

```text
Xem | Sửa | Xóa | Tạo đội
```

`Tạo đội` điều hướng đến trang riêng, đề xuất route `/matches/[matchId]/teams`. Không dùng popup vì màn hình có nhiều bước, bảng thống kê và thao tác kéo/thả.

### 4.2. Bước 1 — Kiểm tra người tham gia và nhập seed

Trang tạo đội tải toàn bộ người đã được check tham gia trận và hiển thị:

| Thành viên | Seed | Trận gần đây | Thua suy luận | Thắng suy luận | Tỷ lệ thua |
|---|---|---:|---:|---:|---:|

- Seed có thể nhập nhanh ngay trong bảng.
- Seed được lưu trên bản ghi người tham gia của trận hiện tại, không ghi vào hồ sơ thành viên.
- Có thể hiển thị seed của trận gần nhất chỉ để Admin tham khảo khi đánh giá lại.
- Người thiếu seed được tô cảnh báo.
- Thành viên không thuộc danh sách tham gia không xuất hiện trong trình tạo đội.

### 4.3. Bước 2 — Lưu và khóa tier

Admin bấm **Lưu và khóa tier**. Hệ thống lưu seed trên từng người tham gia trận và chụp snapshot vào phiên bản đội hình hiện tại.

- Khi đang khóa, dropdown seed chuyển sang chỉ đọc.
- Muốn sửa phải bấm **Mở khóa tier**; thao tác này xóa đội hình nháp đã sinh vì đầu vào đã thay đổi.
- Seed của trận khác hoặc việc đánh giá lại sau này không làm đổi đội hình lịch sử.

### 4.4. Bước 3 — Cấu hình

Admin nhập:

- số đội, tối thiểu 2;
- cửa sổ phong độ, mặc định 10 trận tham gia gần nhất;
- tên hoặc màu đội nếu cần.

UI hiển thị ngay quân số dự kiến từng đội và cảnh báo số thủ môn.

### 4.5. Bước 4 — Tạo đội

Sau khi hợp lệ, Admin bấm **Tạo đội**. Hệ thống sinh một đội hình nháp cân bằng.

Các lần bấm **Chia lại** trước khi xác nhận chỉ thay thế bản nháp hiện tại; không lưu mọi kết quả random vào cơ sở dữ liệu. Activity log có thể ghi số lần thao tác nhưng không cần lưu thành viên của từng lần thử.

### 4.6. Bước 5 — Kiểm tra và chỉnh thủ công

Mỗi đội hiển thị:

- danh sách thành viên và seed;
- số người;
- số thủ môn;
- tổng điểm cầu thủ sân;
- số lượng từng Tier 1–4;
- tổng hoặc trung bình tỷ lệ thua gần đây.

Admin được kéo/thả người giữa các đội. Sau mỗi thay đổi, hệ thống tính lại các chỉ số và cảnh báo nếu vi phạm quân số hoặc phân bổ thủ môn. Có thể khóa một người tại đội hiện tại trước khi bấm chia lại.

### 4.7. Bước 6 — Xác nhận

Chỉ cho **Xác nhận đội hình** khi các ràng buộc cứng đều hợp lệ. Phiên bản xác nhận là đội hình được thành viên nhìn thấy mặc định.

Sau xác nhận, không sửa trực tiếp phiên bản đó. Admin bấm **Tạo phiên bản mới**, hệ thống sao chép đội hình hiện hành thành một bản nháp mới. Khi phiên bản mới được xác nhận, phiên bản cũ chuyển thành `SUPERSEDED` nhưng vẫn giữ để audit.

Quy ước này đáp ứng đồng thời:

- “chỉ lưu bản cuối”: không lưu các lần random nháp;
- “thay đổi tạo phiên bản mới”: giữ các bản đã từng được xác nhận.

## 5. Thuật toán chia đội

### 5.1. Ràng buộc cứng

- Mọi người tham gia có seed.
- Số đội từ 2 trở lên.
- Mỗi đội có ít nhất 5 người.
- Chênh lệch quân số tối đa 1.
- Chênh lệch số thủ môn tối đa 1.
- Một người chỉ thuộc một đội trong một phiên bản.
- Người bị khóa đội không được thuật toán chuyển sang đội khác.

Không có phương án thỏa ràng buộc cứng thì phải dừng và thông báo nguyên nhân, không sinh đội hình sai rồi yêu cầu Admin tự phát hiện.

### 5.2. Mục tiêu mềm

Trong các phương án hợp lệ, hệ thống tối thiểu hóa hàm chi phí khái niệm:

```text
cost = W_skill × chênh_lệch_điểm_kỹ_năng
     + W_tier  × chênh_lệch_phân_bổ_từng_tier
     + W_loss  × chênh_lệch_gánh_nặng_thua_gần_đây
```

Không cố xếp tất cả người từng thua nhiều vào cùng đội. Chỉ số thua nên dùng tỷ lệ trong **10 trận tham gia gần nhất** thay vì tổng thua trọn đời, tránh bất lợi cho người đã tham gia club lâu hơn.

Trọng số `W_skill`, `W_tier`, `W_loss` là cấu hình kỹ thuật ban đầu. Chưa mở UI cho Admin chỉnh để tránh cấu hình khó hiểu; có thể bổ sung sau khi có dữ liệu thực tế.

### 5.3. Các bước thực thi đề xuất

1. Sinh `random_key` và xáo người trong các nhóm tương đương.
2. Phân bổ thủ môn vòng tròn vào các đội có ít thủ môn nhất.
3. Nhóm cầu thủ sân theo Tier 1–4 và xáo trong từng tier.
4. Phân bổ kiểu snake draft, ưu tiên đội đang có điểm kỹ năng và gánh nặng thua thấp hơn.
5. Thử hoán đổi cặp người giữa các đội bằng local search/hill climbing.
6. Chỉ nhận phép đổi làm giảm `cost` và không phá ràng buộc cứng.
7. Dừng khi không còn cải thiện hoặc đạt giới hạn vòng lặp.

Đây là bài toán nhiều mục tiêu: quân số, kỹ năng, tier, thủ môn và lịch sử thua có thể cạnh tranh nhau. Vì vậy UI nên hiển thị các chỉ số cân bằng, không tuyên bố kết quả là “công bằng tuyệt đối”.

## 6. Báo cáo phong độ phục vụ chia đội

### 6.1. Phạm vi dữ liệu

Mặc định lấy 10 trận gần nhất mà thành viên có tham gia và trận đã qua ngày thi đấu. Không tính trận tương lai, trận bị xóa hoặc người đã bị bỏ khỏi danh sách tham gia.

Một khoản phạt thua chỉ được tính khi:

- `MemberCharge.match_id` trỏ đến trận;
- loại thu có `is_loss_penalty = true`;
- khoản phải thu không bị xóa hoặc hủy.

### 6.2. Chỉ số

- Tổng số trận tham gia trong kỳ nhìn lại.
- Số trận thua suy luận.
- Số trận thắng suy luận hoặc số trận không bị phạt.
- Tỷ lệ thua suy luận.
- Tổng số lần phạt và tổng tiền phạt để tham khảo, không dùng trực tiếp làm điểm chia đội.

### 6.3. Quy tắc dữ liệu thiếu

- Người chưa có trận lịch sử: tỷ lệ thua trung tính, không xem là thắng hoặc thua.
- Trận có khoản phạt nhưng không gắn `match_id`: không dùng suy luận kết quả.
- Loại thu được bật cờ phạt sau này: cần quyết định có áp dụng hồi tố hay chỉ các khoản phát sinh mới. Khuyến nghị dùng snapshot cờ trên `MemberCharge` để lịch sử không đổi.

### 6.4. Giới hạn cần hiển thị

Báo cáo phải ghi nhãn **Phong độ suy luận từ khoản phạt thua**. Để bảo đảm khoản phạt được nhập đồng bộ, Admin có thể nhập thứ hạng cho từng đội trên phiên bản đội hình đã xác nhận. Nhiều đội được phép đồng hạng khi không tranh hạng; các đội đồng hạng nhận cùng mức phạt. Hệ thống tự tạo `hạng - 1` lần phạt cho mỗi thành viên của các đội không đứng hạng 1; không cần nhập tỷ số.

## 7. Mô hình dữ liệu đề xuất

### 7.1. Bổ sung `match_participants`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| seed_tier | enum | NULL, TIER_1, TIER_2, TIER_3, TIER_4, GOALKEEPER |
| seed_evaluated_at | timestamptz | thời điểm đánh giá seed cho trận |
| seed_evaluated_by | uuid | người đánh giá seed cho trận |

Không thêm `seed_tier` vào `members`. Muốn xem lịch sử seed của một thành viên thì truy vấn các `match_participants` theo thời gian.

### 7.2. Bổ sung `charge_types`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| is_loss_penalty | boolean | loại thu được dùng suy luận trận thua, mặc định false |

Để bảo toàn lịch sử, `member_charges` nên lưu thêm `is_loss_penalty_snapshot` tại thời điểm phát sinh.

### 7.3. `match_team_versions`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| id | uuid | PK |
| match_id | uuid | FK matches |
| version | integer | phiên bản đã xác nhận thứ mấy |
| status | enum | DRAFT, CONFIRMED, SUPERSEDED |
| random_key | varchar(100) | tái hiện lần sinh hiện tại |
| team_count | smallint | số đội, >= 2 |
| lookback_matches | smallint | mặc định 10 |
| tier_locked_at | timestamptz | thời điểm khóa seed |
| tier_locked_by | uuid | người khóa seed |
| metrics | jsonb | snapshot chỉ số cân bằng |
| created_by | uuid | người tạo |
| created_at | timestamptz | thời điểm tạo |
| confirmed_at | timestamptz | thời điểm xác nhận |

Mỗi trận có tối đa một `DRAFT` và một `CONFIRMED` hiện hành. Các bản xác nhận cũ mang trạng thái `SUPERSEDED`.

### 7.4. `match_teams`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| id | uuid | PK |
| version_id | uuid | FK match_team_versions |
| team_index | smallint | thứ tự đội |
| name | varchar(80) | Đội A, Đội B... |
| color | varchar(20) | màu nhận diện |
| member_count | smallint | snapshot quân số |
| goalkeeper_count | smallint | snapshot số thủ môn |
| outfield_skill_score | integer | snapshot điểm cầu thủ sân |
| recent_loss_score | numeric | snapshot gánh nặng thua |

### 7.5. `match_team_members`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| id | uuid | PK |
| team_id | uuid | FK match_teams |
| version_id | uuid | FK match_team_versions, phục vụ ràng buộc duy nhất |
| participant_id | uuid | FK match_participants |
| seed_tier_snapshot | enum | seed lúc khóa tier |
| recent_match_count_snapshot | smallint | số trận trong cửa sổ |
| recent_loss_count_snapshot | smallint | số trận thua suy luận |
| recent_loss_rate_snapshot | numeric | tỷ lệ thua suy luận |
| is_locked | boolean | khóa đội khi chia lại |
| display_order | integer | thứ tự hiển thị |

## 8. Ràng buộc dữ liệu

- `(match_id, version)` là duy nhất.
- `(version_id, team_index)` là duy nhất.
- Một `participant_id` chỉ xuất hiện một lần trong một version.
- Seed chỉ nhận một trong 5 giá trị đã định nghĩa.
- `team_count >= 2`, `lookback_matches > 0`.
- Không xác nhận nếu bất kỳ đội nào dưới 5 người.
- Không xác nhận nếu chênh lệch quân số hoặc thủ môn lớn hơn 1.
- Xóa mềm trận làm ẩn đội hình nhưng không xóa audit/version.
- Chia đội không tự tạo, sửa hoặc xóa khoản thu tài chính.

## 9. Quyền và tracking

Các policy mới:

```text
match_seed.view
match_seed.manage
match_teams.view
match_teams.manage
match_form_report.view
```

Mặc định:

| Quyền | Admin | Thủ quỹ | Thành viên |
|---|---:|---:|---:|
| Xem seed | Có | Có | Có |
| Sửa seed | Có | Theo policy | Không |
| Xem đội hình xác nhận | Có | Có | Có |
| Tạo/chỉnh/xác nhận đội | Có | Theo policy | Không |
| Xem phong độ suy luận | Có | Có | Theo policy |

Activity log tối thiểu ghi: đánh giá/thay đổi seed của trận, khóa/mở khóa tier, tạo bản nháp, chia lại, di chuyển thủ công, xác nhận và tạo phiên bản mới.

## 10. Tình huống biên

- 9 người, 2 đội: chặn vì không đủ tối thiểu 5 người/đội.
- 16 người, 3 đội: hợp lệ với quân số 6–5–5.
- 2 thủ môn, 3 đội: chia 1–1–0 và cảnh báo một đội thiếu thủ môn.
- 4 thủ môn, 3 đội: chia 2–1–1.
- Có người thiếu seed: chặn và liệt kê đúng người cần nhập.
- Tất cả cầu thủ sân cùng tier: cân bằng theo quân số và phong độ, random quyết định giữa các phương án tương đương.
- Người chưa có lịch sử: dùng mức phong độ trung tính.
- Xóa người tham gia sau khi đã có nháp: làm nháp mất hiệu lực và yêu cầu sinh lại.
- Thay đổi danh sách tham gia sau xác nhận: bắt buộc tạo phiên bản mới.

## 11. Tiêu chí nghiệm thu chính

1. Không thể chia đội khi thiếu seed, số đội dưới 2 hoặc có đội dự kiến dưới 5 người.
2. Thủ môn luôn được phân bổ với chênh lệch không quá 1.
3. Mọi thành viên tham gia xuất hiện đúng một lần trong kết quả.
4. Cùng đầu vào và `random_key` tái hiện cùng đội hình.
5. Bấm chia lại trước xác nhận không tạo lịch sử đội hình rác.
6. Sau xác nhận, thay đổi chỉ được thực hiện qua phiên bản mới.
7. Seed được đánh giá riêng cho từng trận và snapshot của phiên bản cũ không thay đổi khi trận khác được đánh giá lại.
8. Khoản phạt thua được đếm theo trận, không theo số tiền đã nộp.
9. Thành viên được xem seed của nhau và đội hình đã xác nhận theo policy.
10. Kết quả vẫn cho phép Admin chỉnh thủ công nhưng không được xác nhận khi vi phạm ràng buộc cứng.

## 12. Cơ sở thiết kế thuật toán

Bài toán lập đội công bằng với nhiều tiêu chí là bài toán tối ưu tổ hợp, thường cần cân bằng nhiều mục tiêu và dùng heuristic thay vì kỳ vọng một phép chia đơn giản luôn cho nghiệm tối ưu. Thiết kế trên áp dụng random có kiểm soát, phân bổ ban đầu và local search theo hướng đó:

- [Fair Team Formation: a Multi-Objective Optimization Approach](https://arxiv.org/abs/2011.11611)
- [Fair Team Formation in Multiple Task-oriented Groups](https://arxiv.org/abs/2002.11621)

Các nguồn chỉ định hướng phương pháp tối ưu. Quy tắc tier, thủ môn, tối thiểu 5 người và suy luận phạt thua là nghiệp vụ riêng của FCFUND.
