// Types for shared/referenced-files.mjs, which is plain ESM so that main (the
// spawn path's brief) and the renderer (her attachment row) share one copy of
// the rule about what counts as a file a message refers to.

// The last argument may be `{ dir }`, the product's own folder, which is what
// lets a path written out in full from the root be read as one of ours.
export function referencedFiles(
  ...texts: Array<string | null | undefined | { dir?: string | null }>
): string[];
export function fileLabel(path: string): { name: string; where: string };
export function isImagePath(path: string | null | undefined): boolean;
