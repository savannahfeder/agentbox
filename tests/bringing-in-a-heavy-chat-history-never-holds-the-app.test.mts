// BRINGING IN A HEAVY CHAT HISTORY NEVER HOLDS THE APP.
//
// What broke (2026-11-21, the first multiplayer onboarding call): right after
// setup brought their chats in, one new Mac showed the spinning wheel for a few
// seconds and the other sat on the sign-in step with it for over ten minutes
// and never reached the inbox. That one held chats with hundreds of subagents
// and very long Codex sessions, and its analytics stopped right after the
// welcome screen.
//
// Measured on stand-in histories. The Claude Code chat list, and the ends of
// the chats picked, were read on the main process. A Codex chat's first
// message and last answer were kept whole and put through a link cleanup that
// grows with the cube of its length (2,000 characters of unclosed links took
// 5.6 s, 8,000 about six minutes), at the import and again every minute in the
// Codex watch. A running session's transcript was read whole the first time
// it was seen (64 MB here).
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImportableThreads } from '../main/importable-threads.mts';
import { readSessionThreads } from '../main/agent-sessions.mts';
import { readCodexThreads } from '../main/codex-threads.mts';
import { readClaudeThreadsOffThread, readCodexThreadsOffThread, readChatEndsOffThread } from '../main/chat-reader.mts';
import { codexImportRow, codexMirrorPatch } from '../shared/codex-import.mts';
import { Store } from '../main/store.mts';

const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const homes: string[] = [];
const aHome = (name: string) => { const h = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), name))); homes.push(h); return h; };
afterAll(() => { for (const h of homes) fs.rmSync(h, { recursive: true, force: true }); });

const rows = (list: object[]) => `${list.map((r) => JSON.stringify(r)).join('\n')}\n`;
const filler = (n: number) => 'the retry queue drains and the ledger stays consistent '.repeat(Math.ceil(n / 55)).slice(0, n);

/** A Claude Code chat as Claude Code files it, with its subagents beside it. */
function claudeChat(home: string, folder: string, { id, ask, turns, toolBytes, subagents = 0, when, picture = 0 }: { id: string; ask: string; turns: number; toolBytes: number; subagents?: number; when: number; picture?: number }) {
  const dir = path.join(home, '.claude', 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const base = { cwd: folder, entrypoint: 'cli', sessionId: id };
  const at = (i: number) => new Date(when - (turns - i) * 1000).toISOString();
  // A screenshot pasted into the first message is written into its row.
  const opening = picture ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo'.repeat(Math.ceil(picture / 11)) } }, { type: 'text', text: ask }] : ask;
  const list: object[] = [{ ...base, type: 'user', timestamp: at(0), message: { role: 'user', content: opening } }];
  for (let i = 0; i < turns; i += 1) {
    list.push({ ...base, type: 'assistant', timestamp: at(i), message: { content: [{ type: 'text', text: `Step ${i}.` }, { type: 'tool_use', id: `t${i}`, name: i < subagents ? 'Task' : 'Bash', input: {} }] } });
    list.push({ ...base, type: 'user', timestamp: at(i), toolUseResult: {}, message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: filler(toolBytes) }] } });
  }
  list.push({ ...base, type: 'assistant', timestamp: new Date(when).toISOString(), message: { content: [{ type: 'text', text: `Done with ${ask}.` }] } });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, rows(list));
  fs.utimesSync(file, new Date(when), new Date(when));
  for (let s = 0; s < subagents; s += 1) {
    const sub = path.join(dir, id, 'subagents', `agent-${s}.jsonl`);
    fs.mkdirSync(path.dirname(sub), { recursive: true });
    fs.writeFileSync(sub, rows([{ ...base, isSidechain: true, type: 'user', timestamp: at(0), message: { role: 'user', content: `subtask ${s}` } }]));
  }
}

