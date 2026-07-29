# Nhật ký quyết định

**Trạng thái:** Các câu hỏi bắt buộc đã được trả lời

## Tài khoản

- Admin tạo tài khoản; không có tự đăng ký.
- Thành viên không bắt buộc đổi mật khẩu mặc định trong lần đăng nhập đầu.
- Khi quên mật khẩu, admin đặt lại mật khẩu.
- Đăng nhập bằng số điện thoại.
- Mật khẩu mặc định là `Trailang123`, nhưng trong CSDL chỉ lưu bản hash.

## Phạm vi

- Một bản cài đặt chỉ quản lý một đội bóng.
- Có tên và logo đội bóng.
- `FCFUND` là tên ứng dụng.

## Nền tảng

- Next.js.
- PWA.
- PostgreSQL.
- Triển khai trên Vercel.
- Logo và QR cần nơi lưu tệp phù hợp Vercel; đề xuất Vercel Blob.

## Kiểm soát dữ liệu

- Admin được sửa và xóa dữ liệu.
- Mọi thay đổi tài chính phải được tracking.
- Giao diện có chatter để xem lịch sử.

## Quyền

Ba vai trò:

- Admin.
- Thủ quỹ.
- Thành viên.

Policy mặc định áp dụng theo vai trò. Có thể ghi đè policy theo từng tài khoản để quyết định người nào được xem hoặc thao tác dữ liệu nào.

## Những lựa chọn kỹ thuật mặc định khi triển khai

Trừ khi có thay đổi trước lúc code:

- Dùng Neon PostgreSQL qua Vercel Marketplace.
- Dùng Vercel Blob cho logo và QR.
- Dùng xóa mềm cho dữ liệu tài chính để chatter và báo cáo lịch sử không mất dấu.
- Admin có thể khôi phục bản ghi đã xóa nếu cần.
