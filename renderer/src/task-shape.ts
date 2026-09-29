// WHAT SHAPE AN OPENED TASK IS —, round three.
//
// So the bar coming off an opened task is settled in direction and the SHAPE
// underneath it is not, and the four things she listed are four questions
// about one box: what sits at the top, how tall it is, how wide the words run,
// and whether the whole thing is a card on a ground or the window itself.
//
// This is a TWEAK in the sense tweaks.ts means it: a name, a storage key, an
// attribute on <html> and a list of options, alive only until she picks. It is
// deliberately NOT in TWEAKS itself, because that registry's dock is not
// mounted in App and this question needs to be shootable from a script rather
// than clicked. WHEN SHE PICKS ONE, this file and every option but hers are
// deleted in the same session and the winner becomes the plain rule in
// styles.css (her standing rule on option sets).
//
// NOTHING HERE TOUCHES THE ESCAPE. It is off an opened task and it stays off
// (her second answer on this row, 13:5x), and no shape below draws one.

export type TaskShape = 'plain' | 'line' | 'edge' | 'card' | 'wide' | 'header';

export interface TaskShapeOption {
  id: TaskShape;
  // What she would call it out loud. No metaphor, no jargon.
  label: string;
  // One line: what it does, not what it evokes.
  note: string;
}

// The strip an opened task has instead of the bar is 34 points and that floor
// is not a taste call: macOS paints close, minimise and zoom over the window's
// own top-left corner at y 10..23, and the strip is the only -webkit-app-region
// drag surface left on the screen. `edge` below does not delete the drag, it
// stops DRAWING it and lets the words run under it, which is only safe because
// the reading column starts hundreds of points to the right of the buttons.
export const SHAPES: readonly TaskShapeOption[] = [
  { id: 'plain', label: 'Nothing up there', note: 'A 34 point strip with nothing in it, and the task starts under it. This is what is on the branch now.' },
  { id: 'line', label: 'The row’s own line up top', note: 'The product, the kind and the age move up into the strip, and the line under the title goes. The title starts 23 points higher.' },
  { id: 'edge', label: 'No strip at all', note: 'The task begins at the very top of the window. You can still drag the window by the same band, it is just not drawn.' },
  { id: 'card', label: 'The task on a card', note: 'The same 3 point corner and 22 point padding the inbox card has, so the task is an object on the ground rather than the window.' },
  { id: 'wide', label: 'The words take the width', note: 'The reading column goes from 780 to 980 points and centres in the space it actually has.' },
  { id: 'header', label: 'A real header', note: 'A 56 point band carrying the title and the age, and the big title in the body goes. The header stays while you scroll.' },
];

export const TASK_SHAPE_KEY = 'zero.taskShape';
export const TASK_SHAPE_ATTR = 'data-task-shape';
export const DEFAULT_SHAPE: TaskShape = 'plain';

// An unreadable stored value is no preference, not a seventh shape: a typo in a
// settings file must not be able to leave the window wearing an attribute that
// nothing in the stylesheet answers.
export function resolveTaskShape(stored: string | null | undefined): TaskShape {
  return SHAPES.some((s) => s.id === stored) ? (stored as TaskShape) : DEFAULT_SHAPE;
}

export function applyTaskShape(
  shape: TaskShape,
  root: { setAttribute(k: string, v: string): void } = document.documentElement,
): void {
  root.setAttribute(TASK_SHAPE_ATTR, shape);
}
