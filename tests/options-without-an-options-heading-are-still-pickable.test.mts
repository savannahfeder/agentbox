// A Codex agent asked for three design options ended with a bold question, a
// numbered list with option 1 marked Recommended, and "I'll wait for your
// pick". It wrote no "## Options" heading, so parseOptions found nothing: no
// option buttons were drawn and pressing 2 typed "2" into the reply box
// (w-40d7d7cf71). Measured by feeding that answer to parseOptions: [].
//
// A closing numbered list with one choice marked recommended is an offer even
// without the heading. A numbered list that marks nothing, or that the message
// goes on well past, stays prose.

import { describe, it, expect } from 'vitest';
import { parseOptions, stripOptionsSection } from '../renderer/src/format';

const reported = [
  '**Which rule should countWords use for punctuation-only tokens?**',
  '',
  'Each option changes what `countWords("a -- b")` returns.',
  '',
  '1. Skip them: a token with no letter or digit is not a word (Recommended)',
  '2. Count them: every whitespace-separated token is a word',
  '3. Join them to the word before, so "a --" is one word',
  '',
  "I'll wait for your pick before writing code.",
].join('\n');

describe('an answer whose options have no heading', () => {
  it('offers the reported three choices, with the first recommended', () => {
    const options = parseOptions(reported);
    expect(options.map((o) => o.n)).toEqual([1, 2, 3]);
    expect(options[0].recommended).toBe(true);
    expect(options[1].recommended).toBe(false);
    expect(options[1].text).toBe('Count them: every whitespace-separated token is a word');
  });

  it('reads a leading bold Recommended marker and puts it where the rest of the app looks', () => {
    const body = ['Pick one.', '', '1. **Recommended:** Skip them', '2. Count them'].join('\n');
    expect(parseOptions(body)).toEqual([
      { n: 1, text: 'Skip them (recommended)', recommended: true },
      { n: 2, text: 'Count them', recommended: false },
    ]);
  });

  it('takes items spread over blank and indented lines', () => {
    const body = [
      'Which one?', '',
      '1. Skip them (recommended)', '   Simplest to explain.', '',
      '2. Count them', '   Matches wc.',
    ].join('\n');
    expect(parseOptions(body).map((o) => o.n)).toEqual([1, 2]);
  });

  it('takes the options out of the prose when the strip draws them, keeping the question and the closing line', () => {
    const stripped = stripOptionsSection(reported);
    expect(stripped).toContain('Which rule should countWords use');
    expect(stripped).toContain("I'll wait for your pick");
    expect(stripped).not.toContain('Count them');
  });
});

describe('a numbered list that is not an offer', () => {
  it('a list of steps that marks nothing recommended', () => {
    const body = ['Do this:', '', '1. Open Settings', '2. Turn on the cloud', '3. Press Done'].join('\n');
    expect(parseOptions(body)).toEqual([]);
    expect(stripOptionsSection(body)).toBe(body);
  });

  it('a list the message carries on well past', () => {
    const body = [
      '1. Tried the cache (recommended by the docs)', '2. Tried a restart', '',
      'Neither helped.', 'The log shows a timeout.', 'I am looking at the network next.',
    ].join('\n');
    expect(parseOptions(body)).toEqual([]);
  });

  it('a list where "recommended" is only a word in passing', () => {
    const body = ['1. Install the recommended Node version', '2. Run the tests'].join('\n');
    expect(parseOptions(body)).toEqual([]);
  });

  it('a single item', () => {
    expect(parseOptions('1. Ship it (recommended)')).toEqual([]);
  });

  it('numbers that do not run 1, 2, 3', () => {
    expect(parseOptions(['2. Ship it (recommended)', '3. Leave it'].join('\n'))).toEqual([]);
  });
});

describe('an answer with an Options heading', () => {
  it('reads as it always did, ignoring a recommended list above it', () => {
    const body = [
      '1. An earlier list (recommended)', '2. Another', '',
      '## Options', '1. Ship it (recommended)', '2. Change the colour first',
    ].join('\n');
    expect(parseOptions(body).map((o) => o.text)).toEqual(['Ship it (recommended)', 'Change the colour first']);
  });
});
