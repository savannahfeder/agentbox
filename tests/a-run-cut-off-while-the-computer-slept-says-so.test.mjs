// A RUN CUT OFF WHILE THE MAC SLEPT SAYS SO (2026-10-28).
//
// A tester started "Run the shell command sleep 240, then reply done", shut
// the lid for two or three minutes, and the thread said "Claude Code was cut
// off partway through, so this task is not finished. Agentbox runs it again on
// its own at 6:28pm." It gave no reason, and the app knew one: it hears the
// Mac go to sleep and wake (powerMonitor in main/main.mjs). Now a run that
// dies with no cause of its own, across a sleep or just after one, says the
// computer went to sleep ("computer", since the app runs on Linux too). A
// cause the run did name, and a death long after waking, keep their own words.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { deadRunSentence } from '../shared/spawn-trouble.mjs';
import { Name } from '../shared/product-name.mjs';

const MIN = 60_000;
const SLEPT = 'was cut off when this computer went to sleep';

describe('the sentence', () => {
  it('names the sleep on a run that had started working (the reported case)', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted', worked: true, slept: true });
    expect(said).toBe(`Claude Code ${SLEPT}, so this task is not finished. ${Name} runs it again on its own.`);
  });

  it('names the sleep on a run that had not done anything yet', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', slept: true });
    expect(said).toMatch(new RegExp(`^Claude Code ${SLEPT}, so nothing has been done on this task\\.`));
  });

  it('keeps the time it tries again', () => {
    const now = Date.parse('2026-10-27T18:13:00');
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted', worked: true, slept: true, retryAt: now + 15 * MIN, now });
    expect(said).toContain(SLEPT);
    expect(said).toMatch(/runs it again on its own at 6:28pm\.$/);
  });

  it('leaves a cause the run named alone, sleep or not', () => {
    for (const cause of ['at-limit', 'signed-out', 'network']) {
      expect(deadRunSentence({ engineWord: 'Claude Code', cause, worked: true, slept: true })).not.toContain('sleep');
    }
  });

  it('is unchanged without a sleep', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted', worked: true }))
      .toBe(`Claude Code was cut off partway through, so this task is not finished. ${Name} runs it again on its own.`);
  });
});

function makeSupervisor(item) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slept-'));
  const store = {
    listItems: () => [item],
    listProducts: () => [{ slug: 'notes', name: 'Notes', dir: root }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
  };
  return { sup: new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root), store };
}

const row = () => ({ id: 'w-sleep', product: 'notes', status: 'open', kind: 'directive', labels: ['founder'], title: 'Run sleep 240' });
const cutOff = (startedAt) => ({ engine: 'claude', startedAt, usedATool: true, tail: ['stderr: API Error: Request timed out.', 'session exited (1)'] });

describe('the supervisor', () => {
  it('says it for a run that was going when the lid shut', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteSleep(now - 4 * MIN);
    sup.noteWake(now - 1 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 6 * MIN));
    expect(store.written[0].result).toContain(SLEPT);
  });

  it('says it for a run that dies while the Mac is still asleep', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteSleep(now - 2 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 6 * MIN));
    expect(store.written[0].result).toContain(SLEPT);
  });

  it('says it when only the wake was heard', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteWake(now - 1 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 6 * MIN));
    expect(store.written[0].result).toContain(SLEPT);
  });

  it('does not say it for a run started after the Mac woke', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteSleep(now - 30 * MIN);
    sup.noteWake(now - 20 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 5 * MIN));
    expect(store.written[0].result).not.toContain('sleep');
  });

  it('does not say it hours after a sleep whose wake was never heard', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteSleep(now - 5 * 60 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 6 * 60 * MIN));
    expect(store.written[0].result).not.toContain('sleep');
  });

  it('does not say it for a run that died long after the Mac woke', () => {
    const { sup, store } = makeSupervisor(row());
    const now = Date.now();
    sup.noteSleep(now - 90 * MIN);
    sup.noteWake(now - 80 * MIN);
    sup.sayTheRunDied(row(), cutOff(now - 120 * MIN));
    expect(store.written[0].result).not.toContain('sleep');
  });
});
