/** What a click on a link inside a file opened full screen does. */
export type FileLinkGoes = 'browser' | 'outside' | 'nowhere';

export function whereAFileLinkGoes(href: string): FileLinkGoes {
  const to = href.trim();
  if (/^https?:\/\//i.test(to)) return 'browser';
  // A path to another file; any other scheme (javascript:, mailto:) has nowhere here to go.
  if (!to || to.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(to)) return 'nowhere';
  return 'outside';
}
