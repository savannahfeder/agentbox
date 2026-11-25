// A message that names you sits in Needs you as a row. On the desktop that
// row shows the message's first real line cut at 48 characters, or "Sent a
// file" when it carries only a file, and names who wrote it "in your thread" or
// "in a thread" when it was a thread reply (2026-11-22). The phone parity round
// of 2026-11-25 found the phone drawing the whole raw body over two lines, and
// nothing at all for a message that was only a file.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mentionRowWords } from '../mobile/src/lib/mention-row';

const m = (over: Record<string, unknown>) => ({ id: 'm1', roomId: 'r', roomName: 'astral', by: 'u1', byName: 'Sam R.', body: '', at: 0, ...over });

describe("a mention on the phone's list", () => {
  it('shows the first real line, cut at a word within 48 characters', () => {
    const w = mentionRowWords(m({ body: 'Sign-in screen is down to two. @Ada L. which do you want, the dark one or the light one?' }));
    expect(w.says.length).toBeLessThanOrEqual(49);
    expect(w.says).toMatch(/^Sign-in screen is down to two\. @Ada .*…$/);
    expect(w.says).not.toContain('light one');
  });

  it('skips a label line such as "Update:" and keeps a short message whole', () => {
    expect(mentionRowWords(m({ body: 'Update:\nShipped the fix' })).says).toBe('Shipped the fix');
  });

  it('says Sent a file for a message that is only a file', () => {
    expect(mentionRowWords(m({ body: '' })).says).toBe('Sent a file');
  });

  it('names a thread reply as the desktop does, and a plain message by its writer only', () => {
    expect(mentionRowWords(m({ body: 'hi', thread: 'yours' })).who).toBe('Sam R. in your thread');
    expect(mentionRowWords(m({ body: 'hi', thread: 'theirs' })).who).toBe('Sam R. in a thread');
    expect(mentionRowWords(m({ body: 'hi' })).who).toBe('Sam R.');
    expect(mentionRowWords(m({ body: 'hi', byName: '' })).who).toBe('Someone');
  });

  it('is what the inbox row draws, on one line', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    expect(src).toContain('mentionRowWords(m)');
    expect(src).not.toContain('{m.body}');
  });
});
