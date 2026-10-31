// What broke (2026-10-29): a thread on a Claude plan that had been running
// other threads for hours sat "Queued" under "This run stopped because the
// account hit its usage limit", while the other threads on that plan ran on.
//
// Claude Code 2.1.312 has its own sentence for Anthropic's servers turning a
// request away for a moment: "Server is temporarily limiting requests (not your
// usage limit)". `troubleCause` matched /usage limit/ inside "not your usage
// limit" and filed it as the plan being out, which benched the login (and, in
// the cloud, the cloud's login) and held the thread. Both sentences below are
// read out of the claude binary with `grep -a "not your usage limit"`.

import { describe, it, expect } from 'vitest';
import { troubleCause, runStoppedLine } from '../shared/spawn-trouble.mjs';
import { limitInResultLine } from '../main/cloud/run.mjs';
import { humanFailure } from '../renderer/src/notes.ts';

const SERVER_BUSY = 'Server is temporarily limiting requests (not your usage limit)';
const USAGE_PAGE_BUSY = 'Claude is temporarily limiting requests to the usage page (not your usage limit). Try again in a moment';

describe('the server turning a request away is not the plan running out', () => {
  it('reads the CLI sentence as a run that was cut off, not a limit', () => {
    expect(troubleCause(SERVER_BUSY)).toBe('interrupted');
    expect(troubleCause(`API Error: ${SERVER_BUSY}`)).toBe('interrupted');
    expect(troubleCause(`API Error: ${SERVER_BUSY} · If it persists, check https://status.claude.com.`)).toBe('interrupted');
    expect(troubleCause(USAGE_PAGE_BUSY)).toBe('interrupted');
  });

  it('does not tell them the account hit its usage limit', () => {
    expect(runStoppedLine(`API Error: ${SERVER_BUSY}`)).not.toMatch(/usage limit/);
    expect(humanFailure(`API Error: ${SERVER_BUSY}`)).not.toMatch(/used up/);
  });

  it('does not bench the cloud login either', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: `API Error: ${SERVER_BUSY}` });
    expect(limitInResultLine(line, 0)).toBe(null);
  });

  it('still reads a real limit as a limit', () => {
    expect(troubleCause("You've hit your session limit · resets 6pm (America/Los_Angeles)")).toBe('at-limit');
    expect(troubleCause('API Error: Claude AI usage limit reached.')).toBe('at-limit');
    expect(troubleCause('usage limit reached — check plan')).toBe('at-limit');
    expect(humanFailure('API Error: Claude AI usage limit reached.')).toMatch(/used up/);
  });
});
