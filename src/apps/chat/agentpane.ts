// Chat's Agents tab: pick an AI, connect it, and talk; every thread is kept in Documents/AI chats (chat/agents.ts).
// The built-in models run on this device (assistant/engine.ts; connecting loads the model, the first time a download
// from this MyiaOS). Claude answers with the person's own key (assistant/claude.ts; the key is added in the
// Claude settings in Settings › AI). The AI can be swapped in the middle of a thread; each answer is labelled with the AI
// that wrote it.
//
// The built-in AI and the open thread belong to the whole desktop, not to this tab: moving from the Overview's chat to
// another view shows "Already connected" and the chat so far. A model already running (started here or in another view) is joined without starting it again, and the thread
// (chat/live.ts) is the same one every view shows.
import { h, on } from '../../core/dom.ts';
import { formatSize } from '../../core/format.ts';
import { ServiceApi } from '../../net/service.ts';
import { joinPath } from '../../fs/names.ts';
import { pickSave } from '../../shell/filepicker.ts';
import type { AppHandle } from '../../shell/types.ts';
import { checkDevice, fitText, isDownloadProblem, jobPrompt, modelLabel, modelName, probeSavedModel, startProblem, OnDevice, rememberModel, type ChatTurn, type StopReason } from '../assistant/engine.ts';
import { inHerOwnWords, personaTurns } from '../assistant/persona.ts';
import { listModels, withMyModels, type ModelInfo } from '../assistant/models.ts';
import { askClaude, CLAUDE_MAX_INPUT, money, type ClaudeSettings } from '../assistant/claude.ts';
import type { OpenRouterSettings } from '../assistant/openrouter.ts';
import { baseName } from '../../fs/names.ts';
import { pickFile } from '../../shell/filepicker.ts';
import { isTextName } from '../notepadpro/findfiles.ts';
import { AGENT_FOLDER, listThreads, openThread, threadLabel, threadToText, titleFrom, type AgentTurn } from './agents.ts';
import { LiveChat } from './live.ts';

const GEMMA = 'gemma-2-2b-it-q4f32_1-MLC';

