// AN INBOX TO DEMO WITH, AND THE FOUR WAYS IT COULD QUIETLY BE HER OWN.
//
// The dangerous versions of this feature are all the same shape: a demo copy
// that reaches back into her real world and shows a room something of hers.
// There are four ways that can happen and each one has a test here.
//
//   1. It reads her ledger. `ASTRAL_HOME` is inherited: every session Agentbox
//      spawns has it set, so a demo launched by a process that has it would
//      stand in an invented store and read HER work items out of ~/Zero.
//   2. It shows her agents. Linking ~/.claude through, which the new-user row
//      does on purpose, puts the Claude Code sessions running on this Mac into
//      the inbox with her real folder names on them.
//   3. It writes the work where nothing reads it. The ledger has not lived in
//      the product folder since 2026-08-27; put it there and the demo opens on
//      an empty inbox, in front of a room.
//   4. It counts as a person. A demo is opened and closed, which is the exact
//      shape of a stranger who bounced.
//
// And one that is not about her at all: an empty inbox demonstrates nothing, so
// the last block reads the seeded store back through the app's own reader and
// checks that real rows come out of it.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HOMES as DEMO_HOMES, demoEnv, demoPaths, makeDemoHome, openDemo, seedDemoStore,
} from '../main/demo.mts';
import { DEMO_ENV, DEMO_GROUP_POSTS, DEMO_INSTALL_ID, DEMO_PRODUCTS, demoLedgerLines, demoMessages, runningAsADemo } from '../shared/demo-world.mts';
import { HOMES as FRESH_HOMES } from '../shared/fresh-user-home.mts';
import { readInstallId } from '../shared/install-id.mts';
import { readWorkItems } from '../main/store/work-items.mts';
import { NAME, Name } from '../shared/product-name.mjs';
import { setAppHome, clearAppHome, appHomeEnv } from './app-home.mts';

const made = [];

function aHome() {
  const home = makeDemoHome(new Date(Date.now() + made.length * 1000));
  made.push(home);
  return home;
}

afterEach(() => {
  while (made.length) fs.rmSync(made.pop(), { recursive: true, force: true });
});

describe('where a demo lives', () => {
  it('is its own folder under /tmp, not the first-run one', () => {
    // Sharing the fresh-user folder would make every demo home answer yes to
    // `runningAsAFreshUser`, which keys on that path, and the demo's counts
    // would go out under the first-run id instead of its own.
    expect(DEMO_HOMES).not.toBe(FRESH_HOMES);
    expect(DEMO_HOMES.startsWith(FRESH_HOMES + path.sep)).toBe(false);
    const home = aHome();
    expect(path.dirname(home)).toBe(DEMO_HOMES);
  });

  it('puts the store and the app records inside that one folder', () => {
    const home = aHome();
    const { storeRoot, accountRoot, appHome } = demoPaths(home);
    for (const p of [storeRoot, accountRoot, appHome]) {
      expect(p.startsWith(home + path.sep)).toBe(true);
    }
  });

  // A demo copy may be open on a call while the suite runs on the same
  // computer. Clearing the whole folder here wiped an open demo's store and
  // left its inbox empty (2026-11-21), so nothing clears it any more.
  it('offers nothing that deletes every demo home, so a test run cannot empty an open demo', async () => {
    expect('clearDemoHomes' in (await import('../main/demo.mts'))).toBe(false);
  });
});

describe('the environment a demo is launched with', () => {
  it('sets both home variables, because HOME alone shares her userData', () => {
    // The lock is keyed on userData and `app.getPath('appData')` asks Core
    // Foundation, not the environment. With only HOME the copy loses the
    // single-instance race and quits in half a second.
    const home = aHome();
    const env = demoEnv(home, {});
    expect(env.HOME).toBe(home);
    expect(env.CFFIXED_USER_HOME).toBe(home);
  });

  it('overwrites an inherited ASTRAL_HOME, so a demo cannot read her ledger', () => {
    // THIS IS THE ONE THAT WOULD HAVE HAPPENED. Every session Agentbox spawns
    // carries ASTRAL_HOME, and the app's home reads that variable before it
    // falls back to ~/.astral. Inherited, the demo copy would draw invented
    // products and her real work items inside them.
    const home = aHome();
    const hers = '/Users/somebody/Zero';
    const env = demoEnv(home, { ASTRAL_HOME: hers });
    expect(env.ASTRAL_HOME).not.toBe(hers);
    expect(env.ASTRAL_HOME).toBe(demoPaths(home).appHome);
  });

  it('marks the copy as a demo', () => {
    const home = aHome();
    expect(runningAsADemo(demoEnv(home, {}))).toBe(true);
    expect(runningAsADemo({})).toBe(false);
    expect(demoEnv(home, {})[DEMO_ENV]).toBe('1');
  });
});

