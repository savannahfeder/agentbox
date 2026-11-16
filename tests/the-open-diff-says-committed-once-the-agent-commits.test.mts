// THE DIFF SAID "NOT COMMITTED" OVER WORK THE AGENT HAD JUST COMMITTED.
//
// Linux QA box, Nov 15 2026 (w-3bd5d73ad2). A Claude thread edited a file,
// stopped to ask for a git author, and was told to commit. It committed on its
// branch and the folder was clean, yet the open diff read "1 file +1 -1 not
// committed" for a while after. The label came from the change saved when the
// first round ended, and nothing rewrites that file until the next round
// exits, so for the whole second round the pane drew the first round's folder.
// Measured here by saving the change, committing, and reading it back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotRepo, changeFromRepo, whereTheWorkStands } from '../main/git-change.mts';
import { writeChangeForRun, readChange, withStandsNow } from '../main/code-change.mts';
import { standingLabel } from '../renderer/src/code-artifact.ts';
import { Name } from '../shared/product-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cwd: string, cmd: string, args: string[]) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

describe('the open diff reads the folder as it is now', () => {
  let dir: string;
  let docs: string;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-now-')));
    docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-now-docs-'));
    run(dir, 'git', ['init', '-q', '-b', 'main', '.']);
    run(dir, 'git', ['config', 'user.email', 'agent@agentbox.local']);
    run(dir, 'git', ['config', 'user.name', Name]);
    fs.writeFileSync(path.join(dir, 'greet.js'), 'export const greet = () => "hi";\n');
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'base']);
    run(dir, 'git', ['checkout', '-q', '-b', 'agentbox/w-a07c573f81']);
  });
  afterEach(() => {
    for (const d of [dir, docs]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }
  });

  const firstRoundEnds = () => {
    const before = snapshotRepo(dir);
    fs.writeFileSync(path.join(dir, 'greet.js'), 'export const greet = () => "hello";\n');
    return writeChangeForRun({
      transcript: path.join(dir, 'no-such-session.jsonl'),
      docsDir: docs,
      itemId: 'w-a07c573f81',
      roots: [dir],
      repos: [changeFromRepo(before)],
    })!;
  };

  it('drops "not committed" once the agent commits, before its round ends', () => {
    const file = firstRoundEnds();
    expect(standingLabel(readChange(file))).toBe('not committed');
    run(dir, 'git', ['commit', '-qam', 'greet says hello']);
    // The saved file still carries the first round's answer: that is the bug.
    expect(standingLabel(readChange(file))).toBe('not committed');
    expect(standingLabel(withStandsNow(readChange(file), whereTheWorkStands(dir)))).toBe('');
  });

  it('still says "not committed" while the work is loose', () => {
    const file = firstRoundEnds();
    expect(standingLabel(withStandsNow(readChange(file), whereTheWorkStands(dir)))).toBe('not committed');
  });

  it('says it again when a later edit is left loose after the commit', () => {
    const file = firstRoundEnds();
    run(dir, 'git', ['commit', '-qam', 'greet says hello']);
    fs.appendFileSync(path.join(dir, 'greet.js'), '// more\n');
    // Committed and loose at once is not "never committed".
    expect(withStandsNow(readChange(file), whereTheWorkStands(dir))).toMatchObject({ committed: true, uncommitted: true });
  });

  it('keeps what was saved when the folder cannot be read', () => {
    const file = firstRoundEnds();
    expect(withStandsNow(readChange(file), null)).toMatchObject({ committed: false, uncommitted: true });
    expect(withStandsNow(readChange(file), whereTheWorkStands(path.join(dir, 'gone'))))
      .toMatchObject({ committed: false, uncommitted: true });
    expect(withStandsNow(readChange(file), { committed: null, uncommitted: false }))
      .toMatchObject({ committed: false, uncommitted: false });
  });

  it('is what the app hands the pane', () => {
    const ipc = fs.readFileSync(path.join(ROOT, 'main/ipc.mts'), 'utf8');
    const handler = ipc.slice(ipc.indexOf("'zero:code-change'"), ipc.indexOf("'zero:code-change'") + 1500);
    expect(handler).toMatch(/withStandsNow\(/);
    expect(handler).toMatch(/gitJob\('whereTheWorkStands'/);
  });
});
