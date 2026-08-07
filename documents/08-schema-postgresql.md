# Schema PostgreSQL

**Trạng thái:** Thiết kế vật lý đề xuất, chưa tạo migration  
**Quy ước:** Tiền lưu bằng số nguyên VND, không lưu số thực

## 1. Kiểu dữ liệu chung

- Khóa chính: `uuid`.
- Tiền: `bigint`, giá trị theo VND.
- Ngày nghiệp vụ: `date`.
- Thời điểm hệ thống: `timestamptz`.
- Số điện thoại: `varchar`, không dùng kiểu số.
- Dữ liệu tracking trước/sau: `jsonb`.
- Bản ghi tài chính dùng `deleted_at`, không xóa vật lý.

## 2. Enum dự kiến

### user_role

```text
ADMIN
TREASURER
MEMBER
```

### charge_calculation

```text
MONTHLY
OCCURRENCE
```

### charge_source

```text
AUTO_MONTHLY
MANUAL
MATCH
ADJUSTMENT
```

### fund_direction

```text
IN
OUT
```

### fund_transaction_kind

```text
MEMBER_PAYMENT
OTHER_INCOME
EXPENSE
OPENING_BALANCE
ADJUSTMENT
```

### member_seed_tier

```text
TIER_1
TIER_2
TIER_3
TIER_4
GOALKEEPER
```

### match_team_version_status

```text
DRAFT
CONFIRMED
SUPERSEDED
```

## 3. clubs

Một bản cài đặt chỉ có một dòng club hoạt động.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| name | varchar(160) | NOT NULL |
| logo_url | text | NULL |
| qr_url | text | NULL |
| bank_name | varchar(160) | NULL |
| bank_account_number | varchar(80) | NULL |
| bank_account_holder | varchar(160) | NULL |
| timezone | varchar(80) | mặc định `Asia/Ho_Chi_Minh` |
| created_at | timestamptz | NOT NULL |
| updated_at | timestamptz | NOT NULL |

## 4. members

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| code | varchar(40) | unique trong club |
| full_name | varchar(160) | NOT NULL |
| phone | varchar(24) | NOT NULL |
| status | varchar(20) | ACTIVE/INACTIVE |
| joined_on | date | NULL |
| left_on | date | NULL |
| note | text | NULL |
| created_at/updated_at | timestamptz | NOT NULL |

Số điện thoại hồ sơ có thể trùng nếu nghiệp vụ sau này cho phép; số điện thoại đăng nhập tại `users` phải unique.

## 5. users

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| member_id | uuid | FK members, NULL nếu User không đại diện cho thành viên; unique khi khác NULL |
| display_name | varchar(160) | NOT NULL, tên hiển thị độc lập |
| phone_normalized | varchar(24) | UNIQUE, NOT NULL |
| password_hash | text | NOT NULL |
| role | user_role | NOT NULL |
| is_active | boolean | mặc định true |
| last_login_at | timestamptz | NULL |
| created_at/updated_at | timestamptz | NOT NULL |

Frontend chỉ nhận chữ số. Server tiếp tục chuẩn hóa và kiểm tra lại.

`member_id` chỉ phục vụ dữ liệu mang nghĩa "của mình". Role, policy, số điện thoại đăng nhập và `is_active` thuộc User, không bị suy ra từ Member.

## 6. permissions

Danh mục mã quyền ổn định:

| Cột | Kiểu |
|---|---|
| key | varchar(100), PK |
| name | varchar(160) |
| description | text |

Ví dụ:

```text
dashboard.view
members.view
members.manage
charges.view_own
charges.view_all
charges.manage
payments.view_own
payments.view_all
payments.manage
expenses.view
expenses.manage
club_balance.view
settings.manage
users.manage
audit.view
match_seed.view
match_seed.manage
match_teams.view
match_teams.manage
match_form_report.view
```

## 7. role_permissions

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| role | user_role | PK ghép |
| permission_key | varchar(100) | PK ghép, FK permissions |
| allowed | boolean | NOT NULL |

## 8. user_permission_overrides

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| user_id | uuid | PK ghép, FK users |
| permission_key | varchar(100) | PK ghép, FK permissions |
| allowed | boolean | NOT NULL |
| created_by | uuid | FK users |
| created_at | timestamptz | NOT NULL |

Quyền hiệu lực:

```text
user override nếu tồn tại
ngược lại dùng role permission
```

## 9. charge_types

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| name | varchar(120) | NOT NULL |
| calculation | charge_calculation | NOT NULL |
| default_amount | bigint | >= 0 |
| icon_name | varchar(100) | NOT NULL |
| icon_style | varchar(40) | NOT NULL |
| color | varchar(20) | NULL |
| is_loss_penalty | boolean | mặc định false |
| is_active | boolean | mặc định true |
| created_at/updated_at | timestamptz | NOT NULL |

