// PURE. Where a click on a link in a thread takes it.
import { opensInPane } from './doc-pane';
import { opensAsPicture } from './picture-view';
import { isLocalPreview } from './artifact-layout';

export type LinkClick = { metaKey?: boolean; ctrlKey?: boolean };

/**
 * `outside` is your browser for an address and the app that owns the file for
 * a file, which for a page is the browser too.
 */
export type LinkGoes = 'picture' | 'pane' | 'outside';

/** ⌘-click on a Mac, Ctrl-click on Linux: a browser's "open in a new tab". */
export function asksForANewTab(click: LinkClick = {}): boolean {
  return !!(click.metaKey || click.ctrlKey);
}

export function whereALinkGoes(href: string, click: LinkClick = {}, { pane = true }: { pane?: boolean } = {}): LinkGoes {
  if (asksForANewTab(click)) return 'outside';
  if (opensAsPicture(href)) return 'picture';
  if (pane && (opensInPane(href) || isLocalPreview(href))) return 'pane';
  return 'outside';
}
