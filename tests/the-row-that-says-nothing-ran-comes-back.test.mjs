// 2026-08-31.
//
// The component is there. `troubleRow` in renderer/src/trouble-row.ts builds it
// and App.tsx drops it into the inbox, and both are exactly as she approved
// them on 2026-08-29. What was missing is the number it is built from, and it
// was missing for a reason that never showed up as a fault anywhere: the count
// is taken in `sayItOnEveryStrandedRow`, which skips a row it has already
// spoken on, and on a running app the row is spoken on by `sayTheRunDied` at
// the moment of the exit instead. That writes the watermark and, until tonight,
// no reason with it, so the pass read the row as dealt with and counted nothing.
//
// MEASURED ON HER OWN MACHINE, ~/Zero/.zero-supervisor.json at 22:30 that
// night: 65 rows with dead runs recorded, 10 of them spoken on, 0 carrying a
// reason. The count was zero on every tick of its life, so the row she is
// asking about has never once been able to appear.
//
// The three tests that matter are the three ways it stayed silent: a row the
// exit handler spoke on, a row whose watermark predates this fix, and the half
// hour of cooldown that follows a fleet with no account left to run on, which
// is precisely when everything is stuck.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deadRunSentence, deadRunCause } from '../shared/spawn-trouble.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

const TWENTY_MINUTES = 20 * 60_000;

// Her own night. Both accounts hit the weekly limit, and every row in her inbox
// came back carrying the same sentence.
const DIED = new Date(2026, 7, 31, 22, 22).getTime();
const LATER = DIED + TWENTY_MINUTES + 60_000;

// What the CLI actually printed, off her trace logs that evening.
const LIMIT_LINE = "You've hit your weekly limit · resets Sep 3 at 12pm (America/Los_Angeles)";

const LIMIT_TRACE = `# Observing several issues
# w-limit · spawned 2026-08-31T22:20:51.000Z

stderr: ${LIMIT_LINE}

# exited (1) 2026-08-31T22:22:14.000Z
`;

let home;
let docs;
let store;
let sup;
let items;
let clock = 0;

function row(id, extra = {}) {
  return {
    id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'],
    title: id, wrote: { body: { ts: 1000, source: 'founder' } }, ...extra,
  };
}

function layDownTrace(id, text) {
  const dir = machineryPath(docs, path.join('sessions', id), home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1788214934000.log'), text);
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-back-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-back-docs-'));
  process.env.ASTRAL_HOME = home;
  clock = DIED;
  items = [row('w-limit')];
  store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: docs }],
    isDue: () => true,
    recordSessionResult(product, id, patch) {
      const it = items.find((i) => i.id === id);
      if (it) { it.result = patch.result; it.wrote.result = { ts: clock, source: 'agent' }; }
    },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3, driveEnabled: true }, store, home);
  layDownTrace('w-limit', LIMIT_TRACE);
});

afterEach(() => { delete process.env.ASTRAL_HOME; });

describe('a row the exit handler already spoke on still counts', () => {
  it('is counted, which is the bug she filed', () => {
    // The ordinary path on a running app: the session dies, the handler puts
    // the sentence on the row itself, and the pass below never writes a word.
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0 };
    sup.sayTheRunDied(items[0], { tail: [`stderr: ${LIMIT_LINE}`], startedAt: DIED - 83_000 });

    expect(items[0].result).toMatch(/^Claude Code is at its usage limit/);

    sup.sayItOnEveryStrandedRow(items, LATER);
    const news = sup._strandedNews(LATER);
    expect(news).not.toBe(null);
    expect(news.count).toBe(1);
    expect(news.cause).toBe('at-limit');
  });

  it('carries the hour the limit printed all the way to the row', () => {
    // The handler is the only reader that has the dying session's own words, so
    // it is the one that must keep the hour. Without it the row falls back to
    // "when it resets", which is the vaguer sentence was about.
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0 };
    sup.sayTheRunDied(items[0], { tail: ['stderr: You have hit your session limit · resets 6pm (America/Los_Angeles)'], startedAt: DIED - 30_000 });
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(sup._strandedNews(LATER).resetsAt).toBe('6pm');
  });

  it('and the clock is when it got stuck, not when the pass noticed', () => {
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0 };
    sup.sayTheRunDied(items[0], { tail: [`stderr: ${LIMIT_LINE}`], startedAt: DIED - 83_000 });
    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(sup._strandedNews(LATER).since).toBe(DIED);
  });
});

