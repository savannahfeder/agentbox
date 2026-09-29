// THE WATCH THAT NOTICES A CODEX CONVERSATION AND ASKS.
//
// A Codex conversation is asked about before it is imported, never imported
// silently. So every minute this reads the user's Codex conversations from this
// week, and for each one that runs in a folder one of the user's projects points
// at and has no row anywhere yet, it files the asking row in that project. It
// also keeps the rows the user said yes to current: when Codex
// writes another answer, the row's result follows it.
//
// A conversation in a folder no project points at gets no row here. It is
// still on the ⌘K import card, under a section that makes the project on the
// press, which is the card's own way of handling a new folder.
import { readCodexThreads } from './codex-threads.mjs';

export const CODEX_POLL_MS = 60_000;

export function scanCodex({ store, readThreads = readCodexThreads, now = Date.now() } = {}) {
  let threads = [];
  try { ({ threads } = readThreads({ now })); } catch { return { asked: 0, refreshed: 0, retold: 0, threads: 0 }; }
  const asked = store.askAboutCodexThreads(threads, { now });
  const refreshed = store.refreshCodexMirrors(threads, { now });
  const retold = store.refreshCodexAsks(threads, { now });
  return { asked, refreshed, retold, threads: threads.length };
}

export function startCodexWatch({ store, readThreads = readCodexThreads, pollMs = CODEX_POLL_MS, firstDelayMs = 8_000 } = {}) {
  const run = () => {
    try { scanCodex({ store, readThreads }); } catch (e) { console.warn('codex watch:', e?.message ?? e); }
  };
  const first = setTimeout(run, firstDelayMs);
  const timer = setInterval(run, pollMs);
  return {
    scanNow: run,
    stop: () => { clearTimeout(first); clearInterval(timer); },
  };
}
