# Thanh toán công nợ bằng ứng dụng ngân hàng

**Trạng thái:** Phase 1 đã triển khai trong source; cần chạy migration `0019_lying_shiver_man` trước khi deploy.  
**Phạm vi:** Thay CTA chính `Sao chép số tài khoản` trên trang chi tiết nhắc công nợ bằng luồng `Thanh toán <số tiền>` → chọn ứng dụng ngân hàng → mở app ngân hàng qua VietQR deeplink. QR và sao chép số tài khoản vẫn được giữ làm fallback.

## 1. Mục tiêu

Khi thành viên nhận Push nhắc công nợ và mở chi tiết lời nhắc, họ không cần tự chuyển sang app ngân hàng rồi nhập lại thông tin bằng tay.

Luồng mong muốn:

1. Thành viên mở Push/Hộp thư.
2. FCFund hiển thị số công nợ hiện tại.
3. Thành viên bấm **Thanh toán 350.000đ**.
4. FCFund hỏi **Bạn muốn dùng ngân hàng nào?**
5. Thành viên chọn app ngân hàng đang dùng, ví dụ MB Bank.
6. FCFund tạo VietQR deeplink chứa tài khoản nhận, số tiền và nội dung chuyển khoản.
7. Android/iOS mở app ngân hàng tương ứng.
8. Nếu app ngân hàng hỗ trợ autofill, thông tin chuyển khoản được điền sẵn.
9. Thành viên kiểm tra và xác nhận giao dịch trong app ngân hàng.
10. FCFund **không tự ghi nhận đã thanh toán** trong giai đoạn này; Admin/Thủ quỹ vẫn ghi nhận tiền thực nhận như hiện tại.

## 2. Quyết định nghiệp vụ đã chốt

### 2.1. CTA thanh toán

CTA chính trên trang chi tiết nhắc nợ đổi từ:

```text
[Sao chép số tài khoản]
```

thành:

```text
[Thanh toán 350.000đ]
```

Số tiền trên nút phải lấy từ **công nợ hiện tại khi mở trang**, không lấy cứng từ snapshot tại thời điểm gửi lời nhắc.

Ví dụ:

```text
Nợ tại lúc nhắc: 500.000đ
Hiện tại:         350.000đ

[ Thanh toán 350.000đ ]
```

Nếu thành viên không còn nợ:

```text
Hiện tại: Không còn nợ
```

thì không hiển thị CTA thanh toán.

### 2.2. Nội dung chuyển khoản

Nội dung chuyển khoản được tạo động theo mẫu:

```text
Tên Đội Bóng + Tên Thành Viên + DD-MM-YYYY
```

Trong đó **Tên Đội Bóng lấy trực tiếp từ `clubs.name`**, không hard-code `Trai Lang FC` trong source.

Cú pháp thực tế không chứa ký tự `+`; dấu `+` chỉ dùng để mô tả việc nối chuỗi.

Ví dụ:

```text
Trai Lang FC Nguyen Thanh Hai 10-09-2026
```

Quy tắc:

- Phần đầu lấy từ tên đội bóng hiện tại trong `clubs.name`.
- Tên thành viên lấy từ Member đang liên kết với User nhận lời nhắc.
- Ngày dùng định dạng `DD-MM-YYYY`.
- Ngày được tạo tại thời điểm thành viên bấm **Thanh toán**, theo múi giờ `Asia/Ho_Chi_Minh`.
- Khi truyền sang app ngân hàng, nội dung được chuẩn hóa để tương thích tốt hơn: bỏ dấu tiếng Việt, bỏ ký tự đặc biệt, ngày chuyển thành `DDMMYYYY`, giữ tối đa 40 ký tự.
- Ví dụ business content `Trai Lang FC Nguyễn Thanh Hải 23-09-2026` được truyền thành dạng tương thích ngân hàng như `Trai Lang FC Nguyen Thanh Hai 23092026` nếu nằm trong giới hạn.
- Nếu vượt giới hạn, phần tên đội/thành viên được rút gọn nhưng ngày vẫn được giữ.
- Không thêm reminder ID, user ID, mã giao dịch nội bộ hoặc dữ liệu kỹ thuật khác vào nội dung chuyển khoản.
- Client không được tự truyền tên thành viên hoặc số nợ tùy ý; dữ liệu thanh toán phải được dựng từ dữ liệu server đã xác thực.

