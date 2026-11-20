// CODE BESIDE A FILE IS SET SMALL ENOUGH TO KEEP ITS WORDS (w-f702d60afe, round seven, 2026-11-20).
//
// The product engineer tester read an agent's snippet with the code change open
// beside the thread: "The snippet breaks hidden between 'hidde' and 'n' in the
// narrow thread column". Under 560px of conversation a code block wraps
// anywhere, since a line nobody can scroll to is a line nobody reads, and at
// the thread's reading size (16-18px) a line of code held about 36 characters.
// Set at 12.5px there, the same snippet's lines fit whole.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/narrow-conversation.css', import.meta.url), 'utf8');
const narrow = css.slice(css.indexOf('@container talk (max-width: 560px) {'), css.indexOf('\n}', css.indexOf('@container talk (max-width: 560px) {')));

describe('code in a narrow conversation', () => {
  it('is set at 12.5px', () => {
    expect(narrow).toMatch(/\.markdown pre \{ font-size: 12\.5px; line-height: 1\.55; \}/);
  });
  it('still wraps rather than running off the edge', () => {
    expect(narrow).toMatch(/\.markdown pre, \.markdown pre code \{ white-space: pre-wrap; overflow-wrap: anywhere; \}/);
  });
});