describe('a watermark from before tonight', () => {
  it('is adopted off the sentence already sitting on the row', () => {
    // Every one of the ten on her machine looked exactly like this: spoken on,
    // with no reason kept. Fixing only the handler would have left them
    // invisible until each failed again, up to fifteen minutes later, and a fix
    // she cannot see is not one she can check.
    items[0].result = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', runs: 1 });
    items[0].wrote.result = { ts: DIED + 10, source: 'agent' };
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0, saidAt: DIED };

    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(sup._strandedNews(LATER).count).toBe(1);
    expect(sup._strandedNews(LATER).cause).toBe('at-limit');
  });

  it('and a row a worker really answered is left alone', () => {
    // The same shape in the state file, and the opposite fact on the row. This
    // is why the adoption asks the sentence rather than assuming: a result that
    // is not one of ours means somebody did some work here.
    items[0].result = 'Read the paper and pulled out the four numbers you asked for.';
    items[0].wrote.result = { ts: DIED + 10, source: 'agent' };
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0, saidAt: DIED };

    sup.sayItOnEveryStrandedRow(items, LATER);
    expect(sup._strandedNews(LATER)).toBe(null);
  });
});

describe('the half hour when nothing can spawn', () => {
  it('still counts what is stuck, because that is when it is worst', () => {
    // The fleet brake goes on when no account is left healthy, which on her
    // machine was both of them at the weekly limit. The tick used to return at
    // that line and take the count with it, so the app fell silent exactly when
    // every task in her inbox was stopped.
    sup._fruitless['agentbox:w-limit'] = { runs: 1, endedAt: DIED, founderAt: 0 };
    sup.sayTheRunDied(items[0], { tail: [`stderr: ${LIMIT_LINE}`], startedAt: DIED - 83_000 });
    sup._stranded = [];
    sup._spawnCooldownUntil = Date.now() + 25 * 60_000;

    return sup.tick().then(() => {
      expect(sup._stranded.map((s) => s.id)).toEqual(['w-limit']);
    });
  });
});

describe('the sentence reads back as the thing it says', () => {
  it('round-trips every cause it can write', () => {
    for (const cause of ['workspace', 'signed-out', 'at-limit', 'interrupted', 'unknown']) {
      expect(deadRunCause(deadRunSentence({ engineWord: 'Claude Code', cause, runs: 3, resetsAt: '6pm' }))).toBe(cause);
    }
  });

  it('says nothing about a sentence a person or a worker wrote', () => {
    expect(deadRunCause('Merged the branch and the tests are green.')).toBe(null);
    expect(deadRunCause('')).toBe(null);
    expect(deadRunCause(null)).toBe(null);
  });

  it('still writes the five sentences word for word', () => {
    // The openers moved into a map so they could be read back. Nothing she
    // reads may have changed by a character.
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', runs: 2, resetsAt: '6pm' }))
      .toBe('Claude Code is at its usage limit, so nothing has been done on this task. This has happened 2 times on this task. It starts again on its own at 6pm.');
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out' }))
      .toBe('Claude Code could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'workspace' }))
      .toBe(`Claude Code would not start in this project's folder, so nothing has been done here. ${Name} keeps trying, and it will keep failing the same way until this is fixed.`);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted' }))
      .toBe(`Claude Code was cut off in the middle, so nothing has been done on this task. ${Name} runs it again on its own.`);
    expect(deadRunSentence({ engineWord: 'The agent' }))
      .toBe(`The agent stopped before it did anything, so this task has not been started. ${Name} keeps trying, and it will keep failing the same way until this is fixed.`);
  });
});
