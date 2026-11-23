// A run's change is read without loading its whole transcript.
//
// 2026-11-22: fifteen minutes after a restart the app's main process went from
// 0.75 GB to 1.8 GB in two minutes. Its "git" thread held 416 MB of heap, and
// a run had just ended on a thread whose transcript was 185 MB. To find the
// edits that one run made, the whole file was read into one string, split
// into lines and every line parsed. A long thread's transcript holds every
// run it ever had; on that Mac the biggest was 568 MB. Now the file is read a
// piece at a time and only a line that can hold an edit is parsed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from '../main/strip-types.mts';
import { changeFromTranscript, changeFromTranscriptFile } from '../main/code-change.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SINCE = Date.parse('2026-11-22T21:00:00.000Z');
const at = (min: number) => new Date(SINCE + min * 60_000).toISOString();

const edit = (min: number, file: string, was: string, now: string, said = '') => JSON.stringify({
  type: 'assistant',
  timestamp: at(min),
  message: { content: [
    ...(said ? [{ type: 'text', text: said }] : []),
    { type: 'tool_use', name: 'Edit', input: { file_path: file, old_string: was, new_string: now } },
  ] },
});
const result = (min: number, text: string) => JSON.stringify({
  type: 'user', timestamp: at(min), message: { content: [{ type: 'tool_result', content: text }] },
});
const said = (min: number, text: string) => JSON.stringify({
  type: 'assistant', timestamp: at(min), message: { content: [{ type: 'text', text }] },
});

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-transcript-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A long thread: earlier runs' edits and output, then this run's two edits. */
function longThread(file: string, megabytes: number) {
  const fd = fs.openSync(file, 'w');
  const filler = 'x'.repeat(4000);
  let written = 0;
  const put = (line: string) => { written += fs.writeSync(fd, `${line}\n`); };
  put(edit(-600, '/repo/src/old.ts', 'a', 'b', 'An earlier run changed this.'));
  while (written < megabytes * 1024 * 1024) put(result(-500, filler));
  // One line of 6 MB, as a tool that printed a whole file leaves.
  put(result(-400, 'y'.repeat(6 * 1024 * 1024)));
  put(edit(0, '/repo/src/first.ts', 'one', 'uno ✓ café', 'This run starts here.'));
  put(result(1, 'ok'));
  put(said(2, 'Words that only mention "tool_use" change nothing.'));
  put('{"type":"assistant","message":{"content":[{"type":"tool_use" broken');
  put(edit(3, '/repo/src/second.ts', 'two', 'dos', 'And its second edit.'));
  fs.closeSync(fd);
}

describe('reading what a run changed from its transcript', () => {
  it('reads a long thread\'s transcript in less memory than the file is long', async () => {
    const transcript = path.join(dir, 'session.jsonl');
    longThread(transcript, 80);
    const script = path.join(dir, 'read.mjs');
    fs.writeFileSync(script, `
      import { writeChangeForRun, readChange } from ${JSON.stringify(path.join(ROOT, 'main', 'code-change.mts'))};
      const out = writeChangeForRun({ transcript: ${JSON.stringify(transcript)}, docsDir: ${JSON.stringify(dir)}, itemId: 'w-abc123', roots: ['/repo'], since: ${SINCE} });
      const change = readChange(out);
      console.log(JSON.stringify(change.files.map((f) => [f.path, f.plus, f.minus])));
    `);
    // The old reading needed the 86 MB file as one string, and more to split it.
    const { stdout } = await promisify(execFile)(process.execPath, ['--max-old-space-size=48', ...stripTypesFlags(), script], { timeout: 60_000 });
    expect(JSON.parse(stdout)).toEqual([['src/first.ts', 1, 1], ['src/second.ts', 1, 1]]);
  }, 90_000);

  it('reads the same change as the whole text did, edit for edit', () => {
    const transcript = path.join(dir, 'session.jsonl');
    longThread(transcript, 3);
    const whole = changeFromTranscript(fs.readFileSync(transcript, 'utf8'), { roots: ['/repo'], since: SINCE });
    const pieces = changeFromTranscriptFile(transcript, { roots: ['/repo'], since: SINCE });
    expect(pieces).toEqual(whole);
    expect(pieces.files.map((f) => f.path)).toEqual(['src/first.ts', 'src/second.ts']);
    // Characters of several bytes survive a cut between two pieces.
    expect(JSON.stringify(pieces.files[0].hunks)).toContain('uno ✓ café');
    expect(pieces.files[0].hunks[0].said).toBe('This run starts here.');
  });

  it('counts an edit made at the very moment the run began, and none before it', () => {
    const transcript = path.join(dir, 'session.jsonl');
    fs.writeFileSync(transcript, [
      edit(-1, '/repo/before.ts', 'a', 'b'),
      edit(0, '/repo/at.ts', 'a', 'b'),
      edit(1, '/repo/after.ts', 'a', 'b'),
    ].join('\n'));
    expect(changeFromTranscriptFile(transcript, { roots: ['/repo'], since: SINCE }).files.map((f) => f.path)).toEqual(['at.ts', 'after.ts']);
    // With no start given, the whole thread counts, as it always did.
    expect(changeFromTranscriptFile(transcript, { roots: ['/repo'] }).files).toHaveLength(3);
  });

  it('reads a transcript that is not there as no change', () => {
    expect(changeFromTranscriptFile(path.join(dir, 'gone.jsonl'), { roots: ['/repo'], since: SINCE }).files).toEqual([]);
  });
});
