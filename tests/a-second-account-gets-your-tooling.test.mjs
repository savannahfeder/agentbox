// A SECOND ACCOUNT GETS YOUR SKILLS, COMMANDS AND AGENTS.
//
// The bug these tests close is one we shipped rather than one anybody caused.
// The Accounts page tells a person to add a subscription by logging in with a
// brand new folder, Claude Code reads a session's skills, commands and
// subagents out of whichever folder CLAUDE_CONFIG_DIR names, and the supervisor
// then round-robins every spawn across the accounts. On the one machine where
// it had happened that was 65 skills on the first login against 12 on the
// second, and 445 of 874 sessions run on the empty one.
//
// The other half of the contract, and the half worth protecting: this never
// takes anything away. A person who already put their own commands folder in
// that account keeps it exactly as it was.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkAccountTooling, toolingLine, SHARED_DIRS } from '../main/account-tooling.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

let root;
let home;
let account;
let realHome;

// The first login: a home folder with the three folders in it and a named file
// inside each, so a test can prove a session reading through the link reaches
// the real thing rather than an empty directory that happens to exist.
const layFirstLogin = () => {
  for (const name of SHARED_DIRS) {
    fs.mkdirSync(path.join(home, '.claude', name), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', name, `hers-${name}.md`), `# ${name}\n`);
  }
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-accounts-'));
  home = path.join(root, 'home');
  account = path.join(root, 'home', '.claude-second');
  fs.mkdirSync(account, { recursive: true });
  layFirstLogin();
  // THE FAKE FIRST LOGIN ABOVE HAS TO BE THE ONE THE SUPERVISOR READS. The
  // supervisor calls `linkAccountTooling(profile)` with no home, so it falls
  // through to `os.homedir`, and until this line that meant the real
  // `~/.claude` of whoever was running the suite. On her Mac that folder is
  // there and full, so the test passed for a reason that had nothing to do with
  // the fixture. On a GitHub macOS runner on 2026-08-25 there is no `~/.claude`
  // at all, no links were made, and the test failed on the first machine other
  // than hers it had ever run on. Node reads `HOME` before it asks the system,
  // so pointing it at the fixture makes the test test the fixture.
  realHome = process.env.HOME;
  process.env.HOME = home;
});
afterEach(() => {
  if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

describe('the empty second account', () => {
  it('gets all three, and they reach the real files', () => {
    const out = linkAccountTooling(account, { home });
    expect(out.linked).toEqual(['skills', 'commands', 'agents']);
    for (const name of SHARED_DIRS) {
      expect(fs.lstatSync(path.join(account, name)).isSymbolicLink()).toBe(true);
      expect(fs.readdirSync(path.join(account, name))).toEqual([`hers-${name}.md`]);
    }
  });

  it('is quiet the second time, because the links are already there', () => {
    linkAccountTooling(account, { home });
    const again = linkAccountTooling(account, { home });
    expect(again.linked).toEqual([]);
    expect(again.already).toEqual(['skills', 'commands', 'agents']);
    expect(toolingLine(again)).toBe(null);
  });

  it('heals itself if a link is deleted later', () => {
    linkAccountTooling(account, { home });
    fs.unlinkSync(path.join(account, 'commands'));
    const out = linkAccountTooling(account, { home });
    expect(out.linked).toEqual(['commands']);
    expect(out.already).toEqual(['skills', 'agents']);
  });

  it('says one plain line when it acts, and nothing when it does not', () => {
    const out = linkAccountTooling(account, { home });
    expect(toolingLine(out)).toBe('Gave the .claude-second account your skills, commands and agents.');
    expect(toolingLine({ dir: account, linked: [] })).toBe(null);
  });
});

describe('it never takes anything away', () => {
  it('leaves a folder the person made themselves exactly where it was', () => {
    fs.mkdirSync(path.join(account, 'commands'));
    fs.writeFileSync(path.join(account, 'commands', 'mine.md'), 'mine');
    const out = linkAccountTooling(account, { home });
    expect(out.theirs).toEqual(['commands']);
    expect(out.linked).toEqual(['skills', 'agents']);
    expect(fs.lstatSync(path.join(account, 'commands')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(account, 'commands', 'mine.md'), 'utf8')).toBe('mine');
  });

  it('leaves a link of their own pointing wherever they pointed it', () => {
    const elsewhere = path.join(root, 'somewhere-else');
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, path.join(account, 'skills'), 'dir');
    const out = linkAccountTooling(account, { home });
    expect(out.theirs).toEqual(['skills']);
    expect(fs.realpathSync(path.join(account, 'skills'))).toBe(fs.realpathSync(elsewhere));
  });

  it('creates nothing for a folder the first login does not have either', () => {
    fs.rmSync(path.join(home, '.claude', 'agents'), { recursive: true });
    const out = linkAccountTooling(account, { home });
    expect(out.missing).toEqual(['agents']);
    expect(out.linked).toEqual(['skills', 'commands']);
    expect(fs.existsSync(path.join(account, 'agents'))).toBe(false);
  });
});

describe('the accounts it must not touch at all', () => {
  it('does nothing for the first login, which is where the links point', () => {
    expect(linkAccountTooling('default', { home }).skipped).toBe('default');
    expect(linkAccountTooling(null, { home }).skipped).toBe('default');
  });

  it('never links the first login into itself, whatever path names it', () => {
    // A real way to arrive here: authProfiles carrying ~/.claude, or a home
    // folder that is itself a link. Left unguarded this makes skills/skills.
    const byAnotherName = path.join(root, 'same-thing');
    fs.symlinkSync(path.join(home, '.claude'), byAnotherName, 'dir');
    expect(linkAccountTooling(byAnotherName, { home }).skipped).toBe('same');
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'skills'))).toBe(false);
  });

  it('does not invent a home for an account folder that is not there', () => {
    const ghost = path.join(root, 'never-logged-in');
    expect(linkAccountTooling(ghost, { home }).skipped).toBe('no-dir');
    expect(fs.existsSync(ghost)).toBe(false);
  });
});

