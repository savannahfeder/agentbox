// A THREAD GIVEN A CODEX MODEL RUNS ON CODEX.
//
// What broke (2026-11-10): an agent handed a thread over with `model:
// "gpt-6.1-sol"` and no engine, as the store tool's own words invite ("For
// Codex: its model slug"). `engineFor` only read the engine field, so the
// thread went to Claude Code as `claude -p --model gpt-6.1-sol`. Claude Code
// answered "There's an issue with the selected model (gpt-6.1-sol)" in about
// three seconds, 64 times in under two hours, measured off runs.jsonl and the
// session's transcript. The thread did no work at all, and its row said only
// "This run stopped before it finished."
//
// The six-starts guard never held it, because Claude Code gives that run a
// session id and an error result, and `_noteHowTheRunStarted` read a session
// id as the agent getting going. Each start was also struck against the Claude
// login as a fast exit, which put the person's main login on a cooldown that
// held every other thread on it.
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      return { stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});
vi.mock('../main/account-tooling.mts', async (importActual) => {
  const actual = await importActual();
  return { ...actual, linkAccountTooling: () => null };
});

import { Supervisor } from '../main/supervisor.mts';
import { foldWorkItems } from '../shared/work-items.mts';
import { engineFor, modelForEngine, ENGINE_CHOICE_ENABLED } from '../shared/engines.mts';
import { troubleCause } from '../shared/spawn-trouble.mts';
import { captureStream } from '../main/harnesses/claude-stream.mts';

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';
const OPENED = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-11-10T18:34:51Z');
// Claude Code 2.1.321's own final frame for `--model gpt-6.1-sol`, run for real.
const CLAUDE_SAYS = "There's an issue with the selected model (gpt-6.1-sol). It may not exist or you may not have access to it. Run --model to pick a different model.";

const dirs = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function build({ codex = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-model-row-'));
  dirs.push(dir);
  const written = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      ...(codex ? { codexBin: CODEX_BIN } : {}),
      engineChoice: OPENED,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
    },
    {
      listItems: () => [],
      listProducts: () => [{ slug: 'agentbox', dir, repoPath: null }],
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult: (slug, id, patch) => { written.push({ slug, id, patch }); },
    },
    '/nonexistent-app',
  );
  sup.written = written;
  return sup;
}

// Folded off a ledger line the way the store hands it over, written by an agent.
const row = ({ engine, model } = {}) => ({
  ...foldWorkItems([{
    id: 'w-f64bc7617e', ts: AFTER, source: 'agent',
    patch: { title: 'outreach films', status: 'open', ...(engine ? { engine } : {}), ...(model ? { model } : {}) },
  }]).get('w-f64bc7617e'),
  product: 'agentbox',
});

const open = { enabled: ENGINE_CHOICE_ENABLED, found: { claude: true, codex: true } };

beforeEach(() => { spawns.length = 0; });

describe('the model names the agent when the thread does not', () => {
  it('sends a thread with a Codex model and no engine to Codex', () => {
    expect(engineFor({ model: 'gpt-6.1-sol' }, open)).toBe('codex');
    expect(engineFor({ model: 'gpt-5.6-terra' }, open)).toBe('codex');
    expect(engineFor({ model: 'o3' }, open)).toBe('codex');
  });

  it('does so even when the workspace default is Claude Code', () => {
    expect(engineFor({ model: 'gpt-6.1-sol' }, { ...open, config: { engine: 'claude' } })).toBe('codex');
  });

  it('keeps a thread that names an engine on that engine', () => {
    expect(engineFor({ engine: 'claude', model: 'gpt-6.1-sol' }, open)).toBe('claude');
  });

  it('must NOT move a thread with a Claude model, or no model', () => {
    expect(engineFor({ model: 'opus' }, open)).toBe('claude');
    expect(engineFor({ model: 'claude-opus-5-5' }, open)).toBe('claude');
    expect(engineFor({}, open)).toBe('claude');
    // A word that only starts like a slug is not one.
    expect(engineFor({ model: 'gptx sol' }, open)).toBe('claude');
  });

  it('still answers Claude Code where Codex was never turned on', () => {
    expect(engineFor({ model: 'gpt-6.1-sol' }, { found: { claude: true, codex: true } })).toBe('claude');
    expect(engineFor({ model: 'gpt-6.1-sol' }, { enabled: ENGINE_CHOICE_ENABLED, found: { claude: true } })).toBe('claude');
  });

  it('runs it on Codex with that model, past an old Claude Code chat on the thread', () => {
    const sup = build();
    sup._rowSessions = { 'w-f64bc7617e': { sessionId: '9eb313ba', product: 'agentbox', engine: 'claude' } };
    const item = row({ model: 'gpt-6.1-sol' });
    expect(sup._engineFor(item)).toBe('codex');
    const plan = sup.spawnPlan(item, { slug: 'agentbox', dir: '/nonexistent', repoPath: null }, { engine: 'codex' });
    expect(plan.model).toBe('gpt-6.1-sol');
  });
});

