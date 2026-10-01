<?php
// Video titles for the YouTube Player's saved list (YouTube's oEmbed; needs no key). There is no search (it would need
// a YouTube key; people paste a link instead).
//   GET youtube.php?op=title&id=<video id>  the video's title
// Signed-in people only; 300 look-ups an hour each.
declare(strict_types=1);

require __DIR__ . '/../lib/http.php';
require __DIR__ . '/../lib/auth.php';
require __DIR__ . '/../lib/outbound.php';

api_headers();
api_guard();

$config = api_config();
$root = rtrim((string) $config['data_dir'], '/\\');
[, , $user] = require_full($root);

$op = (string) ($_GET['op'] ?? '');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' || $op !== 'title') {
    api_fail(400, 'Unknown request.');
}

$id = (string) ($_GET['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{11}$/D', $id)) {
    api_fail(400, 'That is not a YouTube video id.');
}
$wait = rate_take($root, (string) $user['id'], 'youtube-title', 300, 3600);
if ($wait > 0) {
    api_fail(429, 'Too many title look-ups this hour. The videos still play.', ['wait' => $wait]);
}
try {
    $data = outbound_get_json('https://www.youtube.com/oembed?' . http_build_query(['url' => 'https://www.youtube.com/watch?v=' . $id, 'format' => 'json']));
} catch (RuntimeException $e) {
    api_fail(502, 'YouTube could not be asked: ' . $e->getMessage());
}
$title = isset($data['_status']) ? '' : (string) preg_replace('/^(.{0,200}).*$/us', '$1', (string) ($data['title'] ?? ''));
api_json(['title' => $title]);
