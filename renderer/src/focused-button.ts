/** Enter or Space on a button the keyboard focused is that button's to press:
 * a window listener that calls preventDefault on it cancels the button's own
 * click. Focus left on a button by a mouse click does not count, so Enter
 * still takes the lit row after somebody clicked Back. */
export function enterIsTheButtons(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  const t = e.target as Element | null;
  const button = t && typeof t.closest === 'function' ? t.closest('button') : null;
  return !!button && button.matches(':focus-visible');
}
