// A SANDBOXED TESTER DOES NOT KILL THE BROWSER IT WAS GIVEN (w-fbe5e95dea, 2026-11-09).
//
// Both testers in a one-hour onboarding test lost their browser in their
// second stretch and never got it back: every `app look` printed "The browser
// had closed" and every `app open` failed with "chrome exited before printing a
// devtools url". The harness opens each tester's Chrome outside Codex's
// sandbox. Inside it, `process.kill(pid, 0)` on that Chrome throws EPERM, which
// browse.mjs read as "not running", so it relaunched: it killed the working
// Chrome and started one the sandbox would not let live. EPERM means the
// process is there.
import { it, expect } from 'vitest';
import { isRunning } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const throwing = (code) => () => { throw Object.assign(new Error(code), { code }); };

it('a process this one may not signal is still running', () => {
  expect(isRunning(123, throwing('EPERM'))).toBe(true);
});
it('a process that is gone is not running', () => {
  expect(isRunning(123, throwing('ESRCH'))).toBe(false);
});
it('a process that answers is running', () => {
  expect(isRunning(process.pid)).toBe(true);
});
