import fs from 'node:fs';

const WAITS_MS = [15, 30, 60, 120, 240];
const HELD_OPEN = new Set(['EPERM', 'EACCES', 'EBUSY']);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export interface ReplaceFileHow {
  platform?: NodeJS.Platform;
  rename?: (from: string, to: string) => void;
  pause?: (ms: number) => void;
}

/**
 * Renames `from` over `to`. On Windows a rename over a file another program
 * has open (an antivirus scan, the search indexer, a sync tool) fails until
 * that program lets go, so this tries again for about half a second. It never
 * deletes the target first, because a crash in between would lose it.
 * Pinned by tests/on-windows-a-file-something-is-reading-is-still-replaced.test.mts.
 */
export function replaceFileSync(from: string, to: string, { platform = process.platform, rename = fs.renameSync, pause = sleepSync }: ReplaceFileHow = {}): void {
  if (platform !== 'win32') return rename(from, to);
  for (let attempt = 0; ; attempt++) {
    try {
      return rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (attempt >= WAITS_MS.length || !code || !HELD_OPEN.has(code)) throw err;
      pause(WAITS_MS[attempt]);
    }
  }
}
