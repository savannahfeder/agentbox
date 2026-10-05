// THE NAME IN THE THREAD BAR, CUT TO SIZE (w-922f66bb06).
//
// While the summary is open the thread's bar is one line, "NEEDS YOU / THE
// NAME", in mono capitals (Summary.tsx ThreadCrumb). Her limit, from full-screen
// drawings at 32, 59, 75 and 140 letters: whole words up to the medium length,
// 59. Past that the name keeps whole words only, drops a small word left
// dangling at the end ("for", "so"), and ends in an ellipsis, so it always
// reads as a phrase and never as a sentence chopped mid-word. The whole name
// stays one hover away on the crumb's title.

/** The longest name the bar shows whole, in letters. Her approved medium length. */
export const CRUMB_NAME_MAX = 59;

const SMALL = new Set(['a', 'an', 'the', 'for', 'to', 'of', 'on', 'in', 'at', 'and', 'or', 'but', 'so', 'by', 'with', 'from', 'before', 'after', 'until', 'it', 'as', 'is']);

/** The thread's name as the bar shows it. */
export function crumbName(title: string, max: number = CRUMB_NAME_MAX): string {
  const name = (title ?? '').replace(/\s+/g, ' ').trim();
  if (name.length <= max) return name;
  const kept: string[] = [];
  for (const word of name.split(' ')) {
    if ([...kept, word].join(' ').length > max) break;
    kept.push(word);
  }
  // One word longer than the whole limit: cut it, rather than show nothing.
  if (!kept.length) return `${name.slice(0, max)}…`;
  while (kept.length > 1 && SMALL.has(kept[kept.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) kept.pop();
  return `${kept.join(' ').replace(/[,;:.\-–]+$/, '')}…`;
}
