// A CHAT BROUGHT IN FOLLOWS THE PLACE IT STARTED. Each is read where it lives,
// and its row follows it:
//   - typed to there, its agent at work: In progress, claimed under `HELD_IN`
//     (shared/carried-on-outside.mts);
//   - answered there: the answer is the row's, and it is back in Needs you;
//   - stopped there without an answer, or no longer watched: the claim is let
//     go, or its lease runs out, and it is in Needs you again.
// A reply here makes it this app's thread, and the follow lets go of it.
// Codex answers already reach the row (`refreshCodexMirrors`); for Codex this
// adds only the move out of Needs you, off what main/codex-watch.mts reads.
// Pinned by tests/a-chat-you-answer-in-the-terminal-leaves-your-inbox.
import path from 'node:path';
import fs from 'node:fs';
import { readChatTurn } from './agent-sessions.mts';
import type { ChatTurn } from './agent-sessions.mts';
import { claudeSessionStatus } from './claude-session-open.mts';
import { findTranscript } from './transcript-search.mts';
import { appSessionFolders } from './agent-homes.mts';
import type { HomesSupervisor } from './agent-homes.mts';
import { HELD_IN } from '../shared/carried-on-outside.mts';

export const FOLLOW_EVERY_MS = 30_000;
const PASS_DEADLINE_MS = 60_000;
/** How recently a chat with no session file must have been written to count as
 *  running: Claude Code's desktop app and older CLIs publish no status. */
export const FRESH_MS = 2 * 60_000;
const RUNNING = new Set(['busy', 'shell']);

export type ChatMove = { move: 'working' } | { move: 'answered'; said: string } | { move: 'stays' };

/** `knownAt` is when the row last heard from the chat (its result's time). */
export function whereTheChatIs(turn: ChatTurn | null, { running, knownAt }: { running: boolean; knownAt: number }): ChatMove {
  if (!turn) return { move: 'stays' };
  if (!turn.ended) return running ? { move: 'working' } : { move: 'stays' };
  if (turn.said && turn.saidAt > knownAt) return { move: 'answered', said: turn.said };
  return { move: 'stays' };
}

/** What you typed there since the row last heard from the chat, or ''. */
export function newWords(turn: { heard?: string; heardAt?: number } | null | undefined, heardThrough: number): string {
  return turn?.heard && (turn.heardAt ?? 0) > heardThrough ? turn.heard : '';
}

export interface FollowedChat {
  product: string;
  id: string;
  engine: 'claude' | 'codex';
  chat: string;
  knownAt: number;
  /** When the row last heard from either side of the chat. */
  heardThrough: number;
  /** The follow holds it now. */
  held: boolean;
  /** Still the follow's to move: open or held, not answered here, not shared. */
  follow: boolean;
}

export interface FollowStore {
  chatsToFollow(now?: number): FollowedChat[];
  chatSaidOutside(slug: string, id: string, words: string, opts?: { now?: number }): unknown;
  holdChatOutside(slug: string, id: string, holder: string, opts?: { now?: number }): Promise<unknown>;
  chatAnsweredOutside(slug: string, id: string, said: string, opts?: { now?: number }): unknown;
  letGoOfChat(slug: string, id: string, opts?: { now?: number }): unknown;
}

export interface CodexChatLike {
  id?: string; herTurnLast?: boolean; live?: boolean; herLast?: string; herLastAt?: number; turnOpen?: boolean | null; lastActive?: number;
}

/** A Codex turn this quiet is taken to have died, so the row comes back. */
export const CODEX_QUIET_MS = 10 * 60_000;

/** Codex is at work on what was typed to it. A rollout that marks no turns
 *  falls back to who wrote last, while it is still being written. */
export function codexWorking(t: CodexChatLike | null | undefined, now = Date.now()): boolean {
  if (!t) return false;
  if (t.turnOpen === true || t.turnOpen === false) return t.turnOpen && now - (t.lastActive ?? 0) < CODEX_QUIET_MS;
  return !!t.herTurnLast && !!t.live;
}

type Status = (sessionId: string, homes: string[]) => string | null;

// A transcript as last read, kept while its size and time are unchanged: most
// brought-in chats are not moving, and a busy one can be megabytes.
const kept = new Map<string, { size: number; mtimeMs: number; turn: ChatTurn | null }>();
const KEPT_MOST = 2000;

function turnOf(file: string): { turn: ChatTurn | null; mtimeMs: number } {
  let st: fs.Stats;
  try { st = fs.statSync(file); } catch { return { turn: null, mtimeMs: 0 }; }
  const was = kept.get(file);
  if (was && was.size === st.size && was.mtimeMs === st.mtimeMs) return { turn: was.turn, mtimeMs: st.mtimeMs };
  const turn = readChatTurn(file);
  kept.delete(file);
  kept.set(file, { size: st.size, mtimeMs: st.mtimeMs, turn });
  if (kept.size > KEPT_MOST) kept.delete(kept.keys().next().value!);
  return { turn, mtimeMs: st.mtimeMs };
}

/** Its transcript in any of these Claude data folders. A miss is looked for in
 *  the background (main/transcript-search.mts), so a later pass finds it. */
function claudeChatFile(sessionId: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    const file = findTranscript(path.join(dir, 'projects'), sessionId, null, { look: 'later' });
    if (file) return file;
  }
  return null;
}