describe('the supervisor does it before the worker starts', () => {
  // The whole point is that this happens on the spawn path, not in a screen
  // somebody has to visit. A worker whose CLAUDE_CONFIG_DIR names the account
  // must find the tooling already there when it reads it.
  const build = () => new Supervisor(
    {
      storeRoot: root,
      maxConcurrentSessions: 3,
      authProfiles: ['default', account],
      claudeBin: '/usr/bin/true',
      sessionArgs: [],
    },
    {
      listItems: () => [],
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
      isDue: () => true,
    },
    root,
  );

  // The trace stream opens on the next tick, so the temp root has to outlive it.
  const settle = () => new Promise((r) => setTimeout(r, 20));

  // A FAILING ASSERTION MUST NOT OUTLIVE THE WORKER IT SPAWNED. Without the
  // finally, the first failure here skipped `killAll`, `afterEach` deleted the
  // temp root underneath a live trace stream, and vitest reported an ENOENT on
  // a log file as an unhandled error on top of the real failure. Two of the
  // four reds on the runner were one bug wearing two faces.
  it('makes the links on the spawn that picks that account', async () => {
    const sup = build();
    try {
      const item = { id: 'w-000000test', product: 'agentbox', status: 'open', title: 'anything at all' };
      sup.spawnWorker(item, { profile: account });
      for (const name of SHARED_DIRS) {
        expect(fs.lstatSync(path.join(account, name)).isSymbolicLink()).toBe(true);
      }
      const session = sup.sessions.get(item.id);
      expect(session.profile).toBe(account);
      expect(session.tail.join(' ')).toContain('Gave the .claude-second account your');
    } finally {
      sup.killAll();
      await settle();
    }
  });

  it('leaves the first login alone when that is the account picked', async () => {
    const sup = build();
    try {
      const before = fs.readdirSync(path.join(home, '.claude')).sort();
      sup.spawnWorker({ id: 'w-000001test', product: 'agentbox', status: 'open', title: 'anything at all' }, { profile: 'default' });
      expect(fs.readdirSync(path.join(home, '.claude')).sort()).toEqual(before);
    } finally {
      sup.killAll();
      await settle();
    }
  });
});
