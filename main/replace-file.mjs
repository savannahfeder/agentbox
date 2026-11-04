import fs from 'node:fs';

const WAITS_MS = [15, 30, 60, 120, 240];
const HELD_OPEN = new Set(['EPERM', 'EACCES', 'EBUSY']);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Renames `from` over `to`. On Windows a rename over a file another program
 * has open (an antivirus scan, the search indexer, a sync tool) fails until
 * that program lets go, so this tries again for about half a second. It never
 * deletes the target first, because a crash in between would lose it.
 * Pinned by tests/on-windows-a-file-something-is-reading-is-still-replaced.test.mjs.
 */
export function replaceFileSync(from, to, { platform = process.platform, rename = fs.renameSync, pause = sleepSync } = {}) {
  if (platform !== 'win32') return rename(from, to);
  for (let attempt = 0; ; attempt++) {
    try {
      return rename(from, to);
    } catch (err) {
      if (attempt >= WAITS_MS.length || !HELD_OPEN.has(err?.code)) throw err;
      pause(WAITS_MS[attempt]);
    }
  }
}
