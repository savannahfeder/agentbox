// RESUME STARTS A THREAD THE APP HAD STOPPED STARTING.
//
// What broke (2026-10-23): four threads went to the cloud while it had no
// usable Claude account, each start died at once, and after six the app held
// them (`_heldFromStarting`) with "stopped starting this thread ... Reply here
// to try again". The person selected all four and pressed Resume Agents at
// 22:47 UTC. Resume counted each one resumed and none started: two hours later
// all four still read Stopped. Read off the store: each row's status went back
// to open at 22:47, filed as the app's write, and nothing else moved.
//
// The hold only let go for the person's own word on the row, and the reopen
// Resume writes is filed as the app's (`authorityOf` in shared/work-items.mjs),
// so the hold never saw it. Resume then marked the reply delivered and the door
// turned the run away, which is what made the rows read Stopped. Restart the
// Agent, Send Back and Run now were turned away the same way.
//
// Measured here by holding a thread with six dead cloud starts that say what
// the real ones said, then pressing each of those buttons.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const T0 = Date.parse('2026-10-23T22:20:00Z');
const realNow = Date.now;
let now; let root; let items; let said; let pastTheDoor;

const row = (id, extra = {}) => ({
  id, product: 'p', title: id, kind: 'task', status: 'open',
  answer: 'Try again with that context.', wrote: { answer: { ts: T0 - 3_600_000, source: 'founder' } }, ...extra,
});

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: () => true,
      recordSessionResult: (product, id, patch) => {
        said.push({ product, id, ...patch });
        const it = items.find((i) => i.id === id);
        if (it && patch.status) it.status = patch.status;
      },
      // The store files a reopen as the app's, as the real fold does.
      answerItem: (product, id, patch) => {
        const it = items.find((i) => i.id === id);
        if (it && patch.status) { it.status = patch.status; it.wrote = { ...it.wrote, status: { ts: now, source: 'system' } }; }
        return it;
      },
    },
    root, root, root,
  );
  // The door's next question after the hold. Answering yes stops the run
  // there, so the test sees which threads got through without starting one.
  sup._compactionJobs = { has: (key) => { pastTheDoor.push(JSON.parse(key)[1]); return true; } };
  sup.tick = async () => {};
  sup.wake = () => {};
  return sup;
}

// Six cloud starts in a row that died before the agent began, as they did.
function holdIt(sup, item) {
  for (let i = 0; i < 6; i += 1) {
    now += 15_000;
    sup._noteHowTheRunStarted(item, {
      itemId: item.id, product: item.product, cloud: true, startedAt: now - 800,
      transportFault: true, resultIsError: true, cloudLoginTrouble: true, sessionId: null, result: null,
      tail: ['stderr: agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)'],
    });
  }
  expect(sup._heldFromStarting(item)).toBe(true);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-held-'));
  now = T0;
  Date.now = () => now;
  said = [];
  pastTheDoor = [];
  items = [row('w-held'), row('w-other')];
});
afterEach(() => { Date.now = realNow; });

describe('a thread held after six dead starts', () => {
  it('starts when they press Resume Agents on it', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    expect(items[0].status).toBe('blocked');
    now += 23 * 60_000;
    const r = sup.resumeItems(['w-held']);
    expect(r.resumed).toBe(1);
    expect(pastTheDoor).toEqual(['w-held']);
  });

  it('starts when an earlier Resume had left it reading Stopped', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    // The four rows as they are now: open again, the reply marked delivered,
    // nobody on them.
    items[0].status = 'open';
    items[0].wrote.status = { ts: now, source: 'system' };
    sup._handledAnswers.add(sup._answerKey(items[0], items[0].answer));
    expect(sup.status().stalled).toContain('w-held');

    now += 2 * 3_600_000;
    sup.resumeItems(['w-held']);
    expect(pastTheDoor).toEqual(['w-held']);
  });

  it('starts when they press Resume interrupted agents', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'open';
    sup._handledAnswers.add(sup._answerKey(items[0], items[0].answer));
    expect(sup.resumeStopped(['w-held'])).toBe(1);
    // What the tick's continuation pass then asks.
    sup.spawnWorker(items[0], { continuation: true });
    expect(pastTheDoor).toEqual(['w-held']);
  });

  it('starts when they press Run now on it', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'open';
    expect(sup.runNow('p', 'w-held')).toEqual({ ok: true });
    sup.spawnWorker(items[0]);
    expect(pastTheDoor).toEqual(['w-held']);
  });

  it('starts when they press Restart the Agent or Send Back', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    sup.forgetDeadStarts({ product: 'p', id: 'w-held' });
    sup.spawnWorker(items[0]);
    expect(pastTheDoor).toEqual(['w-held']);

    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    const handler = (name) => {
      const from = ipc.indexOf(`ipcMain.handle('${name}'`);
      return ipc.slice(from, ipc.indexOf('ipcMain.handle(', from + 10));
    };
    for (const name of ['zero:redeliver', 'zero:reopen']) {
      const body = handler(name);
      expect(body).toContain('supervisor.forgetDeadStarts');
      expect(body.indexOf('forgetDeadStarts')).toBeLessThan(Math.max(body.indexOf('wake()'), body.indexOf('tick?.()')));
    }
  });

  it('is held again after six more dead starts, and says so again', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    sup.resumeItems(['w-held']);
    holdIt(sup, items[0]);
    expect(said.map((s) => s.result)).toEqual([
      expect.stringMatching(/stopped starting this thread.*no Claude account is signed in/),
      expect.stringMatching(/stopped starting this thread.*no Claude account is signed in/),
    ]);
  });

  it('survives five more dead starts after Resume without being held', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    sup.resumeItems(['w-held']);
    for (let i = 0; i < 5; i += 1) {
      now += 15_000;
      sup._noteHowTheRunStarted(items[0], { itemId: 'w-held', product: 'p', startedAt: now - 800, sessionId: null, result: null, tail: [] });
    }
    expect(sup._heldFromStarting(items[0])).toBe(false);
  });
});

describe('what does not let a held thread start', () => {
  it('Resume on a different thread', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    sup.resumeItems(['w-other']);
    expect(sup._heldFromStarting(items[0])).toBe(true);
  });

  it('the app reopening it, handing its answer back, or resuming it on its own', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'open';
    items[0].wrote.status = { ts: now + 1, source: 'system' };
    now += 2;
    sup.redeliverAnswer(items[0], items[0].answer);
    sup._spawnResume(items[0]);
    expect(pastTheDoor).toEqual([]);
    expect(sup._heldFromStarting(items[0])).toBe(true);
  });
});
