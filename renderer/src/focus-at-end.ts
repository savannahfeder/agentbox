// R MEANS "BACK TO TYPING" EVEN WHEN THE BOX IS ALREADY THERE (w-326fb83c0e).
// Escape in a box holding a draft keeps the box and takes the caret out, and
// the dock focuses itself when it MOUNTS, so pressing R on a box that never
// unmounted was a dead key. Nothing else in the window knows where that box is,
// hence the one class name; it is the dock's own input in both its forms.
type Box = { focus: () => void; value?: string; setSelectionRange?: (from: number, to: number) => void };
export function focusTheReplyBox(root: { querySelector: (sel: string) => Box | null } = document) {
  const box = root.querySelector('.dock-input');
  if (!box) return false;
  box.focus();
  if (typeof box.value === 'string' && box.setSelectionRange) box.setSelectionRange(box.value.length, box.value.length);
  return true;
}

/** A box that opens holding words opens with the caret after them: Chrome's focus() leaves it where they begin. */
export function focusAtEnd(box: { focus: () => void; value: string; setSelectionRange: (from: number, to: number) => void } | null) {
  if (!box) return;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}