> Cần test thực tế giới hạn độ dài/nội dung của từng app ngân hàng. Business content chuẩn vẫn là mẫu trên. Nếu provider/bank có giới hạn kỹ thuật khác, không được âm thầm thay đổi nội dung nghiệp vụ; cần có hàm chuẩn hóa được kiểm soát và test riêng.

## 3. Không cần menu ngân hàng riêng cho User

Không tạo thêm một trang Settings kiểu “Ngân hàng của tôi”.

Có hai khái niệm khác nhau:

### Ngân hàng nhận tiền của CLB

Được cấu hình một lần bởi Admin trong **Cài đặt → Thông tin đội bóng**.

Hiện đã có:

- Tên ngân hàng.
- Số tài khoản.
- Chủ tài khoản.
- Ảnh QR.

Cần nâng cấp trường ngân hàng để lưu thêm định danh chuẩn:

```text
bankName
bankCode
bankBin
bankAccountNumber
bankAccountHolder
```

Trong đó:

- `bankCode`: mã ngân hàng dùng khi tạo deeplink/VietQR.
- `bankBin`: BIN 6 số để tạo VietQR động và tránh phụ thuộc text tên ngân hàng.

Không nên chỉ dùng `bankName` dạng text tự do cho tính năng thanh toán.

### Ngân hàng dùng để thanh toán của thành viên

Đây là **app ngân hàng trên thiết bị của User**, ví dụ:

- MB Bank
- Vietcombank
- BIDV SmartBanking
- VietinBank iPay
- ACB ONE
- OCB
- ...

**Quyết định đã chốt: mỗi lần User bấm Thanh toán đều phải hỏi lại dùng ngân hàng nào.**

Không lưu lựa chọn ngân hàng vào:

- Database.
- Cookie.
- localStorage.
- sessionStorage.
- Cache preference trên thiết bị.

Lý do là User có thể muốn dùng ngân hàng khác nhau cho từng lần chuyển khoản, và việc hỏi lại giúp họ chủ động chọn đúng app trước khi rời FCFund để sang ứng dụng ngân hàng.

## 4. Flow tổng thể

```mermaid
flowchart TD
    A[Admin/Thủ quỹ gửi Push nhắc công nợ] --> B[User nhấn Push]
    B --> C[FCFund mở chi tiết lời nhắc]
    C --> D[Server tính công nợ hiện tại]
    D --> E{Còn nợ > 0?}

    E -- Không --> F[Hiển thị Không còn nợ]
    E -- Có --> G[Hiển thị Thanh toán X đồng]

    G --> H[User bấm Thanh toán]
    H --> J[Luôn hiện modal Chọn ngân hàng]
    J --> K[User chọn app ngân hàng]
    K --> O[Tạo payment deeplink]

    O --> P[Mở app ngân hàng]
    P --> Q{Bank hỗ trợ autofill?}

    Q -- Có --> R[Điền sẵn STK + số tiền + nội dung]
    Q -- Chưa/không --> S[Mở app ngân hàng và dùng fallback QR/copy]

    R --> T[User kiểm tra và xác nhận trong app ngân hàng]
    S --> T
    T --> U[Admin/Thủ quỹ ghi nhận tiền thực nhận như hiện tại]
```

## 5. Flow UI đề xuất

### 5.1. Trang chi tiết nhắc công nợ

Ví dụ:

