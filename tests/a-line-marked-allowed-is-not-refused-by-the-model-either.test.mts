// A LINE MARKED `public-check: allow` IS NOT REFUSED BY THE MODEL EITHER.
//
// The refusal message says a line that must carry a fake key on purpose can
// carry `public-check: allow`. Only the rules honoured it: the model reader was
// still handed the line, and on 2026-11-15 it refused a push twice over one
// made-up OpenAI key in a test that proves the key is hidden, marker and all.
// Measured by listing what reviewByModel would send: the marked line was in it.

import { describe, expect, it } from 'vitest';
import { linesForTheModel } from '../scripts/check-before-public.mjs';

const files = (rows: [string, string][]) => new Map([['tests/a.test.mts', rows.map(([n, t]) => [Number(n), t])]]);

describe('what the model reads before a push', () => {
  it('leaves out a line carrying the marker', () => {
    const sent = linesForTheModel(files([['57', "const key = 'sk-proj-abc'; // made up. public-check: allow"]])).join('');
    expect(sent).not.toContain('sk-proj-abc');
  });

  it('leaves it out with no space after the colon too', () => {
    expect(linesForTheModel(files([['1', "x = 'sk-proj-abc' // public-check:allow"]])).join('')).toBe('');
  });

  it('still sends a line without the marker, even one that names the check', () => {
    const sent = linesForTheModel(files([['1', "x = 'sk-proj-abc'"], ['2', '// see public-check for the rules']])).join('');
    expect(sent).toContain('tests/a.test.mts:1:');
    expect(sent).toContain('tests/a.test.mts:2:');
  });
});
