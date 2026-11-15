// A pasted stack trace lost the one line that said what went wrong.
//
// Measured in the power test (power-test-1, issue 9): a tester pasted
// "TypeError: Cannot read properties of undefined (reading clinicId)", two
// "at …" frames and a sentence asking for a fix. The first line is 66
// characters, so it fitted a title, so it became the title and the body was
// built from the lines AFTER it. The thread then opened on "at
// getAvailability…": a stack with no error in it, and the error itself only in
// a label the row cuts with an ellipsis.
//
// The first line is a subject only when a blank line sets it apart, the way
// email and a commit message do. Anything else is one block of text and the
// body keeps all of it.

import { describe, expect, it } from 'vitest';
import { joinMessage, splitMessage } from '../renderer/src/message-split.ts';

const trace = [
  'TypeError: Cannot read properties of undefined (reading clinicId)',
  '    at getAvailability (/src/booking/availability.ts:42:19)',
  '    at handler (/src/server/routes.ts:118:7)',
  'fix this, happens when a patient has no clinic yet',
].join('\n');

describe('a message with no blank line under its first line', () => {
  it('keeps the whole paste in the body', () => {
    expect(splitMessage(trace).body).toBe(trace);
  });

  it('still labels the thread with the line that says what broke', () => {
    expect(splitMessage(trace).title).toBe('TypeError: Cannot read properties of undefined (reading clinicId)');
  });

  it('keeps a first line that is a sentence of detail, not a subject', () => {
    const { title, body } = splitMessage('Fix the login bug\nIt 500s on a wrong password.');
    expect(title).toBe('Fix the login bug');
    expect(body).toBe('Fix the login bug\nIt 500s on a wrong password.');
  });
});

describe('the email shape is untouched', () => {
  it('lifts a first line that a blank line sets apart', () => {
    const { title, body } = splitMessage('Fix the login bug\n\nIt 500s on a wrong password.');
    expect(title).toBe('Fix the login bug');
    expect(body).toBe('It 500s on a wrong password.');
  });

  it('leaves a one-line message as a title and nothing else', () => {
    expect(splitMessage('Fix the login bug')).toEqual({ title: 'Fix the login bug', body: '' });
  });
});

// The repeats page puts the one message back in the box, so whatever shape it
// was typed in has to survive a round trip through both halves.
describe('every shape round-trips through joinMessage', () => {
  for (const [name, typed] of [
    ['a pasted trace', trace],
    ['a subject and a body', 'Fix the login bug\n\nIt 500s on a wrong password.'],
    ['a first line of detail', 'Fix the login bug\nIt 500s on a wrong password.'],
    ['one line', 'Fix the login bug'],
    ['a long first line', `${'word '.repeat(60)}end.\nAnd a second line.`],
  ]) {
    it(name, () => {
      const once = splitMessage(typed);
      expect(joinMessage(once)).toBe(typed.trim());
      expect(splitMessage(joinMessage(once))).toEqual(once);
    });
  }
});
