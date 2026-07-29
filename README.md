# FC Fund

Ứng dụng mini quản lý quỹ cho câu lạc bộ bóng đá. Dự án chạy hoàn toàn trên trình duyệt, không cần cài thư viện hay cơ sở dữ liệu.

## Chức năng

- Xem nhanh số dư, tổng thu, tổng chi và công nợ theo tháng
- Quản lý danh sách thành viên và mức đóng quỹ
- Ghi nhận các khoản thu/chi
- Lọc, tìm kiếm và xuất lịch sử giao dịch ra CSV
- Lưu dữ liệu ngay trên trình duyệt bằng `localStorage`
- Giao diện responsive cho máy tính và điện thoại

## Chạy dự án

Cách đơn giản nhất là mở file `index.html` bằng trình duyệt.

Để chạy qua web server cục bộ:

```bash
python3 -m http.server 8080
```

Sau đó truy cập <http://localhost:8080>.

## Dữ liệu

Lần đầu mở ứng dụng sẽ có dữ liệu mẫu để trải nghiệm. Chọn **Cài đặt → Khôi phục dữ liệu mẫu** để đưa ứng dụng về trạng thái ban đầu.

> Dữ liệu hiện được lưu riêng trên từng trình duyệt. Bản MVP chưa có tài khoản, đồng bộ nhiều thiết bị hoặc phân quyền.
