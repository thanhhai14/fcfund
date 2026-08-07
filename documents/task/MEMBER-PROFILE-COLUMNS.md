# Member profile, avatar và tùy chọn cột

## Phase 1

- Đổi “Sổ số dư” thành “Lịch sử số dư”; khoản thu hiển thị icon, màu và tên loại thu.
- `ColumnVisibilityMenu` dùng chung cho list view, lưu lựa chọn theo từng màn hình trong localStorage.
- Áp dụng cho Thành viên, Khoản phải thu, Thu & chi, báo cáo tháng, công nợ, chi tiết trận và Seed.
- `match-date` dùng icon lịch Font Awesome làm watermark.

## Phase 2

- `member_profiles` lưu CV của thành viên.
- `avatars` là model riêng có `member_id` và `user_id` nullable, có unique index từng owner.
- Avatar private được đọc qua API có kiểm tra club.
- Khi liên kết User–Member, avatar được hợp nhất theo nguyên tắc Member ưu tiên.
- `MemberIdentity` chuẩn hóa avatar + tên và bỏ mã thành viên khỏi phần nhận diện trực quan.

## Bố cục và quyền xem hồ sơ

- `profile-hero` chứa avatar và `member-cv-panel`; form sửa CV mở bằng disclosure.
- Số dư, tổng phải đóng và đã nộp nằm trong `detail-columns`, không nằm trong hero.
- `members.view` chỉ mở quyền xem hồ sơ/CV cơ bản.
- Công nợ người khác cần `member_balances.view_all`; lịch sử thu/nộp tuân theo policy `view_all` hoặc `view_own`.
- Chatter chỉ hiển thị khi có `audit.view`; số điện thoại chỉ hiển thị cho chính chủ hoặc người quản lý thành viên.
