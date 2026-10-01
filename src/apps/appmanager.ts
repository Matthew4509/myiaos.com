// Application manager: the apps on this MyiaOS by kind (Games, Office, System) as a grid of icons, and Updates. Optional
// apps (src/release.ts OPTIONAL_APPS) carry Install / Remove: each person chooses them for their own desktop. New apps and new
// versions of the built-in ones arrive as a System update, signed by MyiaOS and fetched from myiaos.com by this
// MyiaOS's own server (server/lib/updater.php); only the owner installs one. Opened with "updates" it starts there.
import { h, on } from '../core/dom.ts';
import { formatSize } from '../core/format.ts';
import { ServiceApi } from '../net/service.ts';
import { HIDDEN_APPS, OPTIONAL_APPS } from '../release.ts';
import { icon, type IconName } from '../shell/icons.ts';
import type { AppDef } from '../shell/types.ts';
import { APPS } from './catalog.ts';

type Kind = 'games' | 'office' | 'system';

const KINDS: Array<{ id: Kind | 'updates'; label: string }> = [
  { id: 'games', label: 'Games' },
  { id: 'office', label: 'Office' },
  { id: 'system', label: 'System' },
  { id: 'updates', label: 'Updates' },
];

/** Which shelf each app sits on; an app not named here is Office. */
const KIND_OF: Partial<Record<string, Kind>> = {
  planetziods: 'games', printer: 'games', officeprinter: 'games',
  explorer: 'system', terminal: 'system', taskmanager: 'system', settings: 'system', account: 'system',
  shortcuts: 'system', about: 'system', trash: 'system', riscv: 'system', aimodels: 'system', panel: 'system', appmanager: 'system',
};

interface Check {
  current: string;
  owner: boolean;
  back: string | null;
  latest: { version: string; date: string; notes: string; bytes: number } | null;
  newer: boolean;
  error: string | null;
  missing?: string[];
}

