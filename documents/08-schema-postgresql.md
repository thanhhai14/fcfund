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
| member_id | uuid | FK members, NULL với admin không phải cầu thủ |
| phone_normalized | varchar(24) | UNIQUE, NOT NULL |
| password_hash | text | NOT NULL |
| role | user_role | NOT NULL |
| is_active | boolean | mặc định true |
| last_login_at | timestamptz | NULL |
| created_at/updated_at | timestamptz | NOT NULL |

Frontend chỉ nhận chữ số. Server tiếp tục chuẩn hóa và kiểm tra lại.

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
| note | text | NULL |

Ràng buộc: phải có `member_id` hoặc `guest_name`.

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
- `members(club_id, code)` unique.
- `member_charges(member_id, charge_date)`.
- `member_charges(charge_type_id, period_month)`.
- `fund_transactions(member_id, transaction_date)`.
- `fund_transactions(club_id, transaction_date, direction)`.
- `activity_logs(entity_type, entity_id, created_at DESC)`.
- `match_participants(match_id)`.

## 20. Giao dịch CSDL

Các thao tác sau phải chạy trong PostgreSQL transaction:

- tạo/sửa/xóa giao dịch và ghi activity log;
- tạo/sửa/xóa khoản phải đóng và ghi activity log;
- sinh hàng loạt khoản tháng;
- đặt lại mật khẩu và ghi activity log.
