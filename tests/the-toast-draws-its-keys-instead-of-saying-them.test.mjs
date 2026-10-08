// THE TOAST DRAWS ITS KEYS INSTEAD OF SAYING THEM.
//
// w-f0bfe32859: "Right now they're pretty unattractive and messy-looking all
// around." The new-task toast read, in one run of text:
//   Started in Agentbox Team · Z to undo  Open it
// a sentence, a key spelt out in prose after a middle dot, and an underlined
// link, three registers in one pill. The undo half is baked into the string by
// about a dozen callers (" · Z to undo" or " · press Z to undo"), so the toast
// takes it back off the end and draws it as a keycap beside O.
//
// Only a TRAILING clause is taken: a sentence that merely mentions Z in the
// middle keeps its words, because that is the toast explaining something.

import { describe, it, expect } from 'vitest';
import { toastParts } from '../renderer/src/toast-parts';

describe('splitting the undo clause off a toast', () => {
  it('the new-task toast', () => {
    expect(toastParts('Started in Agentbox Team · Z to undo')).toEqual({ line: 'Started in Agentbox Team', undo: true });
  });

  it('the answer toasts, which say "press"', () => {
    expect(toastParts('Sent → Agentbox · press Z to undo')).toEqual({ line: 'Sent → Agentbox', undo: true });
    expect(toastParts('Closed: Added the sign-in route. · press Z to undo')).toEqual({ line: 'Closed: Added the sign-in route.', undo: true });
  });

  it('a scheduled send keeps its own middle dot', () => {
    expect(toastParts('Scheduled in Agentbox · Tomorrow 9am · Z to undo')).toEqual({ line: 'Scheduled in Agentbox · Tomorrow 9am', undo: true });
  });

  it('a toast with no undo is left exactly as written', () => {
    expect(toastParts('Priority: high')).toEqual({ line: 'Priority: high', undo: false });
  });

  it('Z mentioned in the middle is the toast explaining, not a key to draw', () => {
    const t = 'Press Z to undo it, or E to close it until something else stops.';
    expect(toastParts(t)).toEqual({ line: t, undo: false });
  });

  it('the clause with no separator before it is not taken', () => {
    // Without the middle dot it is part of a sentence, not a tail.
    expect(toastParts('Nothing left. Z to undo')).toEqual({ line: 'Nothing left. Z to undo', undo: false });
  });
});
