<?php
// Stride Labs contact form handler. Sends the enquiry to info@thestridelabs.com.
const TO = 'info@thestridelabs.com';
const FROM = 'no-reply@thestridelabs.com';

$wantsJson = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

function respond($ok, $msg, $code = 200) {
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Robots-Tag: noindex');
        echo json_encode(['ok' => $ok, 'message' => $msg]);
    } else {
        header('Location: /contact?' . ($ok ? 'sent=1' : 'error=1') . '#form', true, 303);
    }
    exit;
}

function clean($v, $max) {
    $v = is_string($v) ? trim($v) : '';
    $v = str_replace(["\r", "\n", "\0"], ' ', $v);
    return mb_substr($v, 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') respond(false, 'Method not allowed.', 405);

// Spam traps: honeypot field, and a form that was submitted faster than a human could fill it.
if (!empty($_POST['website'])) respond(true, 'Thanks, we\'ll be in touch.');
$ts = (int)($_POST['ts'] ?? 0);
if ($ts > 0 && (time() - intdiv($ts, 1000)) < 3) respond(true, 'Thanks, we\'ll be in touch.');

// Basic per-IP throttle: one enquiry every 30 seconds.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lock = sys_get_temp_dir() . '/sl_contact_' . md5($ip);
if (is_file($lock) && (time() - filemtime($lock)) < 30) respond(false, 'Please wait a moment before sending another message.', 429);

$name = clean($_POST['name'] ?? '', 120);
$email = clean($_POST['email'] ?? '', 160);
$phone = clean($_POST['phone'] ?? '', 40);
$company = clean($_POST['company'] ?? '', 160);
$message = trim((string)($_POST['message'] ?? ''));
$message = mb_substr(str_replace("\0", '', $message), 0, 4000);
$allowed = ['Social Media Marketing', 'Paid Ads & Performance Marketing', 'Business Automation with AI', 'AI Video Production', 'Copywriting', 'Branding & Visual Identity', 'SEO & AEO', 'Not sure yet'];
$services = array_values(array_intersect($allowed, (array)($_POST['services'] ?? [])));

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please fill in your name, a valid email and a message.', 422);
}

$body = "New enquiry from thestridelabs.com\n\n"
      . "Name: $name\nEmail: $email\nPhone: " . ($phone ?: '-') . "\nCompany / website: " . ($company ?: '-') . "\n"
      . "Interested in: " . ($services ? implode(', ', $services) : '-') . "\n\nMessage:\n$message\n";

$headers = [
    'From: Stride Labs Website <' . FROM . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . PHP_VERSION,
];
$subject = '=?UTF-8?B?' . base64_encode('New project enquiry: ' . $name) . '?=';

if (!mail(TO, $subject, $body, implode("\r\n", $headers), '-f' . FROM)) {
    respond(false, 'We couldn\'t send your message. Please email info@thestridelabs.com directly.', 500);
}
@touch($lock);
respond(true, 'Thanks, we\'ve got your message and will be in touch.');
