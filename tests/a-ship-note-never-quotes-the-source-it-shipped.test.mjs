// A FAILED SHIP'S NOTE NEVER QUOTES THE SOURCE IT WAS SHIPPING.
//
// What broke (w-560647d4db, 2026-10-04, five bounces). Twice the thread said
//
//   It did not ship, and it went back to its agent: +               than
//   deleted: a bare corner here reads as a control that failed
//
// That is a code comment in a file the branch touched, printed by vitest
// inside the diff of a failing text assertion and prefixed `+` because it is
// the received side. It names no fault at all. `failureNote` matched
// /\bfailed\b/ against every line of the output and took the first hit, and
// the diff is printed long before the runner's own list of failures.
//
// The real cause was three failing tests, which the note never mentioned. Two
// sessions on that row went looking for a merge conflict that was not there,
// and the three were found only by running the whole suite by hand, which
// CLAUDE.md tells agents not to do.
//
// So, measured here:
//   1. A line vitest QUOTED is never the reason: a diff line (`+`/`-`) or a
//      code frame (`34|   expect(...)`) is source, not the script speaking.
//   2. A line that NAMES a failing test outranks a loose word match anywhere
//      else in the output.
//   3. The note says HOW MANY failed when the run said so, so that one named
//      file reads as the first of three rather than as the whole story.

import { describe, it, expect } from 'vitest';
import { failureNote, failureReply } from '../main/ship-queue.mjs';

const PREFIX = 'It did not ship, and it went back to its agent: ';
const why = (out) => failureNote(out).replace(PREFIX, '');

// The shape of that ship's own tail: three text assertions on one component,
// each printing the file's text as a diff, then the runner's list of failures.
const THE_FIVE_BOUNCES = [
  'ship: running the tests for 6 changed file(s). The hook runs the rest on push.',
  '✓ tests/an-agent-marks-ready-and-the-app-ships-it.test.mjs (12 tests) 94ms',
  '❯ tests/a-corner-is-never-bare.test.mjs (3 tests | 3 failed) 412ms',
  'AssertionError: expected the file to contain "rounded-xl"',
  '- Expected',
  '+ Received',
  '-               rounded-xl',
  '+               than deleted: a bare corner here reads as a control that failed',
  ' ❯ tests/a-corner-is-never-bare.test.mjs:34:5',
  '     33|   const text = fs.readFileSync(focus, \'utf8\');',
  '     34|   expect(text).toContain(\'rounded-xl\');',
  '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯',
  ' FAIL  tests/a-corner-is-never-bare.test.mjs > every corner > the focus panel is rounded',
  ' FAIL  tests/a-corner-is-never-bare.test.mjs > every corner > the reply box is rounded',
  ' FAIL  tests/a-corner-is-never-bare.test.mjs > every corner > the card is rounded',
  'Test Files  1 failed | 133 passed (134)',
  '     Tests  3 failed | 1920 passed (1923)',
  'ship: those tests are red, so nothing was pushed.',
].join('\n');

describe('the note that bounced five times', () => {
  it('does not quote the code comment out of the diff', () => {
    expect(why(THE_FIVE_BOUNCES)).not.toMatch(/a bare corner/);
  });

  it('names the failing test file instead', () => {
    expect(why(THE_FIVE_BOUNCES)).toMatch(/a-corner-is-never-bare\.test\.mjs/);
  });

  it('says there were three of them, not one', () => {
    expect(why(THE_FIVE_BOUNCES)).toMatch(/3 tests failed/);
  });

  it('tells the woken agent the same thing in the reply it gets back', () => {
    const reply = failureReply(THE_FIVE_BOUNCES);
    expect(reply).toMatch(/3 tests failed/);
    expect(reply.split('```')[0]).not.toMatch(/a bare corner/);
  });
});

describe('a line vitest quoted rather than said', () => {
  it('is never the reason, on either side of a diff', () => {
    const out = [
      '+ this is the line that failed to draw',
      '- the old error message',
      ' FAIL  tests/x.test.mjs > it works',
    ].join('\n');
    expect(why(out)).toBe('FAIL  tests/x.test.mjs > it works');
  });

  it('is never the reason inside a code frame either', () => {
    const out = [
      '     12|   // a control that failed to draw',
      'ship: the push was refused',
    ].join('\n');
    expect(why(out)).toBe('ship: the push was refused');
  });

  it('leaves a run that quoted nothing else as a run that died', () => {
    expect(why('+ a control that failed to draw')).toMatch(/died/);
  });
});

describe('a line that names a failing test', () => {
  it('outranks a loose word match printed before it', () => {
    const out = [
      'ship: merging origin/main, which has moved.',
      'Error: a warning some other test prints on purpose',
      ' FAIL  tests/y.test.mjs > it adds up',
    ].join('\n');
    expect(why(out)).toBe('FAIL  tests/y.test.mjs > it adds up');
  });

  it('outranks the script\'s own closing line, which names nothing', () => {
    const out = [
      ' FAIL  tests/y.test.mjs > it adds up',
      'ship: those tests are red, so nothing was pushed.',
    ].join('\n');
    expect(why(out)).toMatch(/^FAIL {2}tests\/y\.test\.mjs/);
  });
});

describe('how many failed', () => {
  it('is said in the singular when one did', () => {
    const out = [' FAIL  tests/y.test.mjs > it adds up', '     Tests  1 failed | 9 passed (10)'].join('\n');
    expect(why(out)).toBe('1 test failed, the first is FAIL  tests/y.test.mjs > it adds up');
  });

  it('is counted off the runner\'s own total, not off the files', () => {
    const out = [
      ' FAIL  tests/y.test.mjs > it adds up',
      'Test Files  2 failed | 133 passed (135)',
      '     Tests  7 failed | 1920 passed (1927)',
    ].join('\n');
    expect(why(out)).toMatch(/^7 tests failed/);
  });

  it('must NOT invent a number the run never printed', () => {
    expect(why(' FAIL  tests/y.test.mjs > it adds up')).toBe('FAIL  tests/y.test.mjs > it adds up');
  });

  it('must NOT be pinned onto a line that is not a test, which would read as its count', () => {
    const out = ['CONFLICT (content): Merge conflict in a.mjs', '     Tests  3 failed | 9 passed (12)'].join('\n');
    expect(why(out)).toBe('CONFLICT (content): Merge conflict in a.mjs');
  });
});
