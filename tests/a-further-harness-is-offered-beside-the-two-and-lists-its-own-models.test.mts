// A third harness could run a thread and still reached no screen. Read off the
// code on 2026-11-22: the list of harnesses the supervisor hands every screen
// named Claude Code and Codex only, which is right for screens written for
// those two and left nowhere for a third to be told; nothing said which models
// it offers, and only the tool knows (OpenCode 2.3.2 listed ten with nobody
// signed in, measured by opening a conversation over ACP); and an older install
// with Claude Code and OpenCode but no Codex kept the harness choice shut, so a
// thread naming OpenCode would have run on Claude Code for ever.
//
// These build the real supervisor against the stand-in ACP agent, with OpenCode
// put on offer for this process the way the real check does it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => { process.env.AGENTBOX_HARNESSES_IN_TESTING = 'opencode'; });

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { loadConfig } from '../main/config.mts';
import { modelRows } from '../main/harnesses/acp.mts';
import { endAgentsWithTheApp } from '../main/acp-worker.mts';
import { foldWorkItems } from '../shared/work-items.mts';
import { engineChoiceSince } from '../shared/engines.mts';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-acp-agent.mjs');
const OPENED = '2026-01-01T00:00:00Z';
const MISSING = '/nonexistent/not-installed';
const FAKE_MODELS = [{ id: 'fake/small', label: 'Small' }, { id: 'fake/large', label: 'Large' }];

