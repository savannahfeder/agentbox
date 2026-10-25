// A RUN OF CHANGES READS AS "THINGS IT CHANGED".
//
// w-a358961e3e, 2026-10-15, found while trimming comments in
// shared/work-lines.mjs. Edits were renamed "changed" in workVerb, but the
// list of verbs that read plainly on their own still said "edited". So a run
// that only changed files folded to "5 things it did · changed 5" instead of
// "5 things it changed". Measured: runSummary of five Edit calls returned the
// first form before the fix.

import { describe, it, expect } from 'vitest';
import { runSummary, workVerb } from '../shared/work-lines.mjs';

const calls = (tool, n) => Array.from({ length: n }, () => ({ verb: workVerb(tool) }));

describe('a run that only changed files', () => {
  it('reads as the things it changed', () => {
    expect(runSummary(calls('Edit', 5))).toBe('5 things it changed');
  });

  it('says thing, not things, for one', () => {
    expect(runSummary(calls('MultiEdit', 1))).toBe('1 thing it changed');
  });

  it('still tallies when changes are mixed with other work', () => {
    expect(runSummary([...calls('Bash', 3), ...calls('Edit', 2)])).toBe('5 things it did · ran 3 · changed 2');
  });

  it('keeps the tally for a verb that does not read plainly alone', () => {
    expect(runSummary(calls('mcp__paper__write_html', 4))).toBe('4 things it did · write html 4');
  });
});