```text
Nhắc đóng quỹ

Nợ tại lúc nhắc
500.000đ

Hiện tại
Còn nợ 350.000đ

[ Thanh toán 350.000đ ]

Thông tin nhận tiền
MB Bank
0123456789
NGUYEN VAN A

[ Hiện VietQR ]
[ Sao chép số tài khoản ]
```

QR và sao chép tài khoản chuyển thành fallback, không còn là CTA chính.

### 5.2. Mỗi lần bấm Thanh toán

Mỗi lần User bấm **Thanh toán**, luôn hiện bottom sheet/modal để chọn ngân hàng:

```text
Thanh toán 350.000đ

Bạn muốn dùng ứng dụng ngân hàng nào?

[ MB Bank           ]
[ Vietcombank       ]
[ BIDV SmartBanking ]
[ VietinBank iPay   ]
[ ACB ONE           ]
[ ...               ]

Hủy
```

Danh sách app ngân hàng lấy từ API deeplink tương ứng với OS:

```text
Android → danh sách Android app deeplinks
iOS     → danh sách iOS app deeplinks
```

Danh sách nên có:

- Logo app.
- Tên app.
- Tên ngân hàng.
- `appId`.
- Deeplink base.

Không hard-code toàn bộ danh sách app ngân hàng vào component nếu có thể tránh.

### 5.3. Không ghi nhớ ngân hàng đã chọn

Sau khi User chọn ngân hàng và deeplink được mở:

- FCFund không lưu app ngân hàng vừa chọn.
- Lần thanh toán tiếp theo vẫn hiện lại bank picker.
- CTA luôn giữ dạng trung lập, ví dụ `Thanh toán 350.000đ`, không đổi thành `Thanh toán bằng MB Bank`.
- Không có nút hoặc trạng thái `Đổi ngân hàng`, vì ngân hàng luôn được chọn lại ở mỗi lần thanh toán.

## 6. Cấu trúc VietQR deeplink

Deeplink thanh toán dự kiến dùng dạng:

```text
https://dl.vietqr.io/pay
  ?app=<APP_ID>
  &ba=<ACCOUNT_NO>@<BANK_CODE>
  &am=<AMOUNT>
  &tn=<TRANSFER_CONTENT>
  &bn=<ACCOUNT_HOLDER>
  &url=<RETURN_URL>
```

Ví dụ khái niệm:

```text
app = mb
ba  = 0123456789@mb
am  = 350000
tn  = <club.name> <member.name> 10-09-2026
bn  = NGUYEN VAN A
url = https://www.trailang.io.vn/notifications/<reminderId>
```

Ý nghĩa:

| Tham số | Nguồn dữ liệu |
|---|---|
| `app` | App ngân hàng User chọn |
| `ba` | STK nhận tiền + bank code của CLB |
| `am` | Công nợ hiện tại |
| `tn` | Nội dung chuyển khoản cố định |
| `bn` | Chủ tài khoản nhận tiền |
| `url` | URL quay về chi tiết reminder |

Luôn truyền đầy đủ các tham số ngay cả khi một số ngân hàng hiện chỉ hỗ trợ mở app mà chưa autofill. Khi app ngân hàng nâng cấp hỗ trợ autofill, FCFund không cần đổi cách tạo link.

## 7. Dữ liệu thanh toán phải được dựng từ server

Không nên tạo toàn bộ deeplink từ các giá trị client có thể sửa.

Đề xuất tạo endpoint:

```text
GET /api/payments/debt-reminder/<reminderId>?app=mb
```

hoặc route tương đương.

Server thực hiện:

1. Xác thực User.
2. Xác thực reminder thuộc đúng club.
3. Xác thực reminder thuộc Member đang liên kết với User.
4. Tính lại số dư hiện tại.
5. Nếu không còn nợ → không tạo payment link.
6. Đọc cấu hình ngân hàng hiện tại của Club.
7. Tạo nội dung chuyển khoản.
8. Validate app ngân hàng được phép.
9. Build deeplink.
10. Trả URL hoặc redirect sang VietQR deeplink.