let dir = '';
let sup: Supervisor | null = null;
let recorded: string[] = [];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'further-harness-'));
  for (const sub of ['project', 'store', 'user']) fs.mkdirSync(path.join(dir, sub));
  fs.writeFileSync(path.join(dir, 'opencode'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`, { mode: 0o755 });
  process.env.FAKE_ACP_LOG = path.join(dir, 'log.jsonl');
  recorded = [];
});
afterEach(() => {
  try { sup?._closeCodex?.('the test is over'); } catch { /* nothing open */ }
  for (const session of sup?.sessions?.values?.() ?? []) { try { session.child.kill(); } catch { /* gone */ } }
  // A stopped worker's agent is signalled only after a grace, and one still
  // writing its log here made the folder's removal fail on a Mac (ENOTEMPTY).
  endAgentsWithTheApp();
  sup = null;
  delete process.env.FAKE_ACP_LOG;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function build({ codexBin = '/nonexistent/codex' as string | null, opencodeBin = path.join(dir, 'opencode') as string | null } = {}) {
  const product = { slug: 'sandbox', dir: path.join(dir, 'project'), repoPath: null };
  sup = new Supervisor(
    {
      home: dir, storeRoot: path.join(dir, 'store'), claudeBin: '/nonexistent/claude', claudeFound: true, codexBin,
      opencodeBin, engineChoice: OPENED, maxConcurrentSessions: 4, authProfiles: ['default'],
    } as never,
    { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, readItem: () => null, recordSessionResult: (_slug: string, id: string) => { recorded.push(id); } } as never,
    '/nonexistent-app', dir, path.join(dir, 'user'),
  );
  return sup;
}

/** A thread somebody wrote after the harness choice was opened. */
function row(id: string, engine: string | null, title = 'A thread') {
  const item = foldWorkItems([JSON.parse(JSON.stringify({ id, ts: Date.now(), source: 'founder', patch: { title, status: 'open', ...(engine ? { engine } : {}) } }))]).get(id);
  return { ...item, product: 'sandbox' } as never;
}

const until = async <T,>(read: () => T | null | undefined | false, what: string): Promise<T> => {
  for (let i = 0; i < 1000; i += 1) { const got = read(); if (got) return got; await new Promise((r) => setTimeout(r, 10)); }
  throw Error(`never happened: ${what}`);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logged = () => (fs.existsSync(path.join(dir, 'log.jsonl')) ? fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const modelsFile = () => path.join(dir, 'user', 'harnesses', 'opencode', 'models.json');
const further = (s: Supervisor) => (s.engineFacts() as { further?: { id: string; label: string; models: { id: string; label: string }[] }[] }).further;
// Looking at the facts asks the tool for its models, in a process of its own
// that writes into this test's folder. It is done once the list has arrived.
const listArrived = (s: Supervisor) => until(() => further(s)?.[0].models.length, 'the model list arriving');

describe('what the screens are told', () => {
  it('names Claude Code and Codex in the list every two-harness screen draws, and the third only in the list of where a thread may run', () => {
    const s = build();
    expect(s.engineChoices().map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(s.enginesHere().map((e) => e.id)).toEqual(['claude', 'codex', 'opencode']);
    expect(s.engineOffered('opencode')).toBe('opencode');
  });

  it('tells them about the further harness in a list of its own, by name', async () => {
    const s = build();
    expect(further(s)?.map((e) => [e.id, e.label])).toEqual([['opencode', 'OpenCode']]);
    await listArrived(s);
  });

  it('tells them exactly what it always did where the further harness was not found', () => {
    const s = build({ opencodeBin: null });
    expect(Object.keys(s.engineFacts())).toEqual(['choices', 'workspace', 'byItem']);
    expect(s.enginesHere().map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(s.engineOffered('opencode')).toBeNull();
  });

  it('names the row that runs on it, also on a computer whose only other harness is Claude Code', async () => {
    const s = build({ codexBin: null });
    expect(s.engineChoices().map((e) => e.id)).toEqual(['claude']);
    const facts = s.engineFacts([row('w-1', 'opencode'), row('w-2', null), row('w-3', 'claude')]);
    expect(facts.workspace).toBe('claude');
    expect(facts.byItem).toEqual({ 'w-1': 'opencode' });
    await listArrived(s);
  });
});

describe('the models it offers', () => {
  it('are asked of the tool once, in the app\'s own folder, and kept', async () => {
    const s = build();
    let redrawn = 0;
    s.onChange = () => { redrawn += 1; };
    expect(further(s)?.[0].models).toEqual([]);
    await until(() => further(s)?.[0].models.length, 'the list arriving');
    expect(further(s)?.[0].models).toEqual(FAKE_MODELS);
    expect(redrawn).toBe(1);
    expect(JSON.parse(fs.readFileSync(modelsFile(), 'utf8')).models).toEqual(FAKE_MODELS);

    for (let i = 0; i < 5; i += 1) further(s);
    await pause(150);
    const opened = logged().filter((l) => l.method === 'session/new');
    expect(opened).toHaveLength(1);
    expect(opened[0].params.cwd).toBe(path.join(dir, 'user', 'harnesses', 'opencode'));
    expect(logged().filter((l) => l.method === 'session/prompt')).toHaveLength(0);
  });

  it('are read from what was kept when the app opens again, without starting the tool', async () => {
    const kept = [{ id: 'opencode/big-pickle', label: 'Big Pickle' }];
    fs.mkdirSync(path.dirname(modelsFile()), { recursive: true });
    fs.writeFileSync(modelsFile(), JSON.stringify({ models: kept }));
    const s = build();
    expect(further(s)?.[0].models).toEqual(kept);
    await pause(150);
    expect(logged()).toEqual([]);
  });

  it('follow what a conversation on it says, so a model connected since is offered after the next run', async () => {
    fs.mkdirSync(path.dirname(modelsFile()), { recursive: true });
    fs.writeFileSync(modelsFile(), JSON.stringify({ models: [{ id: 'gone/model', label: 'Gone' }] }));
    const s = build();
    expect(further(s)?.[0].models.map((m) => m.id)).toEqual(['gone/model']);
    s.spawnWorker(row('w-1', 'opencode', 'FAKE:SAY done'));
    await until(() => further(s)?.[0].models.length === 2, 'the list a conversation stated');
    expect(further(s)?.[0].models).toEqual(FAKE_MODELS);
    expect(JSON.parse(fs.readFileSync(modelsFile(), 'utf8')).models).toEqual(FAKE_MODELS);
    // The list arrives when the conversation opens; the run is seen through before the folder goes.
    await until(() => recorded.includes('w-1'), 'the run ending');
  });

  it('are asked for once when the tool will not start, not on every look at the screen', async () => {
    const starts = path.join(dir, 'starts');
    fs.writeFileSync(path.join(dir, 'opencode'), `#!/bin/sh\necho started >> "${starts}"\nexit 1\n`, { mode: 0o755 });
    const s = build();
    for (let i = 0; i < 5; i += 1) { expect(further(s)?.[0].models).toEqual([]); await pause(40); }
    await until(() => fs.existsSync(starts), 'the one start');
    await pause(150);
    expect(fs.readFileSync(starts, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(fs.existsSync(modelsFile())).toBe(false);
  });
});