async function move(store: FollowStore, c: FollowedChat, where: ChatMove, holder: string, now: number) {
  if (where.move === 'working') {
    const got = await store.holdChatOutside(c.product, c.id, holder, { now });
    return got && !c.held ? 1 : 0;
  }
  if (where.move === 'answered') {
    store.chatAnsweredOutside(c.product, c.id, where.said, { now });
    return 1;
  }
  if (c.held) {
    store.letGoOfChat(c.product, c.id, { now });
    return 1;
  }
  return 0;
}

export async function followClaudeChats(
  { store, dirs, now = Date.now(), status = claudeSessionStatus }: { store: FollowStore; dirs: string[]; now?: number; status?: Status },
) {
  let moved = 0;
  for (const c of store.chatsToFollow(now)) {
    if (c.engine !== 'claude') continue;
    if (!c.follow) {
      if (c.held) { store.letGoOfChat(c.product, c.id, { now }); moved += 1; }
      continue;
    }
    // Not found yet is looked for in the background; a hold meanwhile is left
    // to its lease rather than let go of mid-turn.
    const file = claudeChatFile(c.chat, dirs);
    if (!file) continue;
    const { turn, mtimeMs } = turnOf(file);
    const words = newWords(turn, c.heardThrough);
    if (words) store.chatSaidOutside(c.product, c.id, words, { now });
    const state = turn && !turn.ended ? status(c.chat, dirs) : null;
    const running = state ? RUNNING.has(state) : now - mtimeMs < FRESH_MS;
    moved += await move(store, c, whereTheChatIs(turn, { running, knownAt: c.knownAt }), HELD_IN.claude, now);
  }
  return { moved };
}

/** Your words from Codex, written before `refreshCodexMirrors` writes its
 *  answer to them, so the thread reads in the order it happened. */
export function noteCodexWords(
  { store, threads, now = Date.now() }: { store: FollowStore; threads: readonly CodexChatLike[]; now?: number },
) {
  const byId = new Map(threads.map((t) => [String(t?.id ?? ''), t]));
  let noted = 0;
  for (const c of store.chatsToFollow(now)) {
    if (c.engine !== 'codex' || !c.follow) continue;
    const t = byId.get(c.chat);
    const words = newWords({ heard: t?.herLast, heardAt: t?.herLastAt }, c.heardThrough);
    if (words) { store.chatSaidOutside(c.product, c.id, words, { now }); noted += 1; }
  }
  return noted;
}

/** Runs after `refreshCodexMirrors` has given each row Codex's latest answer. */
export async function followCodexChats(
  { store, threads, now = Date.now() }: { store: FollowStore; threads: readonly CodexChatLike[]; now?: number },
) {
  const byId = new Map(threads.map((t) => [String(t?.id ?? ''), t]));
  let moved = 0;
  for (const c of store.chatsToFollow(now)) {
    if (c.engine !== 'codex') continue;
    const working = c.follow && codexWorking(byId.get(c.chat), now);
    moved += await move(store, c, working ? { move: 'working' } : { move: 'stays' }, HELD_IN.codex, now);
  }
  return { moved };
}

export interface ChatFollowTiming {
  everyMs?: number;
  firstDelayMs?: number;
  deadlineMs?: number;
  log?: (...args: unknown[]) => void;
}

/** One pass at a time, Claude's on a timer and Codex's when the Codex watch has
 *  read, so two never claim the same row at once. A pass that never answers is
 *  given up on and the next one runs. */
export function startChatFollow(
  { store, dirs, status, everyMs = FOLLOW_EVERY_MS, firstDelayMs = 20_000, deadlineMs = PASS_DEADLINE_MS, log = console.warn }:
    { store: FollowStore; dirs: () => string[]; status?: Status } & ChatFollowTiming,
) {
  let chain: Promise<unknown> = Promise.resolve();
  let claudeQueued = false;
  const queue = (what: string, job: () => Promise<unknown>) => {
    chain = chain.then(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(deadlineMs / 1000)}s`)), deadlineMs);
      });
      return Promise.race([Promise.resolve().then(job), deadline])
        .catch((e) => log(`chat follow (${what}):`, e?.message ?? e))
        .finally(() => clearTimeout(timer!));
    });
    return chain;
  };
  const claude = () => {
    if (claudeQueued) return chain;
    claudeQueued = true;
    return queue('claude', () => {
      claudeQueued = false;
      return followClaudeChats({ store, dirs: dirs(), ...(status ? { status } : {}) });
    });
  };
  const first = setTimeout(claude, firstDelayMs);
  const timer = setInterval(claude, everyMs);
  return {
    followNow: claude,
    // Called before the Codex watch writes this read's answers: the words go
    // down now, and the moves after those answers.
    followCodex: (threads: readonly CodexChatLike[]) => {
      try { noteCodexWords({ store, threads }); } catch (e) { log('chat follow (codex words):', (e as Error)?.message ?? e); }
      return queue('codex', () => followCodexChats({ store, threads }));
    },
    stop: () => { clearTimeout(first); clearInterval(timer); },
  };
}

/** The follow as the app runs it, on the desktop (main/main.mts) and in the browser copy (bin/agentbox.mjs). */
export function followChatsFor(
  { store, config, supervisor, ...timing }:
    { store: FollowStore; config: { authProfiles?: string[] | string | null } | null | undefined; supervisor: HomesSupervisor | null | undefined } & ChatFollowTiming,
) {
  return startChatFollow({ store, dirs: () => appSessionFolders({ config, supervisor }).dirs, ...timing });
}
