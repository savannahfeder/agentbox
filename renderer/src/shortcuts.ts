// PURE. EVERY KEY AGENTBOX HAS, IN THE ORDER A PERSON MEETS THEM.
//
// A shortcuts page in settings, because onboarding a non-technical tester
// meant saying each key out loud, one at a time: the app had a switch for
// whether it WHISPERS its keys and no page anywhere that says what they are.
//
// WHY THIS IS A FILE AND NOT MARKUP IN THE COMPONENT. A page that prints a key
// the handler does not have is worse than no page at all — that is the rule
// `list-rules.ts` already keeps for the hint on a row, and the reason it holds
// even harder here is that a hint is read for a second and a reference page is
// believed. So the list is a value, and
// `tests/the-shortcuts-page-lists-keys-that-work.test.mjs` reads every entry
// below against the branch in App.tsx (or main/main.mjs, or Compose.tsx) that
// actually runs it. A key added here without a handler fails the suite.
//
// ONE SENTENCE A ROW, AND IT IS SHORT (w-1bc916a880). Every
// sentence here is now under seventy characters and the test enforces it. A row
// that wants a second idea becomes its own row, or it does not go on the page.
//
// AND NO KEY HIDES INSIDE A SENTENCE.
//
// HOW IT IS GROUPED, and it is not how the code is arranged. The code has one
// switch for the list, one branch for an open task, a chord block above both
// and a main-process handler under all of it. Nobody thinks in those. Four
// headings, and every key sits under the one that matches when she would want
// it: in your inbox, in a task you have opened, closing and scheduling and
// undoing, anywhere in the app.
//
// EVERY HEADING IS LITERAL AND THERE IS NO SUBHEADING AT ALL (w-1bc916a880,
// second round).
//
// The plainest point first: that heading named one of the two
// directions its own rows draw. Three of the four were figures of speech, and a
// figure of speech is a second thing to decode on a page whose only job is to
// be looked up. So a heading now says WHEN the keys under it work, in the words
// the app itself uses for those places, and the one group that cannot be named
// that way is named by what its keys do instead, because all four of its keys
// work in both places.
//
// What the three of them carried, and where it went:
//
//   "In Scheduled, E brings a task back instead of closing it." This was the
//   most confusing one. It is also the same class of thing as G, B and
//   the import letters below: a behaviour that only happens in one view. The
//   page's existing rule is that those stay off it, so this now obeys the rule
//   the rest of the file already kept.
//
// The two ↵ rows say what ↵ does when it does something.
//
//   "Anything without a key of its own is in ⌘K by name." The lede at the top
//   of the page already says this, so it was the same sentence twice.
//
// WHAT IS DELIBERATELY NOT HERE, so nobody adds it back as an oversight:
//
// ⌘1..4, for PRIORITY or for anything else. Priority was removed deliberately
// and that handler no longer fires. The chord then went to a section of the
// sidebar until 2026-10-02, and that is gone as well: Tab moves along the tabs
// now and is listed above.
//
//   Y, N and I on a row in the list. Real since w-9741ed0e0b, but they answer
//   a Codex conversation's import row and are dead on every other row in the
//   app. A reference page that lists a key which does nothing on nineteen
//   screens out of twenty teaches somebody that the app ignores them.
//
//   ⇥ inside the new task card, which changes the project it goes to. It is
//   gated to that one card, the card draws its projects where she can see
//   them, and it used to ride along inside the C row's sentence, which is the
//   fault the NO KEY HIDES INSIDE A SENTENCE block above is about.
//
//   ⇧⇥ in the reply box, which cycles Claude Code's permission modes. Real,
//   and it belongs to the reply box rather than to the app; it is also the one
//   key here that cannot be said without the word "permissions", and Settings
//   already has a whole group explaining those.
//
//   ⌘R, ⌘=, ⌘- and ⌘0. The Mac's own chords, answered in main.mjs so they work
//   over the game. Nobody needs to be taught reload and zoom.
//
// EVERY SENTENCE IS PLAIN. A tester does not know what a modal, a pane, a
// binary or a view is. No row uses a word the app does not print on screen
// somewhere she can see it. THE SIDEBAR ROW IS WHY THAT NOW MATTERS TWICE: it
// used to name the sections, "Inbox, Scheduled, In progress, Closed", and
// that went wrong in both halves. The real order is Inbox, In
// progress, Scheduled, Closed (`workspaceDestinations`), and Scheduled is
// drawn only when something is actually scheduled. A reference
// page that recites a list the sidebar can change goes stale without anybody
// touching it, so the row names no sections at all.

