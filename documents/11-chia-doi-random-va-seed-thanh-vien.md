# Chia đội random, seed và phong độ thành viên

**Trạng thái:** Cập nhật Tier 1–7 và vai trò thủ môn ngày 17/08/2026
**Phạm vi:** Mở rộng module Trận đấu; tài liệu thiết kế trước khi triển khai

## 1. Mục tiêu

- Đánh giá lại seed của từng người tham gia theo Tier 1–7 ở mỗi trận; khả năng bắt gôn được đánh dấu riêng.
- Chia từ 2 đội trở lên từ danh sách người tham gia trận.
- Cho phép chia đội khi có ít nhất 10 người; đội thiếu người được cảnh báo nhưng không bị chặn.
- Quân số và thủ môn được phân bổ đều, chênh lệch giữa các đội không quá 1.
- Cân bằng đồng thời trình độ và phong độ gần đây nhưng vẫn giữ tính ngẫu nhiên.
- Cho Admin chỉnh đội hình nháp rồi xác nhận bản cuối.
- Lưu phiên bản đã xác nhận để có lịch sử và tracking khi đội hình thay đổi.

Tính năng không yêu cầu quản lý hai đội thi đấu cố định, tỷ số hay diễn biến trận. Đội hình chỉ thuộc về từng trận.

## 2. Khái niệm

### 2.1. Seed tier

Mỗi người tham gia có đúng một seed trong phạm vi **một trận**:

| Seed | Ý nghĩa | Trọng số đề xuất |
|---|---|---:|
| Tier 1 | Mạnh nhất | 7 |
| Tier 2 | | 6 |
| Tier 3 | | 5 |
| Tier 4 | Trung tâm thang đánh giá | 4 |
| Tier 5 | | 3 |
| Tier 6 | | 2 |
| Tier 7 | Thấp nhất | 1 |

Tier càng nhỏ thì trình độ tổng quát càng cao, bao gồm năng lực ở các vị trí người đó có thể chơi. Thủ môn không còn là một Tier: người được chọn bắt gôn vẫn có Tier 1–7, nhưng đóng góp của Tier và Điểm phong độ vào điểm cân bằng đội chỉ bằng **15%** cầu thủ sân.

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

### 2.5. Điểm phong độ

Từ ngày 07/08/2026, dữ liệu chính để tính phong độ là thứ hạng đã ghi nhận của đội. Khoản phạt thua chỉ là nguồn dự phòng cho trận lịch sử chưa có kết quả chính thức.

Điểm của một trận được lưu theo thang `0–10000`:

```text
Điểm trận = (Số đội - Thứ hạng) / (Số đội - 1) × 10000
```

Các đội đồng hạng nhận cùng điểm. Ví dụ trận bốn đội: hạng 1 nhận 10000, hạng 2 nhận 6667, hạng 3 nhận 3333 và hạng 4 nhận 0.

Điểm phong độ dùng tối đa 10 kết quả gần nhất trước ngày của trận đang chia. Trận mới nhất có trọng số `1`, mỗi trận cũ hơn nhân tiếp `0,9`. Dữ liệu nền tương đương ba trận ở mức trung lập 5000:

```text
Điểm phong độ =
[Tổng(Điểm trận × Trọng số) + 3 × 5000]
÷ [Tổng trọng số + 3]
```

Người chưa có dữ liệu nhận 5000. Chỉ đánh dấu phong độ thấp khi đã có tối thiểu 3 trận và điểm dưới 4000. Seed vẫn là yếu tố năng lực chính; Điểm phong độ chỉ dùng sau Seed để phân bổ đều người đang có kết quả thấp và cân bằng điểm trung bình giữa các đội.

## 3. Điều kiện trước khi chia đội

Hệ thống chỉ cho bấm **Tạo đội** khi đồng thời thỏa mãn:

1. Trận đã được tạo và có danh sách người tham gia.
2. Số đội do người thao tác nhập là số nguyên và lớn hơn hoặc bằng 2.
3. Có ít nhất 10 người tham gia và số đội không vượt quá số người.
4. Tất cả người tham gia đều đã có Seed Tier 1–7.
5. Có ít nhất một ứng viên bắt gôn cho mỗi đội.
6. Tier và khả năng bắt gôn đã được lưu, khóa cho phiên bản đội hình đang chuẩn bị.

