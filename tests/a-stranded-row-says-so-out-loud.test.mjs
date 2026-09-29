// 2026-08-27.
//
// She was right, and the reason was a gap in WHEN it speaks rather than in
// WHAT it says. `sayTheRunDied` runs inside a child process's exit handler, so
// it covers one instant and nothing either side of it. Measured on her own Mac
// at 15:48 that afternoon:
//
//   - Codex was fixed and merged at 15:02 and the app restarted at 15:04.
//   - Her four remaining Codex rows had last died at 13:48 and 13:51, before
//     any of it existed. Nothing revisits a row, so all four still carried not
//     one word, 45 minutes after the fix was live.
//   - Two of them had five strikes each on disk and were asleep until 13:48 and
//     13:51 the FOLLOWING afternoon, a sentence earned entirely by the bug that
//     had just been fixed.
//
// So the fact is re-derived from the store and from the run's own trace on
// every tick. Both are on disk and both outlive the process that wrote them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDeadRunTrace, traceShowsASilentDeath } from '../shared/dead-run-trace.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

// Her own trace, copied out of the store verbatim.
const DEAD_TRACE = `# There's something wrong with our search field.
# w-51f7fdb0e0 · spawned 2026-08-27T20:51:39.445Z

stderr: Reading additional input from stdin...
Not inside a trusted directory and --skip-git-repo-check was not specified.


# exited (1) 2026-08-27T20:51:40.139Z
`;

// THE SAME DEATH, SAID THE WAY THE ONE ENGINE LEFT SAYS IT. The line in the
// trace above is Codex's, and Codex came out of the app whole, so the words it
// used are not words anything prints here any more and the classifier no
// longer carries them. This is the same fault, a folder the CLI will not run
// in, in Claude Code's wording, which is what the row has to name today.
const UNTRUSTED_TRACE = `# There's something wrong with our search field.
# w-51f7fdb0e0 · spawned 2026-08-27T20:51:39.445Z

stderr: Reading additional input from stdin...
This directory is untrusted. Trust this folder to continue.


# exited (1) 2026-08-27T20:51:40.139Z
`;

// And a run that really happened, from the same folder the same afternoon.
const LIVE_TRACE = `# Running into an issue where I was running out of space on my computer.
# w-3fa879cd61 · spawned 2026-08-27T22:25:22.807Z · continuation (the founder answered)

stderr: Reading additional input from stdin...

22:25:29  I'm picking up the search for the Mac storage app.
22:25:34  [agentbox__claim_work_item] failed
22:31:00  == RESULT (ok · 14919 out, 3272490 in) ==

# exited (0) 2026-08-27T22:31:01.414Z
`;

// Her, verbatim. 238 traces on that one row and not a word on it.
const SIGNED_OUT_TRACE = `# Reminder to the founder: Screenshot all your Twitter posts because the hacker might delete them.
# w-4966ad40a5 · spawned 2026-08-27T22:56:30.221Z

22:56:32  Failed to authenticate: OAuth session expired and could not be refreshed

22:56:32  == RESULT (success ERROR · 1 turns) ==
Failed to authenticate: OAuth session expired and could not be refreshed

# exited (1) 2026-08-27T22:56:33.700Z
`;

