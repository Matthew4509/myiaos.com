// YouTube Player: paste a YouTube link and it plays in YouTube's own privacy-enhanced player (youtube-nocookie.com)
// inside the window. Nothing reaches YouTube until a video is played, except the small pictures of saved videos (from
// i.ytimg.com); signing in to YouTube inside MyiaOS is not possible (YouTube does not allow it in a frame).
// No search (it would need a YouTube key); people paste a link.
// Saved videos are kept in the person's own files (/System/youtube.json). Locking the screen pauses the video.
import { h, on } from '../core/dom.ts';
import { ServiceApi } from '../net/service.ts';
import type { AppDef } from '../shell/types.ts';
import { cleanClip, embedUrl, parseClip, thumbUrl, watchUrl, type Clip } from './youtube/links.ts';
import { APPS } from './catalog.ts';

const SAVED_PATH = '/System/youtube.json';
const MAX_SAVED = 500;

interface Saved extends Clip {
  title: string;
  added: number;
}

const clipKey = (c: Clip) => (c.kind === 'playlist' ? `list:${c.list}` : `video:${c.id}`);

export const youtubeApp: AppDef = {
  ...APPS.youtube,
  async launch(app, arg) {
    const shell = app.shell;
    app.root.classList.add('yt');
    const service = shell.account ? new ServiceApi(shell.account.api.base, 'youtube') : null;
    let saved: Saved[] = [];
    let current: (Clip & { title?: string }) | null = null;

    const input = h('input', { type: 'text', class: 'field yt-input', placeholder: 'Paste a YouTube link (a video or a playlist)', 'aria-label': 'YouTube link', spellcheck: false, autocomplete: 'off' });
    const goBtn = h('button', { type: 'button', class: 'tool wide' }, 'Play');
    const saveBtn = h('button', { type: 'button', class: 'tool wide', disabled: true, title: 'Keep this video in your saved list' }, '☆ Save');
    const outBtn = h('button', { type: 'button', class: 'tool wide', disabled: true, title: 'Open this video on YouTube in a new browser tab' }, 'Open on YouTube');
    const list = h('div', { class: 'yt-list', role: 'list' });
    const stage = h('div', { class: 'yt-stage' });
    const status = h('div', { class: 'statusbar', role: 'status' });
    app.root.append(
      h('div', { class: 'toolbar yt-bar' }, input, goBtn, saveBtn, outBtn),
      h('div', { class: 'yt-body' }, h('div', { class: 'yt-side' }, h('h2', { class: 'yt-head' }, 'Saved videos'), list), stage),
      status,
    );

    function idle() {
      stage.replaceChildren(h('div', { class: 'yt-idle' },
        h('p', {}, 'Paste a YouTube link above and press Play.'),
        h('p', { class: 'hint' }, 'Find the video on YouTube in your browser, copy its address, and paste it here.'),
        h('p', { class: 'hint' }, 'Nothing is sent to YouTube until you play something, apart from the small pictures of videos you saved, which come from YouTube\'s picture server. Playing a video connects to YouTube (Google), in its privacy-enhanced mode.')));
    }

    async function loadSaved() {
      try {
        const text = await shell.fs.readText(SAVED_PATH);
        const raw = JSON.parse(text) as unknown;
        saved = (Array.isArray(raw) ? raw : []).flatMap(r => {
          const clip = cleanClip(r);
          const s = r as Partial<Saved>;
          return clip ? [{ ...clip, title: String(s.title ?? '').slice(0, 200) || 'Untitled', added: Number(s.added) || 0 }] : [];
        });
      } catch {
        saved = [];
      }
    }
    async function writeSaved() {
      try {
        await shell.fs.ensureFolder('/System', { hidden: true });
        await shell.fs.writeText(SAVED_PATH, JSON.stringify(saved.slice(0, MAX_SAVED)), { hidden: true });
      } catch (error) {
        await shell.report('Could not save the list', error);
      }
    }

    function row(clip: Clip, title: string, sub: string, remove?: () => void): HTMLElement {
      const thumb = clip.id ? thumbUrl(clip.id) : null;
      const pic = thumb ? h('img', { class: 'yt-thumb', src: thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'yt-thumb yt-thumb-list' }, '☰');
      const x = remove ? h('button', { type: 'button', class: 'yt-x', title: 'Remove from saved', 'aria-label': `Remove ${title}` }, '×') : null;
      const el = h('div', { class: 'yt-row', role: 'listitem', tabindex: '0', title }, pic, h('div', { class: 'yt-text' }, h('div', { class: 'yt-title' }, title), h('div', { class: 'yt-sub' }, sub)), x);
      on(el, 'click', e => e.target !== x && play({ ...clip, title }), app.signal);
      on(el, 'keydown', (e: KeyboardEvent) => e.key === 'Enter' && play({ ...clip, title }), app.signal);
      if (x && remove) on(x, 'click', remove, app.signal);
      return el;
    }

    function paintList() {
      list.replaceChildren(...saved.map((s, i) => row(s, s.title, s.kind === 'playlist' ? 'Playlist' : new Date(s.added).toLocaleDateString(), () => {
        saved.splice(i, 1);
        void writeSaved();
        paintList();
        refreshButtons();
      })));
      if (!saved.length) list.append(h('p', { class: 'yt-empty' }, 'Videos you save with ☆ appear here.'));
    }

    function refreshButtons() {
      saveBtn.disabled = !current;
      const isSaved = !!current && saved.some(s => clipKey(s) === clipKey(current!));
      saveBtn.textContent = isSaved ? '★ Saved' : '☆ Save';
      saveBtn.setAttribute('aria-pressed', String(isSaved));
      outBtn.disabled = !current;
    }

    function play(clip: Clip & { title?: string }) {
      current = clip;
      const frame = h('iframe', {
        class: 'yt-frame',
        src: embedUrl(clip) + `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`,
        title: clip.title ?? 'YouTube video',
        // YouTube's player needs to know which site embeds it (it refuses to play otherwise); the rest of the desktop
        // sends no referrer at all.
        referrerpolicy: 'strict-origin-when-cross-origin',
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
      });
      stage.replaceChildren(frame);
      app.setTitle(clip.title ? `${clip.title} - YouTube Player` : 'YouTube Player');
      status.textContent = clip.kind === 'playlist' ? 'Playing a playlist from YouTube.' : 'Playing from YouTube (privacy-enhanced mode).';
      refreshButtons();
      if (clip.kind === 'video' && !clip.title && service) void fillTitle(clip);
    }

    async function fillTitle(clip: Clip & { title?: string }) {
      try {
        const r = await service!.call<{ title: string }>('title', { query: { id: clip.id! } });
        if (current === clip && r.title) {
          clip.title = r.title;
          app.setTitle(`${r.title} - YouTube Player`);
        }
      } catch {
        // The title is a nicety; the video still plays.
      }
    }

    function go() {
      const text = input.value.trim();
      if (!text) return;
      const clip = parseClip(text);
      if (clip) play(clip);
      else if (/^[a-z]+:\/\//i.test(text) || /^[\w-]+\.[a-z]{2,}\//i.test(text)) status.textContent = 'That is not a YouTube link. Only videos from youtube.com and youtu.be play here.';
      else status.textContent = 'That is not a link. This player does not search: find the video on YouTube in your browser, copy its address, and paste it here.';
    }

    on(goBtn, 'click', go, app.signal);
    on(input, 'keydown', (e: KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), go()), app.signal);
    on(outBtn, 'click', () => current && window.open(watchUrl(current), '_blank', 'noopener,noreferrer'), app.signal);
    on(saveBtn, 'click', async () => {
      if (!current) return;
      const at = saved.findIndex(s => clipKey(s) === clipKey(current!));
      if (at >= 0) saved.splice(at, 1);
      else {
        const title = current.title ?? (await shell.dialogs.prompt({ title: 'Save video', label: 'A name for it', value: current.kind === 'playlist' ? 'Playlist' : 'Video', ok: 'Save' }));
        if (title === null) return;
        const { kind, id, list: l, start } = current;
        saved.unshift({ kind, ...(id ? { id } : {}), ...(l ? { list: l } : {}), ...(start ? { start } : {}), title: title.slice(0, 200), added: Date.now() });
      }
      await writeSaved();
      paintList();
      refreshButtons();
    }, app.signal);
    // Locking the screen pauses the video (through YouTube's own player commands).
    shell.lockChanged.on(locked => {
      const frame = stage.querySelector('iframe');
      if (locked && frame?.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 'https://www.youtube-nocookie.com');
    }, app.signal);

    idle();
    await loadSaved();
    paintList();
    refreshButtons();
    if (arg) {
      input.value = arg;
      go();
    }
    input.focus();
  },
};
