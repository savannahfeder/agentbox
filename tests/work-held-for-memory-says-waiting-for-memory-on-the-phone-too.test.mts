// Short of memory, a running agent's heavy command waits in the computer's
// memory gate. Since 2026-11-23 the desktop's step reads "Waiting for memory to
// run npm test" then, where it had read "Running npm test" for minutes. The
// phone parity round of 2026-11-25 found the phone still saying Running: the
// phone's copy of a run never said the gate held it. It says so now, as a mark
// that changes only when the gate takes or lets go of the run, so the copy is
// not sent again every pass for a count of milliseconds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { heldStepWord } from '../renderer/src/live-line';
import { phoneView } from '../renderer/src/phone-rows';
import { liveOf } from '../mobile/src/lib/thread-offers';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const running = (live: Record<string, unknown>) => ({ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 2, item: { id: 'w-1', title: 'Fix the tests', kind: 'directive', labels: ['founder'], status: 'claimed', updatedAt: NOW - 1e4, createdAt: NOW - 2e4 }, history: [], live: { since: NOW - 60_000, at: NOW - 1000, where: 'mac', doing: [{ label: 'Running npm test', startedAt: NOW - 30_000 }], ...live } } });

function word(live: Record<string, unknown>) {
  const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [running(live)], commands: [] } as never, NOW);
  const session = view.running.find((r: { itemId: string }) => r.itemId === 'w-1');
  return liveOf(view.items[0], { session, inProgress: true, now: NOW })?.word;
}

describe('work held for memory, on the phone', () => {
  it('says Waiting for memory to run the command, in the desktop words', () => {
    expect(word({ memoryHeld: true })).toBe(heldStepWord({ label: 'Running npm test' }, 0));
    expect(word({ memoryHeld: true })).toBe('Waiting for memory to run npm test');
  });

  it('says the step as before when nothing holds it', () => {
    expect(word({})).toBe('Running npm test');
  });

  it('is told by the computer, which marks the run held while the memory gate keeps its command', () => {
    const sup = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    const liveFor = sup.slice(sup.indexOf('  liveFor(product: string, itemId: string) {'), sup.indexOf('  // The phone asks for each running thread on every pass'));
    expect(liveFor).toMatch(/memoryHeld/);
    const inbox = fs.readFileSync(new URL('../main/phone-inbox.mts', import.meta.url), 'utf8');
    expect(inbox).toMatch(/const same = sameRun && was\.runId === runId && !!was\.memoryHeld === memoryHeld;/);
  });
});
