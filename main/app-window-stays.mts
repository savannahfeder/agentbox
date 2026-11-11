/**
 * Whether going to `next` would take the app's window off its own page. The
 * window has no address bar and no Back, so a page it is walked to is a page
 * nobody can leave.
 */
export function leavesTheApp(appUrl: string, next: string): boolean {
  let at: URL;
  let to: URL;
  try { at = new URL(appUrl); to = new URL(next); } catch { return true; }
  return at.protocol !== to.protocol || at.host !== to.host || at.pathname !== to.pathname;
}
