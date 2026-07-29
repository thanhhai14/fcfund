# Phân tích bảng quỹ tháng 7

**Trạng thái:** Đã phân tích ảnh; một phần nghiệp vụ đã được xác nhận  
**Nguồn:** Ảnh bảng tính do người dùng cung cấp  
**Phạm vi:** Chỉ mô tả những gì nhìn thấy trong ảnh; chưa phải thiết kế CSDL

## 1. Bố cục quan sát được

Bảng được tổ chức theo một kỳ tháng, trong ảnh là **Tháng 7**, gồm:

- Danh sách cầu thủ/thành viên.
- Khu vực tổng hợp đầu bảng.
- Khu vực thu của từng cầu thủ.
- Khu vực `THU LẺ THEO TRẬN`.
- Ghi chú công nợ hoặc thông tin phát sinh.

Các cột chính:

| Cột | Nội dung quan sát được |
|---|---|
| STT | Mã hoặc số thứ tự cầu thủ |
| Cầu thủ | Tên/người được theo dõi |
| Quỹ tháng | Số tiền thu hoặc phải thu trong kỳ |
| Mời nước | Có cả ký hiệu `x`, `xx`, `xxxx` và số tiền |
| Chi | Tổng hoặc chi tiết các khoản chi |
| Còn | Số tiền còn lại |
| Cột ghi chú | Ví dụ: `Nợ 86K tháng 6` |

## 2. Khu vực tổng hợp

Các số liệu nhìn thấy:

| Chỉ tiêu | Giá trị |
|---|---:|
| TỔNG tại cột Quỹ tháng | 5.709.000đ |
| TỔNG tại cột Mời nước | 48.000đ |
| TỔNG Chi | 4.980.000đ |
| Còn | 777.000đ |
| THU THEO THÁNG | 4.578.000đ |

Công thức khớp trực tiếp từ ảnh:

```text
5.709.000 + 48.000 - 4.980.000 = 777.000
```

Như vậy ô `Còn` đang được tính từ ba ô tổng hợp phía trước. Tuy nhiên, ý nghĩa đầy đủ của `5.709.000đ` chưa được xác nhận.

## 3. Đối chiếu cột Quỹ tháng

Các khoản có số tiền trong danh sách cầu thủ:

| STT | Cầu thủ | Quỹ tháng |
|---:|---|---:|
| 1 | Dũng Bệu | 236.000đ |
| 2 | Vinh Siêu Thị | 308.000đ |
| 3 | Ông Thọ | 272.000đ |
| 4 | Anh Quốc | 236.000đ |
| 5 | Vĩ Tiểu Bảo | 272.000đ |
| 6 | Thanh Bình | 200.000đ |
| 7 | Đức Huy | 272.000đ |
| 8 | Sỹ Tấn | 308.000đ |
| 9 | Khoa Trọc | 272.000đ |
| 10 | Phú Dubai | 200.000đ |
| 11 | Tâm Huỳnh | 200.000đ |
| 16 | Tường Nguyễn | 272.000đ |
| 17 | Hiếu Art | 272.000đ |
| 18 | Tuấn Luxury | 200.000đ |
| 19 | Anh Vũ | 236.000đ |
| 20 | Văn Sĩ | 272.000đ |
| 21 | Võ Đình Lý | 100.000đ |
| 23 | Anh Hùng | 100.000đ |
| 24 | Khánh Hòa | 200.000đ |
| 1 (thu lẻ) | Xuân Sơn | 150.000đ |

Đối chiếu số học:

```text
Tổng tiền của 19 cầu thủ có số tiền = 4.428.000đ
Khoản thu lẻ của Xuân Sơn             =   150.000đ
                                          -----------
Tổng                                    4.578.000đ
```

Kết quả này khớp chính xác với ô `THU THEO THÁNG`.

### Nhận định sơ bộ

- `THU THEO THÁNG` không chỉ gồm tiền ở danh sách cầu thủ chính thức.
- Khoản `Xuân Sơn — 150.000đ` trong phần `THU LẺ THEO TRẬN` cũng được cộng vào chỉ tiêu này.
- Không nên thiết kế hệ thống theo giả định mỗi thành viên chỉ có một khoản đóng cố định mỗi tháng.

## 4. Mức tiền xuất hiện

Các mức phổ biến trong cột Quỹ tháng:

- 100.000đ
- 150.000đ
- 200.000đ
- 236.000đ
- 272.000đ
- 308.000đ

Chuỗi `200.000 → 236.000 → 272.000 → 308.000` tăng đều mỗi lần `36.000đ`. Đây có thể là một công thức nghiệp vụ, nhưng ảnh chưa đủ để kết luận 36.000đ đại diện cho khoản gì.

## 5. Cột Mời nước

Quan sát được hai dạng dữ liệu:

