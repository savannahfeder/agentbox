// PURE. WHAT STANDS BETWEEN "DISCARD THE CHANGE" AND THE DISCARD (F-84).
//
// On the QA box a thread was opened and "2 Discard the change" clicked: the
// reply went at once, the view moved on to the next thread, and the pointer
// that had not moved came to rest on that thread's "1 Ship it". Every other
// option in the strip sends words or closes a row, and Z takes both back. This
// one ends as `git checkout --` in a folder and nothing brings that back.
//
// So it asks, in the strip the close question already uses
// (./close-asks-first.ts) and answered by the same keys. KEEPING IT SITS ON
// NUMBER 2, the number the discard was picked with, so the press repeated by
// habit is the safe one. App.tsx raises it and `answerCloseAsk` does what the
// answer says; this is only the words.
//
// AND NO `esc` ROW UNDER IT. A close question needs one, because its two
// options both close and leaving the thread open is a third answer. Here
// option 2 IS that answer, and a row saying it again is the same thing twice.
// Escape still works; it is the keys that answer, not the row.
import type { CloseAsk, CloseOption } from './close-asks-first';

export function discardAsk(): CloseAsk {
  return {
    ask: 'Discard the change?',
    options: [
      { n: 1, text: 'Discard it', recommended: false, act: 'discard' } as CloseOption,
      { n: 2, text: 'Keep it', recommended: true, act: 'keep' } as CloseOption,
    ],
  };
}
