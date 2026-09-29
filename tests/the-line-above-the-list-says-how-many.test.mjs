// 2026-08-27. She was shown six looks photographed in the real app on her own
// rows and picked the fourth: one line above the list, said once for the whole
// app, with the silent rows left exactly as they are.
//
//     8 tasks have not been able to run since yesterday. Nothing has started
//     on any of them.
//     Open Claude in a terminal, type /login, and they pick straight back up.
//
// The line it fills is not new. It has been there since and it could never have
// said this. `_spawnTrouble` wants `_fleetTroubleSince`, which is only set when
// NO Claude account is left healthy, and it wants `sessions.size === 0`. Her
// Claude agents worked all day on 08-27 while four Codex tasks and four on a
// signed-out second login sat there, so both of those gates were open the whole
// time and the one surface the app owns for this was structurally unable to
// speak. That is the whole of "it happened blindly".
//
// So the subject of the sentence is her TASKS, not the fleet, and the tests
// below are mostly about the two ways that can go wrong: saying it when it is
// not true, and not saying it when it is.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sinceWords, strandedSentence, strandedRemedy, troubleRemedy } from '../shared/spawn-trouble.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

const TWENTY_MINUTES = 20 * 60_000;

describe('when it started, in words', () => {
  const now = new Date(2026, 7, 27, 23, 30).getTime();

  it('says nothing at all about something that just happened', () => {
    // Everything in her inbox is from today. "since 11:14pm" at 11:30pm is the
    // app filling space, and the sentence reads better without it.
    expect(sinceWords(now - 90 * 60_000, now)).toBe('');
  });

  it('gives the time of day once it has been hours', () => {
    expect(sinceWords(new Date(2026, 7, 27, 13, 48).getTime(), now)).toBe(' since 1:48pm');
    expect(sinceWords(new Date(2026, 7, 27, 9, 5).getTime(), now)).toBe(' since 9:05am');
  });

  it('says yesterday, which is the word that carries the weight', () => {
    expect(sinceWords(new Date(2026, 7, 26, 13, 48).getTime(), now)).toBe(' since yesterday');
  });

  it('names the day inside the week, and stops naming it after', () => {
    expect(sinceWords(new Date(2026, 7, 24, 10, 0).getTime(), now)).toBe(' since Monday');
    expect(sinceWords(new Date(2026, 7, 14, 10, 0).getTime(), now)).toBe(' for over a week');
  });

  it('says nothing when it has no time to work from', () => {
    expect(sinceWords(0, now)).toBe('');
    expect(sinceWords(undefined, now)).toBe('');
    expect(sinceWords(now + 60_000, now)).toBe('');
  });
});

describe('the sentence she picked', () => {
  const now = new Date(2026, 7, 27, 23, 30).getTime();
  const yesterday = new Date(2026, 7, 26, 13, 48).getTime();

  it('is word for word the one she approved', () => {
    expect(strandedSentence({ count: 8, since: yesterday, now }))
      .toBe('8 tasks have not been able to run since yesterday. Nothing has started on any of them.');
  });

  it('counts one task as one task', () => {
    expect(strandedSentence({ count: 1, since: yesterday, now }))
      .toBe('1 task has not been able to run since yesterday. Nothing has started on it.');
  });

  it('fits the two lines her inbox row budget is measured in', () => {
    // The line sits above a list whose rows clip at 112 characters, and a
    // sentence longer than the rows under it reads as a paragraph.
    expect(strandedSentence({ count: 8, since: yesterday, now }).length).toBeLessThan(112);
  });
});

describe('and what to do about it', () => {
  it('names the fix when there is one fix', () => {
    expect(strandedRemedy(['signed-out', 'signed-out'])).toBe(troubleRemedy('signed-out'));
    expect(strandedRemedy(['workspace'])).toBe(troubleRemedy('workspace'));
  });

  it('refuses to name one when it would only mend half of them', () => {
    // Her own afternoon: four Codex tasks refused a folder and four could not
    // sign in. "Type /login" would have been true of half and useless on the
    // rest, and she would have found that out by trying it.
    expect(strandedRemedy(['workspace', 'signed-out']))
      .toBe('They are not all stuck on the same thing. Each row says which.');
  });
});

/* ------------------------------------------------------------------------- */

