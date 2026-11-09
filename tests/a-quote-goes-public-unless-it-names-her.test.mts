// A QUOTE GOES PUBLIC, UNLESS IT NAMES HER OR CARRIES SOMETHING PRIVATE.
//
// The public check used to refuse any comment that quoted a person, by four
// attribution patterns and by a model told to block "quotes of a real person's
// messages". On 2026-10-01 that refused one push 25 times over (16 files), all
// for design feedback with no secret in it, and the same rule had been stopping
// agents' merges all day. The rule now: a quote is fine; a quote that names her
// is refused by the private-words list, like any other line that names her;
// keys, home folders and private files are refused as before.

import { describe, expect, it } from 'vitest';
import { checkLine, PROMPT } from '../scripts/check-before-public.mjs';

const WORD = 'zanzibarquux';
const blocks = (text, opts) => checkLine('a.mjs', text, opts).filter((f) => f.severity === 'block');

describe('a quote in a comment', () => {
  it('goes through, however it is attributed', () => {
    expect(blocks('// Her' + 's, 2026-08-24: "run every test before a push"')).toEqual([]);
    expect(blocks('// Her ' + 'words: "this was wrong"')).toEqual([]);
    expect(blocks('// the ' + 'founder, 2026-08-16, approving the card')).toEqual([]);
    expect(blocks('// she ' + 'said: "drop the last two"')).toEqual([]);
  });

  it('is not even a warning in a whole-tree audit', () => {
    expect(checkLine('a.mjs', '// Her ' + 'words: "this was wrong"', { soft: true })).toEqual([]);
  });

  it('is still refused when it names her', () => {
    expect(blocks(`// ${WORD}'s words: "this was wrong"`, { words: [WORD] })).not.toEqual([]);
  });

  it('is still refused when it carries a key', () => {
    expect(blocks('// she ' + 'said: "use sk-ant-' + 'api03-' + 'Q'.repeat(40) + '"')).not.toEqual([]);
  });
});

describe('the model that reads a push', () => {
  it('is not told to refuse quotes', () => {
    expect(PROMPT).not.toMatch(/quotes of a real person/);
    expect(PROMPT).toMatch(/quot\w+[\s\S]{0,60}(fine|allowed)/i);
  });

  it('is still told to refuse names, secrets and private data', () => {
    expect(PROMPT).toMatch(/names, emails/);
    expect(PROMPT).toMatch(/credentials, keys, tokens/);
  });
});
