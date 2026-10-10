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
import fs from 'node:fs';
import { toastParts } from '../renderer/src/toast-parts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const rule = (sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? '';

// THE CARD SHE PICKED, out of fourteen drawn over four rounds: the task's
// title first, one quiet line under it with the keys on its right, bottom
// right of the window, and a thin orange timer along the foot ("that little
// orange timer that tells you how much time is left").
describe('the card she picked', () => {
  it('reads the task title first, then where it went', () => {
    const title = app.indexOf('{about && <span className="toast-title">{about.label || about.title}</span>}');
    const line = app.indexOf('<span className="toast-line">{line}</span>');
    expect(title).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(title);
    expect(rule('.toast')).toContain('grid-template-areas: "title title" "line keys";');
  });

  // "the placement of the toast is weird, too much padding from bottom
  // corner". At 56px it floated 34px inside the pane, whose edge is 22px in
  // from the window (measured on the built app at 1512x945). At 30px its
  // corner lands on the pane's own corner mark, which sits 8px in from the
  // pane's corner; 34 and 38 were tried and left the mark peeking out beside
  // it, which reads as a mistake.
  it('sits in the bottom right corner, on the pane\'s corner mark', () => {
    expect(rule('.toast')).toContain('right: 30px;');
    expect(rule('.toast')).toContain('bottom: 30px;');
  });

  it('is not back at the distance that read as too much padding', () => {
    expect(rule('.toast')).not.toContain('right: 56px;');
    expect(rule('.toast')).not.toContain('bottom: 56px;');
  });

  it('runs its timer only when there is something to run out', () => {
    // A toast that only announces something has nothing to open, so no timer.
    expect(app).toContain('{toast.goes && <span className="toast-clock" aria-hidden="true" style={{ animationDuration: `${TOAST_GOES_MS}ms` }} />}');
    expect(rule('.toast-clock')).toContain('background: var(--accent);');
    expect(rule('.toast-clock')).toContain('animation: toast-drain linear forwards;');
  });

  it('leaves nothing of the looks it was picked from', () => {
    // The ?toasts= switch and the hook that let the pictures be taken.
    expect(app).not.toContain('toastLook');
    expect(app).not.toContain('__showToast');
    // Only the toast's own looks: `data-look-switching` is the theme picker's.
    expect(css).not.toContain('.toast[data-look');
  });
});

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
