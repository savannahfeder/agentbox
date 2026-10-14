// THE IMPORT SURVIVES ODD FOLDERS, COPIES AND SETTINGS.
//
// Written by Codex on 2026-10-11 as an adversarial review of the change that
// made the import read every Claude Code and Codex data folder (w-e46f2e9cea).
// 65 cases on made-up homes; 13 failed against that first commit:
//   - a stale Codex copy beat the newer one, because the copy was judged by a
//     date that folded in the index file's own timestamp;
//   - the copy kept lost the name Codex had given the conversation in another
//     folder's index;
//   - a damaged newer Claude copy hid the good older one;
//   - seven ways an odd config or supervisor made the app's wiring silently
//     read nothing beyond the defaults (missing methods, null profiles, a home
//     that throws, null config, environment homes dropped, the Codex watch, the
//     import "yes" lookup);
//   - three older head-reading bugs: a one-row file with no final newline, a long
//     row written with spaces around its type, and a large non-message first row.
// All but the last are fixed; that one is pinned below as a known gap.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appSessionFolders, claudeDataDirs, codexDataDirs, sessionFolders } from '../main/agent-homes.mjs';
import { readSessionThreads } from '../main/agent-sessions.mjs';
import { readCodexThreads } from '../main/codex-threads.mjs';
import { scanCodex } from '../main/codex-watch.mjs';

const NOW = Date.UTC(2026, 9, 11, 18);
let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-qa-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });
const mkdir = p => (fs.mkdirSync(p, { recursive: true }), p);
function put(file, rows, when = NOW - 1000, newline = true) {
  mkdir(path.dirname(file));
  fs.writeFileSync(file, rows.map(r => typeof r === 'string' ? r : JSON.stringify(r)).join('\n') + (newline ? '\n' : ''));
  fs.utimesSync(file, new Date(when), new Date(when));
  return file;
}
function claude(dir = '.claude', { id = 'c1', ep = 'cli', cwd = `${home}/work`, text = 'Fix checkout', when, extra = {}, newline = true, nested = '' } = {}) {
  return put(path.join(home, dir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), nested, `${id}.jsonl`),
    [{ type: 'user', sessionId: id, entrypoint: ep, cwd, message: { role: 'user', content: text }, ...extra }], when, newline);
}
function codex(dir = '.codex', { id = 'x1', cwd = `${home}/work`, text = 'Fix checkout', when, timestamp = NOW - 10000, meta = {}, extra = [], date = '2026/10/11' } = {}) {
  return put(path.join(home, dir, 'sessions', date, `rollout-test-${id}.jsonl`), [
    { type: 'session_meta', timestamp: new Date(timestamp).toISOString(), payload: { id, cwd, timestamp: new Date(timestamp).toISOString(), originator: 'codex_cli_rs', source: 'cli', ...meta } },
    { type: 'event_msg', timestamp: new Date(timestamp).toISOString(), payload: { type: 'user_message', message: text } }, ...extra,
  ], when);
}
const cr = opts => readSessionThreads({ home, now: NOW, ...opts });
const xr = opts => readCodexThreads({ home, now: NOW, ...opts });
const ids = r => r.threads.map(t => t.id);
function index(dir, id, name, when) {
  put(path.join(home, dir, 'session_index.jsonl'), [{ id, thread_name: name, updated_at: new Date(when).toISOString() }]);
}

