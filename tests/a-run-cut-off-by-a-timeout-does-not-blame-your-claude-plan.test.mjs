// A RUN CUT OFF BY A TIMEOUT DOES NOT BLAME YOUR CLAUDE PLAN.
//
// On 2026-10-27 six cloud starts died with "agentbox cloud: stopped: The
// operation was aborted due to timeout" (Node's own words for a fetch whose
// deadline passed while the Mac slept), and four more with "agentbox cloud:
// stopped: fetch failed" (a 247 MB upload past Node's five-minute limit). None
// matched a cause, so each row said "Claude Code stopped before it did
// anything... Check that your Claude plan is active at claude.ai", and the
// founder went looking at a plan that was fine. Both are now a run cut off.
import { describe, it, expect } from 'vitest';
import { troubleCause, deadRunSentence } from '../shared/spawn-trouble.mts';

const TIMEOUT = 'agentbox cloud: stopped: The operation was aborted due to timeout';
const FETCH = 'agentbox cloud: stopped: fetch failed';

describe('what a cut-off cloud start is called', () => {
  it('a deadline that passed is a run cut off', () => {
    expect(troubleCause(TIMEOUT)).toBe('interrupted');
  });

  it('a request that failed on the way is a run cut off', () => {
    expect(troubleCause(FETCH)).toBe('interrupted');
    expect(troubleCause('TypeError: fetch failed')).toBe('interrupted');
  });

  it('the row says so, with no word about her plan', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: troubleCause(TIMEOUT) });
    expect(said).toContain('was cut off');
    expect(said).not.toMatch(/plan|claude\.ai/i);
  });

  it('a limit that mentions a failed fetch on the way down is still the limit', () => {
    expect(troubleCause("You've hit your weekly limit · resets Oct 29 at 4pm. fetch failed")).toBe('at-limit');
  });

  it('an abort with no timeout in it, and a word merely containing fetch, are not', () => {
    expect(troubleCause('The operation was aborted')).toBe('unknown');
    expect(troubleCause('prefetch failed to warm the cache')).toBe('unknown');
  });
});