describe('a Codex model on a Mac that cannot run Codex', () => {
  it('never becomes a Claude Code command line', () => {
    expect(modelForEngine({ model: 'gpt-6.1-sol' }, 'claude')).toBe(null);
    expect(modelForEngine({ model: 'gpt-6.1-sol' }, 'codex')).toBe('gpt-6.1-sol');
    expect(modelForEngine({ model: 'opus' }, 'claude')).toBe('opus');
    const sup = build({ codex: false });
    sup.spawnWorker(row({ model: 'gpt-6.1-sol' }));
    expect(spawns).toEqual([]);
  });

  it('says so on the thread, naming Codex and the model', () => {
    const sup = build({ codex: false });
    sup.spawnWorker(row({ model: 'gpt-6.1-sol' }));
    expect(sup.written).toHaveLength(1);
    expect(sup.written[0].patch.result).toBe('This task chose Codex model "gpt-6.1-sol", but this computer would run it with Claude Code. Nothing has been done. Pick a Claude Code model to continue, or use a computer with Codex.');
  });
});

describe('Claude Code refusing the model is a start that never began', () => {
  const T0 = Date.parse('2026-11-10T23:39:52Z');
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
  afterEach(() => vi.useRealTimers());

  // The run as its exit handler meets it, through the reader that fills it.
  const refusedRun = (words = CLAUDE_SAYS) => {
    const session = { itemId: 'w-f64bc7617e', product: 'agentbox', engine: 'claude', profile: 'default', startedAt: Date.now() - 3_000, tail: [] };
    captureStream(session, JSON.stringify({ type: 'system', subtype: 'init', session_id: '9eb313ba' }));
    captureStream(session, JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: words, session_id: '9eb313ba' }));
    return session;
  };

  it('is read as the model, not the login', () => {
    expect(troubleCause(CLAUDE_SAYS)).toBe('model-not-on-plan');
    expect(troubleCause('There is an issue with the selected model.')).toBe('unknown');
  });

  it('holds the thread after six in ten minutes, and says so once', () => {
    const sup = build();
    const item = row({ model: 'gpt-6.1-sol' });
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      expect(sup._heldFromStarting(item)).toBe(false);
      sup._noteHowTheRunStarted(item, refusedRun());
    }
    expect(sup._heldFromStarting(item)).toBe(true);
    expect(sup.written).toHaveLength(1);
    expect(sup.written[0].patch.status).toBe('blocked');
    expect(sup.written[0].patch.result).toContain('issue with the selected model');
  });

  it('must NOT hold it on five', () => {
    const sup = build();
    const item = row({ model: 'gpt-6.1-sol' });
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup._noteHowTheRunStarted(item, refusedRun());
    }
    expect(sup._heldFromStarting(item)).toBe(false);
  });

  it('must NOT count a run whose agent answered', () => {
    const sup = build();
    const item = row({ model: 'gpt-6.1-sol' });
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      const ran = refusedRun();
      ran.resultIsError = false;
      ran.result = 'Done.';
      sup._noteHowTheRunStarted(item, ran);
    }
    expect(sup._heldFromStarting(item)).toBe(false);
  });

  it('does not strike or rest the Claude login it ran on', () => {
    const sup = build();
    for (let i = 0; i < 4; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup.noteExitForBackoff(refusedRun());
    }
    expect(sup._profileTrouble?.default).toBeUndefined();
    expect(sup._profileResting('default')).toBe(false);
  });
});
