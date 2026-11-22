// A third harness was registered for six weeks and could not have run a
// thread. Read off the code on 2026-11-22: the app's list of harnesses found on
// this computer only ever named Claude Code and Codex, so a thread that named
// OpenCode ran on Claude Code; on a computer without Claude Code every thread
// ran on Codex whatever it named (the first real run of the check: "the app ran
// the thread on Codex instead"); its approval requests reached no card; and a
// reply started a new conversation, because nothing kept a record of the old one.
//
// These run a thread on OpenCode through the real supervisor, against the
// stand-in ACP agent, with OpenCode put on offer for this process the way the
// real check does it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => { process.env.AGENTBOX_HARNESSES_IN_TESTING = 'opencode'; });

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { listPending } from '../main/approvals.mts';
import { foldWorkItems } from '../shared/work-items.mts';
import { ENGINES, isEngine, engineFor, availableEngines, HARNESSES_IN_TESTING_ENV, ENGINE_CHOICE_ENABLED } from '../shared/engines.mts';
import { harnessesToCheck } from '../scripts/lib/harness-check.mts';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-acp-agent.mjs');
const OPENED = '2026-01-01T00:00:00Z';

let dir = '';
let sup: Supervisor | null = null;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'third-harness-'));
  for (const sub of ['project', 'store', 'user']) fs.mkdirSync(path.join(dir, sub));
  fs.writeFileSync(path.join(dir, 'opencode'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`, { mode: 0o755 });
  process.env.FAKE_ACP_LOG = path.join(dir, 'log.jsonl');
  process.env.FAKE_ACP_STATE = path.join(dir, 'state.json');
});
afterEach(() => {
  try { sup?._closeCodex?.('the test is over'); } catch { /* nothing open */ }
  for (const session of sup?.sessions?.values?.() ?? []) { try { session.child.kill(); } catch { /* gone */ } }
  sup = null;
  delete process.env.FAKE_ACP_LOG;
  delete process.env.FAKE_ACP_STATE;
  fs.rmSync(dir, { recursive: true, force: true });
});

interface Recorded { id: string; result?: string }

function build({ claudeFound = true, codexBin = null as string | null } = {}) {
  const recorded: Recorded[] = [];
  const product = { slug: 'sandbox', dir: path.join(dir, 'project'), repoPath: null };
  sup = new Supervisor(
    {
      home: dir, storeRoot: path.join(dir, 'store'), claudeBin: '/nonexistent/claude', claudeFound, codexBin,
      opencodeBin: path.join(dir, 'opencode'), engineChoice: OPENED, maxConcurrentSessions: 4, authProfiles: ['default'],
    } as never,
    {
      listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, readItem: () => null,
      recordSessionResult: (_slug: string, id: string, opts: { result?: string }) => { recorded.push({ id, result: opts.result }); },
    } as never,
    '/nonexistent-app', dir, path.join(dir, 'user'),
  );
  return { sup, recorded };
}

/** A thread somebody wrote after the harness choice was opened, naming OpenCode. */
function row(title: string, patch: Record<string, unknown> = {}) {
  const item = foldWorkItems([JSON.parse(JSON.stringify({ id: 'w-1', ts: Date.now(), source: 'founder', patch: { title, status: 'open', engine: 'opencode', ...patch } }))]).get('w-1');
  return { ...item, product: 'sandbox' } as never;
}

const until = async <T,>(read: () => T | null | undefined | false, what: string): Promise<T> => {
  for (let i = 0; i < 1000; i += 1) { const got = read(); if (got) return got; await new Promise((r) => setTimeout(r, 10)); }
  throw Error(`never happened: ${what}`);
};
const logged = () => (fs.existsSync(path.join(dir, 'log.jsonl')) ? fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

describe('a harness put on offer for one copy of the app', () => {
  it('is an engine in this process, and the variable is the one the check sets', () => {
    expect(HARNESSES_IN_TESTING_ENV).toBe('AGENTBOX_HARNESSES_IN_TESTING');
    expect(ENGINES.map((e) => e.id)).toEqual(['claude', 'codex', 'opencode']);
    expect(isEngine('opencode')).toBe(true);
  });

  it('is offered only where its binary was found', () => {
    expect(availableEngines({ claude: true, opencode: true }).map((e) => e.id)).toEqual(['claude', 'opencode']);
    expect(availableEngines({ claude: true, opencode: false }).map((e) => e.id)).toEqual(['claude']);
    expect(build().sup._enginesFound()).toMatchObject({ claude: true, codex: false, opencode: true });
  });

  it('can be named to the real check as a candidate, and only a known harness can', () => {
    expect(harnessesToCheck(['opencode'], ['opencode'])).toEqual(['opencode']);
    expect(() => harnessesToCheck([], ['nonesuch'])).toThrow(/not a harness this app knows/);
  });
});

describe('which harness a thread that names one runs on', () => {
  const opened = { config: { engineChoice: OPENED }, enabled: ENGINE_CHOICE_ENABLED };
  const named = (engine: string) => ({ engine, wrote: { engine: { ts: Date.parse(OPENED) + 1 } } });

  it('is the one it names, beside Claude Code', () => {
    expect(engineFor(named('opencode'), { ...opened, found: { claude: true, opencode: true } })).toBe('opencode');
  });

  it('is the one it names on a computer without Claude Code, not Codex', () => {
    expect(engineFor(named('opencode'), { ...opened, found: { claude: false, codex: true, opencode: true } })).toBe('opencode');
  });

  it('is still Codex there when the thread names nothing, Claude Code, or a harness that is not here', () => {
    const found = { claude: false, codex: true, opencode: false };
    expect(engineFor({}, { ...opened, found })).toBe('codex');
    expect(engineFor(named('claude'), { ...opened, found })).toBe('codex');
    expect(engineFor(named('opencode'), { ...opened, found })).toBe('codex');
  });

  it('falls back to Claude Code when the one it names is not on this computer', () => {
    expect(engineFor(named('opencode'), { ...opened, found: { claude: true, opencode: false } })).toBe('claude');
  });
});

describe('a thread on OpenCode, through the supervisor', () => {
  it('starts `opencode acp`, and its answer is written onto the thread', async () => {
    const { sup, recorded } = build();
    sup.spawnWorker(row('FAKE:SAY apple'));
    const done = await until(() => recorded.find((r) => r.id === 'w-1'), 'the answer being recorded');
    expect(done.result).toBe('apple');
    expect(logged().find((l) => l.started)?.started.args).toEqual(['acp']);
  });

  it('carries the conversation on when a reply comes, in a new process', async () => {
    const { sup, recorded } = build();
    sup.spawnWorker(row('FAKE:SAY apple'));
    await until(() => recorded.length === 1, 'the first answer');
    await until(() => sup.sessions.size === 0, 'the first run ending');
    sup.spawnWorker(row('FAKE:SAY apple', { answer: 'FAKE:RECALL' }), { continuation: true });
    await until(() => recorded.length === 2, 'the reply being answered');
    expect(recorded[1].result).toBe('apple');
    expect(logged().some((l) => l.method === 'session/load')).toBe(true);
  });

  it('puts a command to the person as a card the one answering door settles', async () => {
    const { sup, recorded } = build();
    const file = path.join(dir, 'project', 'made.txt');
    sup.spawnWorker(row(`FAKE:RUN echo ok > ${file}`));
    const card = await until(() => listPending(path.join(dir, 'store'))[0], 'the card');
    expect(card).toMatchObject({ item: 'w-1', product: 'sandbox', tool: 'Bash', input: { command: `echo ok > ${file}` } });
    expect(fs.existsSync(file)).toBe(false);
    expect(sup.settleCodexApproval(card.id, true)).toBe(true);
    const done = await until(() => recorded.find((r) => r.id === 'w-1'), 'the answer after the yes');
    expect(done.result).toBe('done');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('does not run a command the person refused', async () => {
    const { sup, recorded } = build();
    const file = path.join(dir, 'project', 'made.txt');
    sup.spawnWorker(row(`FAKE:RUN echo ok > ${file}`));
    const card = await until(() => listPending(path.join(dir, 'store'))[0], 'the card');
    sup.settleCodexApproval(card.id, false);
    await until(() => recorded.find((r) => r.id === 'w-1'), 'the thread saying it stopped');
    expect(fs.existsSync(file)).toBe(false);
    expect(recorded[0].result).toMatch(/It stopped when you refused: echo ok > /);
  });

  it('takes its open card away when the run is stopped', async () => {
    const { sup } = build();
    sup.spawnWorker(row(`FAKE:RUN echo ok > ${path.join(dir, 'project', 'made.txt')}`));
    await until(() => listPending(path.join(dir, 'store'))[0], 'the card');
    sup.stopSession('w-1');
    await until(() => sup.sessions.size === 0, 'the run ending');
    expect(listPending(path.join(dir, 'store'))).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'project', 'made.txt'))).toBe(false);
  });
});
