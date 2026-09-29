// The protocol is the only thing standing between a clean run and a swallowed
// finding, so the exact mechanics have to be in the words the worker reads.
// Labels REPLACE rather than merge, and the MCP drops its record of the held
// item once it sees done, so a label sent afterwards writes into nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { OCCURRENCE_PROTOCOL } from '../main/repeats.mjs';

const brief = fs.readFileSync(new URL('../briefs/worker.md', import.meta.url), 'utf8');

describe('the occurrence protocol', () => {
  it('tells the worker to send all the labels, in one call', () => {
    expect(OCCURRENCE_PROTOCOL).toMatch(/REPLACE/);
    expect(OCCURRENCE_PROTOCOL).toMatch(/SAME CALL/i);
  });

  it('defaults to telling her when the worker is unsure', () => {
    expect(OCCURRENCE_PROTOCOL).toMatch(/unsure/i);
    expect(brief).toMatch(/unsure/i);
  });

  it('comes FIRST, so an over-long body cannot truncate it away', () => {
    expect(OCCURRENCE_PROTOCOL.trimEnd().endsWith('HER INSTRUCTION FOLLOWS.')).toBe(true);
  });

  it('the standing worker brief carries the same two endings', () => {
    expect(brief).toMatch(/repeating task/i);
    expect(brief).toMatch(/"clean"/);
    expect(brief).toMatch(/labels replace the array rather than merging/i);
  });
});
