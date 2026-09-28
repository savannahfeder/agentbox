// IS THE RUNNING APP THE APP ON DISK?
//
// Electron reads main/*.mjs once, at boot. Every fix to the supervisor, the IPC
// surface or the preload is therefore invisible until a restart, and nothing on
// screen said which build was running. That cost real hours three times in two
// days (2026-08-07 to 08-11): the app ran for 2d22h while four main-process
// fixes landed on disk beneath it, and the last of those was a correction to a
// bug that was actively stopping her agents. Each time the code was right, the
// tests were green, it was pushed, and none of it was running.
//
// Worse than merely stale: ⌘R reloads the RENDERER only. So a reload picks up
// new UI against an old main process, and a renderer that calls an IPC handler
// its main process has never heard of fails silently. That exact mismatch was
// one keystroke away on 2026-08-10 (the palette's resume-any-row calling
// zero:resume-items against a main process without the handler).
//
// So the app checks itself, continuously rather than at boot, because the
// staleness develops WHILE it runs: it rides the snapshot the renderer already
// polls, and says plainly that a restart, not a reload, is what is needed.

import fs from 'node:fs';
import path from 'node:path';

// When this module was first imported, which is when the main process read its
// code. Every file below is compared against it.
export const BOOTED_AT = Date.now();

// Everything the MAIN process holds in memory from boot. The renderer is
// deliberately absent: it reloads with ⌘R, so it is never the thing a restart
// is needed for, and listing it here would cry wolf on every rebuild.
const WATCHED_DIRS = ['main', 'shared'];
const WATCHED_FILES = ['preload.cjs'];

// PURE, and the whole rule: a file written after the process read it is code
// that exists and is not running.
export function changedSinceBoot(bootedAt, files) {
  return files
    .filter((f) => Number.isFinite(f.mtimeMs) && f.mtimeMs > bootedAt)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((f) => f.name);
}

function listWatched(appDir) {
  const found = [];
  for (const rel of WATCHED_FILES) {
    try { found.push({ name: rel, mtimeMs: fs.statSync(path.join(appDir, rel)).mtimeMs }); } catch {}
  }
  for (const dir of WATCHED_DIRS) {
    let entries = [];
    try { entries = fs.readdirSync(path.join(appDir, dir), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !/\.(mjs|cjs|js)$/.test(e.name)) continue;
      try {
        found.push({ name: `${dir}/${e.name}`, mtimeMs: fs.statSync(path.join(appDir, dir, e.name)).mtimeMs });
      } catch {}
    }
  }
  return found;
}

// Cached: the snapshot is polled every ten seconds and pushed on every store
// change, and this is a disk walk. Staleness is not urgent to the second.
let cache = { at: 0, value: null };
const TTL_MS = 15_000;

export function restartNeeded(appDir, bootedAt = BOOTED_AT, now = Date.now()) {
  if (cache.value !== undefined && now - cache.at < TTL_MS) return cache.value;
  const files = changedSinceBoot(bootedAt, listWatched(appDir));
  const value = files.length ? { files, since: bootedAt } : null;
  cache = { at: now, value };
  return value;
}

export function _resetCacheForTests() {
  cache = { at: 0, value: null };
}