Icon phải nằm trong allowlist Font Awesome của ứng dụng.

## 10. member_charge_assignments

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| member_id | uuid | FK members |
| charge_type_id | uuid | FK charge_types |
| custom_amount | bigint | NULL, >= 0 |
| valid_from | date | NOT NULL |
| valid_until | date | NULL |
| is_active | boolean | mặc định true |
| note | text | NULL |
| created_by | uuid | FK users |
| created_at/updated_at | timestamptz | NOT NULL |

Đơn giá hiệu lực:

```text
COALESCE(custom_amount, charge_types.default_amount)
```

Ứng dụng không cho hai cấu hình cùng loại thu của một thành viên có khoảng hiệu lực chồng nhau.

## 11. matches

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| played_on | date | NOT NULL |
| note | text | NULL |
| created_by | uuid | FK users |
| created_at/updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |

## 12. match_participants

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| match_id | uuid | FK matches |
| member_id | uuid | FK members, NULL nếu là khách |
| guest_name | varchar(160) | NULL |
| seed_tier | member_seed_tier | NULL trước khi đánh giá |
| seed_evaluated_at | timestamptz | NULL |
| seed_evaluated_by | uuid | FK users, NULL |
| note | text | NULL |

Ràng buộc: phải có `member_id` hoặc `guest_name`.

Mỗi bản ghi tham gia phải được đánh giá seed trước khi chia đội, kể cả khách. Không lưu seed trong `members` và không tự động sao chép seed của trận trước. Lịch sử gần nhất chỉ được truy vấn để hiển thị tham khảo.

## 12A. match_team_versions

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| match_id | uuid | FK matches |
| version | integer | > 0 |
| status | match_team_version_status | NOT NULL |
| random_key | varchar(100) | NULL trước lần sinh đầu |
| team_count | smallint | >= 2 |
| lookback_matches | smallint | > 0, mặc định 10 |
| tier_locked_at | timestamptz | NULL trước khi khóa |
| tier_locked_by | uuid | FK users, NULL |
| metrics | jsonb | NOT NULL, mặc định `{}` |
| created_by | uuid | FK users |
| created_at/updated_at | timestamptz | NOT NULL |
| confirmed_at | timestamptz | NULL |

Ràng buộc/index:

```text
UNIQUE (match_id, version)
UNIQUE (match_id) WHERE status = 'DRAFT'
UNIQUE (match_id) WHERE status = 'CONFIRMED'
```

Các lần chia lại chỉ cập nhật bản `DRAFT`. Khi xác nhận phiên bản mới, phiên bản `CONFIRMED` cũ chuyển sang `SUPERSEDED` trong cùng một transaction.

## 12B. match_teams

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| version_id | uuid | FK match_team_versions |
| team_index | smallint | > 0 |
| name | varchar(80) | NOT NULL |
| color | varchar(20) | NULL |
| member_count | smallint | >= 0 |
| goalkeeper_count | smallint | >= 0 |
| outfield_skill_score | integer | >= 0 |
| recent_loss_score | numeric(8,4) | >= 0 |

`(version_id, team_index)` là duy nhất.

## 12C. match_team_members

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| team_id | uuid | FK match_teams |
| version_id | uuid | FK match_team_versions |
| participant_id | uuid | FK match_participants |
| seed_tier_snapshot | member_seed_tier | NOT NULL |
| recent_match_count_snapshot | smallint | >= 0 |
| recent_loss_count_snapshot | smallint | >= 0 |
| recent_loss_rate_snapshot | numeric(7,4) | từ 0 đến 1, NULL nếu chưa có lịch sử |
| is_locked | boolean | mặc định false |
| display_order | integer | >= 0 |

`(version_id, participant_id)` là duy nhất. Ứng dụng phải kiểm tra `team_id` thuộc đúng `version_id` và participant thuộc đúng trận của version trong cùng transaction.

## 13. member_charges

Khoản làm giảm số dư thành viên.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| member_id | uuid | FK members |
| charge_type_id | uuid | FK charge_types |
| assignment_id | uuid | FK assignments, NULL |
| match_id | uuid | FK matches, NULL |
| source | charge_source | NOT NULL |
| charge_date | date | NOT NULL |
| period_month | date | NULL, ngày đầu tháng |
| quantity | integer | > 0 |
| unit_amount | bigint | >= 0 |
| total_amount | bigint | >= 0 |
| is_loss_penalty_snapshot | boolean | mặc định false |
| note | text | NULL |
| created_by | uuid | FK users, NULL nếu job |
| created_at/updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |
| deleted_by | uuid | FK users, NULL |

Ràng buộc ứng dụng:

