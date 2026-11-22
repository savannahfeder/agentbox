// A recorded Claude Code session carries each thinking block's `signature`,
// and that base64 blob holds the organisation id of the account that ran it.
// tests/fixtures/lead-works-while-a-subagent-is-out.stream.jsonl went public
// with one, and the same id sat in a test as a stand-in. Found 2026-11-16 by
// decoding every tracked signature: one of one carried an id.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkRecording } from '../scripts/check-before-public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = ['0f1e2d3c', '4b5a', '4978', '8695', 'a4b3c2d1e0f9'].join('-');
const b64 = (s: string) => Buffer.from(s).toString('base64');
const thinking = (signature: string) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '', signature }] } });

describe('a recorded session\'s thinking signature', () => {
  it('is refused when it decodes to an account id', () => {
    expect(checkRecording('t/run.stream.jsonl', thinking(b64(`\u0012claude-opus\u0018thinking Z$${ID}\u0000more`)))).not.toEqual([]);
  });

  it('is refused when the id sits at another offset of the blob', () => {
    expect(checkRecording('t/run.stream.jsonl', thinking(b64(`xy${ID}`)))).not.toEqual([]);
  });

  it('is let through when it decodes to no id', () => {
    expect(checkRecording('t/run.stream.jsonl', thinking(b64('a signature with nothing in it')))).toEqual([]);
    expect(checkRecording('t/run.stream.jsonl', thinking(''))).toEqual([]);
  });

  it('is not read in a file that is not a recording', () => {
    expect(checkRecording('t/notes.md', thinking(b64(ID)))).toEqual([]);
  });
});

describe('the recordings in this repository', () => {
  it('carry no signature that decodes to an account id', () => {
    const files = execFileSync('git', ['ls-files', '*.jsonl'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    const found = files.filter((f) => checkRecording(f, fs.readFileSync(path.join(root, f), 'utf8')).length);
    expect(found).toEqual([]);
  });
});
