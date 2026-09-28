// Her rules for ONE project reach every session on it, and no session on any
// other.
//
// The standing instructions were the whole story until now: one file, every
// session, no scoping. This is the second altitude, and the two facts that make
// it safe are that a project without a file changes nothing at all, and that
// reading order settles precedence out loud rather than leaving a model to
// guess which block wins.
//
// Pinned in spawnPlan, the ONE place a session's arguments are built, for the
// same reason the standing tests are: that is what makes "every session" a fact
// rather than a hope.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let appDir;
let storeRoot;

const productDir = (slug) => path.join(storeRoot, slug);

const supervisor = (over = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = appDir;
  // Running from source the two are the same folder; they only diverge inside a
  // packaged app, where the bundle is read-only and what she writes cannot be.
  s.dataDir = appDir;
  // And her own folder, which the app now keeps outside the checkout whichever
  // way it was started (w-3dc46f3a67).
  s.userDir = appDir;
  s.config = {
    sessionArgs: ['--model', 'claude-opus-5', '--allowedTools', 'mcp__agentbox', 'Bash(git push:*)', '--permission-mode', 'bypassPermissions'],
    personalSessionArgs: ['--permission-mode', 'acceptEdits'],
    personalProducts: ['personal'],
  };
  s._personalSessions = {};
  s.buildBrief = () => 'THE BRIEF';
  s.store = {
    listProducts: () => [
      { slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null },
      { slug: 'personal', name: 'Personal', dir: productDir('personal'), repoPath: null },
    ],
  };
  return Object.assign(s, over);
};

const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });
const acme = () => ({ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null });

const writeStanding = (text) => {
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'briefs', 'founder.md'), text, 'utf8');
};

const injected = (args) => {
  const at = args.indexOf('--append-system-prompt');
  return at === -1 ? undefined : args[at + 1];
};

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-proj-instr-app-'));
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-proj-instr-store-'));
  fs.mkdirSync(productDir('acme'), { recursive: true });
  fs.mkdirSync(productDir('personal'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

describe('a project without instructions', () => {
  // The migration story is that there is no migration. Every project on the
  // day this shipped had no file, and every one of them had to behave exactly
  // as it did the day before.
  it('is briefed exactly as it was before this existed', () => {
    const { args } = supervisor().spawnPlan(item(), acme(), {});
    expect(args).not.toContain('--append-system-prompt');
  });

  it('still gets her standing instructions, alone', () => {
    writeStanding('Never guess at a number.');
    const { args } = supervisor().spawnPlan(item(), acme(), {});
    expect(injected(args)).toBe('Never guess at a number.');
  });

  // An emptied box is the same state as a file that was never written, so the
  // save deletes it rather than leaving a blank one behind.
  it('treats an emptied box as no instructions at all', () => {
    const s = supervisor();
    s.writeProjectInstructions('acme', 'a rule');
    s.writeProjectInstructions('acme', '   \n\n ');
    expect(fs.existsSync(path.join(productDir('acme'), 'instructions.md'))).toBe(false);
    expect(s.spawnPlan(item(), acme(), {}).args).not.toContain('--append-system-prompt');
  });
});

describe('a project with instructions', () => {
  it('reaches sessions on that project', () => {
    supervisor().writeProjectInstructions('acme', 'Never restart the app to test a change.');
    const text = injected(supervisor().spawnPlan(item(), acme(), {}).args);
    expect(text).toContain('Never restart the app to test a change.');
    expect(text).toContain('Acme');
  });

  // The whole reason this is scoped and the standing file is not.
  it('reaches no session on any other project', () => {
    supervisor().writeProjectInstructions('acme', 'Never restart the app to test a change.');
    const other = { slug: 'personal', name: 'Personal', dir: productDir('personal'), repoPath: null };
    const { args } = supervisor().spawnPlan(item({ product: 'personal' }), other, {});
    expect(args).not.toContain('--append-system-prompt');
  });

  // Two blocks in one flag, hers first. A model handed both with no ordering
  // has no way to know which wins, and the answer is not negotiable: the
  // workspace rules outrank the project's.
  it('rides after her standing instructions, and says which wins', () => {
    writeStanding('Never guess at a number.');
    supervisor().writeProjectInstructions('acme', 'Screens are designs first.');
    const text = injected(supervisor().spawnPlan(item(), acme(), {}).args);
    expect(text.indexOf('Never guess at a number.')).toBeLessThan(text.indexOf('Screens are designs first.'));
    expect(text).toMatch(/instructions above, those win/);
  });

  // She edits these from the app while the fleet is running. A cached copy is
  // a rule she believes she set, ignored until the next restart.
  it('picks up an edit with no restart', () => {
    const s = supervisor();
    s.writeProjectInstructions('acme', 'first rule');
    expect(injected(s.spawnPlan(item(), acme(), {}).args)).toContain('first rule');
    s.writeProjectInstructions('acme', 'second rule');
    expect(injected(s.spawnPlan(item(), acme(), {}).args)).toContain('second rule');
  });

  it('never leaves a half-written file for a spawn to read', () => {
    supervisor().writeProjectInstructions('acme', 'a rule');
    expect(fs.readdirSync(productDir('acme')).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('round-trips her text exactly, whitespace and all', () => {
    const s = supervisor();
    s.writeProjectInstructions('acme', 'one rule\n\n  and another\n');
    expect(s.readProjectInstructions('acme')).toBe('one rule\n\n  and another\n');
  });

  it('reads as empty before she has ever written one', () => {
    expect(supervisor().readProjectInstructions('acme')).toBe('');
  });

  // It lives beside STATE.md, in the project's own documents, not in this repo.
  it('lives in the project docs dir', () => {
    supervisor().writeProjectInstructions('acme', 'a rule');
    expect(fs.existsSync(path.join(productDir('acme'), 'instructions.md'))).toBe(true);
  });
});

describe('what a project may let its sessions do', () => {
  it('uses the workspace grants when it has no override', () => {
    const { args } = supervisor().spawnPlan(item(), acme(), {});
    expect(args).toContain('bypassPermissions');
    expect(args).toContain('Bash(git push:*)');
  });

  it('uses its own grants when it has them', () => {
    const s = supervisor();
    s.config.projectSessionArgs = { acme: ['--model', 'claude-opus-5', '--allowedTools', 'mcp__agentbox'] };
    const { args } = s.spawnPlan(item(), acme(), {});
    expect(args).not.toContain('bypassPermissions');
    expect(args).not.toContain('Bash(git push:*)');
  });

  it('leaves other projects on the workspace grants', () => {
    const s = supervisor();
    s.config.projectSessionArgs = { somewhere_else: ['--allowedTools', 'mcp__agentbox'] };
    expect(s.spawnPlan(item(), acme(), {}).args).toContain('bypassPermissions');
  });

  // A personal session kept its own grants and a project override had to leave
  // them alone. Personal projects are deleted (w-d19d6d387c, 2026-09-22).

  // Anything malformed falls back to the workspace default. A half-written
  // override must never become a wider grant by accident.
  it('ignores a malformed override', () => {
    const s = supervisor();
    s.config.projectSessionArgs = { acme: 'not an array' };
    expect(s.spawnPlan(item(), acme(), {}).args).toContain('bypassPermissions');
  });
});

/* Whether the drive watched a project had four cases here. The drive is
   deleted (w-d19d6d387c, 2026-09-22): nothing in this app proposes work the
   founder did not ask for, so there is no switch left to read. */
