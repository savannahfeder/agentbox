// A CLAUDE LOGIN IN AN ADDED ACCOUNT IS STILL OFFERED (w-d75c73d091).
//
// A tester signed Claude Code in through an added account (a second
// CLAUDE_CONFIG_DIR, as Settings › Claude Code › Add account makes) and left
// the default ~/.claude signed out. Settings showed that account In use, but
// the Home composer offered only Codex: no Claude row in the Agent menu and no
// Claude Code column under All models. The launch sign-in check asks only the
// default ~/.claude, and its "signed out", beside a signed-in Codex, made the
// app count Claude Code as not installed. Measured with Supervisor#engineChoices
// on that setup, which returned ['codex'].

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const tmp = (tag: string) => fs.mkdtempSync(path.join(os.tmpdir(), `added-claude-${tag}-`));
const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };
const supervisor = (overrides: Record<string, unknown>) => {
  const dir = tmp('sup');
  return new Supervisor({
    home: tmp('home'), storeRoot: dir, accountRoot: dir, appDir: dir,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3,
    sessionArgs: [], claudeFound: true, codexBin: '/nonexistent/codex', engineChoice: '2026-10-01',
    claudeSignedIn: false, codexSignedIn: true, ...overrides,
  } as never, emptyStore as never, dir);
};

describe('Claude Code signed in only on an added account, default signed out, Codex signed in', () => {
  it('offers Claude Code beside Codex and runs on Claude Code', () => {
    const added = tmp('claude-3');
    const sup = supervisor({ authProfiles: [added] });
    expect(sup._profilesFor('claude')).toEqual([added]);
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(sup._engineFor({ id: 'w-1' } as never)).toBe('claude');
  });

  it('still counts Claude Code as out when work runs on the signed-out default', () => {
    const sup = supervisor({ authProfiles: ['default'] });
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['codex']);
  });
});
