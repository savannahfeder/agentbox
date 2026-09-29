// THE HALF THAT MAKES ANY OF IT REACH HER —.
//
// Round four drew the artifact beautifully and nothing wrote one, so there was
// still nothing to open. This covers the writer and the one line in the
// supervisor that calls it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeFromTranscript, writeChangeForRun, changePath } from '../main/code-change.mjs';
import { machineryPath } from '../main/store/home.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One assistant turn of a real transcript, in the shape the CLI writes. */
const turn = (ts, blocks) => JSON.stringify({
  type: 'assistant', timestamp: ts, message: { content: blocks },
});
const edit = (file, oldText, newText) => ({
  type: 'tool_use', name: 'Edit', input: { file_path: file, old_string: oldText, new_string: newText },
});

describe('a run saves what it changed', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('reads an edit out of the conversation, not out of a repository', () => {
    const text = [
      turn('2026-08-23T20:00:00Z', [
        { type: 'text', text: 'Now the header.' },
        edit('/repo/main/ipc.mjs', 'const a = 1;\nconst b = 2;\n', 'const a = 1;\nconst b = 3;\n'),
      ]),
    ].join('\n');
    const change = changeFromTranscript(text, { roots: ['/repo'] });
    expect(change.files).toHaveLength(1);
    expect(change.files[0].path).toBe('main/ipc.mjs');
    // One line moved, so one green and one red, and the line that did not move
    // is still there as context. That is the whole point of the row shape.
    expect(change.plus).toBe(1);
    expect(change.minus).toBe(1);
    expect(change.files[0].hunks[0].rows.filter((r) => r[0] === '=')).toHaveLength(1);
  });

  it('drops scratch a run wrote outside every root', () => {
    const text = [
      turn('2026-08-23T20:00:00Z', [edit('/repo/main/ipc.mjs', 'a\n', 'b\n')]),
      turn('2026-08-23T20:01:00Z', [edit('/tmp/shot-once.mjs', '', 'console.log(1)\n')]),
      turn('2026-08-23T20:02:00Z', [edit('/private/tmp/scratch.mjs', '', 'x\n')]),
    ].join('\n');
    const change = changeFromTranscript(text, { roots: ['/repo'] });
    expect(change.files.map((f) => f.path)).toEqual(['main/ipc.mjs']);
  });

  // IN THE APP'S HOME, NOT IN HER FOLDER. This used to assert `path.join(dir,
  // ...)`, and that assertion was the bug written down: `runs/` moves out of
  // her folder, and this writer put it straight back, once per run that
  // changed any code.
  it('writes the change where the pane looks for it', () => {
    const text = turn('2026-08-23T20:00:00Z', [edit('/repo/main/ipc.mjs', 'a\n', 'b\n')]);
    const transcript = path.join(dir, 'session.jsonl');
    fs.writeFileSync(transcript, text);
    const out = writeChangeForRun({ transcript, docsDir: dir, itemId: 'w-test01', roots: ['/repo'] });
    expect(out).toBe(machineryPath(dir, changePath('w-test01')));
    expect(out.startsWith(dir)).toBe(false);
    expect(changePath('w-test01')).toBe('runs/w-test01/the-change-it-made.change');
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).item).toBe('w-test01');
    // And her folder is still hers: no `runs/` was created in it.
    expect(fs.existsSync(path.join(dir, 'runs'))).toBe(false);
  });

  it('leaves no artifact behind for a run that touched no code', () => {
    const transcript = path.join(dir, 'session.jsonl');
    fs.writeFileSync(transcript, turn('2026-08-23T20:00:00Z', [{ type: 'text', text: 'I answered her question.' }]));
    expect(writeChangeForRun({ transcript, docsDir: dir, itemId: 'w-test02', roots: ['/repo'] })).toBeNull();
    expect(fs.existsSync(path.join(dir, 'runs', 'w-test02'))).toBe(false);
  });

  it('is called when a worker exits, and names the file in the run trace', () => {
    // The trace line is not decoration: the chip on her card is found by
    // reading the run's own trace for paths (renderer/src/run-files.ts), so a
    // change written without one is a file nothing on screen can reach.
    const src = fs.readFileSync(path.join(ROOT, 'main', 'supervisor.mjs'), 'utf8');
    const exitHandler = src.slice(src.indexOf("child.on('exit'"));
    expect(exitHandler).toContain('writeChangeForRun(');
    expect(exitHandler.indexOf('writeChangeForRun(')).toBeLessThan(exitHandler.indexOf('trace?.end()'));
    expect(exitHandler).toMatch(/\[Write\]/);
  });
});