```mermaid
sequenceDiagram
    participant U as User/PWA
    participant F as FCFund Server
    participant DB as PostgreSQL
    participant V as VietQR Deeplink
    participant B as Bank App

    U->>F: Thanh toán reminderId + appId
    F->>DB: Kiểm tra User/Member/Reminder/Club
    F->>DB: Tính công nợ hiện tại
    DB-->>F: currentDebt

    alt currentDebt <= 0
        F-->>U: Không còn khoản cần thanh toán
    else currentDebt > 0
        F->>F: Tạo transfer content
        F->>F: Build deeplink
        F-->>U: Payment URL
        U->>V: Mở deeplink
        V->>B: Mở app ngân hàng đã chọn
        B-->>U: Màn hình chuyển khoản/xác nhận
    end
```

## 8. Hàm tạo nội dung chuyển khoản

Đề xuất helper server-side:

```ts
buildDebtTransferContent({
  clubName,
  memberName,
  paymentDate,
})
```

Kết quả:

```text
<clubName> <memberName> DD-MM-YYYY
```

Ví dụ:

```text
Trai Lang FC Nguyen Thanh Hai 10-09-2026
```

Ngày phải dùng timezone ứng dụng:

```text
Asia/Ho_Chi_Minh
```

Không dùng UTC trực tiếp để tránh trường hợp gần nửa đêm sinh sai ngày.

## 9. VietQR động làm fallback — Đã triển khai

Trang reminder không còn phụ thuộc ảnh QR upload tĩnh. QR thanh toán được tạo động từ Quick Link VietQR và dùng **custom template `LAZD3qS`**.

Cú pháp:

```text
https://img.vietqr.io/image/<BANK_BIN>-<ACCOUNT_NO>-LAZD3qS.png
  ?amount=<AMOUNT>
  &addInfo=<TRANSFER_CONTENT>
  &accountName=<ACCOUNT_HOLDER>
```

QR động dùng cùng:

- Bank/BIN nhận tiền.
- STK nhận tiền.
- Số công nợ hiện tại.
- Nội dung chuyển khoản đã chuẩn hóa.
- Chủ tài khoản.
- Template VietQR `LAZD3qS`.

Route QR production tự xác thực User/Member/Reminder và tự tính lại current debt:

```text
/api/payments/debt-reminder/<reminderId>/qr
```

Route QR test chỉ chấp nhận event `DEBT_REMINDER_TEST` và cố định số tiền **1.000đ**:

```text
/api/payments/debt-reminder-test/<notificationEventId>/qr
```

UI reminder theo thứ tự:

```text
Thanh toán X đồng
→ Hoặc quét mã QR bên dưới
→ VietQR động, căn giữa
→ Hoặc thanh toán theo STK
→ Thông tin ngân hàng/STK/chủ tài khoản
→ Sao chép số tài khoản
```

Như vậy deeplink và QR luôn cùng dữ liệu:

```mermaid
flowchart LR
    A[Reminder + current debt] --> B[Payment Payload]
    C[Club Bank Config] --> B
    D[Club Name + Member Name + Current Date] --> B

    B --> E[VietQR Deeplink]
    B --> F[VietQR Dynamic QR]

    E --> G[Open Bank App]
    F --> H[Scan QR]
```

Payment payload logic nên chỉ có một nguồn để tránh trường hợp QR ghi 350.000đ nhưng deeplink lại ghi 500.000đ.

## 10. Cấu hình Admin cần bổ sung

Không tạo menu mới. Nâng cấp section **Thông tin đội bóng** hiện có.

Hiện tại:

```text
Ngân hàng:          <text>
Số tài khoản:       <text>
Chủ tài khoản:      <text>
Ảnh QR:             <file>
```

Đề xuất:

```text
Ngân hàng nhận tiền: [searchable bank select]
Bank Code:           tự lấy
BIN:                 tự lấy
Số tài khoản:        <text>
Chủ tài khoản:       <text>

[Kiểm tra cấu hình thanh toán]
```

