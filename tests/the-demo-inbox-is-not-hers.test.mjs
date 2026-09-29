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
  HOMES as DEMO_HOMES, clearDemoHomes, demoEnv, demoPaths, makeDemoHome, openDemo, seedDemoStore,
} from '../main/demo.mjs';
import { DEMO_ENV, DEMO_INSTALL_ID, DEMO_PRODUCTS, demoLedgerLines, runningAsADemo } from '../shared/demo-world.mjs';
import { HOMES as FRESH_HOMES } from '../shared/fresh-user-home.mjs';
import { readInstallId } from '../shared/install-id.mjs';
import { readWorkItems } from '../main/store/work-items.mjs';
import { NAME, Name } from '../shared/product-name.mjs';
import { setAppHome, clearAppHome, appHomeEnv } from './app-home.mjs';

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

  it('clears only its own folder', () => {
    aHome();
    expect(fs.existsSync(DEMO_HOMES)).toBe(true);
    expect(clearDemoHomes()).toEqual({ ok: true });
    expect(fs.existsSync(DEMO_HOMES)).toBe(false);
    made.length = 0;
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
      expect(all.length).toBeGreaterThanOrEqual(9);
      // Every screen worth demoing has a row that lands on it.
      expect(all.some((i) => i.status === 'open' && /## Options/.test(i.body ?? ''))).toBe(true);
      expect(all.some((i) => i.status === 'blocked')).toBe(true);
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
    // Checked through the link, not on it: `~/.claude` really is on this Mac,
    // so a link that had been made would resolve and this would go red.
    expect(fs.existsSync(path.join(out.home, '.claude'))).toBe(false);
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
    // is `<home>/<Name>` (main/config.mjs), so that word is in the demo's own
    // paths by construction. It sits inside a /tmp folder and it is a default,
    // not anything of anybody's. Another product's name was that default until 2026-09-22
    // and is banned by name, so a demo can never quietly start writing to a
    // folder somebody may still have.
    const banned = [
      '/Users/',
      path.basename(os.homedir()),
      os.userInfo().username,
    ].filter((w) => w && w.length > 2);
    for (const word of banned) {
      expect(all.includes(word)).toBe(false);
    }
  });
});

describe('how the demo rows are written', () => {
  const rows = Object.values(demoLedgerLines(Date.now())).flat();
  // AGENT BODIES ONLY. The user's own row is their sentence, written the way
  // somebody types a sentence, and a rule about how we open a card does not
  // apply to what the user wrote.
  const bodies = rows.filter((l) => l.source === 'agent').map((l) => l.patch?.body).filter(Boolean);

  it('opens every body with the ask in bold on the first line', () => {
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const first = body.split('\n')[0];
      expect(first.startsWith('**')).toBe(true);
      expect(first.endsWith('**')).toBe(true);
    }
  });

  it('writes no em dash anywhere, because a screenshot of this is our writing', () => {
    for (const line of rows) {
      expect(JSON.stringify(line).includes('—')).toBe(false);
    }
  });

  it('gives every unanswered question and review an options section to draw', () => {
    // The list under the reply box is drawn from the body's `## Options`
    // section. A demo whose questions have none demonstrates the app with its
    // best feature switched off.
    const asks = rows.filter((l) => l.patch?.body && /^\*\*(Say|Merge|Post|Pick)/.test(l.patch.body));
    expect(asks.length).toBeGreaterThanOrEqual(4);
    for (const ask of asks) expect(ask.patch.body).toMatch(/\n## Options\n/);
  });
});

describe('the ⌘K row', () => {
  // Read out of the source in the shape ⌘K matches on, the way the tutorial's
  // own test does it, so the row and this file cannot drift apart.
  const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
  const row = (id) => {
    const from = palette.indexOf(`id: '${id}'`);
    expect(from, `no ⌘K row called ${id}`).toBeGreaterThan(-1);
    const chunk = palette.slice(from, from + 900);
    return {
      label: /label: '([^']*)'/.exec(chunk)?.[1] ?? '',
      hint: /hint: '([^']*)'/.exec(chunk)?.[1] ?? '',
      keywords: /keywords: '([^']*)'/.exec(chunk)?.[1] ?? '',
      at: from,
    };
  };

  it('is found by the word she would type', () => {
    const demo = row('demo');
    expect(`${demo.label} ${demo.keywords}`.toLowerCase()).toContain('demo');
    for (const word of ['present', 'pitch', 'screen share', 'investor']) {
      expect(`${demo.label} ${demo.keywords}`.toLowerCase()).toContain(word);
    }
  });

  it('is the only row that word finds, so her return key lands on it', () => {
    // MEASURED 2026-09-02 BEFORE THIS WENT IN: typing "demo" returned two rows
    // and the tutorial was first, because `demo` was in its keywords. Two rows
    // under one word is a choice nobody should have to make correctly at speed,
    // and this one gets made in front of a room.
    const tutorial = row('tutorial');
    expect(`${tutorial.label} ${tutorial.keywords}`.toLowerCase()).not.toContain('demo');
  });

  it('says it is not her work and that hers keeps running', () => {
    const demo = row('demo');
    expect(demo.hint).toMatch(/invented/i);
    expect(demo.hint).toMatch(/yours keeps running/i);
    expect(demo.hint.length).toBeLessThan(45);
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
    expect(out.rows).toBeGreaterThanOrEqual(9);
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
