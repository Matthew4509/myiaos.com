// YouTube Player: what a pasted link becomes, and what is refused.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedUrl, parseClip, parseTime, thumbUrl } from '../src/apps/youtube/links.ts';

test('the usual kinds of link all find the video, its start time and playlist', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of [
    `https://www.youtube.com/watch?v=${id}`, `youtube.com/watch?v=${id}&feature=share`, `https://youtu.be/${id}`,
    `https://m.youtube.com/watch?v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?si=abc`, `https://music.youtube.com/watch?v=${id}`, id,
  ]) assert.equal(parseClip(link)?.id, id, link);
  assert.deepEqual(parseClip(`https://youtu.be/${id}?t=1m30s`), { kind: 'video', id, start: 90 });
  assert.deepEqual(parseClip(`https://www.youtube.com/watch?v=${id}&list=PL1234567890ab`), { kind: 'video', id, list: 'PL1234567890ab' });
  assert.deepEqual(parseClip('https://www.youtube.com/playlist?list=PL1234567890ab'), { kind: 'playlist', list: 'PL1234567890ab' });
});

test('other sites, other schemes and bad ids are refused', () => {
  for (const bad of [
    'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><x',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ', 'data:text/html,x', '',
  ]) assert.equal(parseClip(bad), null, bad);
});

test('the player address is YouTube\'s privacy-enhanced one, never autoplay', () => {
  const v = embedUrl({ kind: 'video', id: 'dQw4w9WgXcQ', start: 90 });
  assert.equal(v, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&start=90');
  assert.ok(!v.includes('autoplay'));
  assert.equal(embedUrl({ kind: 'playlist', list: 'PL1234567890ab' }), 'https://www.youtube-nocookie.com/embed/videoseries?rel=0&playsinline=1&list=PL1234567890ab');
  assert.equal(thumbUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  assert.equal(thumbUrl('../../x'), null);
  assert.equal(parseTime('1h2m3s'), 3723);
  assert.equal(parseTime('abc'), undefined);
});