Admin chỉ chọn tên ngân hàng. `bankCode` và `bankBin` lấy tự động từ dữ liệu ngân hàng.

## 11. Data model đề xuất

Bảng `clubs` hiện có:

```text
bankName
bankAccountNumber
bankAccountHolder
qrUrl
```

Bổ sung:

```text
bankCode varchar(...)
bankBin  varchar(6)
```

Không cần thêm vào `users` bất kỳ trường nào để lưu app ngân hàng thanh toán.

Cũng không cần schema/client model kiểu:

```text
preferredBankApp
```

FCFund chỉ dùng `appId` trong đúng thao tác thanh toán hiện tại để build deeplink, sau đó bỏ lựa chọn này. Mỗi lần thanh toán mới sẽ yêu cầu User chọn lại ngân hàng.

## 12. Hành vi trên Android và iOS

### Android

Ưu tiên:

```text
PWA
→ click Thanh toán
→ chọn MB Bank
→ HTTPS VietQR deeplink
→ Android mở MB Bank
```

Nếu thiết bị không cài app đã chọn:

- Deeplink có thể không mở được app mong muốn.
- User vẫn đang có fallback QR và thông tin tài khoản trong FCFund.
- Không được đánh dấu thanh toán chỉ vì đã click link.

### iOS

Để giảm lỗi chuyển từ PWA/WebView sang app ngân hàng, khi User chọn ngân hàng trên iOS, FCFund không điều hướng trực tiếp từ PWA sang VietQR.

Luồng:

```text
PWA
→ Thanh toán
→ chọn app ngân hàng
→ PWA gọi server lấy payment URL đã kiểm tra
→ mở payment URL bằng Safari qua x-safari-https
→ Safari mở VietQR deeplink
→ bank app
```

Như vậy phần xác thực/reminder/current debt vẫn được xử lý trong phiên PWA hiện tại, còn bước mở deeplink ngân hàng được chuyển sang Safari. Danh sách app/deeplink phải dùng tập dữ liệu dành riêng cho iOS.

### Kiểm tra thông báo / Thử nhắc nợ

Luồng **Kiểm tra thông báo → Thử nhắc nợ** cũng dùng bank picker và VietQR deeplink thật để kiểm tra end-to-end.

Quy tắc riêng của chế độ test:

- Số tiền deeplink luôn cố định ở **1.000đ**.
- Không lấy công nợ thật của User.
- Không tạo hoặc cập nhật `MEMBER_PAYMENT`.
- Không thay đổi số dư/công nợ trong FCFund.
- Mỗi lần bấm **Thanh toán thử 1.000đ** vẫn luôn hỏi chọn ngân hàng.
- App ngân hàng được mở thật; giao dịch ngân hàng chỉ xảy ra nếu User tiếp tục xác nhận trong app ngân hàng.
- Nội dung chuyển khoản vẫn dùng cùng format production:
  `<Tên Đội Bóng> <Tên Thành Viên> DD-MM-YYYY`.
- Nếu tài khoản test chưa liên kết Member, tên hiển thị của User được dùng làm fallback cho phần tên trong nội dung chuyển khoản.
- UI phải cảnh báo rõ đây là deeplink thật với số tiền 1.000đ để tránh User vô tình xác nhận giao dịch.

Route triển khai:

```text
/api/payments/debt-reminder-test/<notificationEventId>?app=<appId>
```

Route chỉ chấp nhận event `DEBT_REMINDER_TEST` thuộc đúng User/Club đang đăng nhập và không nhận amount từ client.

### Khả năng autofill theo app ngân hàng

Không phải app nào trong danh sách deeplink cũng hỗ trợ mở thẳng màn hình chuyển khoản và điền sẵn dữ liệu.

Theo changelog VietQR tại thời điểm triển khai, các app đã công bố hỗ trợ autofill gồm:

