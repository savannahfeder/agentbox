// Types for shared/project-folder-check.mjs, which is plain ESM so that main
// (Node) and the renderer (Vite) can share one copy of the rule.

export interface FolderVerdict {
  ok: boolean;
  /** Why it was turned down. For tests and the log; never put on a screen. */
  reason?: 'home' | 'guarded' | 'system' | 'volume';
  /** The sentence to show as it stands, when `ok` is false. */
  say?: string;
}

export const GUARDED: string[];

export function checkProjectFolder(
  folder: string | null | undefined,
  opts?: { home?: string },
): FolderVerdict;

export function proposeParent(
  existing?: string[],
  opts?: { home?: string },
): string;