/** A Codex conversation whose first message and last answer are `prompt` and `last`. */
function codexChat(home: string, folder: string, { id, prompt, last, when }: { id: string; prompt: string; last: string; when: number }) {
  const d = new Date(when);
  const dir = path.join(home, '.codex', 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const ts = d.toISOString();
  const file = path.join(dir, `rollout-${ts.replace(/[:.]/g, '-')}-${id}.jsonl`);
  fs.writeFileSync(file, rows([
    { type: 'session_meta', timestamp: ts, payload: { id, cwd: folder, timestamp: ts, source: 'cli', thread_source: 'user' } },
    { type: 'event_msg', timestamp: ts, payload: { type: 'user_message', message: prompt } },
    { type: 'event_msg', timestamp: ts, payload: { type: 'agent_message', message: last } },
  ]));
  fs.utimesSync(file, d, d);
}

/** The app held, measured as the longest gap between beats 10 ms apart. */
async function longestHold<T>(fn: () => Promise<T>): Promise<{ value: T; longest: number; took: number }> {
  let longest = 0;
  let last = performance.now();
  const beat = setInterval(() => { const t = performance.now(); longest = Math.max(longest, t - last); last = t; }, 10);
  const at = performance.now();
  const value = await fn();
  const took = performance.now() - at;
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(beat);
  return { value, longest, took };
}

describe('the chat list setup offers', () => {
  let home: string;
  const now = Date.now();
  beforeAll(() => {
    home = aHome('heavy-history-');
    const folders = ['api', 'web', 'agents', 'billing'].map((n) => path.join(home, 'code', n));
    for (const f of folders) fs.mkdirSync(f, { recursive: true });
    claudeChat(home, folders[2], { id: 'sweep-750', ask: 'Run the eval sweep across every model', turns: 800, toolBytes: 3000, subagents: 750, when: now - 60_000 });
    for (let i = 0; i < 5; i += 1) claudeChat(home, folders[i % 4], { id: `big-${i}`, ask: `Migrate the ledger, part ${i}`, turns: 600, toolBytes: 6000, when: now - (i + 2) * 3_600_000 });
    for (let i = 0; i < 600; i += 1) claudeChat(home, folders[i % 4], { id: `chat-${i}`, ask: `Fix flaky test ${i}`, turns: 30, toolBytes: 4000, when: now - (i + 10) * 600_000, picture: i % 4 ? 0 : 400_000 });
    for (let i = 0; i < 12; i += 1) codexChat(home, folders[i % 4], { id: `codex-${i}`, prompt: `Tidy module ${i}`, last: `Tidied module ${i}.`, when: now - i * 900_000 });
  }, 120_000);

  it('is read off the main process, and is the list the main process would read', async () => {
    const dirs = [path.join(home, '.claude')];
    const { value: off, longest, took } = await longestHold(() => readImportableThreads({ home, env: {}, shellEnv: {}, readCodex: readCodexThreadsOffThread, readClaude: readClaudeThreadsOffThread }));
    const here = [...readSessionThreads({ home, dirs }).threads, ...readCodexThreads({ home, codexDirs: [path.join(home, '.codex')] }).threads];
    expect(off.map((t) => t.id).sort()).toEqual(here.map((t) => t.id).sort());
    expect(off.some((t) => t.id === 'sweep-750')).toBe(true);
    expect(longest).toBeLessThan(Math.max(150, took / 4));
  }, 120_000);

  it('reads the ends of the chats picked off the main process too', async () => {
    const listed = readSessionThreads({ home, dirs: [path.join(home, '.claude')], ends: false }).threads.slice(0, 50);
    const { value: ended } = await longestHold(() => readChatEndsOffThread(listed));
    expect(ended).toHaveLength(listed.length);
    expect(ended.every((t) => typeof t.lastSaid === 'string' && !t.endUnknown)).toBe(true);
  }, 60_000);

  it('is how the app reads it for setup, the name search and the import', () => {
    const ipc = read('main/ipc.mts');
    expect(ipc).toMatch(/const readAllThreads = \(\) => readImportableThreads\(\{ config, supervisor, readCodex: readCodexThreadsOffThread, readClaude: readClaudeThreadsOffThread \}\)/);
    expect(ipc).toMatch(/readSearchableThreads\(\{ config, supervisor, readCodex: readCodexThreadsOffThread, readClaude: readClaudeThreadsOffThread \}\)/);
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:import-threads'"), ipc.indexOf("ipcMain.handle('zero:import-agents'"));
    expect(handler).toMatch(/await readChatEndsOffThread\(/);
    expect(handler).not.toMatch(/[^.]readChatEnds\(/);
  });
});

describe('a Codex chat', () => {
  const now = Date.now();
  const long = filler(300 * 1024);
  // A markdown link left open, again and again on one line, as in a pasted log.
  const tangled = '[a]('.repeat(750);

  it('keeps no more of its first message and last answer than a Claude Code chat does', () => {
    const home = aHome('codex-long-');
    const folder = path.join(home, 'code', 'api');
    fs.mkdirSync(folder, { recursive: true });
    codexChat(home, folder, { id: 'long-1', prompt: `Start here. ${long}`, last: `${long} The report is written.`, when: now });
    const [t] = readCodexThreads({ home, codexDirs: [path.join(home, '.codex')] }).threads;
    expect(t.prompt.length).toBeLessThanOrEqual(4000);
    expect(t.prompt.startsWith('Start here.')).toBe(true);
    expect(t.last.length).toBeLessThanOrEqual(8000);
    expect(t.last.endsWith('The report is written.')).toBe(true);
    expect(t.lastSaid).toBe(t.last);
    expect(t.firstSaid).toBe(t.prompt);
  });

  it('builds its rows in the same few milliseconds however its links are written', () => {
    const at = performance.now();
    for (const text of [tangled, `${tangled}\n${long}`]) {
      codexImportRow({ id: 'x', title: 'Tangled', prompt: text, last: text }, { projectName: 'API', now });
      codexMirrorPatch({ id: 'x', title: 'Tangled', prompt: text, last: text });
    }
    expect(performance.now() - at).toBeLessThan(500);
  }, 120_000);

  it('comes in with the rest of its folder, whatever the length of its words', async () => {
    const root = aHome('codex-import-');
    const accountRoot = path.join(root, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    const folder = path.join(root, 'code', 'api');
    const { slug } = store.createProduct({ name: 'API', repoPath: folder });
    const chat = (id: string, prompt: string, last: string) => ({ id, source: 'codex', folder, title: id, when: now, prompt, last, firstSaid: prompt, lastSaid: last });
    const chosen = [chat('c-long', long, long), chat('c-tangled', tangled, tangled), chat('c-plain', 'Tidy it', 'Tidied.')];
    const at = performance.now();
    const out = store.importCodexThreads(slug, chosen as never, { land: 'inbox' });
    expect(out.added).toBe(3);
    const items = store.listItems().filter((i) => i.product === slug);
    expect(items).toHaveLength(3);
    for (const i of items) expect(String(i.body ?? '').length + String(i.result ?? '').length).toBeLessThanOrEqual(12_000);
    // And the watch that keeps them current every minute.
    store.refreshCodexMirrors(chosen.map((t) => ({ ...t, last: `${t.last} More.` })) as never);
    expect(performance.now() - at).toBeLessThan(1500);
  }, 120_000);
});

describe('an import cut off part way', () => {
  it('is finished by the next one, and nothing comes in twice', async () => {
    const root = aHome('import-again-');
    const accountRoot = path.join(root, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    const folder = path.join(root, 'code', 'web');
    const { slug } = store.createProduct({ name: 'Web', repoPath: folder });
    const now = Date.now();
    const claude = ['a', 'b', 'c'].map((id) => ({ id, source: 'terminal', folder, title: `Chat ${id}`, firstSaid: `Ask ${id}`, lastSaid: `Answer ${id}.`, when: now }));
    const codex = ['x', 'y'].map((id) => ({ id, source: 'codex', folder, title: `Codex ${id}`, prompt: `Ask ${id}`, last: `Answer ${id}.`, when: now }));
    // The first import got through one of each before the app was quit.
    store.importThreadRows(slug, claude.slice(0, 1) as never);
    store.importCodexThreads(slug, codex.slice(0, 1) as never);
    const again = { claude: store.importThreadRows(slug, [...claude, ...codex] as never), codex: store.importCodexThreads(slug, [...claude, ...codex] as never) };
    expect(again.claude).toMatchObject({ added: 2, already: 1 });
    expect(again.codex).toMatchObject({ added: 1, already: 1 });
    const labels = store.listItems().filter((i) => i.product === slug).flatMap((i) => (i.labels ?? []).filter((l) => /^(thread|codex):/.test(String(l))));
    expect(labels.sort()).toEqual(['codex:x', 'codex:y', 'thread:a', 'thread:b', 'thread:c']);
  });
});

describe('a running session seen for the first time', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads its start and its end, not the whole transcript', async () => {
    const home = aHome('live-session-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const cwd = path.join(home, 'code', 'agents');
    const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'live-1.jsonl');
    const fd = fs.openSync(file, 'w');
    const ts = new Date().toISOString();
    fs.writeSync(fd, rows([{ type: 'user', cwd, timestamp: ts, message: { role: 'user', content: 'Run all 750 subagents' } }]));
    const progress = rows(Array.from({ length: 256 }, () => ({ type: 'progress', cwd, timestamp: ts, data: { message: filler(4000) } })));
    while (fs.fstatSync(fd).size < 64 * 1024 * 1024) fs.writeSync(fd, progress);
    fs.writeSync(fd, rows([
      { type: 'ai-title', aiTitle: 'The eval sweep' },
      { type: 'assistant', cwd, timestamp: ts, message: { content: [{ type: 'text', text: 'All 750 finished.' }] } },
    ]));
    fs.closeSync(fd);
    const agents = await import('../main/agents.mts');
    let asked = 0;
    const real = fs.readSync;
    vi.spyOn(fs, 'readSync').mockImplementation(((...a: Parameters<typeof fs.readSync>) => { asked += Number(a[3] ?? 0); return real(...a); }) as typeof fs.readSync);
    const facts = agents.__readHistory('live-1', cwd);
    expect(facts.asked[0]?.text).toBe('Run all 750 subagents');
    expect(facts.lastSaid).toBe('All 750 finished.');
    expect(facts.about).toBe('The eval sweep');
    expect(asked).toBeLessThan(32 * 1024 * 1024);
  }, 60_000);
});