- MBBank (`mb`).
- VietinBank iPay (`icb`).
- BIDV SmartBanking (`bidv`).
- ACB ONE (`acb`).
- OCB (`ocb`).

Vietcombank hiện chỉ được VietQR mô tả ở mức mở ứng dụng; không đảm bảo tự điền người nhận/số tiền/nội dung hoặc mở đúng màn hình chuyển khoản. UI bank picker phải hiển thị rõ:

```text
Hỗ trợ điền sẵn thông tin
```

hoặc:

```text
Chỉ mở ứng dụng ngân hàng
```

để User không hiểu nhầm.

## 13. Trạng thái và lỗi cần xử lý

### Club chưa cấu hình ngân hàng

Không hiển thị CTA thanh toán.

Hiển thị:

```text
Thông tin chuyển khoản chưa được cấu hình đầy đủ.
Vui lòng liên hệ Thủ quỹ/Admin.
```

### Club có bankName nhưng thiếu bankCode/BIN

Không build deeplink bằng cách đoán từ text.

Admin phải chọn lại ngân hàng từ danh sách chuẩn.

### Không còn nợ

Không tạo link.

```text
Bạn hiện không còn khoản cần thanh toán.
```

### Chọn ngân hàng thanh toán

Mỗi lần User bấm **Thanh toán** đều mở bank picker, kể cả ngay trước đó User vừa thanh toán bằng một ngân hàng cụ thể.

Không có fast path dựa trên lựa chọn cũ.

### App ngân hàng đã chọn bị gỡ khỏi thiết bị

Deeplink không đảm bảo mở thành công.

FCFund vẫn giữ:

- QR.
- STK.
- Tên chủ tài khoản.
- Nút sao chép.

### API danh sách app ngân hàng lỗi

Có thể:

1. Dùng cache danh sách ngân hàng/app gần nhất trên server.
2. Nếu không có cache, giữ QR/copy fallback.
3. Không chặn toàn bộ trang reminder.

## 14. Bảo mật và tính đúng dữ liệu

- Không tin `amount` từ client.
- Không tin `memberName` từ client.
- Không tin bank nhận tiền từ client.
- `appId` do client chọn nhưng phải validate với danh sách app hỗ trợ.
- Server luôn tính lại current debt.
- Server luôn kiểm tra reminder/user/member/club.
- Payment deeplink không phải bằng chứng thanh toán.
- Không tự cập nhật `MEMBER_PAYMENT` khi User chỉ mở app ngân hàng.
- Không lưu access token hay credential ngân hàng.
- Không tích hợp login internet banking.
- User tự kiểm tra và xác nhận giao dịch trong app ngân hàng.

## 15. Quan hệ với Push công nợ hiện tại

Không cần đổi logic gửi Push.

Push vẫn dẫn tới reminder:

```text
Push
→ /notifications/<reminderId>
→ currentMemberBalances()
→ hiện số nợ mới nhất
→ CTA Thanh toán
```

Điểm thay đổi nằm ở action trong trang reminder.

```mermaid
flowchart TD
    A[Push nhắc đóng quỹ] --> B[Chi tiết reminder]
    B --> C[Current member balance]
    C --> D{Debt > 0}
    D -- No --> E[Không còn nợ]
    D -- Yes --> F[Thanh toán X đồng]
    F --> G[Luôn mở Bank picker]
    G --> H[Payment deeplink]
    H --> I[Bank App]
```

## 16. Các file dự kiến liên quan khi triển khai

Hiện trạng:

- `src/app/(app)/notifications/[id]/page.tsx`
  - đang hiển thị QR/tài khoản và `CopyBankAccount`.
- `src/components/copy-bank-account.tsx`
  - fallback hiện tại.
- `src/app/(app)/settings/page.tsx`
  - cấu hình ngân hàng của Club.
- `src/app/(app)/mutations.ts`
  - update thông tin Club.