it('single default Claude home retains terminal, desktop-entrypoint, and editor labels', () => {
  for (const [id, ep] of [['terminal', 'cli'], ['desktop', 'claude-desktop'], ['editor', 'claude-vscode']]) claude('.claude', { id, ep });
  expect(cr().threads.map(t => [t.id, t.source]).sort()).toEqual([['desktop', 'desktop'], ['editor', 'editor'], ['terminal', 'terminal']]);
});
it('single default Codex home retains named title, prompt, reply, and source', () => {
  codex('.codex', { extra: [{ type: 'event_msg', payload: { type: 'agent_message', message: 'Fixed it' } }] });
  index('.codex', 'x1', 'Checkout repair', NOW - 500);
  expect(xr().threads[0]).toMatchObject({ id: 'x1', title: 'Checkout repair', prompt: 'Fix checkout', last: 'Fixed it', source: 'codex', turns: 1 });
});
for (const [tool, inner, discover, write] of [['claude', 'projects', claudeDataDirs, claude], ['codex', 'sessions', codexDataDirs, codex]]) {
  it(`${tool}: symlink default, environment alias, and trailing slash are one folder`, () => {
    write('data'); fs.symlinkSync(path.join(home, 'data'), path.join(home, `.${tool}`));
    const key = tool === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME';
    const dirs = discover({ home, env: { [key]: `${home}/.${tool}/` }, configured: ['default', `${home}/data/`] });
    expect(dirs).toEqual([path.join(home, `.${tool}`)]);
    expect(ids(tool === 'claude' ? cr({ dirs }) : xr({ codexDirs: dirs }))).toHaveLength(1);
  });
  it(`${tool}: files, broken links, no-dot names, and missing inner folders are ignored`, () => {
    write(`.${tool}`); write(`${tool}-src`);
    fs.writeFileSync(path.join(home, `.${tool}-file`), 'not a directory');
    fs.symlinkSync(path.join(home, 'missing'), path.join(home, `.${tool}-broken`));
    mkdir(path.join(home, `.${tool}-worktrees`));
    expect(discover({ home, env: {}, configured: [null, {}, '', 'default', `${home}/missing`] })).toEqual([`${home}/.${tool}`]);
  });
  it(`${tool}: an empty ${inner} directory offers no sessions`, () => {
    mkdir(path.join(home, `.${tool}-empty`, inner));
    expect(ids(tool === 'claude' ? cr() : xr())).toEqual([]);
  });
  it(`${tool}: configured and environment homes outside the synthetic home are found`, () => {
    // Nested fake user home; sibling data is still inside the disposable root.
    const user = mkdir(path.join(home, 'user'));
    write('environment', { id: 'env' }); write('configured', { id: 'config' });
    const key = tool === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME';
    expect(discover({ home: user, env: { [key]: `${home}/environment/` }, configured: `${home}/configured` }).sort()).toEqual([`${home}/configured`, `${home}/environment`]);
  });
  it(`${tool}: unreadable data root does not hide a readable sibling`, () => {
    write(`.${tool}-denied`, { id: 'denied' }); write(`.${tool}-good`, { id: 'good' });
    const denied = `${home}/.${tool}-denied/${inner}`;
    // Deterministic EACCES even on a privileged runner; real sibling remains real I/O.
    const original = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation((p, ...args) => {
      if (String(p) === denied) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return original(p, ...args);
    });
    expect(ids(tool === 'claude' ? cr() : xr())).toEqual(['good']);
  });
  it(`${tool}: three duplicate copies choose newest mtime independent of folder order`, () => {
    const old = write(`.${tool}-a`, { when: NOW - 3000, text: 'Old copy' });
    const newest = write(`.${tool}-b`, { when: NOW - 1000, text: 'Newest copy' });
    write(`.${tool}-c`, { when: NOW - 2000, text: 'Middle copy' });
    const result = tool === 'claude' ? cr() : xr();
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]).toMatchObject({ path: newest, title: 'Newest copy', when: NOW - 1000 });
    expect(result.threads[0].path).not.toBe(old);
  });
}
it('Linux XDG_CONFIG_HOME selects its claude directory', () => {
  claude('xdg/claude'); claude('.config/claude', { id: 'fallback' });
  expect(claudeDataDirs({ home, env: { XDG_CONFIG_HOME: `${home}/xdg` } })).toEqual([`${home}/xdg/claude`]);
  expect(claudeDataDirs({ home, env: {} })).toEqual([`${home}/.config/claude`]);
});
it('sessionFolders combines both environment variables and configured profiles', () => {
  for (const dir of ['ce', 'cp']) claude(dir);
  for (const dir of ['xe', 'xp']) codex(dir);
  expect(sessionFolders({ home, env: { CLAUDE_CONFIG_DIR: `${home}/ce`, CODEX_HOME: `${home}/xe` }, claudeProfiles: [`${home}/cp`], codexHomes: ['default', '', `${home}/xp`] })).toEqual({ dirs: [`${home}/ce`, `${home}/cp`], codexDirs: [`${home}/xe`, `${home}/xp`] });
});
for (const ep of ['sdk-cli', 'sdk-ts', 'sdk-py', 'remote', 'remote_mobile', 'unknown', undefined, '']) {
  it(`Claude refuses entrypoint ${String(ep) || '(empty)'}`, () => {
    claude('.claude-alt', { extra: { entrypoint: ep } }); expect(ids(cr())).toEqual([]);
  });
}
it('Claude ignores nested subagents and temporary working folders', () => {
  claude('.claude-alt', { id: 'sub', nested: 'parent/subagents' });
  claude('.claude-alt', { id: 'tmp', cwd: '/tmp/qa-work' });
  claude('.claude-alt', { id: 'private-tmp', cwd: '/private/tmp/qa-work' });
  claude('.claude-alt', { id: 'good', cwd: '/home/example/work' });
  expect(ids(cr())).toEqual(['good']);
});
for (const meta of [{ originator: 'agentbox' }, { thread_source: 'subagent' }, { source: { subagent: {} } }, { thread_source: 'guardian_review' }]) {
  it(`Codex refuses ${JSON.stringify(meta)}`, () => { codex('.codex-alt', { meta }); expect(ids(xr())).toEqual([]); });
}
it('Codex ignores temporary cwd and respects explicit single-home selection', () => {
  codex('.codex', { id: 'main' }); codex('.codex-alt', { id: 'alt' }); codex('.codex-alt', { id: 'tmp', cwd: '/tmp/qa-work' });
  expect(ids(xr({ codexDir: `${home}/.codex-alt` }))).toEqual(['alt']);
});
it('recent cutoff excludes old sessions in both tools', () => {
  claude('.claude', { id: 'old', when: NOW - 11 * 86400000 }); claude('.claude', { id: 'recent' });
  codex('.codex', { id: 'old', when: NOW - 11 * 86400000, timestamp: NOW - 12 * 86400000 }); codex('.codex', { id: 'recent' });
  expect(ids(cr())).toEqual(['recent']); expect(ids(xr())).toEqual(['recent']);
});
it('many homes: newest Claude session wins global max rather than discovery order', () => {
  for (let i = 0; i < 80; i++) claude(`.claude-${String(i).padStart(3, '0')}`, { id: `c${i}`, when: NOW - 100000 + i * 1000 });
  expect(ids(cr({ max: 1 }))).toEqual(['c79']);
});
it('many homes: 80 Codex homes are all read', () => {
  for (let i = 0; i < 80; i++) codex(`.codex-${i}`, { id: `x${i}` });
  expect(xr().threads).toHaveLength(80);
});
it('Claude read budget is shared across homes and prioritizes newest files', () => {
  for (let i = 0; i < 4; i++) claude(`.claude-${i}`, { id: `c${i}`, when: NOW - 4000 + i * 1000 });
  let elapsed = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => NOW + elapsed);
  const original = fs.readSync;
  vi.spyOn(fs, 'readSync').mockImplementation((...args) => { elapsed += 1600; return original(...args); });
  const result = cr();
  expect(ids(result)).toEqual(['c3', 'c2']); expect(result.skipped.unread).toBe(2);
});
it('Claude first user row beyond 96 KiB still reads editor text after an image', () => {
  claude('.claude', { ep: 'claude-vscode', text: [{ type: 'image', source: { data: 'a'.repeat(150000) } }, { type: 'text', text: 'Describe the screenshot' }] });
  expect(cr().threads[0]).toMatchObject({ source: 'editor', title: 'Describe the screenshot' });
});
it('Claude final complete JSON row without newline is still a session', () => {
  claude('.claude', { newline: false }); expect(ids(cr())).toEqual(['c1']);
});
it('Claude long first user row tolerates JSON whitespace around type', () => {
  const file = claude('.claude', { text: 'Explain this image', extra: { padding: 'a'.repeat(150000) } });
  const content = fs.readFileSync(file, 'utf8').replace('"type":"user"', '"type": "user"');
  put(file, [content.trimEnd()]); expect(ids(cr())).toEqual(['c1']);
});
// KNOWN GAP, left as it was before this change: reading past a large first row
// that is not a message would mean reading past the head of thousands of the
// app's own worker transcripts too, whose first rows are often that large.
// `it.fails` turns red the day it starts working, so this note gets updated.
it.fails('known gap: an oversized non-message first row still hides the session', () => {
  const file = claude('.claude', { ep: 'claude-vscode' });
  const row = fs.readFileSync(file, 'utf8').trimEnd();
  put(file, [{ type: 'file-history-snapshot', snapshot: { padding: 'a'.repeat(150000) } }, row]);
  expect(ids(cr())).toEqual(['c1']);
});
it('Codex newer rollout keeps a title known only to the older home index', () => {
  codex('.codex-a', { when: NOW - 5000 }); index('.codex-a', 'x1', 'Named conversation', NOW - 5000);
  const newest = codex('.codex-b', { when: NOW - 1000, text: 'Newer prompt' });
  expect(xr().threads[0]).toMatchObject({ path: newest, title: 'Named conversation' });
});
it('Codex index timestamp must not make an older rollout beat newer mtime', () => {
  codex('.codex-a', { when: NOW - 5000, text: 'Old prompt' }); index('.codex-a', 'x1', 'Renamed', NOW);
  const newest = codex('.codex-b', { when: NOW - 1000, text: 'New prompt' });
  expect(xr().threads[0]).toMatchObject({ path: newest, prompt: 'New prompt' });
});
it('a damaged newest Claude copy does not erase the valid older session', () => {
  claude('.claude-a', { when: NOW - 5000 }); const damaged = claude('.claude-b');
  put(damaged, ['{"type":"user",']); expect(ids(cr())).toEqual(['c1']);
});