Nếu thiếu seed, hệ thống không tự gán Tier 3. UI hiển thị danh sách cụ thể những người còn thiếu và đưa con trỏ đến ô seed đầu tiên cần nhập.

Quân số các đội phải chênh nhau không quá 1. Mỗi đội phải có đúng một thủ môn.

Hệ thống không còn chặn theo chuẩn 5 người mỗi đội. Nếu có đội dưới 5 người, UI hiển thị phân bổ dự kiến và cảnh báo để người tổ chức cân nhắc, nhưng vẫn cho phép tạo và xác nhận đội hình.

Nếu số người được đánh dấu có thể bắt gôn ít hơn số đội, hệ thống chặn thao tác và báo số người còn thiếu.

## 4. Workflow giao diện

### 4.1. Từ danh sách trận

Mỗi trận có các thao tác:

```text
Xem | Sửa | Xóa | Tạo đội
```

`Tạo đội` điều hướng đến trang riêng, đề xuất route `/matches/[matchId]/teams`. Không dùng popup vì màn hình có nhiều bước, bảng thống kê và thao tác kéo/thả.

### 4.2. Bước 1 — Kiểm tra người tham gia và nhập seed

Trang tạo đội tải toàn bộ người đã được check tham gia trận và hiển thị:

| Thành viên | Seed trận này | Có thể bắt gôn | Số trận | Hạng nhất | Phong độ |
|---|---|---:|---:|---:|---:|

- Seed Tier 1–7 và checkbox có thể bắt gôn có thể nhập nhanh ngay trong bảng. Checkbox mặc định lấy từ vị trí mong muốn trong CV và vẫn được phép chỉnh riêng cho trận.
- Seed được lưu trên bản ghi người tham gia của trận hiện tại, không ghi vào hồ sơ thành viên.
- Nếu trận hiện tại chưa có Seed, dropdown tự chọn sẵn Seed gần nhất trước đó của chính thành viên. Gợi ý này chỉ được ghi nhận khi Admin lưu và khóa Seed.
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
- số lượng từng Tier 1–7 của cầu thủ sân;
- điểm phong độ trung bình và số người phong độ thấp.

Admin được kéo/thả người giữa các đội. Sau mỗi thay đổi, hệ thống tính lại các chỉ số và cảnh báo nếu vi phạm quân số hoặc phân bổ thủ môn. Có thể khóa một người tại đội hiện tại trước khi bấm chia lại.

### 4.7. Bước 6 — Xác nhận

Chỉ cho **Xác nhận đội hình** khi các ràng buộc cứng đều hợp lệ. Phiên bản xác nhận là đội hình được thành viên nhìn thấy mặc định.

Sau xác nhận, không sửa trực tiếp phiên bản đó. Admin bấm **Tạo phiên bản mới**, hệ thống sao chép đội hình hiện hành thành một bản nháp mới. Khi phiên bản mới được xác nhận, phiên bản cũ chuyển thành `SUPERSEDED` nhưng vẫn giữ để audit.

Quy ước này đáp ứng đồng thời:

- “chỉ lưu bản cuối”: không lưu các lần random nháp;
- “thay đổi tạo phiên bản mới”: giữ các bản đã từng được xác nhận.

### 4.8. Xem và chia sẻ đội hình

- Ở chi tiết trận, chế độ **Theo đội** hiển thị đồng thời toàn bộ card đội trên PC. Trên mobile dùng tab từng đội để tránh trang quá dài.
- Admin hoặc Người tổ chức có thể bật trang đội hình công khai sau khi đã xác nhận đội hình.
- Liên kết công khai dùng token ngẫu nhiên, có thể tắt hoặc tạo lại để vô hiệu hóa liên kết cũ.
- Trang công khai chỉ hiển thị tên đội bóng, logo, ngày thi đấu, tên đội, tên/avatar/số áo cầu thủ thuộc phiên bản đã xác nhận gần nhất.
- Không công khai Seed, Điểm phong độ, khoản thu, công nợ, số điện thoại hoặc thao tác quản trị.
- Avatar và logo công khai chỉ được trả về khi token còn hiệu lực và thành viên thuộc đội hình xác nhận của chính trận đó.
- Trang công khai cung cấp Open Graph và Twitter Card động. Ảnh preview 1200×630 sử dụng logo, tên đội bóng, ngày thi đấu, tên/màu các đội và tổng quân số; token đã tắt không được tạo metadata hoặc ảnh preview hợp lệ.