- `src/db/schema.ts`
  - cần thêm bank code/BIN nếu chưa có.
- `src/lib/current-member-balance.ts`
  - nguồn current debt hiện tại.

Dự kiến thêm:

```text
src/components/debt-payment-button.tsx
src/components/bank-app-picker.tsx
src/lib/vietqr.ts
src/app/api/payments/debt-reminder/[id]/route.ts
```

Tên file chỉ là đề xuất; khi triển khai cần kiểm tra conventions hiện tại của project trước.

## 17. Roadmap triển khai

### Phase 1 — Deeplink thanh toán — Đã triển khai

- Đã thêm `bankCode`, `bankBin` bằng migration `0019_lying_shiver_man`.
- Settings ngân hàng dùng danh sách chuẩn từ VietQR; server xác thực lại ngân hàng khi lưu.
- Đã tạo helper payment payload/deeplink trong `src/lib/vietqr.ts`.
- Đã tạo bank app picker lấy đúng danh sách Android/iOS từ VietQR.
- Mỗi lần thanh toán luôn mở bank picker; không lưu preferred bank app.
- Đã tạo route thanh toán theo reminder, tính lại current debt ở server trước khi redirect.
- CTA reminder đổi thành `Thanh toán X đồng` khi cấu hình ngân hàng mới đầy đủ.
- QR và sao chép số tài khoản vẫn giữ làm fallback.

### Phase 2 — QR động — Đã triển khai

- Không phụ thuộc ảnh QR upload cố định.
- QR sinh theo current debt.
- QR dùng đúng transfer content của deeplink.
- Có thể giữ QR upload legacy trong thời gian migration.

### Phase 3 — Xác nhận thanh toán tự động

Ngoài phạm vi tài liệu này.

Có thể nghiên cứu sau:

- Payment request riêng.
- Webhook/provider confirmation.
- Mapping giao dịch nhận tiền về Member.
- Tự đề xuất/tạo `MEMBER_PAYMENT`.
- Chống duplicate webhook.
- Reconciliation cho Admin/Thủ quỹ.

Không triển khai Phase 3 cùng Phase 1 để tránh làm phức tạp feature mở app ngân hàng.

## 18. Tiêu chí hoàn thành Phase 1

Feature được xem là đạt khi:

1. Admin chọn được ngân hàng nhận tiền bằng dữ liệu chuẩn.
2. Reminder còn nợ hiển thị đúng `Thanh toán <current debt>`.
3. Mỗi lần click Thanh toán đều hỏi app ngân hàng.
4. Không lưu app ngân hàng đã chọn vào DB, cookie, localStorage hoặc sessionStorage.
5. Sau khi User chọn ngân hàng, FCFund tạo deeplink cho đúng app của lần thanh toán đó.
6. Deeplink chứa đúng STK nhận tiền.
7. Deeplink chứa đúng current debt.
8. Nội dung là:
   `<Tên Đội Bóng> <Tên Thành Viên> DD-MM-YYYY`, trong đó tên đội bóng lấy từ `clubs.name`.
9. App ngân hàng được mở khi thiết bị hỗ trợ.
10. QR/copy vẫn hoạt động khi deeplink không dùng được.
11. Không tạo transaction FCFund chỉ vì User đã click Thanh toán.
12. Không có dữ liệu payment quan trọng nào được tin trực tiếp từ client.

## 19. Nguồn kỹ thuật tham khảo

Thiết kế deeplink/QR dựa trên tài liệu chính thức VietQR hiện tại:

- Deeplink App ngân hàng.
- API danh sách Android App Deeplinks.
- API danh sách iOS App Deeplinks.
- VietQR Quick Link.
- API tạo mã QR.
- VietQR changelog về hỗ trợ autofill của từng app ngân hàng.

Các API/provider là dependency bên ngoài, vì vậy khi bắt đầu implementation cần kiểm tra lại response schema thực tế và capability của các app ngân hàng ở thời điểm triển khai.
