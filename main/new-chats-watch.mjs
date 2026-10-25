// NEW CHATS COME IN ON THEIR OWN, when somebody ticked "Keep bringing in new
// chats from Claude Code and Codex" on setup's last screen or turned it on in
// Settings (`importNew`, from the moment `importNewSince`).
//
// A chat comes in when it was started after that moment, in a folder one of
// the projects points at, and has gone quiet. Claude Code may still have it
// open: people leave it open for hours, and a reply here to an open chat
// carries on a copy (Supervisor#importedThreadFor). It is filed the way setup
// files one: waiting on you to Needs you, finished to Done. Nothing asks about
// a chat first; asking rows are what the old Codex watch was removed for.
import { productsForThread } from '../shared/codex-import.mjs';
import { isShared } from '../shared/team-rules.mjs';
import { appSessionFolders } from './agent-homes.mjs';
import { outsideAgentsMode } from './settings.mjs';
import { claudeSessionOpen } from './claude-session-open.mjs';
import { readCodexThreadsOffThread } from './codex-threads.mjs';
import { readRecentThreads } from './importable-threads.mjs';

export const NEW_CHATS_POLL_MS = 60_000;
/** How long a chat has to have been still before it comes in. */
export const QUIET_MS = 10 * 60_000;
const PASS_DEADLINE_MS = 90_000;

function idsWithRows(items) {
  const ids = new Set();
  for (const item of items ?? []) {
    for (const label of item?.labels ?? []) {
      if (typeof label !== 'string') continue;
      if (label.startsWith('thread:')) ids.add(label.slice(7));
      else if (label.startsWith('codex:')) ids.add(label.slice(6));
    }
  }
  return ids;
}

/** Which of `threads` come in now, grouped by the project each lands in. */
export function newChatsToBring(threads, { products, items, since, now, isOpen = () => false, openShownLive = false }) {
  const had = idsWithRows(items);
  const bySlug = new Map();
  for (const t of threads ?? []) {
    const id = String(t?.id ?? '').trim();
    if (!id || had.has(id)) continue;
    if (!(Number(t.startedAt) > since)) continue;
    if (now - Number(t.when ?? 0) < QUIET_MS) continue;
    if (t.source === 'codex' ? t.live : openShownLive && isOpen(t)) continue;
    const slug = productsForThread(t, products)[0]?.slug;
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(t);
    had.add(id);
  }
  return bySlug;
}

export async function scanNewChats({ store, config, readThreads, isOpen, now = Date.now() }) {
  if (config?.importNew !== true) return { brought: 0 };
  const since = Number(config.importNewSince) || now;
  // Only as far back as the switch, and never further than the import card reads.
  const days = Math.min(10, Math.max(1, Math.ceil((now - since) / 86400e3) + 1));
  // Never a project shared with a team: teammates would read chats nobody chose to share.
  const products = store.listProducts().filter((p) => !isShared(p));
  const folders = products.map((p) => p.repoPath).filter(Boolean);
  const threads = await readThreads({ days, since, folders, now });
  // An open session already has its own row when "Show while they run" is on.
  const openShownLive = outsideAgentsMode(config) !== 'off';
  const picks = newChatsToBring(threads, { products, items: store.listItems(), since, now, isOpen, openShownLive });
  let brought = 0;
  for (const [slug, list] of picks) {
    brought += store.importThreadRows(slug, list, { now, land: 'sorted' }).added;
    brought += store.importCodexThreads(slug, list, { now, land: 'sorted' }).added;
  }
  return { brought };
}

export function startNewChatsWatch({
  store, config, readThreads, isOpen,
  everyMs = NEW_CHATS_POLL_MS, firstDelayMs = 30_000, deadlineMs = PASS_DEADLINE_MS, log = console.warn,
}) {
  // One pass at a time, and a pass that never answers is given up on so the
  // next one still runs.
  let running = null;
  const run = () => {
    if (running) return running;
    let timer = null;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(deadlineMs / 1000)}s`)), deadlineMs);
    });
    running = Promise.race([scanNewChats({ store, config, readThreads, isOpen }), deadline])
      .catch((e) => log('new chats watch:', e?.message ?? e))
      .finally(() => { clearTimeout(timer); running = null; });
    return running;
  };
  const first = setTimeout(run, firstDelayMs);
  const timer = setInterval(run, everyMs);
  return {
    scanNow: run,
    stop: () => { clearTimeout(first); clearInterval(timer); },
  };
}

/** The watch as the app runs it, on the desktop (main/main.mjs) and in the browser copy (bin/agentbox.mjs). */
export function watchNewChatsFor({ store, config, supervisor, ...timing }) {
  return startNewChatsWatch({
    store,
    config,
    readThreads: (opts) => readRecentThreads({ ...opts, config, supervisor, readCodex: readCodexThreadsOffThread }),
    isOpen: (t) => claudeSessionOpen(t.id, appSessionFolders({ config, supervisor }).dirs),
    ...timing,
  });
}
