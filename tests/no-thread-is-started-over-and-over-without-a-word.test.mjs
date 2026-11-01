// NO THREAD IS STARTED OVER AND OVER WITHOUT A WORD.
//
// What broke (2026-10-19): one thread's cloud start died in under a second,
// every time, because its folder was halfway through a merge. The way it died
// counted as "try again, no attempt spent", so the app started it again at
// every check: 16,135 starts, one every 15 seconds for 30 hours, and nothing
// on the row, in the inbox or anywhere else said so. Every earlier guard was
// keyed to one way of failing (an account, a delivery attempt, the cloud's
// health); this way slipped between all of them.
//
// Now one rule sits where every run starts, whatever the engine, wherever it
// runs and however it died: a thread whose last six starts inside ten minutes
// each ended before its agent began is not started again, and its row says so
// once, in Needs you, with the last thing the run said. Her reply on the row
// lets it start again. Measured here by driving every way a run can end, a
// start every 15 seconds for an hour.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const T0 = Date.parse('2026-10-19T10:00:00Z');
let now; let said; let root;
const realNow = Date.now;

function supervisor() {
  return new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => [], listProducts: () => [], isDue: () => true,
      recordSessionResult: (product, id, patch) => { said.push({ product, id, ...patch }); },
    },
    root, root, root,
  );
}
const item = (extra = {}) => ({ id: 'w-1', product: 'p', title: 'T', status: 'open', ...extra });
// A run that ended `after` ms after it started, as the exit handler sees it.
const run = (extra = {}, after = 800) => ({ itemId: 'w-1', product: 'p', startedAt: now - after, tail: ['stderr: agentbox cloud: stopped: Command failed: git write-tree'], sessionId: null, result: null, ...extra });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-storm-'));
  now = T0;
  said = [];
  Date.now = () => now;
  return () => { Date.now = realNow; };
});

// An hour of a start every 15 seconds, each ending the given way; how many starts were allowed.
function anHour(sup, ending, it = item()) {
  let started = 0;
  const from = now;
  for (let t = 0; t < 3600_000; t += 15_000) {
    now = from + t;
    if (sup._heldFromStarting(it)) continue;
    started += 1;
    now += 800;
    sup._noteHowTheRunStarted(it, run(ending()));
  }
  return started;
}

describe('a thread whose every start dies at once', () => {
  const endings = {
    'a cloud start the host could not run (exit 75)': () => ({ transportFault: true, resultIsError: true }),
    'a crash (exit 1) before the agent said a word': () => ({}),
    'a clean exit with nothing said': () => ({}),
    'a kill that was not ours': () => ({}),
    'an account that refused it': () => ({ accountFault: true }),
    'a cloud hand-back that ran nothing': () => ({ handedBack: true }),
  };
  for (const [how, ending] of Object.entries(endings)) {
    it(`is started six times, not 240, when it ends as ${how}`, () => {
      const sup = supervisor();
      expect(anHour(sup, ending)).toBe(6);
    });
  }

  it('says so once on its row, in Needs you, with the last thing the run said', () => {
    const sup = supervisor();
    anHour(sup, () => ({}));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ product: 'p', id: 'w-1', status: 'blocked' });
    expect(said[0].result).toMatch(/stopped starting this thread/i);
    expect(said[0].result).toContain('git write-tree');
    expect(said[0].result).toMatch(/Reply here to try again/);
  });

  it('starts again once she writes on the row, and is held again only after six more', () => {
    const sup = supervisor();
    anHour(sup, () => ({}));
    const replied = item({ wrote: { answer: { ts: now + 1, source: 'founder' } }, answer: 'try again' });
    now += 2;
    expect(sup._heldFromStarting(replied)).toBe(false);
    expect(anHour(sup, () => ({}), replied)).toBe(6);
  });

  it('is held across a restart of the app', () => {
    const first = supervisor();
    anHour(first, () => ({}));
    first._saveState();
    expect(supervisor()._heldFromStarting(item())).toBe(true);
  });
});

describe('what never trips it', () => {
  it('a run whose agent got going resets the count', () => {
    const sup = supervisor();
    for (let i = 0; i < 5; i += 1) { now += 15_000; sup._noteHowTheRunStarted(item(), run()); }
    now += 15_000;
    sup._noteHowTheRunStarted(item(), run({ sessionId: 'abc' }, 30_000));
    for (let i = 0; i < 5; i += 1) { now += 15_000; sup._noteHowTheRunStarted(item(), run()); }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('a run the app stopped itself, a quit or a Stop', () => {
    const sup = supervisor();
    for (let i = 0; i < 20; i += 1) { now += 15_000; sup._noteHowTheRunStarted(item(), run({ stoppedByUs: true })); }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('a run that worked a while before it died', () => {
    const sup = supervisor();
    for (let i = 0; i < 20; i += 1) { now += 120_000; sup._noteHowTheRunStarted(item(), run({}, 100_000)); }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('quick failures spread out over hours, as the account and delivery rests already space them', () => {
    const sup = supervisor();
    for (let i = 0; i < 20; i += 1) { now += 15 * 60_000; sup._noteHowTheRunStarted(item(), run()); }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('another thread', () => {
    const sup = supervisor();
    anHour(sup, () => ({}));
    expect(sup._heldFromStarting(item({ id: 'w-2' }))).toBe(false);
  });
});

describe('the door every run starts through', () => {
  it('starts nothing for a held thread', () => {
    const sup = supervisor();
    anHour(sup, () => ({}));
    let spawned = 0;
    sup._spawnFor = () => { spawned += 1; };
    expect(sup.spawnWorker(item())).toBeUndefined();
    expect(sup.sessions.size).toBe(0);
    expect(sup._preparing?.size ?? 0).toBe(0);
    expect(spawned).toBe(0);
  });
});

describe('where it sits', () => {
  const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
  it('every run starts through the one door that asks it', () => {
    const door = src.slice(src.indexOf('  spawnWorker(item, {'), src.indexOf('  spawnWorker(item, {') + 400);
    expect(door).toMatch(/if \(this\._heldFromStarting\(item\)\) (return;|\{ refuse\('held'\); return; \})/);
  });
  it('every run that ends is counted, before anything else is decided about it', () => {
    expect(src).toMatch(/this\._noteHowTheRunStarted\(item, session\);/);
  });
});