describe('reading a conversation\'s options as rows for the menu', () => {
  const option = (options: unknown[]) => [{ id: 'model', category: 'model', type: 'select', currentValue: 'a', options }];

  it('takes each model by its id, named in the tool\'s own words', () => {
    expect(modelRows(option([{ value: 'a/one', name: 'One' }, { value: 'b/two', name: 'Two' }]) as never)).toEqual([{ id: 'a/one', label: 'One' }, { id: 'b/two', label: 'Two' }]);
  });

  it('names a model by its id when the tool gave it no name, and lets the harness rename', () => {
    expect(modelRows(option([{ value: 'a/one' }]) as never)).toEqual([{ id: 'a/one', label: 'a/one' }]);
    expect(modelRows(option([{ value: 'opencode/pickle', name: 'opencode/Pickle' }]) as never, (_id, name) => name.replace(/^opencode\//, ''))).toEqual([{ id: 'opencode/pickle', label: 'Pickle' }]);
  });

  it('leaves out a row with no id, and is empty for a tool that listed no models', () => {
    expect(modelRows(option([{ value: '', name: 'Nothing' }, { name: 'No id' }, { value: 'a/one', name: 'One' }]) as never)).toEqual([{ id: 'a/one', label: 'One' }]);
    expect(modelRows([{ id: 'mode', category: 'mode', type: 'select', currentValue: 'build', options: [{ value: 'build', name: 'Build' }] }] as never)).toEqual([]);
    expect(modelRows(null)).toEqual([]);
  });
});

// An older install: it has a settings file, so its first launch is long past.
describe('the harness choice on an older install', () => {
  const realFile = () => { const file = path.join(dir, 'a-binary'); fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o755 }); return file; };
  const withConfig = (contents: Record<string, unknown>) => {
    const d = fs.mkdtempSync(path.join(dir, 'install-'));
    fs.writeFileSync(path.join(d, 'zero.config.json'), JSON.stringify({ accountId: 'existing', claudeBin: MISSING, codexBin: MISSING, ...contents }));
    return d;
  };
  const saved = (d: string) => JSON.parse(fs.readFileSync(path.join(d, 'zero.config.json'), 'utf8'));

  it('opens when a further harness is found, with no Codex on the computer', () => {
    const d = withConfig({ opencodeBin: realFile() });
    const config = loadConfig(d, { home: d });
    expect((config as unknown as { opencodeBin: string }).opencodeBin).toBe(path.join(dir, 'a-binary'));
    expect(engineChoiceSince(config)).not.toBeNull();
    expect(engineChoiceSince(saved(d))).toBe(engineChoiceSince(config));
  });

  it('stays shut when the further harness is not on the computer either', () => {
    const d = withConfig({ opencodeBin: MISSING });
    const config = loadConfig(d, { home: d });
    expect((config as unknown as { opencodeBin: string | null }).opencodeBin).toBeNull();
    expect(engineChoiceSince(config)).toBeNull();
    expect(saved(d).engineChoice).toBeUndefined();
  });

  it('stays shut where the person shut it by hand', () => {
    const d = withConfig({ opencodeBin: realFile(), engineChoice: false });
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBeNull();
    expect(saved(d).engineChoice).toBe(false);
  });
});
