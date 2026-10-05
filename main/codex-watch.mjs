// THE WATCH THAT KEEPS AN IMPORTED CODEX CONVERSATION CURRENT.
//
// Every minute this reads the user's recent Codex conversations and, for each
// one they already brought in, makes the row follow Codex: when Codex writes
// another answer, the row's result follows it. An asking row filed before this
// change is kept true the same way.
//
// IT NO LONGER ASKS ABOUT NEW ONES (w-db6f5e331e, 2026-10-05). It used to file
// an "Import into ...?" row for every new conversation in a project's folder.
// The founder, before launch: "after onboarding for both anthropic and openai
// harnesses, it should only import on command, not continuously". Importing is
// now the walk's last card and ⌘K import, for Claude Code and Codex alike.
import { readCodexThreads } from './codex-threads.mjs';

export const CODEX_POLL_MS = 60_000;

export function scanCodex({ store, readThreads = readCodexThreads, now = Date.now() } = {}) {
  let threads = [];
  try { ({ threads } = readThreads({ now })); } catch { return { refreshed: 0, retold: 0, threads: 0 }; }
  const refreshed = store.refreshCodexMirrors(threads, { now });
  const retold = store.refreshCodexAsks(threads, { now });
  return { refreshed, retold, threads: threads.length };
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
