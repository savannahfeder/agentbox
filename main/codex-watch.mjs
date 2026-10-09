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
//
// IT IS ALSO WHERE A CODEX AGENT IS NOTICED (w-1116fbb68a, 2026-10-08). It is
// the one thing in the app that already knows a person's Codex conversations,
// and it reads them on a timer rather than on the snapshot, which is what makes
// it the right place: see `noticeCodexAgents` below.
import { readCodexThreads } from './codex-threads.mjs';

export const CODEX_POLL_MS = 60_000;

/**
 * HOW LONG AFTER ITS LAST WRITE A CODEX THREAD IS STILL AN AGENT THAT WAS SEEN.
 *
 *  A Claude Code session is a process, so `agent_seen` catches one that has sat
 *  open since earlier in the sitting (main/ipc.mjs, liveAgents). A Codex thread
 *  leaves no process behind: `isLive` is two minutes of file mtime, so counting
 *  only live threads would notice a Codex user ONLY when this watch's minute
 *  happened to land while they were typing. An hour is one sitting, which is
 *  the span the Claude read already covers without being asked to.
 *
 *  AND IT IS NOT A DAY. The reader hands over ten days of conversations, and
 *  counting those would say every install with Codex on it had an agent up on
 *  every day the app was opened, which is the opposite of the under-count this
 *  was added to fix.
 */
export const CODEX_SEEN_MS = 60 * 60_000;

/**
 * "AN AGENT WAS SEEN", FOR CODEX TOO (w-1116fbb68a, 2026-10-08).
 *
 *  `agent_seen` listed Claude Code processes and nothing else, and about a
 *  third of the people on this app are on Codex, so whether they had an agent
 *  at all was read off proxies: a run this app started, or a reply. The threads
 *  are already in hand once a minute for the mirror refresh, so this costs
 *  nothing beyond the comparison.
 *
 *  NOTHING ABOUT A THREAD IS SENT. Not its folder, not its title, not its id,
 *  which is only ever compared inside this process. `engine` is the whole of
 *  the payload and it is one of two fixed words.
 *
 *  ONCE PER THREAD PER RUN OF THE APP, for the reason the Claude side keeps a
 *  set: this reads the same conversations every minute, so without it one
 *  conversation would send an event a minute all day.
 */
export function noticeCodexAgents(threads, { count = null, seen = null, now = Date.now() } = {}) {
  if (typeof count !== 'function') return 0;
  let sent = 0;
  for (const t of threads ?? []) {
    const id = String(t?.id ?? '');
    if (!id) continue;
    const at = Number(t.lastActive ?? 0);
    if (!t.live && !(at > 0 && now - at < CODEX_SEEN_MS)) continue;
    if (seen) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    // A count is never worth the watch: the mirror refresh below is what
    // somebody actually sees, and it runs whatever the switch does.
    try { count('agent_seen', { engine: 'codex' }); } catch { /* nothing */ }
    sent += 1;
  }
  return sent;
}

export function scanCodex({ store, readThreads = readCodexThreads, now = Date.now(), count = null, seen = null } = {}) {
  let threads = [];
  try { ({ threads } = readThreads({ now })); } catch { return { refreshed: 0, retold: 0, threads: 0 }; }
  noticeCodexAgents(threads, { count, seen, now });
  const refreshed = store.refreshCodexMirrors(threads, { now });
  const retold = store.refreshCodexAsks(threads, { now });
  return { refreshed, retold, threads: threads.length };
}

export function startCodexWatch({ store, readThreads = readCodexThreads, pollMs = CODEX_POLL_MS, firstDelayMs = 8_000, count = null } = {}) {
  // Conversations this run has already counted. In memory on purpose, exactly
  // as the Claude side's set is: a fresh launch seeing the same conversation
  // again is a fresh fact about the app being used.
  const seen = new Set();
  const run = () => {
    try { scanCodex({ store, readThreads, count, seen }); } catch (e) { console.warn('codex watch:', e?.message ?? e); }
  };
  const first = setTimeout(run, firstDelayMs);
  const timer = setInterval(run, pollMs);
  return {
    scanNow: run,
    stop: () => { clearTimeout(first); clearInterval(timer); },
  };
}