export function agentPane(app: AppHandle): { el: HTMLElement; shown: () => Promise<void> } {
  const { shell, signal } = app;
  const api = shell.account ? new ServiceApi(shell.account.api.base, 'ai') : null;
  const orApi = shell.account ? new ServiceApi(shell.account.api.base, 'openrouter') : null;
  const ai = new OnDevice();
  signal.addEventListener('abort', () => void ai.unload(), { once: true });
  const live = LiveChat.for(shell);

  let models: ModelInfo[] = [];
  let claude: ClaudeSettings | null = null;
  let openrouter: OpenRouterSettings | null = null;
  /** The agent that answers: "device:<model id>", "claude" or "openrouter"; null until connected. */
  let connected: string | null = null;
  /** This tab is starting a model, or waiting for its own answer. */
  let busy = false;
  let claudeStop: AbortController | null = null;

  const pick = h('select', { class: 'agent-pick', 'aria-label': 'Agent' });
  const connectBtn = h('button', { type: 'button', class: 'chat-code' }, 'Connect');
  // Disconnect: for the built-in AI it stops the model for the whole
  // desktop (every view too) and frees its graphics memory; the thread stays.
  const disconnectBtn = h('button', { type: 'button', class: 'chat-code', hidden: true, title: 'Stop the AI. The thread stays; for the built-in AI its graphics memory is freed.' }, 'Disconnect');
  const keyBtn = h('button', { type: 'button', class: 'chat-code', title: 'Add or change your Claude or OpenRouter key in Settings › AI' }, 'AI keys...');
  const recent = h('select', { class: 'agent-pick', 'aria-label': 'Recent threads' });
  const newBtn = h('button', { type: 'button', class: 'chat-code' }, 'New thread');
  const saveBtn = h('button', { type: 'button', class: 'chat-code', title: 'Save a copy of this thread somewhere else' }, 'Save as...');
  const deleteBtn = h('button', { type: 'button', class: 'chat-code', title: 'Move this thread to the Recycle Bin' }, 'Delete');
  // Quick jobs on text in the box, or on a text file.
  const sumBtn = h('button', { type: 'button', class: 'chat-code', title: 'Summarise the text in the box, or a file you choose' }, 'Summarise');
  const rewriteBtn = h('button', { type: 'button', class: 'chat-code', title: 'Rewrite the text in the box clearly and politely' }, 'Rewrite');
  const askFileBtn = h('button', { type: 'button', class: 'chat-code', title: 'Choose a text file, then ask a question about it' }, 'Ask about a file...');
  const note = h('p', { class: 'agent-note', role: 'status' });
  const progress = h('progress', { class: 'agent-progress', max: 1, value: 0, hidden: true });
  const list = h('ol', { class: 'chat-msgs', 'aria-live': 'polite', 'aria-label': 'Thread' });
  const box = h('textarea', { class: 'chat-box', rows: 2, 'aria-label': 'Message to the agent' });
  const sendBtn = h('button', { type: 'submit', class: 'chat-send' }, 'Send');
  const stopBtn = h('button', { type: 'button', class: 'chat-code', hidden: true }, 'Stop');
  const form = h('form', { class: 'chat-say' }, box, sendBtn, stopBtn);
  const el = h('div', { class: 'agent-pane', hidden: true },
    h('div', { class: 'agent-bar' }, pick, connectBtn, disconnectBtn, keyBtn),
    h('div', { class: 'agent-bar' }, recent, newBtn, saveBtn, deleteBtn),
    h('div', { class: 'agent-bar' }, sumBtn, rewriteBtn, askFileBtn),
    note, progress, list, form);

  const agentName = (agent: string | null): string =>
    agent === 'claude' ? (claude?.models.find(m => m.id === claude?.model)?.name ?? 'Claude')
      : agent === 'openrouter' ? (openrouter?.modelName || 'OpenRouter')
        : agent ? modelName(agent.slice(7)) : '';

  // ---- Drawing ----
  function renderTurn(t: AgentTurn, writing = false): { li: HTMLElement; text: HTMLElement } {
    const name = t.role === 'user' ? 'You' : t.by ?? 'AI';
    const text = h('p', { class: 'chat-text' }, live.labels.get(t) ?? (t.text || (writing ? '…' : '')));
    const li = h('li', { class: 'chat-msg' + (t.role === 'user' ? ' mine' : ' agent') },
      h('span', { class: `chat-av ${t.role === 'user' ? 'chat-av-0' : 'chat-av-5'}`, 'aria-hidden': 'true' }, t.role === 'user' ? 'Y' : name[0].toUpperCase()),
      h('div', { class: 'chat-msg-body' },
        h('div', { class: 'chat-who' }, name, h('time', { datetime: new Date(t.at).toISOString() }, new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
        text));
    return { li, text };
  }

  /** The answer being written (here or in another view), updated as it comes without drawing the thread again. */
  let pendingText: HTMLElement | null = null;
  function renderThread(): void {
    const thread = live.thread;
    list.replaceChildren(...thread.turns.map(t => renderTurn(t).li));
    pendingText = null;
    if (live.pending) {
      const p = renderTurn({ role: 'assistant', by: live.pending.by, text: live.pending.text, at: Date.now() }, true);
      pendingText = p.text;
      list.append(p.li);
    } else if (!thread.turns.length) list.append(h('li', { class: 'chat-empty' }, connected
      ? `Ask ${agentName(connected)} something. This thread is kept in Documents › AI chats as you go.`
      : 'Choose an agent above and press Connect. Threads are kept in Documents › AI chats, so closing or reloading loses nothing.'));
    list.scrollTop = list.scrollHeight;
  }

  function renderPending(): void {
    if (!live.pending || !pendingText) return renderThread();
    pendingText.textContent = live.pending.text || '…';
    list.scrollTop = list.scrollHeight;
  }

  function renderControls(): void {
    const chosen = pick.value;
    const isConnected = !!chosen && chosen === connected;
    const waiting = live.busy && !busy;
    connectBtn.textContent = isConnected ? 'Connected' : 'Connect';
    connectBtn.disabled = busy || isConnected || !chosen || (chosen === 'claude' && !claude?.hasKey) || (chosen === 'openrouter' && !(openrouter?.hasKey && openrouter.model));
    disconnectBtn.hidden = !connected;
    disconnectBtn.disabled = busy || live.busy;
    keyBtn.hidden = !api;
    sendBtn.disabled = busy || live.busy || !connected;
    box.disabled = !connected;
    box.placeholder = !connected ? 'Connect an agent, then ask.'
      : waiting ? 'The AI is answering in another window; ask when it has finished.'
        : `Ask ${agentName(connected)}. Enter sends; Shift+Enter starts a new line.`;
    stopBtn.hidden = !busy;
    sumBtn.disabled = rewriteBtn.disabled = askFileBtn.disabled = busy || live.busy || !connected;
    saveBtn.disabled = deleteBtn.disabled = busy || live.busy || !live.file;
    newBtn.disabled = busy || live.busy;
    recent.disabled = busy || live.busy;
  }

  async function fillAgents(): Promise<void> {
    // Saved on this MyiaOS, or fetched from Hugging Face when started (assistant/models.ts).
    models = await withMyModels((await listModels(shell.account ? new ServiceApi(shell.account.api.base, 'models') : null)).models, shell.fs);
    claude = null;
    openrouter = null;
    if (api) {
      try {
        claude = await api.call<ClaudeSettings>('settings');
      } catch {
        claude = null;
      }
    }
    if (orApi) {
      try {
        openrouter = await orApi.call<OpenRouterSettings>('settings');
      } catch {
        openrouter = null;
      }
    }
    const was = pick.value;
    pick.replaceChildren(
      ...models.map(m => h('option', { value: `device:${m.id}` }, `${modelLabel(m.id)} (on this device, ${formatSize(m.bytes)}${m.mine ? ', you added it' : m.saved ? '' : ', from Hugging Face'})`)),
      claude?.hasKey
        ? h('option', { value: 'claude' }, `${agentName('claude')} (your API key)`)
        : h('option', { value: 'claude', disabled: true }, api ? 'Claude: add your key first (AI keys...)' : 'Claude: needs the MyiaOS server'),
      openrouter?.hasKey && openrouter.model
        ? h('option', { value: 'openrouter' }, `${agentName('openrouter')} (OpenRouter, your key)`)
        : h('option', { value: 'openrouter', disabled: true }, orApi ? 'OpenRouter: add your key and a model first (AI keys...)' : 'OpenRouter: needs the MyiaOS server'));
    if (!models.length && !claude?.hasKey && !openrouter?.hasKey) pick.prepend(h('option', { value: '', disabled: true }, 'No agent available yet'));
    const keep = [...pick.options].find(o => o.value === (connected ?? was) && !o.disabled);
    // Nothing chosen yet: Gemma, the model the built-in AI's character is written for (assistant/persona.ts).
    const gemma = [...pick.options].find(o => o.value === `device:${GEMMA}` && !o.disabled);
    pick.value = keep ? keep.value : (gemma?.value ?? [...pick.options].find(o => !o.disabled)?.value ?? '');
  }

  async function fillRecent(): Promise<void> {
    const threads = (await listThreads(shell.fs)).slice(0, 30);
    const file = live.file;
    recent.replaceChildren(
      h('option', { value: '' }, threads.length ? `Recent threads (${threads.length})` : 'No kept threads yet'),
      ...threads.map(t => h('option', { value: t.name }, threadLabel(t.name))));
    recent.value = file && threads.some(t => t.name === file) ? file : '';
  }

  // ---- Connecting ----
  const stoppedWords = (why: StopReason | null) =>
    why === 'disconnect' ? 'Disconnected: the built-in AI stopped and its graphics memory is free. Press Connect to start it again.'
      : why === 'lost' ? 'The graphics chip stopped part-way (older chips are reset when the work runs long). Press Connect to start the agent again, then try a shorter question.'
        : 'The built-in AI stopped. Press Connect to start it again.';
  const connectedWords = (id: string, already: boolean) =>
    `${already ? 'Already connected' : 'Connected'}: ${modelName(id)}, on this device. Nothing you type leaves it. It is small and can be wrong.`;

  /**
   * The built-in model running on this desktop (started here or in another view) is joined: nothing starts again.
   * Not when Claude was chosen here, and not while this tab is busy.
   */
  function joinRunning(): void {
    const running = OnDevice.running();
    if (connected?.startsWith('device:') && (!running || connected !== `device:${running.id}`)) {
      connected = null;
      if (!running) note.textContent = stoppedWords(OnDevice.lastStop());
    }
    if (!running || busy || connected) return;
    const value = `device:${running.id}`;
    if (![...pick.options].some(o => o.value === value && !o.disabled)) return;
    connected = value;
    pick.value = value;
    note.textContent = connectedWords(running.id, true);
  }

  async function connect(): Promise<void> {
    const chosen = pick.value;
    if (!chosen || busy) return;
    if (chosen === 'claude' || chosen === 'openrouter') {
      if (chosen === 'claude' ? !claude?.hasKey : !(openrouter?.hasKey && openrouter.model)) return;
      connected = chosen;
      note.textContent = chosen === 'claude'
        ? `Connected: ${agentName('claude')}, with your API key. What you send goes to Anthropic and is paid by your account (${money(claude!.spent)} of your ${money(claude!.cap)} limit used this month).`
        : `Connected: ${agentName('openrouter')}, with your OpenRouter key. What you send goes to OpenRouter and the model's maker, paid from your credit (${money(openrouter!.spent)} of your ${money(openrouter!.cap)} limit used this month).`;
      renderControls();
      renderThread();
      box.focus();
      return;
    }
    const model = models.find(m => `device:${m.id}` === chosen);
    if (!model) return;
    const already = ai.ready && ai.model?.id === model.id;
    if (!already) {
      const device = await checkDevice();
      if (!device.webgpu) {
        note.textContent = device.advice;
        return;
      }
      busy = true;
      renderControls();
      progress.hidden = false;
      note.textContent = `Starting ${modelName(model.id)}...`;
      try {
        // Another model running on this desktop is replaced, for every view too.
        await ai.load(model, (fraction, text) => {
          progress.value = fraction;
          note.textContent = text.replace(/\[[^\]]*\]\s*/g, '').slice(0, 160);
        });
      } catch (error) {
        const words = error instanceof Error ? error.message : 'unknown error';
        const fromServer = model.saved !== false;
        const detail = fromServer && isDownloadProblem(words) ? await probeSavedModel(model) : '';
        note.textContent = startProblem(words, 'Connect', fromServer, detail);
      } finally {
        busy = false;
        progress.hidden = true;
      }
    }
    if (ai.ready && ai.model?.id === model.id) {
      connected = chosen;
      rememberModel(model.id);
      note.textContent = connectedWords(model.id, already);
    }
    renderControls();
    renderThread();
    box.focus();
  }

  // ---- Keeping ----
  async function keep(thread = live.thread): Promise<void> {
    if (!thread.turns.length) return;
    try {
      await live.keep(shell.fs, thread);
      await fillRecent();
    } catch (error) {
      note.textContent = `This thread could not be kept in ${AGENT_FOLDER}: ${error instanceof Error ? error.message : 'unknown error'}. Save as... still works.`;
    }
    renderControls();
  }

  // ---- Talking ----
  /** `shown` is what the thread shows for a quick job ("Summarise: ..."), when it differs from what the AI is sent. */
  async function send(text: string, shown = text): Promise<void> {
    if (busy || live.busy || !connected || !text.trim()) return;
    const agent = connected;
    const by = agentName(agent);
    const thread = live.thread;
    busy = true;
    live.busy = true;
    if (!thread.turns.length) thread.title = titleFrom(text);
    const question: AgentTurn = { role: 'user', text, at: Date.now() };
    if (shown !== text) live.labels.set(question, shown);
    thread.turns.push(question);
    box.value = '';
    live.pending = { by, text: '' };
    live.tell('thread');
    await keep(thread);
    const turns: ChatTurn[] = thread.turns.map(t => ({ role: t.role, content: t.text }));
    const show = (t: string) => {
      if (live.thread !== thread) return;
      live.pending = { by, text: t };
      live.tell('pending');
    };
    let answer = '';
    let failed: string | null = null;
    try {
      if (agent === 'claude' || agent === 'openrouter') {
        claudeStop = new AbortController();
        // OpenRouter's server half streams the same way as Claude's (server/api/openrouter.php).
        const r = await askClaude(agent === 'claude' ? api! : orApi!, turns, show, claudeStop.signal).catch(error => {
          if ((error as Error).name === 'AbortError') return { text: live.pending?.text ?? '', done: null, error: null };
          throw error;
        });
        answer = r.text;
        if (r.error) failed = r.error;
      } else {
        // The built-in AI is Gemma, the same person everywhere (assistant/persona.ts).
        const r = await ai.ask(await personaTurns(shell.fs, shell.account?.user().display ?? '', turns), show);
        answer = inHerOwnWords(r.text);
        if (r.looped) note.textContent = 'The answer began repeating itself, so it was stopped there.';
      }
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error);
      if (/disposed|device.*lost|DEVICE_HUNG/i.test(words)) {
        await ai.lost();
        connected = null;
        failed = 'The graphics chip stopped part-way (older chips are reset when the work runs long). Press Connect to start the agent again, then try a shorter question.';
      } else failed = words;
    } finally {
      claudeStop = null;
      busy = false;
      live.busy = false;
      live.pending = null;
    }
    if (answer.trim()) {
      thread.turns.push({ role: 'assistant', by, text: answer, at: Date.now() });
    } else {
      // An unanswered question is taken back (the next answer then follows the right question) and put back in the box.
      thread.turns.pop();
      box.value = text;
      if (!failed) failed = 'No answer came back. Try asking in a different way.';
    }
    await keep(thread);
    live.tell('thread');
    if (failed) {
      const li = h('li', { class: 'chat-empty agent-error', role: 'alert' }, failed);
      list.append(li);
      list.scrollTop = list.scrollHeight;
    }
    renderControls();
    box.focus();
  }

  // ---- Controls ----
  on(pick, 'change', () => {
    if ((pick.value === 'claude' && claude?.hasKey) || (pick.value === 'openrouter' && openrouter?.hasKey && openrouter.model)) void connect();
    else if (pick.value && pick.value !== connected) {
      note.textContent = ai.ready && `device:${ai.model?.id}` === pick.value
        ? 'Already running on this device: press Connect to use it.'
        : `Press Connect to start it (the first time, the model is copied into this browser from ${models.find(m => `device:${m.id}` === pick.value)?.saved === false ? 'Hugging Face' : 'this MyiaOS'}).${ai.ready ? ` It replaces ${modelName(ai.model?.id ?? '')}, for the whole desktop.` : ''}`;
    }
    renderControls();
  }, signal);
  on(connectBtn, 'click', () => void connect(), signal);
  on(disconnectBtn, 'click', async () => {
    if (!connected || busy || live.busy) return;
    if (connected === 'claude' || connected === 'openrouter') {
      const was = agentName(connected);
      connected = null;
      note.textContent = `Disconnected from ${was}: nothing more is sent until you connect again.`;
    } else await ai.disconnect(); // the model stops for every view too; OnDevice.watch below says so here
    renderThread();
    renderControls();
  }, signal);
  on(keyBtn, 'click', () => void shell.openApp('settings', 'ai'), signal);

  // ---- Quick jobs ----
  const limit = async () => (connected === 'claude' || connected === 'openrouter' ? CLAUDE_MAX_INPUT : (await checkDevice()).maxInput);
  async function chooseTextFile(): Promise<{ name: string; text: string } | null> {
    const path = await pickFile(shell, { title: 'Choose a text file', folder: '/Documents' });
    if (!path) return null;
    if (!isTextName(path)) {
      await shell.dialogs.alert('Not a text file', 'This reads text files (.txt, .md, .csv, code and the like). For a PDF or a picture, copy the words into the box instead.');
      return null;
    }
    try {
      return { name: baseName(path), text: new TextDecoder('utf-8', { fatal: true }).decode(await shell.fs.readFile(path)) };
    } catch {
      await shell.dialogs.alert('Could not read it', 'That file does not look like text.');
      return null;
    }
  }
  async function quick(job: 'summarise' | 'rewrite'): Promise<void> {
    let text = box.value.trim();
    let label: string;
    const verb = job === 'summarise' ? 'Summarise' : 'Rewrite';
    if (!text) {
      const chosen = await chooseTextFile();
      if (!chosen) return;
      text = chosen.text;
      label = `${verb} “${chosen.name}”`;
    } else label = `${verb}:
${text}`;
    const max = await limit();
    const fit = fitText(text, max);
    if (fit.cut) note.textContent = `That text is long, so only the first ${max.toLocaleString()} letters were given to the AI.`;
    await send(jobPrompt(job, fit.text), label);
  }
  on(sumBtn, 'click', () => void quick('summarise'), signal);
  on(rewriteBtn, 'click', () => void quick('rewrite'), signal);
  on(askFileBtn, 'click', async () => {
    const chosen = await chooseTextFile();
    if (!chosen) return;
    const q = await shell.dialogs.prompt({ title: `Ask about “${chosen.name}”`, label: 'Your question', ok: 'Ask', check: v => (v.trim() ? null : 'Type a question.') });
    if (!q) return;
    const fit = fitText(chosen.text, await limit());
    if (fit.cut) note.textContent = 'That file is long, so only its first part was given to the AI.';
    await send(jobPrompt('ask', fit.text, q), `About “${chosen.name}”: ${q}`);
  }, signal);
  on(newBtn, 'click', () => {
    if (busy || live.busy) return;
    live.open({ title: '', turns: [] });
    box.focus();
  }, signal);
  on(recent, 'change', async () => {
    const name = recent.value;
    if (!name || busy || live.busy) return;
    try {
      live.open(await openThread(shell.fs, name), name);
    } catch (error) {
      await shell.report('Could not open that thread', error);
    }
  }, signal);
  on(deleteBtn, 'click', async () => {
    const file = live.file;
    if (!file || busy || live.busy) return;
    const ok = await shell.dialogs.confirm({ title: 'Delete this thread?', text: `“${threadLabel(file)}” moves to the Recycle Bin. You can restore it from there.`, ok: 'Delete', danger: true });
    if (!ok) return;
    await shell.actions.deleteToBin([joinPath(AGENT_FOLDER, file)]);
    live.open({ title: '', turns: [] });
    await fillRecent();
  }, signal);
  on(saveBtn, 'click', async () => {
    const file = live.file;
    if (!file) return;
    const target = await pickSave(shell, { title: 'Save a copy of this thread', folder: '/Documents', name: file });
    if (!target) return;
    try {
      await shell.fs.writeFile(target.path, new TextEncoder().encode(threadToText(live.thread)), target.replace ? {} : { mustBeNew: true });
      shell.toast('Copy saved.');
    } catch (error) {
      await shell.report('Could not save the copy', error);
    }
  }, signal);
  on(stopBtn, 'click', () => {
    if (connected === 'claude' || connected === 'openrouter') claudeStop?.abort();
    else ai.stop();
  }, signal);
  on(box, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  }, signal);
  on(form, 'submit', (e: SubmitEvent) => {
    e.preventDefault();
    void send(box.value.trim());
  }, signal);

  // The thread and the built-in AI are shared with the other views: what happens there shows here.
  live.watch(change => {
    if (change === 'pending') return renderPending();
    if (change === 'thread') {
      renderThread();
      void fillRecent();
    }
    renderControls();
  }, signal);
  OnDevice.watch(() => {
    joinRunning();
    renderThread();
    renderControls();
  }, signal);

  /** Called each time the tab is shown: the agents and threads are read again (a key may have been added meanwhile). */
  async function shown(): Promise<void> {
    await Promise.all([fillAgents(), fillRecent()]);
    // The newest kept thread opens again (once per desktop), so closing the Panel or reloading carries on.
    await live.start(shell.fs);
    joinRunning();
    renderThread();
    renderControls();
  }
  renderControls();
  return { el, shown };
}