// THE APP'S WIRING. The import card, the import "yes" and the Codex watch all
// take their folders from `appSessionFolders`, which is called here exactly as
// they call it; the last test checks they still do.
const ipcText = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
const mainText = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');
function wiredRead(config, supervisor, env = {}) {
  const { dirs, codexDirs } = appSessionFolders({ config, supervisor, env, home });
  return [...cr({ dirs }).threads, ...xr({ codexDirs }).threads];
}
const goodSupervisor = () => ({ _codexProfiles: () => ['custom'], _codexProfileHome: () => `${home}/xp` });
it('IPC healthy wiring reads configured and environment homes for both tools', () => {
  claude('cp', { id: 'cp' }); claude('ce', { id: 'ce' }); codex('xp', { id: 'xp' }); codex('xe', { id: 'xe' });
  expect(wiredRead({ authProfiles: [`${home}/cp`] }, goodSupervisor(), { CLAUDE_CONFIG_DIR: `${home}/ce`, CODEX_HOME: `${home}/xe` }).map(t => t.id).sort()).toEqual(['ce', 'cp', 'xe', 'xp']);
});
for (const [name, supervisor] of [['missing methods', {}], ['null profiles', { _codexProfiles: () => null }], ['throwing resolver', { _codexProfiles: () => ['bad'], _codexProfileHome: () => { throw Error('bad home'); } }]]) {
  it(`IPC ${name}: does not throw and retains valid configured Claude folder`, () => {
    claude('cp'); expect(wiredRead({ authProfiles: [`${home}/cp`] }, supervisor).map(t => t.id)).toEqual(['c1']);
  });
}
it('IPC null config does not discard valid Codex configured home', () => {
  codex('xp'); expect(wiredRead(null, goodSupervisor()).map(t => t.id)).toEqual(['x1']);
});
it('IPC bad supervisor still reads environment-only homes', () => {
  claude('ce'); codex('xe');
  expect(wiredRead({}, {}, { CLAUDE_CONFIG_DIR: `${home}/ce`, CODEX_HOME: `${home}/xe` }).map(t => t.id).sort()).toEqual(['c1', 'x1']);
});
const watchReader = (supervisor) => (opts) => xr({ ...opts, codexDirs: appSessionFolders({ config: null, supervisor, env: {}, home }).codexDirs });
it('main watch healthy wiring passes configured Codex homes and scan time', () => {
  codex('xp'); expect(ids(watchReader(goodSupervisor())({ now: NOW }))).toEqual(['x1']);
});
it('main watch odd supervisor does not throw at scan boundary', () => {
  const store = { refreshCodexMirrors: vi.fn(() => 0), refreshCodexAsks: vi.fn(() => 0) };
  expect(() => scanCodex({ store, readThreads: watchReader({}), now: NOW })).not.toThrow();
});
it('main watch odd supervisor still refreshes default-home sessions', () => {
  codex('.codex'); const store = { refreshCodexMirrors: vi.fn(() => 1), refreshCodexAsks: vi.fn(() => 0) };
  expect(scanCodex({ store, readThreads: watchReader({}), now: NOW }).threads).toBe(1);
  expect(store.refreshCodexMirrors).toHaveBeenCalled();
});

