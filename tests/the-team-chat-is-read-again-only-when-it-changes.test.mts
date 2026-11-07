// The snapshot reads the teammates and the team chat on every refresh of the
// screen (w-4bd7b5548b). A file is now parsed again only when its size or
// time has changed. Pinned: a new line is always seen, and what one reader
// does to the list it got cannot change what the next reader gets.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readChat, writeChat } from '../main/store/teammates-files.mjs';

describe('reading the team chat', () => {
  it('sees every new line, and hands each reader a list of its own', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-read-'));
    writeChat(dir, { kind: 'msg', from: 'you', to: [], text: 'one' }, 1);
    const first = readChat(dir).messages;
    expect(first.map((l) => l.text)).toEqual(['one']);
    first.push({ kind: 'msg', text: 'not written' });
    expect(readChat(dir).messages.map((l) => l.text)).toEqual(['one']);
    writeChat(dir, { kind: 'msg', from: 'you', to: [], text: 'two' }, 2);
    expect(readChat(dir).messages.map((l) => l.text)).toEqual(['one', 'two']);
  });
});
