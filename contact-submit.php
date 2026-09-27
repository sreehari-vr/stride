<?php
// Stride Labs contact form handler. Sends the enquiry to info@thestridelabs.com
// via SMTP (PHPMailer), since PHP's built-in mail() is unreliable on shared
// hosting and was silently dropping submissions. Also sends a short
// confirmation email back to the person who submitted the form.

require __DIR__ . '/vendor/phpmailer/src/Exception.php';
require __DIR__ . '/vendor/phpmailer/src/PHPMailer.php';
require __DIR__ . '/vendor/phpmailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

$cfg = require __DIR__ . '/mail-config.php';

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

function newMailer($cfg) {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $cfg['host'];
    $mail->Port = $cfg['port'];
    $mail->SMTPSecure = $cfg['secure'] === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : PHPMailer::ENCRYPTION_SMTPS;
    $mail->SMTPAuth = true;
    $mail->Username = $cfg['username'];
    $mail->Password = $cfg['password'];
    $mail->CharSet = 'UTF-8';
    return $mail;
}

// Confirmation email, styled to match the site (graphite ink, paper background,
// ember accent — see style.css :root tokens).
function confirmationEmailHtml($name, $message) {
    $name = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $message = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
    $font = "'Helvetica Neue', Arial, sans-serif";
    return <<<HTML
<!doctype html>
<html>
<body style="margin:0; padding:0; background:#F4F3F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3F0;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:100%; background:#FFFFFF; border:1px solid rgba(16,19,20,.14);">
          <tr>
            <td style="padding:24px 40px; border-bottom:1px solid rgba(16,19,20,.14);">
              <img src="https://thestridelabs.com/assets/logo-email.png" width="36" height="34" alt="Stride Labs" style="display:block; width:36px; height:34px;">
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 10px; font-family:$font; font-weight:700; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#F26419;">Message received</p>
              <h1 style="margin:0 0 18px; font-family:$font; font-weight:800; font-size:26px; letter-spacing:-.02em; color:#101314;">Thanks, $name.</h1>
              <p style="margin:0 0 24px; font-family:$font; font-size:15px; line-height:1.6; color:#101314;">We've got your message and someone from our team will get back to you shortly.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px; background:#F4F3F0; border-left:3px solid #F26419;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 6px; font-family:$font; font-weight:700; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:#626B6E;">Your message</p>
                    <p style="margin:0; font-family:$font; font-size:14px; line-height:1.6; color:#101314;">$message</p>
                  </td>
                </tr>
              </table>
              <a href="https://thestridelabs.com" style="display:inline-block; padding:13px 26px; background:#F26419; color:#101314; font-family:$font; font-weight:700; font-size:14px; text-decoration:none;">Visit thestridelabs.com</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px; border-top:1px solid rgba(16,19,20,.14);">
              <p style="margin:0; font-family:$font; font-size:12px; color:#626B6E;">Stride Labs &middot; <a href="mailto:info@thestridelabs.com" style="color:#626B6E;">info@thestridelabs.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
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

// 1. Notify the team. This must succeed for the submission to count.
try {
    $mail = newMailer($cfg);
    $mail->setFrom($cfg['from'], $cfg['fromName']);
    $mail->addAddress($cfg['to']);
    $mail->addReplyTo($email, $name);

    $mail->Subject = 'New project enquiry: ' . $name;
    $mail->Body = $body;
    $mail->isHTML(false);

    $mail->send();
} catch (PHPMailerException $e) {
    error_log('Contact form mail failed: ' . $mail->ErrorInfo);
    respond(false, 'We couldn\'t send your message. Please email info@thestridelabs.com directly.', 500);
}

// 2. Confirmation back to the visitor. Best-effort: if this fails, the lead
// still reached us above, so we don't fail the whole submission over it.
try {
    $reply = newMailer($cfg);
    $reply->setFrom($cfg['from'], $cfg['fromName']);
    $reply->addAddress($email, $name);

    $reply->Subject = 'Thanks for reaching out to Stride Labs';
    $reply->isHTML(true);
    $reply->Body = confirmationEmailHtml($name, $message);
    $reply->AltBody = "Hi $name,\n\n"
                     . "Thanks for getting in touch with Stride Labs. We've received your message "
                     . "and someone from our team will get back to you shortly.\n\n"
                     . "For reference, here's what you sent us:\n\n$message\n\n"
                     . "Talk soon,\nStride Labs\n";

    $reply->send();
} catch (PHPMailerException $e) {
    error_log('Contact form auto-reply failed: ' . $reply->ErrorInfo);
}

@touch($lock);
respond(true, 'Thanks, we\'ve got your message and will be in touch.');