describe('reading what a run’s own trace says about it', () => {
  it('sees that her dead Codex run was never a session', () => {
    const t = readDeadRunTrace(DEAD_TRACE);
    expect(t.everRan).toBe(false);
    expect(t.exitCode).toBe(1);
    expect(t.stderr).toMatch(/Not inside a trusted directory/);
  });

  it('sees that the run which really worked did run', () => {
    const t = readDeadRunTrace(LIVE_TRACE);
    expect(t.everRan).toBe(true);
    expect(t.exitCode).toBe(0);
  });

  it('calls the first a silent death and the second not', () => {
    expect(traceShowsASilentDeath(readDeadRunTrace(DEAD_TRACE))).toBe(true);
    expect(traceShowsASilentDeath(readDeadRunTrace(LIVE_TRACE))).toBe(false);
  });

  it('finds the reason when it is in the result rather than on stderr', () => {
    // A CLI that starts and then cannot authenticate says so through its own
    // protocol; nothing reaches stderr. Read from stderr alone this came back
    // 'unknown' and her row would have been told the useless half of the news.
    const t = readDeadRunTrace(SIGNED_OUT_TRACE);
    expect(t.everRan).toBe(true);
    expect(t.exitCode).toBe(1);
    expect(t.stderr).toMatch(/OAuth session expired/);
    expect(troubleCause(t.stderr)).toBe('signed-out');
    expect(traceShowsASilentDeath(t)).toBe(true);
  });

  it('will not read a worker’s ordinary prose as a diagnosis', () => {
    // Same block, no ERROR flag: this is a worker reporting on her product and
    // it may say anything at all, including the words above.
    const ok = SIGNED_OUT_TRACE
      .replace('(success ERROR · 1 turns)', '(success · 9 turns)')
      .replace('# exited (1)', '# exited (0)');
    expect(readDeadRunTrace(ok).stderr).not.toMatch(/OAuth/);
    expect(traceShowsASilentDeath(readDeadRunTrace(ok))).toBe(false);
  });

  it('says nothing about a trace with no exit line at all', () => {
    // A session still going, or one that went down with the app. Neither is
    // news, and calling either a death would put a sentence on a live row.
    const running = DEAD_TRACE.replace(/^# exited.*$/m, '');
    expect(readDeadRunTrace(running).exitCode).toBe(null);
    expect(traceShowsASilentDeath(readDeadRunTrace(running))).toBe(false);
    expect(traceShowsASilentDeath(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */

let home;
let docs;
let store;
let sup;
let item;

const ROW = () => ({
  id: 'w-51f7fdb0e0',
  product: 'agentbox',
  status: 'open',
  kind: 'task',
  labels: ['founder'],
  engine: 'codex',
  title: "There's something wrong with our search field.",
  wrote: { body: { ts: 1000, source: 'founder' } },
});

// One trace on disk, exactly where the supervisor writes them.
function layDownTrace(text, at = '1787863899445') {
  const dir = machineryPath(docs, path.join('sessions', 'w-51f7fdb0e0'), home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${at}.log`), text);
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-wa73-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-wa73-docs-'));
  setAppHome(home);
  item = ROW();
  store = {
    listItems: () => [item],
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: docs }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3 }, store, home);
});

afterEach(() => { clearAppHome(); });

// The state her app actually held at 15:48: five strikes, last run at 13:51,
// nothing ever written on the row.
function strandedFor(runs = 5, endedAt = 1787863900000) {
  sup._fruitless['agentbox:w-51f7fdb0e0'] = { runs, endedAt, founderAt: 0 };
}

describe('a row nothing is going to touch says why', () => {
  it('writes the sentence for a run that died before this code existed', () => {
    layDownTrace(UNTRUSTED_TRACE);
    strandedFor();
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(1);
    expect(store.written[0].id).toBe('w-51f7fdb0e0');
    expect(store.written[0].result).toMatch(/^Claude Code would not start in this project's folder/);
    expect(store.written[0].status).toBe('open');
  });

  it('says how many times it has happened, off the strikes on disk', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor(5);
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written[0].result).toMatch(/happened 5 times/);
  });

  it('says it once, not once every fifteen seconds', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    for (let i = 0; i < 4; i += 1) sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(1);
  });

  it('speaks again once a NEW run has died on the same row', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    // The next attempt dies too: a fresh endedAt, and no watermark on it.
    sup._fruitless['agentbox:w-51f7fdb0e0'].endedAt = 1787880000000;
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787890000000);
    expect(store.written).toHaveLength(2);
  });

  it('does not serve out a sleep the bug handed it', () => {
    // Five strikes is the twenty-four hour rung. A run that never became a
    // session is no evidence at all about the row, so it goes back to the
    // first rung and the fresh-work pass can reach it in this same tick.
    layDownTrace(DEAD_TRACE);
    strandedFor(5);
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(sup._fruitless['agentbox:w-51f7fdb0e0'].runs).toBe(1);
  });

  it('leaves the strikes alone when the worker really ran', () => {
    layDownTrace(LIVE_TRACE.replace('# exited (0)', '# exited (1)'));
    strandedFor(3);
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(sup._fruitless['agentbox:w-51f7fdb0e0'].runs).toBe(3);
  });
});

describe('and it never speaks over anybody', () => {
  it('stays quiet when a worker ran cleanly and left the row open', () => {
    layDownTrace(LIVE_TRACE);
    strandedFor(2);
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('stays quiet when the row already carries a result newer than the run', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor(5, 1787863900000);
    item.result = 'A worker already answered this.';
    item.wrote.result = { ts: 1787864000000, source: 'agent' };
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('stays quiet on a row she has answered, because a session is coming', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    item.answer = 'try it again';
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('stays quiet on a row that is no longer open', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    item.status = 'done';
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('stays quiet while a worker is on the row right now', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    sup.sessions.set('w-51f7fdb0e0', { startedAt: Date.now() });
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('stays quiet on a row that has never been spawned at all', () => {
    strandedFor(); // strikes, but no trace on disk
    sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000);
    expect(store.written).toHaveLength(0);
  });

  it('never throws, because it runs inside the tick', () => {
    layDownTrace(DEAD_TRACE);
    strandedFor();
    store.recordSessionResult = () => { throw new Error('disk is full'); };
    expect(() => sup.sayItOnEveryStrandedRow(store.listItems(), 1787870000000)).not.toThrow();
  });
});
