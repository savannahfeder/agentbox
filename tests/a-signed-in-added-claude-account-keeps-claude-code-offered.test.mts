// A SIGNED-IN ADDED CLAUDE ACCOUNT KEEPS CLAUDE CODE OFFERED (w-b2fe1a484a).
//
// A tester's computer had Claude Code signed in on an added account
// (~/.claude-2, Max 20x, shown In use in Settings) and nothing at the default
// ~/.claude, beside a signed-in Codex. The launch sign-in check only asks the
// default login, said signed out, and `_enginesFound` then counted Claude Code
// as not here: every task went to Codex, the desktop offered no Claude engine,
// and the phone's New thread had an untappable To and only Codex models.
// Measured on main 13f14092 with `engineChoices()` returning ['codex'].

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const tmp = (tag: string) => fs.mkdtempSync(path.join(os.tmpdir(), `added-claude-${tag}-`));
const signIn = (dir: string, email: string, uuid: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: uuid } }));
};
const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };
const both = { claudeFound: true, codexBin: '/nonexistent/codex', engineChoice: '2026-10-01', claudeSignedIn: false, codexSignedIn: true };
const supervisor = (home: string, authProfiles: string[]) => {
  const dir = tmp('sup');
  return new Supervisor({
    home, storeRoot: dir, accountRoot: dir, appDir: dir, claudeBin: '/nonexistent/claude',
    maxConcurrentSessions: 3, authProfiles, sessionArgs: [], ...both,
  } as never, emptyStore as never, dir);
};

describe('a signed-out default Claude login beside a signed-in Codex', () => {
  it('still offers Claude Code when an added Claude account is signed in', () => {
    const home = tmp('home');
    const added = path.join(home, '.claude-2');
    signIn(added, 'tester@example.com', 'aaaa1111');
    const sup = supervisor(home, ['default', added]);
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(sup._engineFor({ id: 'w-1' } as never)).toBe('claude');
  });

  it('still offers Claude Code when the added account is found on the disk, not configured', () => {
    const home = tmp('home');
    signIn(path.join(home, '.claude-2'), 'tester@example.com', 'aaaa1111');
    const sup = supervisor(home, ['default']);
    expect(sup.engineChoices().map((e) => e.id)).toContain('claude');
  });

  it('goes to Codex when the added folder holds no login', () => {
    const home = tmp('home');
    const added = path.join(home, 'elsewhere', 'claude-work');
    fs.mkdirSync(added, { recursive: true });
    const sup = supervisor(home, ['default', added]);
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['codex']);
  });

  it('goes to Codex when there is only the signed-out default login', () => {
    const sup = supervisor(tmp('home'), ['default']);
    expect(sup._engineFor({ id: 'w-1' } as never)).toBe('codex');
  });
});