1. Ký hiệu đếm như `x`, `xx`, `xxx`, `xxxx` tại các dòng cầu thủ.
2. Một số tiền cụ thể `48.000đ` tại dòng Xuân Sơn trong phần thu lẻ.

Tổng đầu cột là `48.000đ`, bằng đúng số tiền tại dòng Xuân Sơn. Các ký hiệu `x` vì vậy chưa thể được hiểu là số tiền đã cộng trực tiếp vào tổng.

Có 34 dấu `x` quan sát được trong khu vực danh sách cầu thủ, theo bản chép hiện tại. Con số này cần được đối chiếu với bảng gốc.

## 6. Danh sách chưa có tiền quỹ trong ảnh

Các dòng nhìn thấy nhưng không có số tiền ở cột Quỹ tháng:

- Vương AK
- Trung Hiếu
- Huỳnh Tú
- Cao Đăng
- Minh Đức
- Thanh Hải

Ngoài ra, `Huỳnh Tú` có ghi chú `Nợ 86K tháng 6`.

Chưa thể kết luận ô trống nghĩa là:

- chưa đóng;
- không phải đóng;
- nghỉ trong tháng;
- đang nợ;
- hay được xử lý bằng một quy tắc khác.

## 7. Phần Thu lẻ theo trận

Các dòng nhìn thấy:

| STT hiển thị | Nội dung | Quỹ tháng | Mời nước |
|---:|---|---:|---:|
| 1 | Xuân Sơn | 150.000đ | 48.000đ |
| — | Xuân Nhất | — | — |
| 2 | Bạn Hiếu Art | — | — |
| 3 | Thu tiền nước đội thua (Tưởng) | — | — |
| 4 | Bạn Dũng | — | — |

Tên khu vực cho thấy các khoản này có thể gắn với từng trận thay vì gắn với thành viên/tháng. Cần xác nhận mỗi dòng là một người, một khoản thu, hay một nhóm giao dịch.

## 8. Định danh thành viên

STT chạy từ 1 đến 24 rồi xuất hiện `38 — Thanh Hải`. Điều này gợi ý STT có thể là mã ổn định của thành viên, không phải số thứ tự được đánh lại mỗi tháng.

Nếu đúng, CSDL cần một mã thành viên độc lập và không tự thay đổi khi:

- thành viên nghỉ;
- bị ẩn khỏi kỳ hiện tại;
- hoặc có thành viên mới.

## 9. Xác nhận nghiệp vụ sau khi phân tích ảnh

Chủ quỹ đã xác nhận:

- Quỹ tháng có mức mặc định `200.000đ`, có thể cấu hình.
- Mời nước thực chất là khoản phạt do đá thua, mức hiện tại `36.000đ/lần`.
- Mỗi dấu `x` là một lần phát sinh khoản mời nước.
- Một thành viên có thể đồng thời phải đóng nhiều loại quỹ trong cùng tháng.
- Ví dụ Thanh Hải có nghĩa vụ:

  ```text
  Quỹ tháng:          200.000đ
  Mời nước: 2 × 36K = 72.000đ
                         -------
  Tổng phải đóng:     272.000đ
  ```

- Club có loại `Quỹ lẻ`, thu theo từng trận tham gia với đơn giá cấu hình.
- Admin phải được tạo thêm loại thu quỹ và cấu hình số tiền của từng loại.
- Các khoản chi gồm tiền sân, tiền nước và các khoản phát sinh theo trận.
- Báo cáo phải thể hiện công nợ từng người.
- Thành viên có tài khoản để xem thu chi công khai và công nợ của mình.
- Admin cấu hình tài khoản ngân hàng hoặc mã QR để thành viên chuyển khoản.

### Hiệu chỉnh cách hiểu cột Mời nước

Dấu `x` là số lần phát sinh nghĩa vụ, không phải dấu xác nhận đã thanh toán. Tổng tiền của loại này phải được tính theo:

```text
Số tiền mời nước phải đóng = số dấu x × đơn giá tại thời điểm phát sinh
```

## 10. Các giả thuyết chưa được phép dùng để lập trình

Các giả thuyết sau chỉ dùng làm câu hỏi, chưa phải yêu cầu đã xác nhận:

1. `5.709.000đ` có thể gồm số dư mang sang và số thu mới `4.578.000đ`.
2. Phần chênh `1.131.000đ` có thể là số dư đầu tháng:

   ```text
   5.709.000 - 4.578.000 = 1.131.000đ
   ```

3. Số tiền tại cột `Quỹ tháng` có thể là tổng tiền thực nộp của một người, không nhất thiết chỉ là loại Quỹ tháng.
4. `THU LẺ THEO TRẬN` có thể dành cho khách hoặc người không đóng quỹ cố định theo tháng.

Không giả thuyết nào ở trên được đưa vào công thức hoặc mô hình CSDL trước khi có xác nhận.
