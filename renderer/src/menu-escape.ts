/**
 * While a menu is open, Escape closes it and goes no further, wherever focus
 * is. Taken in the capture phase because the caret can still be in the reply
 * box, whose own Escape folds or blurs the box. Returns the way to stop.
 */
export function escapeClosesMenu(
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  close: () => void,
): () => void {
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  };
  win.addEventListener('keydown', key, true);
  return () => win.removeEventListener('keydown', key, true);
}
