// A SHIP WHOSE TEST RUN DIED SAYS IT DIED, INSTEAD OF QUOTING A GREEN LINE.
//
// What broke (w-c121bd85e6, 2026-10-04): a ship bounced at load 96 after 166
// seconds and the thread said
//
//   It did not ship, and it went back to its agent:
//   ✓ tests/a-failed-hook-is-visible-while-the-agent-continues.test.mjs (7 tests) 51ms
//
// That line is a PASSING file. `failureNote` looks for the first line matching
// /\bfailed\b/i, and a hyphen is a word boundary, so "a-failed-hook" matched.
// The run had not gone red at all: it had died without naming a failing test,
// which is why there was no red line for the note to find. Quoting a green one
// is worse than saying nothing, because whoever reads it goes looking for a
// bug in a file that passed in 51 milliseconds.
//
// So: a line vitest marked as passing is never the reason, and output with no
// real failure in it says the run died rather than offering the nearest line.

import { describe, it, expect } from 'vitest';
import { failureNote, failureReply } from '../main/ship-queue.mjs';

const PREFIX = 'It did not ship, and it went back to its agent: ';
const why = (out) => failureNote(out).replace(PREFIX, '');

// The real tail, trimmed: green files, one of them named "a-failed-hook".
const DIED = [
  'ship: running the tests for 6 changed file(s). The hook runs the rest on push.',
  '✓ tests/an-agent-marks-ready-and-the-app-ships-it.test.mjs (12 tests) 94ms',
  '✓ tests/a-failed-hook-is-visible-while-the-agent-continues.test.mjs (7 tests) 51ms',
].join('\n');

describe('a test run that died', () => {
  it('says it died rather than quoting a file that passed', () => {
    const note = why(DIED);
    expect(note).not.toMatch(/a-failed-hook/);
    expect(note).toMatch(/died|ended without/i);
  });

  it('never offers a line vitest ticked as passing, whatever the file is called', () => {
    const out = ['✓ tests/a-refused-push-is-an-error.test.mjs (3 tests) 9ms', '✔ tests/red-and-failed.test.mjs (1 test) 2ms'].join('\n');
    expect(why(out)).not.toMatch(/\.test\.mjs/);
  });

  it('tells the agent the run died, in the reply it gets back', () => {
    expect(failureReply(DIED)).toMatch(/died|ended without/i);
  });
});

describe('a test run that really went red', () => {
  it('names the red file and its failed count', () => {
    const out = [
      '✓ tests/an-agent-marks-ready-and-the-app-ships-it.test.mjs (12 tests) 94ms',
      '❯ tests/a-signed-out-codex-comes-back-on-its-own-end-to-end.test.mjs (8 tests | 1 failed) 9998ms',
    ].join('\n');
    expect(why(out)).toBe('❯ tests/a-signed-out-codex-comes-back-on-its-own-end-to-end.test.mjs (8 tests | 1 failed) 9998ms');
  });

  it('still names a FAIL line, a conflict, an error and a failed count', () => {
    expect(why(['✓ tests/a-failed-hook.test.mjs (7 tests) 51ms', ' FAIL  tests/x.test.mjs > it works'].join('\n'))).toBe('FAIL  tests/x.test.mjs > it works');
    expect(why('CONFLICT (content): Merge conflict in a.mjs')).toMatch(/^CONFLICT/);
    expect(why('Error: Cannot find module')).toBe('Error: Cannot find module');
    expect(why('Tests  1 failed | 9 passed (10)')).toBe('Tests  1 failed | 9 passed (10)');
  });

  it('and says the tests are red when the script itself said so', () => {
    expect(why(['✓ tests/a-failed-hook.test.mjs (7 tests) 51ms', 'ship: those tests are red, so nothing was pushed.'].join('\n')))
      .toBe('ship: those tests are red, so nothing was pushed.');
  });

  it('must NOT call a real failure a death', () => {
    expect(why('ship: the push was refused')).not.toMatch(/died|ended without/i);
    expect(why('Tests  1 failed | 9 passed (10)')).not.toMatch(/died|ended without/i);
    // A real red run's reply says nothing about dying either.
    expect(failureReply('❯ tests/x.test.mjs (8 tests | 1 failed) 9998ms')).not.toMatch(/died|ended without/i);
  });
});
