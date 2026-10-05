// A FAILED SHIP NAMES THE LINE THAT FAILED, NOT A WORD THAT HIDES "red".
//
// What broke (w-7ec8553e23, 2026-10-04): a ship failed and the thread said
// "It did not ship, and it went back to its agent: Agentbox: sessionArgs
// grants mcp__agentbox but no storeMcpCommand is configured...". That is a
// harmless warning the tests print. `failureNote` picks the first line
// matching /red/i, and "configu-red" matched, so the line shown was not the
// failure. The same branch then passed all 134 related test files (1,923
// tests) when run again, so the note pointed at nothing real.

import { describe, it, expect } from 'vitest';
import { failureNote } from '../main/ship-queue.mjs';

const WARNING = 'Agentbox: sessionArgs grants mcp__agentbox but no storeMcpCommand is configured, so spawned workers will have NO store tools.';
const why = (out) => failureNote(out).replace('It did not ship, and it went back to its agent: ', '');

describe('the line a failed ship shows', () => {
  it('skips a warning that only has "red" inside a word', () => {
    expect(why([WARNING, ' FAIL  tests/x.test.mjs > it works'].join('\n'))).toBe('FAIL  tests/x.test.mjs > it works');
  });

  it('does not take "required", "stored" or "ordered" for red', () => {
    const out = ['the key is required', 'stored the result', 'ordered the list', 'ship: the push was refused'].join('\n');
    expect(why(out)).toBe('ship: the push was refused');
  });

  it('still takes red when it is the word', () => {
    expect(why([WARNING, 'ship: the suite is red'].join('\n'))).toBe('ship: the suite is red');
  });

  it('still takes a merge conflict, an error and a failed count', () => {
    expect(why([WARNING, 'CONFLICT (content): Merge conflict in a.mjs'].join('\n'))).toMatch(/^CONFLICT/);
    expect(why([WARNING, 'Error: Cannot find module'].join('\n'))).toBe('Error: Cannot find module');
    expect(why([WARNING, 'Tests  1 failed | 9 passed (10)'].join('\n'))).toBe('Tests  1 failed | 9 passed (10)');
  });

  // 2026-10-04 (w-c121bd85e6): this used to offer the last line on its own,
  // as if it were the failure. It is not: output with nothing failing in it is
  // a run that DIED, and the last line is only the last thing it managed to
  // say. It is still shown, now labelled as that.
  // tests/a-ship-whose-test-run-died-says-it-died.test.mjs is the measurement.
  it('says the run died when no line in it names a failure, and still quotes the last one', () => {
    expect(why('one\ntwo')).toBe('the test run died without naming a failing test. It last said: two');
    expect(why('')).toBe('the test run died without naming a failing test. It last said: nothing at all');
  });
});
