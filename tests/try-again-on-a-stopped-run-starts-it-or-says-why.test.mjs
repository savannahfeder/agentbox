// Try again on a stopped run did nothing on screen.
// Maya, Sofia and Dev each pressed the Stopped bar's "try again" and the
// "Try again" button under "Nothing running", three presses each, after their
// runs died at the account's weekly limit: no toast, no change in 20 seconds.
// "Run now" on Sofia's stopped thread only turned it to "Up next", and 18
// minutes after the account came back it had still not started.
// Measured here: a start that throws inside resumeItems rejected the whole
// call, and the window drops a rejected Try again without a word; and Run now
// left the stopped reply marked delivered and the fleet's brake on, so the
// queue walked past the row on every pass while the screen said Up next.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { tryAgainWords } from '../renderer/src/try-again.ts';

const T0 = Date.parse('2026-11-01T00:00:00Z');
const realNow = Date.now;
let now; let root; let items; let started;

const row = (id, extra = {}) => ({
  id, product: 'p', title: id, kind: 'task', status: 'open',
  answer: 'Make v5 from the pin.', wrote: { answer: { ts: T0 - 600_000, source: 'founder' } }, ...extra,
});

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: () => true,
      recordSessionResult: () => {},
      answerItem: (product, id, patch) => { const it = items.find((i) => i.id === id); if (it && patch.status) it.status = patch.status; return it; },
    },
    root, root, root,
  );
  sup.tick = async () => {};
  sup.wake = () => {};
  sup.spawnWorker = (item) => { started.push(item.id); };
  return sup;
}

// The run died at the limit: its reply is marked delivered, nobody is on it.
const stopIt = (sup, item) => sup._handledAnswers.add(sup._answerKey(item, item.answer));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'try-again-'));
  now = T0;
  Date.now = () => now;
  started = [];
  items = [row('w-stopped'), row('w-other')];
});
afterEach(() => { Date.now = realNow; });

describe('Try again', () => {
  it('starts a stopped run', () => {
    const sup = supervisor();
    stopIt(sup, items[0]);
    expect(sup.status().stalled).toContain('w-stopped');
    expect(sup.resumeItems(['w-stopped']).resumed).toBe(1);
    expect(started).toEqual(['w-stopped']);
  });

  it('says why when the start throws, instead of throwing', () => {
    const sup = supervisor();
    stopIt(sup, items[0]);
    sup.spawnWorker = () => { throw new Error('the project folder is gone'); };
    const r = sup.resumeItems(['w-stopped']);
    expect(r.resumed).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.why).toBe('the project folder is gone');
  });

  it('one start that throws does not stop the next', () => {
    const sup = supervisor();
    sup.spawnWorker = (item) => { if (item.id === 'w-stopped') throw new Error('boom'); started.push(item.id); };
    const r = sup.resumeItems(['w-stopped', 'w-other']);
    expect(r).toMatchObject({ resumed: 1, failed: 1 });
    expect(started).toEqual(['w-other']);
  });

  it('the window says every outcome in words, a failed call included', () => {
    expect(tryAgainWords({ resumed: 1 })).toBe('Trying again now.');
    expect(tryAgainWords({ queued: 1 })).toMatch(/^Queued/);
    expect(tryAgainWords({ working: 1 })).toBe('Already running.');
    expect(tryAgainWords({ failed: 1, why: 'the project folder is gone' })).toBe('It could not start: the project folder is gone.');
    expect(tryAgainWords({ resumed: 0, queued: 0, working: 0, missing: 0 })).toMatch(/another computer runs it|cannot start/);
    expect(tryAgainWords(null)).toMatch(/did not reach the app/);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const body = app.slice(app.indexOf('const tryAgain = useCallback'), app.indexOf('const undo = useCallback'));
    expect(body).toContain('tryAgainWords(');
    expect(body).toMatch(/catch/);
  });
});

describe('Run now on a stopped run', () => {
  it('lets the queue start it: the reply is owed again and the brake is off', () => {
    const sup = supervisor();
    stopIt(sup, items[0]);
    sup._spawnCooldownUntil = now + 3 * 24 * 3_600_000;
    expect(sup.runNow('p', 'w-stopped')).toEqual({ ok: true });
    expect(sup._answerDelivered(items[0])).toBe(false);
    expect(sup._spawnBraked()).toBe(false);
    expect(sup.status().stalled).not.toContain('w-stopped');
  });

  it('leaves another thread\'s delivered reply alone', () => {
    const sup = supervisor();
    stopIt(sup, items[0]);
    stopIt(sup, items[1]);
    sup.runNow('p', 'w-stopped');
    expect(sup._answerDelivered(items[1])).toBe(true);
  });
});