```text
total_amount = quantity × unit_amount
```

Unique index một phần cho khoản tự động:

```text
UNIQUE (assignment_id, period_month)
WHERE source = 'AUTO_MONTHLY' AND deleted_at IS NULL
```

## 14. fund_categories

Danh mục loại thu/chi tiền mặt:

| Cột | Kiểu |
|---|---|
| id | uuid, PK |
| club_id | uuid, FK |
| name | varchar(120) |
| direction | fund_direction |
| is_system | boolean |
| is_active | boolean |

Danh mục hệ thống `Tiền thành viên nộp` không được xóa.

## 15. fund_transactions

Sổ tiền thực tế của club.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| direction | fund_direction | NOT NULL |
| kind | fund_transaction_kind | NOT NULL |
| category_id | uuid | FK fund_categories, NULL |
| member_id | uuid | FK members, bắt buộc với MEMBER_PAYMENT |
| match_id | uuid | FK matches, NULL |
| amount | bigint | > 0 |
| transaction_date | date | NOT NULL |
| note | text | NULL |
| created_by | uuid | FK users |
| created_at/updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |
| deleted_by | uuid | FK users, NULL |

Một giao dịch `MEMBER_PAYMENT`:

- làm tăng số dư thành viên;
- làm tăng số dư quỹ club.

Một khoản phải đóng trong `member_charges`:

- làm giảm số dư thành viên;
- không làm thay đổi quỹ club cho đến khi có tiền thực nộp.

## 16. activity_logs

Nguồn dữ liệu cho chatter và audit.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK clubs |
| entity_type | varchar(80) | NOT NULL |
| entity_id | uuid | NOT NULL |
| action | varchar(30) | CREATE/UPDATE/DELETE/RESTORE/RESET_PASSWORD/COMMENT |
| message | text | NULL |
| before_data | jsonb | NULL |
| after_data | jsonb | NULL |
| actor_id | uuid | FK users |
| created_at | timestamptz | NOT NULL |

`activity_logs` không cho sửa hoặc xóa qua ứng dụng.

## 17. monthly_job_runs

Theo dõi tác vụ sinh khoản tháng:

| Cột | Kiểu |
|---|---|
| id | uuid, PK |
| period_month | date, UNIQUE |
| started_at | timestamptz |
| finished_at | timestamptz |
| status | varchar(20) |
| created_count | integer |
| error_message | text |

## 18. Công thức báo cáo

### Số dư thành viên

```text
SUM(fund_transactions.amount)
  với kind = MEMBER_PAYMENT, member_id tương ứng, chưa xóa
-
SUM(member_charges.total_amount)
  với member_id tương ứng, chưa xóa
```

### Số dư quỹ club

```text
SUM(IN fund_transactions chưa xóa)
-
SUM(OUT fund_transactions chưa xóa)
```

`OPENING_BALANCE` là một giao dịch đầu vào hoặc đầu ra tùy số dư khởi tạo.

## 19. Index quan trọng

- `users(phone_normalized)` unique.
- `users(member_id)` unique với các bản ghi có `member_id IS NOT NULL`.
- `members(club_id, code)` unique.
- `member_charges(member_id, charge_date)`.
- `member_charges(charge_type_id, period_month)`.
- `fund_transactions(member_id, transaction_date)`.
- `fund_transactions(club_id, transaction_date, direction)`.
- `activity_logs(entity_type, entity_id, created_at DESC)`.
- `match_participants(match_id)`.
- `match_team_versions(match_id, version)` unique.
- `match_teams(version_id, team_index)` unique.
- `match_team_members(version_id, participant_id)` unique.
- `member_charges(match_id, is_loss_penalty_snapshot)` để tính phong độ suy luận.
- `avatars(member_id)` unique khi `member_id IS NOT NULL`.
- `avatars(user_id)` unique khi `user_id IS NOT NULL`.
- `avatars(club_id)` để bảo vệ phạm vi tenant khi tải ảnh.

## 19.1. Profile và avatar

`member_profiles` chứa nội dung CV như giới thiệu, biệt danh, vị trí, chân thuận và số áo. `avatars` chứa metadata file Blob và liên kết tùy chọn đến Member/User. Không lưu binary hoặc base64 trong PostgreSQL.

## 20. Giao dịch CSDL

Các thao tác sau phải chạy trong PostgreSQL transaction:

- tạo/sửa/xóa giao dịch và ghi activity log;
- tạo/sửa/xóa khoản phải đóng và ghi activity log;
- sinh hàng loạt khoản tháng;
- đặt lại mật khẩu và ghi activity log.
- xác nhận phiên bản đội hình mới và chuyển bản cũ sang superseded;
- lưu/chia lại đội hình nháp cùng activity log.