export const appManagerApp: AppDef = {
  ...APPS.appmanager,
  async launch(app, arg) {
    const { shell, signal } = app;
    app.root.classList.add('ast');
    const api = shell.account ? new ServiceApi(shell.account.api.base, 'update') : null;
    const nav = h('nav', { class: 'ast-nav', 'aria-label': 'Kinds of app' });
    const panel = h('div', { class: 'ast-panel' });
    app.root.append(nav, panel);
    let showing: Kind | 'updates' = arg === 'updates' ? 'updates' : 'games';

    const buttons = KINDS.map(k => {
      const b = h('button', { type: 'button', class: 'ast-kind' }, k.label);
      on(b, 'click', () => { showing = k.id; paint(); }, signal);
      return { k, b };
    });
    nav.append(...buttons.map(x => x.b));

    function paint(): void {
      for (const { k, b } of buttons) b.setAttribute('aria-current', String(k.id === showing));
      if (showing === 'updates') { void paintUpdates(); return; }
      const apps = Object.values(APPS).filter(a => 'start' in a && a.start && !HIDDEN_APPS.includes(a.id) && (KIND_OF[a.id] ?? 'office') === showing);
      const more = h('button', { type: 'button', class: 'btn' }, 'Search for more apps');
      on(more, 'click', () => { showing = 'updates'; paint(); }, signal);
      panel.replaceChildren(
        h('div', { class: 'ast-grid', role: 'list' }, ...apps.map(a => {
          const optional = OPTIONAL_APPS.includes(a.id);
          const installed = !optional || shell.installedApps.has(a.id);
          const b = h('button', { type: 'button', class: 'ast-app', disabled: !installed }, icon(a.icon as IconName, 48), h('span', {}, a.title));
          on(b, 'click', () => void shell.openApp(a.id), signal);
          if (!optional) return h('div', { class: 'ast-tile', role: 'listitem' }, b);
          // An optional app: this person adds it to their own Start menu, or takes it off again.
          const toggle = h('button', { type: 'button', class: `btn ast-install${installed ? '' : ' primary'}` }, installed ? 'Remove' : 'Install');
          on(toggle, 'click', () => {
            toggle.disabled = true;
            shell.setInstalled(a.id, !installed).then(
              () => {
                shell.toast(installed ? `${a.title} is removed from your Start menu.` : `${a.title} is installed: open it here or from the Start menu.`);
                paint();
              },
              error => {
                toggle.disabled = false;
                void shell.report(installed ? `${a.title} could not be removed` : `${a.title} could not be installed`, error);
              },
            );
          }, signal);
          return h('div', { class: 'ast-tile', role: 'listitem' }, b, toggle);
        })),
        ...(apps.length ? [] : [h('p', { class: 'hint' }, 'None on this shelf yet.')]),
        h('p', { class: 'hint' }, 'New apps come with MyiaOS updates. Search for more apps checks myiaos.com for one.'),
        more,
      );
    }

    async function paintUpdates(): Promise<void> {
      const status = h('p', { class: 'hint', role: 'status' }, 'Checking myiaos.com...');
      const again = h('button', { type: 'button', class: 'btn' }, 'Search for more apps and updates');
      on(again, 'click', () => void paintUpdates(), signal);
      panel.replaceChildren(h('h2', { class: 'set-h' }, 'Updates'), status);
      if (!api) { status.textContent = 'Updates need this MyiaOS to run on its server.'; return; }
      let c: Check;
      try {
        c = await api.call<Check>('check', { signal });
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'The update check failed.';
        panel.append(again);
        return;
      }
      const rows: Array<HTMLElement | null> = [h('p', {}, `This MyiaOS is version ${c.current}.`)];
      if (c.error) status.textContent = c.error;
      else if (!c.newer) status.textContent = `Up to date. The newest is ${c.latest?.version ?? c.current}.`;
      else status.textContent = '';
      if (c.newer && c.latest) {
        const l = c.latest;
        rows.push(
          h('div', { class: 'ast-update' },
            h('strong', {}, `MyiaOS ${l.version} is available`),
            h('span', { class: 'hint' }, `${l.date}${l.bytes ? ` · ${formatSize(l.bytes)}` : ''}`),
            h('h3', {}, "What's new"),
            h('p', { class: 'ast-notes' }, l.notes)),
        );
        if (c.owner) {
          if (c.missing?.length) rows.push(h('p', { class: 'hint' }, `${c.missing.join(' ')} Until then, update by unzipping the new version in cPanel.`));
          const install = h('button', { type: 'button', class: 'btn primary' }, `Install ${l.version}`);
          on(install, 'click', () => void act('install', install, `Installing ${l.version}... keep this window open.`), signal);
          rows.push(install);
        } else {
          rows.push(h('p', { class: 'hint' }, 'The owner of this MyiaOS installs updates.'));
        }
      }
      if (c.owner && c.back) {
        const back = h('button', { type: 'button', class: 'btn' }, `Go back to ${c.back}`);
        on(back, 'click', () => void act('rollback', back, `Putting ${c.back} back...`), signal);
        rows.push(h('p', { class: 'hint' }, 'The version from before the last update is kept, in case the new one misbehaves.'), back);
      }
      panel.append(...rows.filter((r): r is HTMLElement => !!r), again);
    }

    async function act(op: 'install' | 'rollback', button: HTMLButtonElement, words: string): Promise<void> {
      if (!api) return;
      button.disabled = true;
      const note = h('p', { class: 'hint', role: 'status' }, words);
      button.after(note);
      try {
        const r = await api.call<{ version: string }>(op, { body: {} });
        note.textContent = `MyiaOS ${r.version} is installed. Restarting the desktop to use it...`;
        setTimeout(() => location.reload(), 1500);
      } catch (error) {
        note.textContent = error instanceof Error ? error.message : 'It did not work. Nothing was changed.';
        button.disabled = false;
      }
    }

    paint();
  },
};