import { NAME } from '../../shared/product-name.mjs';
export interface Shortcut {
  /**
   * The caps, drawn in order. A chord is ONE cap ('⌘K', '⌘↵'), the way the
   *  walk already draws them, because ⌘ and K are not two keys to a reader.
   *
   *  AND THE HOVER HINT NO LONGER AGREES WITH THAT. ⌘J was drawn both ways on
   *  w-2f7fac6027, one cap per key won, because a single ⌘J cap looked
   *  condensed next to the usual way shortcuts are drawn. So
   *  `capsFor` in hint-plate.ts splits a chord into one cap per glyph, and this
   *  page does not. That is a real disagreement between two surfaces and it is
   *  left standing rather than quietly resolved: this is a reference page where
   *  a chord is read as one thing to press, and the hint is a label on a
   *  control she is pointing at. If the page ever looks condensed too,
   *  the fix is to take `capsFor` here, not to put one cap back there. */
  keys: string[];
  /**
   * The word set between two caps. Absent means they simply sit side by side,
   *  which is what ↑ ↓ means: both of them, either way. */
  join?: 'or' | 'to';
  /** What it does, in plain English. ONE sentence, under seventy characters. */
  what: string;
}

export interface ShortcutGroup {
  /** THE HEADING SAYS WHEN THE KEYS WORK, LITERALLY, AND IT IS THE ONLY PROSE
   *  A GROUP GETS. There is deliberately no note field: see the block above. */
  label: string;
  keys: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    // App.tsx, the `switch (e.key)` at the foot of the key handler: this is the
    // list with nothing open, which is where anybody starts.
    //
    // "IN YOUR INBOX", BECAUSE INBOX IS A WORD THE APP PRINTS AND TASK LIST IS
    // NOT (w-1bc916a880, third round).
    //
    // The mistake is worth naming because it is the same one
    // the round before was meant to fix. "Task list" was reached for to cover
    // the fact that these keys work in all four sidebar sections rather than
    // only the first, which is an accurate thing about the code and a phrase
    // nobody sees on a screen. Inbox is the first row of the
    // sidebar. The heading claims these keys work there; it does not claim they
    // work ONLY there, and one of its rows moves between the sections anyway.
    label: 'In your inbox',
    keys: [
      // case 'j': case 'J': case 'ArrowDown' → selected + 1
      { keys: ['J', '↓'], join: 'or', what: 'Move down the list.' },
      // case 'k': case 'K': case 'ArrowUp' → selected - 1
      { keys: ['K', '↑'], join: 'or', what: 'Move up the list.' },
      // case 'Enter' → setFocused(pointed)
      { keys: ['↵'], what: 'Open the task you are on.' },
      // App.tsx, `if (e.key === 'Tab')`: nextTab(stateTabOrder, view, shiftKey)
      // walks the tabs along the top of the inbox, both ways, wrapping. It
      // replaced ⌘1 to ⌘4 on 2026-10-02 (w-914b16eab6), which jumped through
      // the sidebar's sections before those became these tabs.
      { keys: ['tab', '⇧tab'], join: 'or', what: 'Move to the next tab along the top, or back one.' },
      // Escape in the focused branch: doc → task → list. In the list switch it
      // clears a selection and closes search.
      { keys: ['esc'], what: 'Go back one step: a file, then the task, then the list.' },
    ],
  },
  {
    // App.tsx, the `if (focused)` branch: a task open in front of her. NOT
    // "answering an agent" any more, because ⌘J opens its terminal and that is
    // not an answer; the heading says when the keys work, which is the scheme.
    label: 'In a task you have opened',
    keys: [
      // focused branch: 'r' → setModal('reply'); list switch: 'r' in the inbox
      { keys: ['R'], what: 'Write back to the agent.' },
      // Compose.tsx onKeyDown: (meta||ctrl) && Enter → send; Focus.tsx the same
      { keys: ['⌘↵'], what: 'Send what you have typed.' },
      // focused branch: ArrowDown / ArrowUp walk opts
      { keys: ['↑', '↓'], what: 'Move through the options an agent has offered.' },
      // focused branch: Enter sends optionSel. Its own row rather than a clause
      // at the end of the one above, so somebody scanning for ↵ finds it.
      { keys: ['↵'], what: 'Send the option you have selected.' },
      // focused branch: /^[1-9]$/ → pickOption(focused, Number(e.key))
      { keys: ['1', '9'], join: 'to', what: 'Pick an option by its number.' },
      // ⌘J, above the inInput gate in App.tsx: dispatches task-terminal-toggle,
      // and toasts "Open a task to use its terminal" when there is none
      // (w-ef92663cb1). It landed after this list last changed, so it was
      // missing here at first.
      { keys: ['⌘J'], what: 'Show or hide this task’s terminal.' },
      // threads/Summary.tsx, `useSummaryShortcut`: it listens in the capture
      // phase and stops the key there, so S belongs to the summary on a thread
      // that has one. It is under THIS heading and not the one below because it
      // is the one key in the app that works only inside an open thread.
      { keys: ['S'], what: 'Show or hide the summary.' },
    ],
  },
  {
    // The one group that cannot be named by WHERE she is, because all four of
    // its keys work both in the list and inside an open task. So it is named by
    // what the keys do, literally and in the order they are drawn.
    label: 'Closing, scheduling and undoing',
    keys: [
      // focused branch: 'e' → markDone. List switch: inbox → markDone,
      // snoozed → unsnooze. It never approves anything.
      { keys: ['E'], what: 'Close the task and take it out of your inbox.' },
      // focused branch and list switch: 'l' → openSnooze. IT WAS S UNTIL
      // 2026-10-01 AND THAT IS THE WHOLE OF WHY IT MOVED. S had come to mean
      // the summary inside a thread and still meant the schedule picker in the
      // list, so this page taught one letter for two different things and an
      // office manager testing the app met both inside a minute. One meaning
      // per letter: S is the summary, L is later.
      { keys: ['L'], what: 'Put the task off until a time you pick.' },
      // focused branch and list switch: 'z' → undo
      { keys: ['Z'], what: 'Undo the last thing you did.' },
      // (meta||ctrl) && 'a' && !inInput && !modal → tick the whole list
      { keys: ['⌘A'], what: 'Tick every task in the list. Press it again to untick.' },
    ],
  },
  {
    label: 'Anywhere in the app',
    keys: [
      // (meta||ctrl) && 'k' → the palette, above every other branch, and
      // forwarded from inside an open file by main.mjs as well.
      { keys: ['⌘K'], what: `The command bar: everything ${NAME} can do, by name.` },
      // 'n' in both branches → setModal('compose'). C does the same and is
      // left off: N is the default (w-fb9051e597).
      // "Threads", not tasks, since w-ec62ab6b38.
      { keys: ['N'], what: 'Start a new thread.' },
      // '/' above the focused branch → openSearch
      { keys: ['/'], what: 'Search your threads.' },
      // '\\' above the focused branch → togglePanel
      { keys: ['\\'], what: 'Show or hide the left sidebar.' },
      // main/main.mjs before-input-event: ⌘Y / ⌘N answer the oldest approval.
      // Its own card prints "⌘Y / ⌘N" beside Allow and Deny, so the words here
      // are the card's words. It lives under this heading rather than under an
      // open task because it is answered from anywhere at all.
      { keys: ['⌘Y', '⌘N'], join: 'or', what: 'Allow or deny a card asking to run something.' },
    ],
  },
];

/** Every cap drawn on the page, flattened. The test walks this. */
export function everyKey(groups: ShortcutGroup[] = SHORTCUTS): string[] {
  return groups.flatMap((g) => g.keys.flatMap((k) => k.keys));
}
