# FCFUND Zalo Profile Proxy

Proxy PHP này chỉ dùng cho bước lấy Zalo profile từ `https://graph.zalo.me/v2.0/me`.

## Yêu cầu hosting

- Hosting có outbound IP được Zalo nhận diện tại Việt Nam.
- PHP 7.4+.
- PHP cURL được bật.
- Có HTTPS.

## File deploy

Upload:

- `index.php`
- `config.php` tạo từ `config.example.php`

Không upload `config.example.php` nếu không cần.

## Tạo secret

Tạo một secret ngẫu nhiên tối thiểu 32 ký tự, ví dụ:

```bash
openssl rand -hex 32
```

Kết quả phải dùng giống nhau ở hai phía:

### PHP hosting

Copy:

```text
config.example.php -> config.php
```

Sau đó sửa:

```php
$fcfundZaloProxySecret = 'SECRET_THAT_BAN_VUA_TAO';
```

Nếu hosting hỗ trợ environment variable, có thể cấu hình:

```text
FCFUND_ZALO_PROXY_SECRET=SECRET_THAT_BAN_VUA_TAO
```

Khi environment variable tồn tại, proxy ưu tiên giá trị này.

### Vercel

Cấu hình:

```text
ZALO_PROFILE_PROXY_URL=https://proxy.example.vn/zalo-profile/
ZALO_PROFILE_PROXY_SECRET=SECRET_THAT_BAN_VUA_TAO
```

Sau đó redeploy production.

## Cơ chế xác thực

FCFUND gửi:

```text
X-FCFUND-Timestamp: <unix timestamp>
X-FCFUND-Signature: HMAC-SHA256(timestamp + "." + rawBody, secret)
```

PHP proxy:

1. chỉ nhận POST;
2. giới hạn body 8 KB;
3. từ chối request lệch thời gian quá 60 giây;
4. xác minh HMAC bằng `hash_equals`;
5. lấy `accessToken` từ JSON;
6. gọi trực tiếp Zalo Graph từ IP của hosting Việt Nam;
7. chỉ trả về `id`, `name`, `pictureUrl`.

Proxy không lưu access token và source không chủ động ghi access token vào log.

## Kiểm tra PHP

Nếu có shell:

```bash
php -l index.php
```

## Kiểm tra outbound IP hosting

Tạo tạm một file riêng rồi xóa ngay sau khi kiểm tra:

```php
<?php
echo file_get_contents('https://api.ipify.org');
```

IP trả về phải được định vị tại Việt Nam. Sau đó mới smoke test Zalo Login production.

## Lưu ý

- Không commit `config.php` chứa secret.
- Không đặt proxy sau một outbound proxy khác có IP nước ngoài.
- Có thể dùng Cloudflare DNS/CDN ở phía inbound; điều quan trọng là request PHP -> Zalo phải thoát trực tiếp bằng IP Việt Nam.
