// A CODEX CHAT THAT CANNOT BE COMPACTED STARTS FRESH.
//
// What broke (2026-11-10): the outreach films thread ran 26 minutes on Codex
// and finished. Its conversation was then 277k tokens into a 475k window, so
// every resume had to compact it first, and Codex 0.165.0's compaction answered
// "Error running remote compact task: workspace routing discovery unauthorized
// (401)" in about three seconds, five times in six minutes (measured off the
// rollout's task_complete events). A fresh `codex exec` on the same login
// worked. The app resumed the same conversation each time, so the thread could
// never continue, and it read the "unauthorized" as the login being signed out.
//
// Now a resumed chat that fails that way is dropped, so the next start is a
// fresh conversation briefed with the thread, and the login is not blamed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { captureCodexEvent } from '../main/codex.mts';
import { troubleCause } from '../shared/spawn-trouble.mts';

const SAID = 'Error running remote compact task: workspace routing discovery unauthorized (401)';
const T0 = Date.parse('2026-11-11T03:10:45Z');
let root; let said;

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: path.join(root, 'home'), maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => [], listProducts: () => [], recordSessionResult: (product, id, patch) => { said.push({ product, id, ...patch }); } },
    root, root, root,
  );
  sup._engineFor = () => 'codex';
  sup._rowSessions = { 'w-f6': { sessionId: 'th_01A1', product: 'p', engine: 'codex', profile: '/x/.codex-2', cwd: null } };
  sup.transcriptFile = () => '/x/rollout.jsonl';
  return sup;
}
const item = { id: 'w-f6', product: 'p', title: 'films', status: 'open', engine: 'codex' };

function codexRun({ resumed = true, says = SAID } = {}) {
  const session = { itemId: 'w-f6', product: 'p', engine: 'codex', profile: '/x/.codex-2', startedAt: Date.now() - 3_000, tail: [], resumed };
  captureCodexEvent(session, 'thread/started', { thread: { id: resumed ? 'th_01A1' : 'th_02B2' } });
  captureCodexEvent(session, 'turn/failed', { turn: { status: 'failed', error: { message: says, codexErrorInfo: 'other' } } });
  return session;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-fails-'));
  said = [];
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

describe('what the failure is read as', () => {
  it('is not the login signing out', () => {
    expect(troubleCause(SAID)).not.toBe('signed-out');
  });

  it('must NOT stop a real sign-out reading as one', () => {
    expect(troubleCause('401 Unauthorized')).toBe('signed-out');
    expect(troubleCause('unauthorized: run codex login')).toBe('signed-out');
  });
});

describe('a resumed Codex chat whose compaction fails', () => {
  it('is dropped, so the next start is a fresh chat', () => {
    const sup = supervisor();
    expect(sup.rowSessionFor(item)).not.toBe(null);
    const run = codexRun();
    expect(run.sessionId).toBe('th_01A1');
    expect(run.resultIsError).toBe(true);
    sup._noteHowTheRunStarted(item, run);
    expect(sup.rowSessionFor(item)).toBe(null);
  });

  it('does not count toward holding the thread, and is not held after six', () => {
    const sup = supervisor();
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup._rowSessions['w-f6'] = { sessionId: 'th_01A1', product: 'p', engine: 'codex', profile: '/x/.codex-2' };
      sup._noteHowTheRunStarted(item, codexRun());
    }
    expect(sup._heldFromStarting(item)).toBe(false);
  });

  it('does not strike or rest the Codex login', () => {
    const sup = supervisor();
    sup._profileTrouble = {};
    for (let i = 0; i < 4; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup.noteExitForBackoff(codexRun());
    }
    expect(Object.keys(sup._profileTrouble)).toEqual([]);
    expect(sup._profileResting('codex:/x/.codex-2')).toBe(false);
  });

  // A fresh chat that fails the same way has nothing to drop, and must still
  // be held after six, or it would start for ever.
  it('must NOT spare a fresh chat that fails the same way', () => {
    const sup = supervisor();
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup._noteHowTheRunStarted(item, codexRun({ resumed: false }));
    }
    expect(sup._heldFromStarting(item)).toBe(true);
  });

  it('must NOT drop a resumed chat that failed for another reason', () => {
    const sup = supervisor();
    sup._noteHowTheRunStarted(item, codexRun({ says: "You've hit your usage limit." }));
    expect(sup.rowSessionFor(item)).not.toBe(null);
  });
});