describe('what a demo copy counts as', () => {
  it('sends under one fixed id rather than as a new person every time', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-demo-id-'));
    expect(readInstallId(dir, { [DEMO_ENV]: '1' })).toBe(DEMO_INSTALL_ID);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not make a real install look like a demo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-real-id-'));
    const id = readInstallId(dir, {});
    expect(id).toBeTruthy();
    expect(id).not.toBe(DEMO_INSTALL_ID);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the store a demo opens on', () => {
  it('writes a project per invented product and nothing else in the account', () => {
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    const slugs = fs.readdirSync(out.accountRoot).sort();
    expect(slugs).toEqual(DEMO_PRODUCTS.map((p) => p.slug).sort());
    for (const p of DEMO_PRODUCTS) {
      const project = JSON.parse(fs.readFileSync(path.join(out.accountRoot, p.slug, 'project.json'), 'utf8'));
      expect(project.name).toBe(p.name);
      expect(project.oneLiner).toBe(p.oneLiner);
      // No repo path: a made-up one either shows a stranger's folder on the
      // screen or shows a warning that the folder is missing.
      expect(project.repoPath ?? null).toBe(null);
    }
  });

  it('puts the work in the app home, never beside project.json', () => {
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    for (const p of out.products) {
      expect(fs.existsSync(path.join(p.dir, 'work-items.jsonl'))).toBe(false);
      expect(fs.existsSync(path.join(p.machinery, 'work-items.jsonl'))).toBe(true);
      expect(p.machinery.startsWith(path.join(out.appHome, 'projects') + path.sep)).toBe(true);
    }
  });

  it('reads back through the app\'s own reader as rows, not as an empty inbox', () => {
    // The point of the whole feature. Nothing here parses the jsonl by hand:
    // the store's real reader is pointed at the demo's home the way the demo
    // copy will point at it, and what comes out is what she would see.
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    const was = appHomeEnv();
    setAppHome(out.appHome);
    try {
      const all = [];
      for (const p of out.products) all.push(...readWorkItems(p.dir));
      expect(all.length).toBeGreaterThanOrEqual(6);
      // Every screen worth demoing has a row that lands on it.
      expect(all.some((i) => i.status === 'open' && /## Options/.test(i.result ?? ''))).toBe(true);
      // Nothing blocked: on the call, "Send back to agent" on a thread nobody
      // handed off read as a riddle (2026-11-21).
      expect(all.some((i) => i.status === 'blocked')).toBe(false);
      expect(all.some((i) => i.status === 'done' && (i.result ?? '').length > 40)).toBe(true);
      // And one row the user wrote, which an agent may not overwrite.
      expect(all.some((i) => i.wrote?.body?.source === 'founder')).toBe(true);
    } finally {
      if (was === undefined) clearAppHome(); else setAppHome(was);
    }
  });

  it('leaves the welcome walk switched off, because the store has projects', () => {
    // `firstRunNeeded` (renderer/src/onboarding.ts) is `!done && products === 0`.
    // A seeded store therefore opens on the inbox rather than on the welcome
    // screen, which is the difference between a demo and a first run.
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    expect(out.products.length).toBeGreaterThan(0);
  });
});

describe('what a demo never shows', () => {
  it('never links her Claude Code folder into the demo home', () => {
    // The new-user row links ~/.claude on purpose so its finish card has agents
    // to offer. In a demo that folder's project names are on a projector.
    const out = openDemo({
      execPath: process.execPath,
      packaged: true,
      spawnFn: () => ({ pid: 4242, unref() {} }),
    });
    made.push(out.home);
    expect(out.ok).toBe(true);
    // A home with Claude Code is given an empty folder of its own, so the app does not read
    // Claude Code as never set up (shared/fresh-user-home.mts). Empty, and no link to hers.
    const folder = path.join(out.home, '.claude');
    if (fs.existsSync(folder)) {
      expect(fs.lstatSync(folder).isSymbolicLink()).toBe(false);
      expect(fs.readdirSync(folder)).toEqual([]);
    }
  });

  it('carries nothing about the person running it in anything it writes', () => {
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    const text = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else text.push(fs.readFileSync(file, 'utf8'));
      }
    };
    walk(out.accountRoot);
    walk(out.appHome);
    const all = text.join('\n');
    // WHOEVER IS RUNNING THIS. The list used to name one person and the two
    // products she shipped, which stopped meaning anything the moment this
    // repository became public: a demo shown on a projector leaks whoever is
    // standing in front of it, not whoever wrote the app. So the words are
    // read off the machine running the test instead of typed.
    //
    // NOT THE APP'S OWN NAME. The store root a copy with no config file reads
    // is `<home>/<Name>` (main/config.mts), so that word is in the demo's own
    // paths by construction. It sits inside a /tmp folder and it is a default,
    // not anything of anybody's. Another product's name was that default until 2026-09-22
    // and is banned by name, so a demo can never quietly start writing to a
    // folder somebody may still have.
    // A runner called "agent" must not reject the app's own name.
    const banned = [
      '/Users/',
      os.homedir(),
      os.userInfo().username,
    ].filter((w) => w && w.length > 2 && !Name.toLowerCase().includes(w.toLowerCase()));
    for (const word of banned) {
      expect(all.includes(word)).toBe(false);
    }
  });
});

describe('how the demo rows are written', () => {
  const rows = Object.values(demoLedgerLines(Date.now())).flat();
  // THE AGENTS' ANSWERS ON THREADS STILL WAITING ON YOU. The user's own words
  // are a sentence somebody typed, and a finished thread's answer is a report.
  const finished = new Set(rows.filter((l) => l.patch?.status === 'done').map((l) => l.id));
  const bodies = rows.filter((l) => l.source === 'agent' && !finished.has(l.id)).map((l) => l.patch?.result).filter(Boolean);

  it('opens every answer waiting on you with the ask in bold, under fifteen words', () => {
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const body of bodies) {
      const first = body.split('\n')[0];
      expect(first.startsWith('**')).toBe(true);
      expect(first.endsWith('**')).toBe(true);
      expect(first.replace(/\*/g, '').split(/\s+/).length).toBeLessThan(15);
    }
  });

  it('names and summarises every thread itself, so the copy never asks a model to', () => {
    // main/row-label.mts names any row without a label on a timer.
    const ids = new Set(rows.map((l) => l.id));
    for (const id of ids) {
      const mine = rows.filter((l) => l.id === id);
      expect(mine.some((l) => String(l.patch?.label ?? '').trim())).toBe(true);
      const summary = mine.find((l) => l.patch?.problem);
      expect(String(summary?.patch.problem).split(/\s+/).length).toBeLessThanOrEqual(45);
      const done = String(summary?.patch.progress).split('\n');
      expect(done.length).toBeLessThanOrEqual(6);
      for (const step of done) expect(step.split(/\s+/).length).toBeLessThanOrEqual(15);
    }
  });

  it('joins no two sentences with a colon, the same standing rule as the em dash', () => {
    const said = [
      ...rows.flatMap((l) => ['title', 'body', 'result', 'problem', 'progress', 'label'].map((k) => l.patch?.[k])),
      ...demoMessages().flatMap((m) => [m.title, m.body]),
      ...DEMO_GROUP_POSTS.map((p) => p.body),
    ].filter((s): s is string => typeof s === 'string');
    for (const text of said) expect(text).not.toMatch(/[a-z]: [a-z]/i);
  });

  // "The word 'fairy,' by the way, is a little funny because it sounds like
  // 'fairy fairy,' which is like a slur" (founder, 2026-11-21). Renamed Shuttle.
  it('never calls the invented company Ferry', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '../shared/demo-world.mts'), 'utf8');
    expect(src).not.toMatch(/ferry/i);
    expect(src).toContain("name: 'Shuttle'");
  });

  it('writes no em dash anywhere, because a screenshot of this is our writing', () => {
    for (const line of rows) {
      expect(JSON.stringify(line).includes('—')).toBe(false);
    }
  });

  // The founder, 2026-11-21, on the Stripe thread: "They don't give me options
  // because... they should all have 1, 2, 3 options", and "They don't really
  // show me screenshots or visuals". Two of four agent threads had neither.
  it('gives every agent thread waiting on you two or three options to pick', () => {
    // Four agents', the AI teammate's, and the one Auto offers a teammate on.
    expect(bodies.length).toBe(6);
    for (const body of bodies) {
      const options = body.split('\n## Options\n')[1];
      expect(options).toBeTruthy();
      const picks = options.split('\n').filter((l) => /^\d\. /.test(l));
      expect(picks.length).toBeGreaterThanOrEqual(2);
      expect(picks.length).toBeLessThanOrEqual(3);
      expect(picks.filter((l) => l.endsWith('(recommended)'))).toHaveLength(1);
    }
  });

  it('shows a picture of the work in every agent thread waiting on you', () => {
    for (const body of bodies) expect(body).toMatch(/^designs\/[\w-]+\.png$/m);
  });

  // "The first couple of threads should be Claude Code threads with standard
  // stuff... and then I'll introduce them to messages from Teams." A message
  // from a person wins a tie in Needs you (threads/page-rules `byPriority`),
  // so the agents' threads rank a level above the teammates' messages.
  it('puts two Claude Code threads first in Needs you, and teammates after every agent', () => {
    const waiting = [...new Set(rows.filter((l) => !finished.has(l.id)).map((l) => l.id))].map((id) => {
      const mine = rows.filter((l) => l.id === id);
      return { engine: mine.find((l) => l.patch?.engine)?.patch.engine, priority: Number(mine.find((l) => l.patch?.priority)?.patch.priority), at: mine[0].ts };
    }).sort((a, b) => b.priority - a.priority || b.at - a.at);
    expect(waiting.slice(0, 2).map((r) => r.engine)).toEqual(['claude', 'claude']);
    const lowest = Math.min(...waiting.map((r) => r.priority));
    for (const m of demoMessages()) expect(m.priority).toBeLessThan(lowest);
  });

  it('lays every picture it names into the project, where the thread draws it from', () => {
    const home = aHome();
    const out = seedDemoStore(home, { now: Date.now() });
    const byId = new Map(rows.map((l) => [l.id, l]));
    const named = rows.flatMap((l) => [...String(l.patch?.result ?? '').matchAll(/^(designs\/[\w-]+\.png)$/gm)].map((m) => ({ id: l.id, file: m[1] })));
    expect(named.length).toBeGreaterThanOrEqual(4);
    for (const { id, file } of named) {
      const product = Object.entries(demoLedgerLines(Date.now())).find(([, ls]) => ls.some((l) => l.id === id))![0];
      expect(byId.has(id)).toBe(true);
      expect(fs.statSync(path.join(out.accountRoot, product, file)).size).toBeGreaterThan(10_000);
    }
  });
});