// Her four Codex traces, in the shape the store really holds them.
const REFUSED_TRACE = `# There's something wrong with our search field.
# w-codex · spawned 2026-08-27T20:51:39.445Z

stderr: Reading additional input from stdin...
Not inside a trusted directory and --skip-git-repo-check was not specified.


# exited (1) 2026-08-27T20:51:40.139Z
`;

// And the second login, which is the other half of what she was looking at.
const SIGNED_OUT_TRACE = `# Screenshot all your Twitter posts.
# w-login · spawned 2026-08-27T22:56:30.221Z

22:56:32  Failed to authenticate: OAuth session expired and could not be refreshed

22:56:32  == RESULT (success ERROR · 1 turns) ==
Failed to authenticate: OAuth session expired and could not be refreshed

# exited (1) 2026-08-27T22:56:33.700Z
`;

const DIED = new Date(2026, 7, 27, 13, 48).getTime();
const LOOKING = new Date(2026, 7, 27, 15, 48).getTime();     // when she filed it

let home;
let docs;
let store;
let sup;
let items;
// The store stamps a result with the clock, and every one of these tests runs
// on a clock of its own, so the two have to be the same one or a sentence
// written "now" lands in the future of the run that caused it.
let clock = 0;

// One tick of the supervisor, at a given moment.
function tick(at) {
  clock = at;
  sup.sayItOnEveryStrandedRow(items, at);
}

function row(id, extra = {}) {
  return {
    id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'],
    title: id, wrote: { body: { ts: 1000, source: 'founder' } }, ...extra,
  };
}

function layDownTrace(id, text) {
  const dir = machineryPath(docs, path.join('sessions', id), home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1787863899445.log'), text);
}

// A row a run died silently on, exactly as `noteFreshRun` leaves it.
function died(id, endedAt = DIED) {
  sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt, founderAt: 0 };
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-line-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-line-docs-'));
  setAppHome(home);
  items = [row('w-codex', { engine: 'codex' }), row('w-login')];
  store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: docs }],
    isDue: () => true,
    recordSessionResult(product, id, patch) {
      const it = items.find((i) => i.id === id);
      if (it) { it.result = patch.result; it.wrote.result = { ts: clock, source: 'agent' }; }
    },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3 }, store, home);
  layDownTrace('w-codex', REFUSED_TRACE);
  layDownTrace('w-login', SIGNED_OUT_TRACE);
});

afterEach(() => { clearAppHome(); });

describe('the line above her list', () => {
  it('speaks while her other agents are working, which is the whole bug', () => {
    // 15:48 on her Mac: two rows dead since 13:48, and four Claude workers
    // going strong on other rows. Every gate on the OLD line was open — no
    // fleet trouble, sessions running — and it said nothing.
    died('w-codex');
    died('w-login');
    sup.sessions.set('w-somethingelse', { startedAt: LOOKING - 60_000 });
    expect(sup._fleetTroubleSince ?? 0).toBe(0);
    expect(sup._spawnTrouble([])).toBe(null);        // the old line, still mute

    tick(LOOKING);
    const news = sup._strandedNews(LOOKING);
    expect(news).not.toBe(null);
    expect(news.message).toBe('2 tasks have not been able to run. Nothing has started on any of them.');

    // Two hours in it is just the count. By the evening the clock is the news,
    // because a task that has been stuck since lunchtime is a different fact
    // from one that failed after tea, and she is the one who has to tell them
    // apart at a glance.
    const evening = new Date(2026, 7, 27, 22, 15).getTime();
    expect(sup._strandedNews(evening).message)
      .toBe('2 tasks have not been able to run since 1:48pm. Nothing has started on any of them.');
  });

  it('goes on saying it after it has said it once on the rows', () => {
    // The rows each carry their own sentence from the first tick. The count
    // must not fall to zero on the second one: being told is not being fixed.
    died('w-codex');
    died('w-login');
    tick(LOOKING);
    tick(LOOKING + 15_000);
    expect(sup._strandedNews(LOOKING + 15_000).message).toMatch(/^2 tasks have not been able to run/);
  });

  it('names one fix when both rows have the same one', () => {
    died('w-login');
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING).remedy).toBe(troubleRemedy('signed-out'));
    expect(sup._strandedNews(LOOKING).cause).toBe('signed-out');
  });

  it('says they are not all the same thing when they are not', () => {
    died('w-codex');
    died('w-login');
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING).cause).toBe('mixed');
    expect(sup._strandedNews(LOOKING).remedy).toMatch(/not all stuck on the same thing/);
  });
});

