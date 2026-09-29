// A RUN THAT USED sed STILL SHOWS ITS CODE —.
//
// The card was drawn out of the agent's conversation, which only carries the
// before and after when the agent used the editing tool. Measured on her Mac
// the same day: 105 runs changed a file over two days and 4 of them would have
// shown the whole change. This covers the half that reads the disk instead.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotRepo, changeFromRepo, filesFromPatch } from '../main/git-change.mjs';
import { mergeChange, changeFromTranscript, writeChangeForRun } from '../main/code-change.mjs';
import { Name } from '../shared/product-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

/** One assistant turn of a real transcript, in the shape the CLI writes. */
const turn = (ts, blocks) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: blocks } });
const edit = (file, oldText, newText) => ({
  type: 'tool_use', name: 'Edit', input: { file_path: file, old_string: oldText, new_string: newText },
});

describe('the card carries code the agent did not type into a tool', () => {
  let dir;
  const lines = (n, word = 'line') => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`).join('\n') + '\n';

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-repo-')));
    run(dir, 'git', ['init', '-q', '.']);
    run(dir, 'git', ['config', 'user.email', 'agent@agentbox.local']);
    run(dir, 'git', ['config', 'user.name', Name]);
    fs.mkdirSync(path.join(dir, 'main'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'main', 'ipc.mjs'), lines(12));
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'base']);
  });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('reads a line a shell command changed, which the conversation never saw', () => {
    const before = snapshotRepo(dir);
    // The way a worker actually writes a file today, and the reason the card
    // was empty: nothing about this reaches the agent's own transcript.
    run(dir, 'sed', ['-i', '', 's/line 4/line four/', 'main/ipc.mjs']);
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['main/ipc.mjs']);
    expect(change.plus).toBe(1);
    expect(change.minus).toBe(1);
    const rows = change.files[0].hunks[0].rows;
    expect(rows).toContainEqual(['-', 'line 4']);
    expect(rows).toContainEqual(['+', 'line four']);
    // Three lines of context each side, so a save can find its place again.
    expect(rows.filter((r) => r[0] === '=')).toHaveLength(6);
  });

  it('does not credit this run with work that was already in the checkout', () => {
    fs.appendFileSync(path.join(dir, 'main', 'ipc.mjs'), 'somebody else was here\n');
    fs.writeFileSync(path.join(dir, 'main', 'theirs.mjs'), 'not mine\n');
    const before = snapshotRepo(dir);
    run(dir, 'sed', ['-i', '', 's/line 2/line two/', 'main/ipc.mjs']);
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['main/ipc.mjs']);
    // The other agent's line is context here, not a green line of ours.
    const rows = change.files[0].hunks.flatMap((h) => h.rows);
    expect(rows.filter((r) => r[0] === '+')).toEqual([['+', 'line two']]);
    expect(change.files.find((f) => f.path === 'main/theirs.mjs')).toBeUndefined();
  });

  it('shows a file the run made and a file it deleted, commits and all', () => {
    const before = snapshotRepo(dir);
    fs.writeFileSync(path.join(dir, 'main', 'new.mjs'), 'export const one = 1;\nexport const two = 2;\n');
    run(dir, 'git', ['rm', '-q', 'main/ipc.mjs']);
    // A worker commits as it goes; the photograph is of a commit, so this is
    // still inside the window.
    run(dir, 'git', ['add', '-A']);
    run(dir, 'git', ['commit', '-qm', 'mid-run']);
    const change = changeFromRepo(before);
    const byPath = Object.fromEntries(change.files.map((f) => [f.path, f]));
    expect(byPath['main/new.mjs'].plus).toBe(2);
    expect(byPath['main/new.mjs'].minus).toBe(0);
    expect(byPath['main/ipc.mjs'].plus).toBe(0);
    expect(byPath['main/ipc.mjs'].minus).toBe(12);
  });

  it('leaves a picture and a huge file alone, because nobody reads a diff of one', () => {
    const before = snapshotRepo(dir);
    fs.writeFileSync(path.join(dir, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    fs.writeFileSync(path.join(dir, 'huge.txt'), 'x'.repeat(600 * 1024));
    fs.writeFileSync(path.join(dir, 'main', 'small.mjs'), 'const a = 1;\n');
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['main/small.mjs']);
  });

  it('says nothing at all about a folder that is not a repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-plain-'));
    try {
      expect(snapshotRepo(plain)).toBeNull();
      expect(snapshotRepo('')).toBeNull();
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });

  it('takes the disk over the conversation, and keeps the sentence the agent wrote', () => {
    const transcript = changeFromTranscript(
      turn('2026-08-24T20:00:00Z', [
        { type: 'text', text: 'Now the header.' },
        edit(path.join(dir, 'main/ipc.mjs'), 'line 1\n', 'line one\n'),
      ]) + '\n' + turn('2026-08-24T20:01:00Z', [
        { type: 'text', text: 'And her report.' },
        edit('/docs/reports/what-i-found.html', '', '<h1>hi</h1>\n'),
      ]),
      { roots: [dir, '/docs'] },
    );
    const repo = {
      root: dir,
      at: 1,
      files: [{ path: 'main/ipc.mjs', hunks: [{ rows: [['-', 'line 1'], ['+', 'line one']], plus: 1, minus: 1 }], plus: 1, minus: 1 }],
    };
    const merged = mergeChange(transcript, [repo], { roots: [dir, '/docs'] });
    const byPath = Object.fromEntries(merged.files.map((f) => [f.path, f]));
    // The file both of them have comes off the disk...
    expect(byPath['main/ipc.mjs'].fromDisk).toBe(true);
    // ...carrying the agent's own words, which only the conversation has.
    expect(byPath['main/ipc.mjs'].hunks[0].said).toBe('Now the header.');
    // And the report she reads is not in any checkout, so it survives.
    expect(byPath['reports/what-i-found.html']).toBeTruthy();
    expect(merged.fromDisk).toBe(1);
  });

  it('writes a card for a run whose conversation held no edits at all', () => {
    const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-docs-'));
    try {
      const transcript = path.join(docs, 'session.jsonl');
      fs.writeFileSync(transcript, turn('2026-08-24T20:00:00Z', [{ type: 'text', text: 'Running a script.' }]));
      const before = snapshotRepo(dir);
      run(dir, 'sed', ['-i', '', 's/line 6/line six/', 'main/ipc.mjs']);
      const repos = [changeFromRepo(before)];
      // Without the disk this is the empty card a tester was clicking.
      expect(writeChangeForRun({ transcript, docsDir: docs, itemId: 'w-none', roots: [dir] })).toBeNull();
      const out = writeChangeForRun({ transcript, docsDir: docs, itemId: 'w-sed', roots: [dir], repos });
      const written = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(written.files.map((f) => f.path)).toEqual(['main/ipc.mjs']);
      expect(written.plus).toBe(1);
      expect(written.startedAt).toBeTruthy();
    } finally { fs.rmSync(docs, { recursive: true, force: true }); }
  });

  it('reads a rename as the file where it now sits', () => {
    const patch = [
      'diff --git a/main/old.mjs b/main/new.mjs',
      'similarity index 90%',
      'rename from main/old.mjs',
      'rename to main/new.mjs',
      '--- a/main/old.mjs',
      '+++ b/main/new.mjs',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-was',
      '+is',
      '',
    ].join('\n');
    expect(filesFromPatch(patch).map((f) => f.path)).toEqual(['main/new.mjs']);
  });

  it('photographs the checkout when the worker spawns, not when it exits', () => {
    // At the exit there is nothing left to compare against, so the order here
    // is the whole mechanism rather than a detail of it.
    const src = fs.readFileSync(path.join(ROOT, 'main', 'supervisor.mjs'), 'utf8');
    expect(src.indexOf('snapshotRepo(cwd)')).toBeGreaterThan(-1);
    expect(src.indexOf('snapshotRepo(cwd)')).toBeLessThan(src.indexOf("child.on('exit'"));
    const exitHandler = src.slice(src.indexOf("child.on('exit'"));
    expect(exitHandler).toContain('changeFromRepo(session.repoBefore)');
    expect(exitHandler).toMatch(/repos,/);
  });
});
