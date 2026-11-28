// After "Discard the change", the thread's diff chip and The change panel
// still showed the discarded code.
//
// Found on the Linux QA box (0.1.32, session 48): a Codex thread committed
// "Implement wrapText word wrapping" (+35 −1), was sent Discard, and committed a
// revert, so its branch had no net difference from main. The thread still read
// +35 −1 and the panel drew the whole implementation as added lines, after a
// relaunch too. The run that discards writes no change of its own, and the
// saved one from the round before was kept with its lines. Measured by ending
// a run on a reverted branch here: the saved change still held one file.
//
// The rule: when a run ends with the thread's own branch the same as main and
// nothing loose, the saved change goes, so there is no chip and no panel.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotRepo, changeFromRepo } from '../main/git-change.mts';
import { writeChangeForRun, changePath, type TranscriptChange } from '../main/code-change.mts';
import { machineryPath } from '../main/store/home.mts';
import { Name } from '../shared/product-name.mjs';

const ITEM = 'w-5b58a4d743';
const run = (cwd: string, cmd: string, args: string[]) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

describe('a discarded change leaves no diff on the thread', () => {
  let dir: string;
  let docs: string;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-discard-')));
    docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-discard-docs-'));
    run(dir, 'git', ['init', '-q', '-b', 'main', '.']);
    run(dir, 'git', ['config', 'user.email', 'agent@agentbox.local']);
    run(dir, 'git', ['config', 'user.name', Name]);
    fs.writeFileSync(path.join(dir, 'wrap.js'), 'export function wrapText() {}\n');
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'init']);
  });
  afterEach(() => {
    for (const d of [dir, docs]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  });

  const file = () => machineryPath(docs, changePath(ITEM));
  const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
  const endRun = (before: ReturnType<typeof snapshotRepo>, change: TranscriptChange | null = null) => writeChangeForRun({
    transcript: path.join(dir, 'no-such-session.jsonl'),
    docsDir: docs,
    itemId: ITEM,
    roots: [dir],
    repos: [changeFromRepo(before)],
    change,
  });
  const implement = () => {
    const first = snapshotRepo(dir);
    fs.writeFileSync(path.join(dir, 'wrap.js'), 'export function wrapText(s, n) {\n  return s;\n}\n');
    run(dir, 'git', ['commit', '-qam', 'Implement wrapText word wrapping']);
    expect(endRun(first)).toBeTruthy();
    expect(saved().files.map((f: { path: string }) => f.path)).toContain('wrap.js');
  };

  describe('on the thread\'s own branch', () => {
    beforeEach(() => run(dir, 'git', ['checkout', '-q', '-b', `agentbox/${ITEM}`]));

    // The reported case: the discard is a revert commit.
    it('is gone once a revert leaves the branch the same as main', () => {
      implement();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['revert', '--no-edit', 'HEAD']);
      expect(endRun(second)).toBe(null);
      expect(fs.existsSync(file())).toBe(false);
    });

    it('is gone once the branch is reset back onto main', () => {
      implement();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['reset', '-q', '--hard', 'main']);
      endRun(second);
      expect(fs.existsSync(file())).toBe(false);
    });

    it('is gone once loose work is thrown away', () => {
      const first = snapshotRepo(dir);
      fs.appendFileSync(path.join(dir, 'wrap.js'), '// more\n');
      expect(endRun(first)).toBeTruthy();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['checkout', '-q', '--', '.']);
      endRun(second);
      expect(fs.existsSync(file())).toBe(false);
    });

    // A discard typed through the editing tool is in the conversation too, and
    // it must not bring the chip back as a removal.
    it('is gone even when the conversation carries the edits that undid it', () => {
      implement();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['revert', '--no-edit', 'HEAD']);
      const typed: TranscriptChange = {
        files: [{ path: 'wrap.js', abs: path.join(dir, 'wrap.js'), hunks: [{ rows: [['-', 'return s;']], plus: 0, minus: 1 }], plus: 0, minus: 1 }],
        roots: [dir], plus: 0, minus: 1, editCount: 1, withProse: 0,
      };
      expect(endRun(second, typed)).toBe(null);
      expect(fs.existsSync(file())).toBe(false);
    });

    // The boundary: something is still on the branch, so there is still a change.
    it('stays, with what is left, when only part of it was undone', () => {
      fs.writeFileSync(path.join(dir, 'other.js'), 'export const x = 1;\n');
      run(dir, 'git', ['add', '-A']);
      run(dir, 'git', ['commit', '-qm', 'other']);
      implement();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['revert', '--no-edit', 'HEAD']);
      expect(endRun(second)).toBeTruthy();
      expect(saved().files.map((f: { path: string }) => f.path)).toEqual(['other.js']);
    });

    it('stays when something new and untracked is left in the tree', () => {
      implement();
      const second = snapshotRepo(dir);
      run(dir, 'git', ['revert', '--no-edit', 'HEAD']);
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'kept\n');
      expect(endRun(second)).toBeTruthy();
      expect(saved().files.map((f: { path: string }) => f.path)).toEqual(['notes.txt']);
    });
  });

  // Must not match: a checkout that is not a thread's own branch has no main to
  // be "the same as", so a later run that changes nothing leaves the change be.
  it('stays on a branch that is not a thread\'s own', () => {
    run(dir, 'git', ['checkout', '-q', '-b', 'feature']);
    implement();
    const second = snapshotRepo(dir);
    endRun(second);
    expect(saved().files).toHaveLength(1);
  });
});
