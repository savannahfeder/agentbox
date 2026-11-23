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
//
// A chat Claude Code says is at work has not gone quiet, however long it has
// written nothing, and one stopped on a question or a permission prompt in its
// own window is waiting on you, which its transcript does not say.
import { productsForThread } from '../shared/codex-import.mts';
import type { CodexThreadLike } from '../shared/codex-import.mts';
import { isShared } from '../shared/team-rules.mts';
import { appSessionFolders } from './agent-homes.mts';
import type { HomesSupervisor } from './agent-homes.mts';
import { outsideAgentsMode } from './settings.mts';
import type { SettingsConfig } from './settings.mts';
import { claudeSessionState } from './claude-session-open.mts';
import type { ClaudeSessionState } from './claude-session-open.mts';
import { atWork, stoppedOn } from './chat-follow.mts';
import { readCodexThreadsOffThread } from './chat-reader.mts';
import { readRecentThreads } from './importable-threads.mts';
import { readChatTurn } from './agent-sessions.mts';
import type { ChatEntry } from './agent-sessions.mts';

export const NEW_CHATS_POLL_MS = 60_000;
/** How long a chat has to have been still before it comes in. */
export const QUIET_MS = 10 * 60_000;
/** And one stopped on a question or a permission prompt, which nobody is at. */
export const STOPPED_QUIET_MS = 2 * 60_000;
const PASS_DEADLINE_MS = 90_000;

export interface NewChatThread extends CodexThreadLike { source?: string; waiting?: boolean; stoppedOn?: string; openIn?: string; path?: string; entries?: ChatEntry[] }

type StateOf = (t: NewChatThread) => ClaudeSessionState | null;

export interface NewChatProduct {
  slug: string;
  repoPath?: string | null;
  team?: { projectId?: string; sharedBy?: string | null } | null;
}

export type NewChatsConfig = SettingsConfig;

export interface NewChatsStore {
  listProducts(): NewChatProduct[];
  listItems(): { labels?: unknown[] }[];
  importThreadRows(slug: string, list: NewChatThread[], opts: { now: number; land: string }): { added: number };
  importCodexThreads(slug: string, list: NewChatThread[], opts: { now: number; land: string }): { added: number };
}

export type ReadThreads = (opts: { days: number; since: number; folders: string[]; now: number }) => Promise<NewChatThread[]> | NewChatThread[];

function idsWithRows(items: { labels?: unknown[] }[] | null | undefined) {
  const ids = new Set<string>();
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
export function newChatsToBring(
  threads: NewChatThread[] | null | undefined,
  { products, items, since, now, isOpen = () => false, stateOf = () => null, openShownLive = false }: {
    products: NewChatProduct[];
    items?: { labels?: unknown[] }[];
    since: number;
    now: number;
    isOpen?: (t: NewChatThread) => boolean;
    stateOf?: StateOf;
    openShownLive?: boolean;
  },
): Map<string, NewChatThread[]> {
  const had = idsWithRows(items);
  const bySlug = new Map<string, NewChatThread[]>();
  for (const t of threads ?? []) {
    const id = String(t?.id ?? '').trim();
    if (!id || had.has(id)) continue;
    if (!(Number(t.startedAt) > since)) continue;
    const quiet = now - Number(t.when ?? 0);
    if (quiet < STOPPED_QUIET_MS) continue;
    if (t.source === 'codex' ? t.live : openShownLive && isOpen(t)) continue;
    const slug = productsForThread(t, products)[0]?.slug;
    if (!slug) continue;
    const state = t.source === 'codex' ? null : stateOf(t);
    if (atWork(state)) continue;
    const on = stoppedOn(state);
    if (on === null && quiet < QUIET_MS) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(on === null ? t : { ...t, waiting: true, stoppedOn: on, openIn: state?.folder });
    had.add(id);
  }
  return bySlug;
}

export interface ScanNewChatsOptions {
  store: NewChatsStore;
  config?: NewChatsConfig | null;
  readThreads: ReadThreads;
  isOpen: (t: NewChatThread) => boolean;
  stateOf?: StateOf;
  now?: number;
}

export async function scanNewChats({ store, config, readThreads, isOpen, stateOf, now = Date.now() }: ScanNewChatsOptions): Promise<{ brought: number }> {
  if (config?.importNew !== true) return { brought: 0 };
  const since = Number(config.importNewSince) || now;
  // Only as far back as the switch, and never further than the import card reads.
  const days = Math.min(10, Math.max(1, Math.ceil((now - since) / 86400e3) + 1));
  // Never a project shared with a team: teammates would read chats nobody chose to share.
  const products = store.listProducts().filter((p) => !isShared(p));
  const folders = products.map((p) => p.repoPath).filter(Boolean) as string[];
  const threads = await readThreads({ days, since, folders, now });
  // An open session already has its own row when "Show while they run" is on.
  const openShownLive = outsideAgentsMode(config) !== 'off';
  const picks = newChatsToBring(threads, { products, items: store.listItems(), since, now, isOpen, stateOf, openShownLive });
  let brought = 0;
  for (const [slug, list] of picks) {
    const whole = list.map((t) => (t.source === 'codex' || !t.path ? t : { ...t, entries: readChatTurn(t.path)?.entries }));
    brought += store.importThreadRows(slug, whole, { now, land: 'sorted' }).added;
    brought += store.importCodexThreads(slug, list, { now, land: 'sorted' }).added;
  }
  return { brought };
}

export interface NewChatsTiming {
  everyMs?: number;
  firstDelayMs?: number;
  deadlineMs?: number;
  log?: (...args: unknown[]) => void;
}

export function startNewChatsWatch({
  store, config, readThreads, isOpen, stateOf,
  everyMs = NEW_CHATS_POLL_MS, firstDelayMs = 30_000, deadlineMs = PASS_DEADLINE_MS, log = console.warn,
}: ScanNewChatsOptions & NewChatsTiming) {
  // One pass at a time, and a pass that never answers is given up on so the
  // next one still runs.
  let running: Promise<unknown> | null = null;
  const run = () => {
    if (running) return running;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(deadlineMs / 1000)}s`)), deadlineMs);
    });
    running = Promise.race([scanNewChats({ store, config, readThreads, isOpen, stateOf }), deadline])
      .catch((e) => log('new chats watch:', e?.message ?? e))
      .finally(() => { clearTimeout(timer!); running = null; });
    return running;
  };
  const first = setTimeout(run, firstDelayMs);
  const timer = setInterval(run, everyMs);
  return {
    scanNow: run,
    stop: () => { clearTimeout(first); clearInterval(timer); },
  };
}

/** The watch as the app runs it, on the desktop (main/main.mts) and in the browser copy (bin/agentbox.mjs). */
export function watchNewChatsFor({ store, config, supervisor, ...timing }: { store: NewChatsStore; config: NewChatsConfig | null | undefined; supervisor: HomesSupervisor | null | undefined } & NewChatsTiming) {
  const stateOf: StateOf = (t) => claudeSessionState(t.id, appSessionFolders({ config, supervisor }).dirs);
  return startNewChatsWatch({
    store,
    config,
    readThreads: (opts) => readRecentThreads({ ...opts, config, supervisor, readCodex: readCodexThreadsOffThread }),
    isOpen: (t) => stateOf(t) !== null,
    stateOf,
    ...timing,
  });
}