## 5. Thuật toán chia đội

### 5.1. Ràng buộc cứng

- Mọi người tham gia có seed.
- Có ít nhất 10 người tham gia.
- Số đội từ 2 trở lên.
- Số đội không vượt quá số người và không có đội rỗng.
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
     + W_low   × chênh_lệch_số_người_phong_độ_thấp
     + W_form  × chênh_lệch_điểm_phong_độ_trung_bình
```

Không cố xếp tất cả người từng thua nhiều vào cùng đội. Chỉ số thua nên dùng tỷ lệ trong **10 trận tham gia gần nhất** thay vì tổng thua trọn đời, tránh bất lợi cho người đã tham gia club lâu hơn.

Trọng số `W_skill`, `W_tier`, `W_loss` là cấu hình kỹ thuật ban đầu. Chưa mở UI cho Admin chỉnh để tránh cấu hình khó hiểu; có thể bổ sung sau khi có dữ liệu thực tế.

### 5.3. Các bước thực thi đề xuất

1. Sinh `random_key` và xáo người trong các nhóm tương đương.
2. Chọn đủ số thủ môn từ các ứng viên, ưu tiên người chỉ khai báo vị trí thủ môn; không ưu tiên Tier thấp hơn.
3. Giữ một chỗ thủ môn cho mỗi đội, nhóm cầu thủ sân theo Tier 1–7 và chia cầu thủ sân trước.
4. Xếp thủ môn sau cùng; Tier và Điểm phong độ của thủ môn nhân hệ số 0,15.
5. Với bóng đá sân 5, đội hình chính dùng đúng 1 thủ môn và 4 cầu thủ sân mạnh nhất theo Tier; phong độ dùng để phân định người cùng Tier.
6. Số lượng của từng Tier giữa các đội chênh tối đa 1. Ví dụ có 4 cầu thủ Tier 1 và 2 đội thì bắt buộc chia 2–2, không cho tổng điểm toàn đội bù lại thành 1–3.
7. Cân bằng sức mạnh và phong độ của đội hình chính trước; phần cầu thủ dự bị chỉ mang trọng số 25% trong điểm cân bằng tổng.
8. Thử hoán đổi cặp người giữa các đội bằng local search/hill climbing.
9. Chỉ nhận phép đổi làm giảm `cost` và không phá ràng buộc cứng.
10. Dừng khi không còn cải thiện hoặc đạt giới hạn vòng lặp.

Đây là bài toán nhiều mục tiêu: quân số, kỹ năng, tier, thủ môn và lịch sử thua có thể cạnh tranh nhau. Vì vậy UI nên hiển thị các chỉ số cân bằng, không tuyên bố kết quả là “công bằng tuyệt đối”.

## 6. Báo cáo phong độ phục vụ chia đội

### 6.1. Phạm vi dữ liệu

Mặc định lấy 10 trận có kết quả gần nhất trước ngày của trận đang chia. Không tính trận tương lai, trận bị xóa hoặc trận chưa có kết quả hợp lệ. Ưu tiên dữ liệu `RECORDED` từ thứ hạng; chỉ dùng khoản phạt thua hợp lệ khi chưa có kết quả chính thức.

### 6.2. Chỉ số

- Tổng số trận có kết quả trong cửa sổ nhìn lại.
- Số lần hạng nhất và không hạng nhất.
- Điểm phong độ đã điều chỉnh theo độ mới và dữ liệu nền.
- Số trận lấy từ nguồn suy luận vẫn được đánh dấu trong thông tin thành viên. Độ tin cậy được tính nội bộ khi điều chỉnh Điểm phong độ nhưng không hiển thị tại bảng Seed và không trực tiếp tham gia chia đội.

### 6.3. Quy tắc dữ liệu thiếu

- Người chưa có trận lịch sử: Điểm phong độ trung lập 50, không xem là thắng hoặc thua.
- Trận có khoản phạt nhưng không gắn `match_id`: không dùng suy luận kết quả.
- Loại thu được bật cờ phạt sau này: cần quyết định có áp dụng hồi tố hay chỉ các khoản phát sinh mới. Khuyến nghị dùng snapshot cờ trên `MemberCharge` để lịch sử không đổi.

### 6.4. Giới hạn cần hiển thị

Báo cáo phân biệt rõ kết quả chính thức và số trận còn phải suy luận từ khoản phạt. Admin nhập thứ hạng cho từng đội trên phiên bản đội hình đã xác nhận. Nhiều đội được phép đồng hạng khi không tranh hạng; các đội đồng hạng nhận cùng Điểm phong độ của thứ hạng đó. Hệ thống vẫn tự tạo `hạng - 1` lần phạt cho mỗi thành viên của các đội không đứng hạng 1; không cần nhập tỷ số.

## 7. Mô hình dữ liệu đề xuất

### 7.1. Bổ sung `match_participants`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| seed_tier | enum | NULL, TIER_1…TIER_7; GOALKEEPER chỉ giữ để đọc lịch sử cũ |
| goalkeeper_available | boolean | có thể bắt gôn trong trận hiện tại |
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
| form_score_total | integer | tổng Điểm phong độ của đội theo thang 0–10000 |
| low_form_count | integer | số người phong độ thấp đã phân bổ vào đội |

### 7.5. `match_team_members`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| id | uuid | PK |
| team_id | uuid | FK match_teams |
| version_id | uuid | FK match_team_versions, phục vụ ràng buộc duy nhất |
| participant_id | uuid | FK match_participants |
| seed_tier_snapshot | enum | seed lúc khóa tier |
| goalkeeper_available_snapshot | boolean | snapshot khả năng bắt gôn của trận |
| assigned_as_goalkeeper | boolean | người này được xếp bắt gôn trong đội hình |
| recent_match_count_snapshot | smallint | số trận trong cửa sổ |
| recent_loss_count_snapshot | smallint | số trận thua suy luận |
| recent_loss_rate_snapshot | numeric | tỷ lệ thua suy luận |
| form_score_snapshot | integer | Điểm phong độ tại thời điểm chia đội |
| form_confidence_snapshot | integer | độ tin cậy của dữ liệu theo thang 0–10000 |
| inferred_match_count_snapshot | integer | số trận trong cửa sổ lấy từ khoản phạt |
| is_locked | boolean | khóa đội khi chia lại |
| display_order | integer | thứ tự hiển thị |

### 7.6. `member_match_stats`

Mỗi dòng là kết quả của một thành viên trong một trận. Bảng này là nguồn dữ liệu riêng cho Điểm phong độ và không phụ thuộc vào việc khoản phạt còn tồn tại sau khi đã ghi nhận kết quả chính thức.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| member_id | uuid | FK members |
| match_id | uuid | FK matches |
| team_version_id | uuid | phiên bản đội hình tạo kết quả |
| team_id | uuid | đội của thành viên |
| played_on | date | ngày thi đấu phục vụ truy vấn lịch sử |
| team_count | integer | số đội khi ghi nhận kết quả |
| placement | integer | thứ hạng của đội |
| is_tied | boolean | kết quả có đồng hạng hay không |
| result | enum | WIN, LOSS hoặc UNRANKED |
| source | enum | RECORDED hoặc PENALTY_INFERRED |
| placement_score | integer | điểm riêng của trận, 0–10000 |
| formula_version | integer | phiên bản công thức |
| calculated_at | timestamptz | thời điểm đồng bộ thống kê |

`(member_id, match_id)` là duy nhất. Khi nhập hoặc sửa kết quả, các dòng của trận được tạo lại trong cùng transaction với thứ hạng và khoản phạt. Kết quả chính thức thay thế dữ liệu `PENALTY_INFERRED`.

## 8. Ràng buộc dữ liệu

- `(match_id, version)` là duy nhất.
- `(version_id, team_index)` là duy nhất.
- Một `participant_id` chỉ xuất hiện một lần trong một version.
- Dữ liệu mới chỉ nhận Seed Tier 1–7; `GOALKEEPER` chỉ được đọc để tương thích lịch sử.
- `team_count >= 2`, `lookback_matches > 0`.
- Không xác nhận nếu tổng người dưới 10 hoặc quân số giữa các đội chênh quá 1.
- Không xác nhận nếu có đội không có đúng một thủ môn.
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

- 9 người, 2 đội: chặn vì tổng danh sách chưa đủ 10 người.
- 16 người, 3 đội: hợp lệ với quân số 6–5–5.
- 2 ứng viên thủ môn, 3 đội: chặn và báo thiếu 1 người có thể bắt gôn.
- 4 ứng viên thủ môn, 3 đội: chọn 3 người làm thủ môn, mỗi đội đúng 1 người; người còn lại vẫn có thể được chia như cầu thủ sân.
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