describe('and it stays quiet unless it is really true', () => {
  it('waits out the twenty minutes the old line waits out', () => {
    // One row's bad minute is not news, and a run that died two minutes ago is
    // very often one Agentbox is about to retry.
    died('w-codex', LOOKING - 60_000);
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING)).toBe(null);
    expect(sup._strandedNews(LOOKING + TWENTY_MINUTES)).not.toBe(null);
  });

  it('counts every stuck row once the clock has armed it', () => {
    // THE PICTURE CAUGHT THIS ONE. Written so the clock filtered the count, the
    // line read "1 task has not been able to run" above two rows each saying
    // nothing had run on it, because the second had failed twelve minutes ago.
    // She would have counted the rows and been right. The wait exists so one
    // bad minute is not shouted about; it is not a reason to undercount.
    died('w-codex', LOOKING - TWENTY_MINUTES - 1);
    died('w-login', LOOKING - 60_000);
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING).message).toMatch(/^2 tasks have not been able to run/);
  });

  it('counts twenty minutes from when it got stuck, not from its newest retry', () => {
    // THIS IS THE ONE THAT NEARLY SHIPPED WRONG. A row on the first rung of the
    // rest ladder is retried every FIFTEEN minutes, and every failure moves
    // `endedAt`. Judged on that, a row stuck all day is never more than fifteen
    // minutes old and the twenty minute gate never opens — and her four Codex
    // rows are capped at that first rung on purpose, so the line would have
    // stayed silent for exactly the rows she filed this about.
    died('w-codex', LOOKING);
    tick(LOOKING);
    for (let i = 1; i <= 8; i += 1) {
      const at = LOOKING + i * 15 * 60_000;
      sup._fruitless['agentbox:w-codex'].endedAt = at;      // it failed again
      tick(at);
    }
    // Two hours of quarter-hourly failures, and the newest is 0 minutes old.
    const twoHoursOn = LOOKING + 8 * 15 * 60_000;
    expect(sup._fruitless['agentbox:w-codex'].endedAt).toBe(twoHoursOn);
    expect(sup._strandedNews(twoHoursOn).message).toMatch(/^1 task has not been able to run/);
  });

  it('drops a row the moment she answers it', () => {
    // Answering is what starts it again. The tick that would notice may be
    // fifteen seconds away, or an hour away if the app is on a cooldown, so
    // the count is re-checked against the store on the way out.
    died('w-codex');
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING)).not.toBe(null);
    items[0].answer = 'try it again';
    expect(sup._strandedNews(LOOKING)).toBe(null);
  });

  it('drops a row that has been closed, and one a worker has picked up', () => {
    died('w-codex');
    died('w-login');
    tick(LOOKING);
    items[0].status = 'done';
    expect(sup._strandedNews(LOOKING).message).toMatch(/^1 task has not been able to run/);
    sup.sessions.set('w-login', { startedAt: LOOKING });
    expect(sup._strandedNews(LOOKING)).toBe(null);
  });

  it('never counts a row a worker actually wrote on', () => {
    // A clean run that left the row open is a worker making its own choices,
    // and the supervisor has no business counting that as a failure.
    died('w-codex');
    items[0].result = 'A worker already answered this.';
    items[0].wrote.result = { ts: DIED + 1000, source: 'agent' };
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING)).toBe(null);
    // And not on the next tick either, when the watermark it just wrote is the
    // thing being read back.
    tick(LOOKING + 15_000);
    expect(sup._strandedNews(LOOKING + 15_000)).toBe(null);
  });

  it('says nothing at all about an app she paused herself', () => {
    died('w-codex');
    tick(LOOKING);
    sup.paused = true;
    expect(sup._strandedNews(LOOKING)).toBe(null);
  });

  it('leaves the older fleet sentence alone when nothing is stranded', () => {
    // Nothing can start anywhere is a different fact and it keeps its own line.
    tick(LOOKING);
    expect(sup._strandedNews(LOOKING)).toBe(null);
    sup._fleetTroubleSince = LOOKING - TWENTY_MINUTES - 1;
    sup._lastFastExit = { at: LOOKING, cause: 'signed-out', raw: '' };
    expect(sup._spawnTrouble(['w-codex']).message).toMatch(/^No agents can start/);
  });
});
