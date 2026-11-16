// A THREAD HANDED ON SAYS WHO HAS IT (2026-11-16).
//
// Two power testers gave a thread to a teammate (More actions, Give it to
// someone else) and both logged it as wrong: the thread then read "Done /
// Customer call prep" with a Reopen button, as if the work had finished. The
// hand-off closes the thread with "Given to <name>." (main/team handOn), and
// the page had nothing beside the name to say so. Measured on the built
// renderer: the bar drew the tab and the name, and no word about the teammate.
import { describe, it, expect } from 'vitest';
import { handedTo } from '../renderer/src/threads/page-rules.ts';

const given = { status: 'done', answer: 'Given to Jordan Ellis.' };

describe('the tag beside a handed-on thread', () => {
  it('names whom it was given to', () => {
    expect(handedTo(given)).toBe('given to Jordan Ellis');
  });

  it('says nothing while the thread is open again', () => {
    expect(handedTo({ ...given, status: 'open' })).toBeNull();
  });

  it('says nothing for a thread that finished or an answer that merely starts alike', () => {
    expect(handedTo({ status: 'done', answer: 'Looks good, ship it.' })).toBeNull();
    expect(handedTo({ status: 'done', answer: 'Given the copy, ship it.' })).toBeNull();
    expect(handedTo({ status: 'done' })).toBeNull();
  });

  it('keeps the words when the teammate had no name', () => {
    expect(handedTo({ status: 'done', answer: 'Given to a teammate.' })).toBe('given to a teammate');
  });
});
