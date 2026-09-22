<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

const MAX_BODY_BYTES = 8192;
const MAX_CLOCK_SKEW_SECONDS = 60;
const ZALO_PROFILE_URL = 'https://graph.zalo.me/v2.0/me';

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function loadProxySecret(): string
{
    $secret = trim((string) getenv('FCFUND_ZALO_PROXY_SECRET'));
    if ($secret !== '') {
        return $secret;
    }

    $configPath = __DIR__ . '/config.php';
    if (is_file($configPath)) {
        $fcfundZaloProxySecret = '';
        require $configPath;
        $secret = trim((string) $fcfundZaloProxySecret);
    }

    if (strlen($secret) < 32) {
        jsonResponse(500, [
            'error' => 'PROXY_NOT_CONFIGURED',
            'message' => 'Proxy secret chưa được cấu hình hợp lệ.',
        ]);
    }

    return $secret;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    jsonResponse(405, [
        'error' => 'METHOD_NOT_ALLOWED',
        'message' => 'Chỉ hỗ trợ POST.',
    ]);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > MAX_BODY_BYTES) {
    jsonResponse(413, [
        'error' => 'PAYLOAD_TOO_LARGE',
        'message' => 'Request body quá lớn.',
    ]);
}

$rawBody = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($rawBody === false || strlen($rawBody) > MAX_BODY_BYTES) {
    jsonResponse(413, [
        'error' => 'PAYLOAD_TOO_LARGE',
        'message' => 'Request body không hợp lệ.',
    ]);
}

$timestampHeader = trim((string) ($_SERVER['HTTP_X_FCFUND_TIMESTAMP'] ?? ''));
$signatureHeader = strtolower(trim((string) ($_SERVER['HTTP_X_FCFUND_SIGNATURE'] ?? '')));

if (!ctype_digit($timestampHeader)) {
    jsonResponse(401, [
        'error' => 'INVALID_SIGNATURE',
        'message' => 'Thiếu timestamp hợp lệ.',
    ]);
}

$timestamp = (int) $timestampHeader;
if (abs(time() - $timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    jsonResponse(401, [
        'error' => 'REQUEST_EXPIRED',
        'message' => 'Request đã hết thời hạn xác thực.',
    ]);
}

$secret = loadProxySecret();
$expectedSignature = hash_hmac('sha256', $timestampHeader . '.' . $rawBody, $secret);

if (
    strlen($signatureHeader) !== strlen($expectedSignature)
    || !hash_equals($expectedSignature, $signatureHeader)
) {
    jsonResponse(401, [
        'error' => 'INVALID_SIGNATURE',
        'message' => 'Chữ ký request không hợp lệ.',
    ]);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    jsonResponse(400, [
        'error' => 'INVALID_JSON',
        'message' => 'Request body phải là JSON.',
    ]);
}

$accessToken = trim((string) ($payload['accessToken'] ?? ''));
if ($accessToken === '' || strlen($accessToken) > 4096) {
    jsonResponse(400, [
        'error' => 'INVALID_ACCESS_TOKEN',
        'message' => 'Access token không hợp lệ.',
    ]);
}

$curl = curl_init(ZALO_PROFILE_URL);
if ($curl === false) {
    jsonResponse(500, [
        'error' => 'CURL_INIT_FAILED',
        'message' => 'Không khởi tạo được HTTP client.',
    ]);
}

curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'access_token: ' . $accessToken,
    ],
]);

$responseBody = curl_exec($curl);
$curlError = curl_error($curl);
$statusCode = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);

if ($responseBody === false) {
    jsonResponse(502, [
        'error' => 'ZALO_CONNECTION_FAILED',
        'message' => $curlError !== '' ? $curlError : 'Không kết nối được Zalo Graph API.',
    ]);
}

$zaloData = json_decode($responseBody, true);
if (!is_array($zaloData)) {
    jsonResponse(502, [
        'error' => 'ZALO_INVALID_RESPONSE',
        'message' => 'Zalo Graph API trả dữ liệu không hợp lệ.',
        'status' => $statusCode,
    ]);
}

$zaloError = $zaloData['error'] ?? null;
$id = trim((string) ($zaloData['id'] ?? ''));
$name = trim((string) ($zaloData['name'] ?? ''));

if ($statusCode < 200 || $statusCode >= 300 || $zaloError !== null || $id === '' || $name === '') {
    jsonResponse(502, [
        'error' => 'ZALO_PROFILE_ERROR',
        'code' => $zaloError ?? $statusCode,
        'message' => trim((string) ($zaloData['message'] ?? 'Không lấy được Zalo profile.')),
    ]);
}

$pictureUrl = null;
if (isset($zaloData['picture']['data']['url']) && is_string($zaloData['picture']['data']['url'])) {
    $value = trim($zaloData['picture']['data']['url']);
    if ($value !== '') {
        $pictureUrl = $value;
    }
}

jsonResponse(200, [
    'id' => $id,
    'name' => $name,
    'pictureUrl' => $pictureUrl,
]);
