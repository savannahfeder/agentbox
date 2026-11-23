// PURE. A file or picture opened big hears every key before the app does
// (ArtifactView, PictureView, FileSheet), so it asks these before taking one.

/** N starts a thread wherever no box takes the letter, as on every other page. */
export const startsAThread = ({ key, chord, inABox }: { key: string; chord: boolean; inABox: boolean }): boolean =>
  !chord && !inABox && (key === 'n' || key === 'N');

export function typesInto(target: unknown): boolean {
  const el = target as { matches?: (s: string) => boolean; isContentEditable?: boolean } | null;
  return typeof el?.matches === 'function' && (el.matches('textarea, input, select') || !!el.isContentEditable);
}

type Doc = { querySelector: (s: string) => unknown };

/** The new thread box N opens, which then draws over the view. */
export const composerIsOpen = (doc: Doc): boolean => !!doc.querySelector('.tc-veil');

export function pressedInTheComposer(target: unknown): boolean {
  const closest = (target as { closest?: (s: string) => unknown } | null)?.closest;
  return typeof closest === 'function' && !!closest.call(target, '.tc-veil');
}

export const aBigViewIsOpen = (doc: Doc): boolean => !!doc.querySelector('.artifact-view, .picture-view, .file-sheet');