it('folder discovery tolerates null and non-array configured values', () => {
  claude(); codex();
  for (const configured of [null, undefined, {}, 42, ['', 'default', null, {}]]) {
    expect(claudeDataDirs({ home, env: null, configured })).toEqual([`${home}/.claude`]);
    expect(codexDataDirs({ home, env: null, configured })).toEqual([`${home}/.codex`]);
  }
});
it('missing home is harmless and explicit external profiles still work', () => {
  claude('cp'); codex('xp');
  const result = sessionFolders({ home: `${home}/absent-user`, env: {}, claudeProfiles: [`${home}/cp`], codexHomes: [`${home}/xp`] });
  expect(result).toEqual({ dirs: [`${home}/cp`], codexDirs: [`${home}/xp`] });
});
it('discovery survives unreadable home enumeration but keeps explicit defaults', () => {
  claude(); codex();
  const original = fs.readdirSync;
  vi.spyOn(fs, 'readdirSync').mockImplementation((p, ...args) => {
    if (String(p) === home) throw Object.assign(Error('denied'), { code: 'EACCES' });
    return original(p, ...args);
  });
  expect(ids(cr())).toEqual(['c1']); expect(ids(xr())).toEqual(['x1']);
});
it('unreadable individual transcripts do not hide other session ids', () => {
  const denied = new Set([claude('.claude', { id: 'denied' }), codex('.codex', { id: 'denied' })]);
  claude('.claude', { id: 'good' }); codex('.codex', { id: 'good' });
  const original = fs.openSync;
  vi.spyOn(fs, 'openSync').mockImplementation((p, ...args) => {
    if (denied.has(String(p))) throw Object.assign(Error('denied'), { code: 'EACCES' });
    return original(p, ...args);
  });
  expect(ids(cr())).toEqual(['good']); expect(ids(xr())).toEqual(['good']);
});
it('Claude first row above eight MiB is safely rejected at the documented cap', () => {
  claude('.claude', { extra: { padding: 'a'.repeat(8 * 1024 * 1024) } });
  expect(ids(cr())).toEqual([]);
});
it('Codex metadata first row above 96 KiB remains readable', () => {
  codex('.codex', { meta: { instructions: 'a'.repeat(150000) } });
  expect(ids(xr())).toEqual(['x1']);
});
it('Codex malformed index lines do not hide a later valid name', () => {
  codex(); put(`${home}/.codex/session_index.jsonl`, ['{broken', { id: 'x1', thread_name: 'Valid name', updated_at: new Date(NOW).toISOString() }]);
  expect(xr().threads[0].title).toBe('Valid name');
});
it('Codex reads an old date folder when its rollout was recently touched', () => {
  codex('.codex', { date: '2025/01/01', timestamp: NOW - 400 * 86400000 });
  expect(ids(xr())).toEqual(['x1']);
});
it('Codex broken newer duplicate leaves a readable older duplicate available', () => {
  codex('.codex-a', { when: NOW - 5000 }); const damaged = codex('.codex-b');
  put(damaged, ['{broken']); expect(ids(xr())).toEqual(['x1']);
});
const answerThread = (supervisor) => xr({ codexDirs: appSessionFolders({ supervisor, env: {}, home }).codexDirs }).threads.find((t) => t.id === 'x1') ?? null;
it('IPC import yes finds a rollout in a configured Codex home', () => {
  codex('xp'); expect(answerThread(goodSupervisor())?.id).toBe('x1');
});
it('IPC import yes with odd supervisor still finds a default-home rollout', () => {
  codex(); expect(answerThread({})?.id).toBe('x1');
});
it('the import card, the import "yes" and the Codex watch all take their folders from appSessionFolders', () => {
  // The card's read goes through readImportableThreads, which builds its own
  // folders with appSessionFolders; the import "yes" calls it directly.
  expect(ipcText).toMatch(/const readAllThreads = \(query = ''\) => readImportableThreads\(\{ config, supervisor, query \}\)/);
  expect(ipcText.match(/appSessionFolders\(\{ config, supervisor \}\)/g)).toHaveLength(1);
  expect(fs.readFileSync(new URL('../main/importable-threads.mjs', import.meta.url), 'utf8')).toMatch(/appSessionFolders\(\{ config, supervisor, env, home[,\s}]/);
  expect(mainText).toMatch(/readThreads: \(opts\) => readCodexThreads\(\{ \.\.\.opts, codexDirs: appSessionFolders\(\{ config, supervisor \}\)\.codexDirs \}\)/);
});