describe('opening one', () => {
  it(`starts a second ${NAME}, detached, in the demo environment`, () => {
    const spawned = [];
    const out = openDemo({
      execPath: process.execPath,
      packaged: true,
      spawnFn: (bin, args, opts) => { spawned.push({ bin, args, opts }); return { pid: 99, unref() {} }; },
    });
    made.push(out.home);
    expect(out.ok).toBe(true);
    expect(out.pid).toBe(99);
    // ROWS, NOT LEDGER LINES. The toast reads this number out loud, and one row
    // is two or three appended lines, so counting lines said twenty for nine.
    expect(out.rows).toBe(new Set(Object.values(demoLedgerLines(Date.now())).flat().map((l) => l.id)).size);
    expect(out.rows).toBeGreaterThanOrEqual(6);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].opts.detached).toBe(true);
    expect(spawned[0].opts.env.HOME).toBe(out.home);
    expect(spawned[0].opts.env[DEMO_ENV]).toBe('1');
  });

  it('says why rather than throwing when the app\'s own program is not there', () => {
    const out = openDemo({
      execPath: `/nowhere/at/all/${NAME}`,
      packaged: true,
      spawnFn: () => { throw new Error('should not be reached'); },
    });
    if (out.home) made.push(out.home);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Cannot find this app's own program/);
  });
});
