// YouTube Player: turns what someone pastes (a watch link, youtu.be, Shorts, a playlist, a bare video id) into the
// address of YouTube's privacy-enhanced player. Only YouTube's own hosts are accepted, and ids are checked against
// YouTube's alphabet, so nothing typed can point the player anywhere else.

export interface Clip {
  kind: 'video' | 'playlist';
  /** 11 letters from A-Z a-z 0-9 _ - */
  id?: string;
  list?: string;
  /** Seconds to start at. */
  start?: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const LIST = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$|^(www\.)?youtube-nocookie\.com$/i;

/** "1h2m3s", "90s", "90" -> seconds. */
export function parseTime(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !(m[1] || m[2] || m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseClip(input: string): Clip | null {
  const text = input.trim();
  if (ID.test(text)) return { kind: 'video', id: text };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !HOSTS.test(url.hostname)) return null;
  const start = parseTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const list = url.searchParams.get('list');
  let id: string | undefined;
  if (/youtu\.be$/i.test(url.hostname)) id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? undefined;
  else {
    const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
    if (m && m[2] !== 'videoseries') id = m[2];
  }
  if (id && ID.test(id)) return { kind: 'video', id, ...(start !== undefined ? { start } : {}), ...(list && LIST.test(list) ? { list } : {}) };
  if (list && LIST.test(list)) return { kind: 'playlist', list };
  return null;
}

/** The player's address. No autoplay: a video starts when the person presses play. */
export function embedUrl(clip: Clip): string {
  const base = 'https://www.youtube-nocookie.com/embed/';
  const q = new URLSearchParams({ rel: '0', playsinline: '1' });
  if (clip.kind === 'playlist') {
    q.set('list', clip.list!);
    return `${base}videoseries?${q}`;
  }
  if (clip.start) q.set('start', String(clip.start));
  if (clip.list) q.set('list', clip.list);
  return `${base}${clip.id}?${q}`;
}

/** YouTube's small picture for a video (only ever from YouTube's picture server). */
export function thumbUrl(id: string): string | null {
  return ID.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

/** The address to open the video on YouTube itself, in a new browser tab. */
export function watchUrl(clip: Clip): string {
  if (clip.kind === 'playlist') return `https://www.youtube.com/playlist?list=${clip.list}`;
  return `https://www.youtube.com/watch?v=${clip.id}${clip.start ? `&t=${clip.start}s` : ''}`;
}

/** A saved entry read back from the person's file: kept only if its ids still pass the same checks. */
export function cleanClip(raw: unknown): Clip | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const start = typeof r.start === 'number' && r.start > 0 && r.start < 86400 * 7 ? Math.floor(r.start) : undefined;
  const list = typeof r.list === 'string' && LIST.test(r.list) ? r.list : undefined;
  if (r.kind === 'video' && typeof r.id === 'string' && ID.test(r.id)) return { kind: 'video', id: r.id, ...(start ? { start } : {}), ...(list ? { list } : {}) };
  if (r.kind === 'playlist' && list) return { kind: 'playlist', list };
  return null;
}
