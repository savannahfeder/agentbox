// A CHAT BROUGHT IN FOLLOWS THE PLACE IT STARTED. Each is read where it lives,
// and its row follows it:
//   - typed to there, its agent at work: In progress, claimed under `HELD_IN`
//     (shared/carried-on-outside.mts);
//   - answered there: the answer is the row's, and it is back in Needs you;
//   - stopped there on a question or a permission prompt: the row says so and
//     where, and it is back in Needs you;
//   - stopped there by you, or no longer watched: the claim is let go, or its
//     lease runs out, and it is in Needs you again;
//   - in Done, and typed to there since: back in Needs you once its agent waits
//     on an answer, as a chat coming in is filed.
// What was said there goes on the thread in order, each once, by the chat's own
// times. A reply here makes it this app's thread once a run of ours takes it up;
// until then the terminal is still the only agent it has.
// Codex answers already reach the row (`refreshCodexMirrors`); for Codex this
// adds the move out of Needs you and back from Done, off what
// main/codex-watch.mts reads.
// Pinned by tests/a-chat-you-answer-in-the-terminal-leaves-your-inbox,
// tests/an-agent-waiting-in-the-terminal-is-in-needs-you and
// tests/what-is-said-in-the-terminal-is-on-the-thread-in-order.
import path from 'node:path';
import fs from 'node:fs';
import { readChatTurn } from './agent-sessions.mts';
import type { ChatEntry, ChatTurn } from './agent-sessions.mts';
import { claudeSessionState } from './claude-session-open.mts';
import type { ClaudeSessionState } from './claude-session-open.mts';
import { findTranscript } from './transcript-search.mts';
import { appSessionFolders } from './agent-homes.mts';
import type { HomesSupervisor } from './agent-homes.mts';
import { HELD_IN, stoppedThere } from '../shared/carried-on-outside.mts';
import { howTheChatEnded } from '../shared/agent-import.mts';

export const FOLLOW_EVERY_MS = 10_000;
/** After a followed chat's session file changes, so its transcript is written too. */
const SOON_MS = 700;
const PASS_DEADLINE_MS = 60_000;
/** How recently a chat with no session file must have been written to count as
 *  running: Claude Code's desktop app and older CLIs publish no status. */
export const FRESH_MS = 2 * 60_000;
const RUNNING = new Set(['busy', 'shell']);

/** How long a chat in Done is read for, and how many of the newest: each is a
 *  file looked at on every pass. */
export const DONE_FOLLOWED_MS = 14 * 24 * 3600_000;
export const DONE_FOLLOWED_MOST = 200;

/** Its agent is at work, whatever its transcript has not yet written. */
export const atWork = (state: ClaudeSessionState | null | undefined) => !!state && RUNNING.has(state.status);
/** What it stopped on in its own window, or null. */
export const stoppedOn = (state: ClaudeSessionState | null | undefined) => (state?.status === 'waiting' ? state.waitingFor : null);
const stopLine = (state: ClaudeSessionState | null | undefined, replyWaits = false) => {
  const on = stoppedOn(state);
  return on === null ? null : stoppedThere(on, state?.folder, { replyWaits });
};

/** How far each side of the chat has been read onto the row. */
export interface ReadTo { heardThrough: number; knownAt: number }

/** What the row has not had yet, in the order it was said: your messages one by
 *  one, the agent's between them as one. */
export function notYetRead(turn: Pick<ChatTurn, 'entries'> | null, { heardThrough, knownAt }: ReadTo): ChatEntry[] {
  const out: ChatEntry[] = [];
  for (const e of turn?.entries ?? []) {
    if (e.at <= (e.who === 'you' ? heardThrough : knownAt)) continue;
    const last = out.at(-1);
    if (last && last.who === 'agent' && e.who === 'agent') Object.assign(last, { text: `${last.text}\n\n${e.text}`, at: e.at });
    else out.push({ ...e });
  }
  return out;
}

export type ChatMove = { move: 'working' } | { move: 'answered' } | { move: 'stopped'; stop: string } | { move: 'cut' } | { move: 'stays' };

/** `news` is that the agent has said something the row has not had; `cut` that
 *  you stopped it there since. */
export function whereTheChatIs(
  turn: Pick<ChatTurn, 'ended'> | null,
  { running, stop = null, news, cut = false }: { running: boolean; stop?: string | null; news: boolean; cut?: boolean },
): ChatMove {
  if (!turn) return { move: 'stays' };
  if (cut) return { move: 'cut' };
  if (turn.ended) return news ? { move: 'answered' } : { move: 'stays' };
  if (stop !== null) return { move: 'stopped', stop };
  return running ? { move: 'working' } : { move: 'stays' };
}

/** What a chat in Done now waits on: an answer its agent ended on a question
 *  for, or the line for one only its own window shows. Null for neither. */
export function asksNow(turn: ChatTurn, state: ClaudeSessionState | null): { stop: string | null } | null {
  if (turn.ended) return howTheChatEnded(turn.said).waiting ? { stop: null } : null;
  const stop = stopLine(state);
  return stop === null ? null : { stop };
}

/** What you typed there since the row last heard from the chat, or ''. */
export function newWords(turn: { heard?: string; heardAt?: number } | null | undefined, heardThrough: number): string {
  return turn?.heard && (turn.heardAt ?? 0) > heardThrough ? turn.heard : '';
}

export interface FollowedChat extends ReadTo {
  product: string;
  id: string;
  engine: 'claude' | 'codex';
  chat: string;
  /** Its project's own folder, where its transcript usually is. */
  folder: string | null;
  /** When it went to Done, 0 for one that is not there. */
  doneAt: number;
  /** A reply typed here waits for a run of ours. */
  replied: boolean;
  /** One went to its terminal, which has not said anything since. */
  told: boolean;
  /** The row already says its window closed, or that you stopped it there. */
  left: boolean;
  /** The follow holds it now. */
  held: boolean;
  /** Still the follow's to move: open, held or lately in Done, not taken up by a run here, not shared. */
  follow: boolean;
}

/** `ours` is that a run of this app has taken the row's chat up. */
export type Ours = (id: string) => boolean;

export interface FollowStore {
  chatsToFollow(now?: number, ours?: Ours): FollowedChat[];
  // `at` is the newest of the chat's own times this puts on the row.
  chatSaidOutside(slug: string, id: string, words: string, opts: { at: number; now?: number }): unknown;
  chatAgentSaid(slug: string, id: string, said: string, opts: { at: number; now?: number }): unknown;
  holdChatOutside(slug: string, id: string, holder: string, opts?: { now?: number }): Promise<unknown>;
  chatAnsweredOutside(slug: string, id: string, said: string, opts: { at: number; now?: number }): unknown;
  chatStoppedOutside(slug: string, id: string, stop: string, news: string, opts: { at: number; now?: number }): unknown;
  chatLeftOutside(slug: string, id: string, how: 'cut' | 'closed', news: string, opts: { at: number; now?: number }): unknown;
  chatAsksAgain(slug: string, id: string, since: ChatEntry[], stop: string | null, opts?: { now?: number }): unknown;
  letGoOfChat(slug: string, id: string, opts?: { now?: number }): unknown;
}

export interface CodexChatLike {
  id?: string; herTurnLast?: boolean; live?: boolean; herLast?: string; herLastAt?: number; turnOpen?: boolean | null; lastActive?: number;
  last?: string; saidAt?: number; waiting?: boolean;
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

type StateOf = (sessionId: string, homes: string[]) => ClaudeSessionState | null;

// The transcripts of chats whose Claude Code has published a session file: one with none now has closed.
const published = new Set<string>();
/** A window that says it is idle before its transcript does has this long to write it. */
const IDLE_FOR_MS = 5_000;

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

/** Its transcript in any of these Claude data folders. One found in none is
 *  looked for in the background (main/transcript-search.mts), so a later pass
 *  finds it; a chat in Done is not worth that search. */
function claudeChatFile(c: FollowedChat, dirs: string[]): string | null {
  const projects = dirs.map((dir) => path.join(dir, 'projects'));
  for (const at of projects) {
    const file = findTranscript(at, c.chat, c.folder, { look: 'never' });
    if (file) return file;
  }
  if (!c.doneAt) for (const at of projects) findTranscript(at, c.chat, c.folder, { look: 'later' });
  return null;
}

export async function followClaudeChats(
  { store, dirs, now = Date.now(), stateOf = claudeSessionState, ours, seen }:
    { store: FollowStore; dirs: string[]; now?: number; stateOf?: StateOf; ours?: Ours; seen?: Set<string> },
) {
  let moved = 0;
  for (const c of store.chatsToFollow(now, ours)) {
    if (c.engine !== 'claude') continue;
    seen?.add(c.chat);
    if (!c.follow) {
      if (c.held) { store.letGoOfChat(c.product, c.id, { now }); moved += 1; }
      continue;
    }
    // Not found yet is looked for in the background; a hold meanwhile is left
    // to its lease rather than let go of mid-turn.
    const file = claudeChatFile(c, dirs);
    if (!file) continue;
    const { turn, mtimeMs } = turnOf(file);
    if (!turn) continue;
    const state = turn.ended ? null : stateOf(c.chat, dirs);
    if (state?.status) published.add(file);
    if (c.doneAt) { moved += comeBack(store, c, turn, state, now); continue; }
    const fresh = notYetRead(turn, c);
    // The agent's words after your last are its turn's, written when that ends or stops.
    const tail = fresh.at(-1)?.who === 'agent' ? fresh.pop()! : null;
    for (const e of fresh) {
      if (e.who === 'you') store.chatSaidOutside(c.product, c.id, e.text, { at: e.at, now });
      else store.chatAgentSaid(c.product, c.id, e.text, { at: e.at, now });
    }
    // Your reply here is on its way to a run of ours, which takes the row up.
    if (c.replied) {
      if (tail && turn.ended) store.chatAgentSaid(c.product, c.id, tail.text, { at: tail.at, now });
      continue;
    }
    const running = state?.status ? atWork(state) : !published.has(file) && now - mtimeMs < FRESH_MS && !(c.left && !fresh.length && !tail);
    // Gone, or back at its prompt, with the turn never finished.
    const left = !turn.ended && !running && (state === null || (state.status === 'idle' && now - Math.max(mtimeMs, state.since ?? 0) > IDLE_FOR_MS));
    const cut = turn.ended && turn.cutAt > Math.max(c.knownAt, c.heardThrough, ...turn.entries.map((e) => e.at));
    const where = whereTheChatIs(turn, { running, stop: stopLine(state, c.told && !tail), news: !!tail, cut });
    if (where.move === 'working') {
      const got = await store.holdChatOutside(c.product, c.id, HELD_IN.claude, { now });
      if (got && !c.held) moved += 1;
    } else if (where.move === 'answered') {
      store.chatAnsweredOutside(c.product, c.id, tail!.text, { at: tail!.at, now });
      moved += 1;
    } else if (where.move === 'stopped') {
      store.chatStoppedOutside(c.product, c.id, where.stop, tail?.text ?? '', { at: tail?.at ?? 0, now });
      if (c.held) moved += 1;
    } else if (where.move === 'cut') {
      store.chatLeftOutside(c.product, c.id, 'cut', tail?.text ?? '', { at: turn.cutAt, now });
      moved += 1;
    } else if (c.held && left) {
      store.chatLeftOutside(c.product, c.id, 'closed', tail?.text ?? '', { at: tail?.at ?? 0, now });
      moved += 1;
    } else if (c.held && turn.ended) {
      store.letGoOfChat(c.product, c.id, { now });
      moved += 1;
    }
  }
  return { moved };
}

/** A chat in Done, back once its agent waits on you, with everything said there
 *  since: after you carried it on there, or stopped in its window since you
 *  closed it here. Not one you closed while it was already stopped. */
function comeBack(store: FollowStore, c: FollowedChat, turn: ChatTurn, state: ClaudeSessionState | null, now: number) {
  const asks = asksNow(turn, state);
  if (!asks || !(turn.heardAt > c.doneAt || (asks.stop !== null && (state?.since ?? 0) > c.doneAt))) return 0;
  // Your words from before the close are on it; a question put up before it may not be.
  const since = notYetRead(turn, { heardThrough: Math.max(c.heardThrough, c.doneAt), knownAt: c.knownAt });
  store.chatAsksAgain(c.product, c.id, since, asks.stop, { now });
  return 1;
}

/** Your words from Codex, written before `refreshCodexMirrors` writes its
 *  answer to them, so the thread reads in the order it happened. */
export function noteCodexWords(
  { store, threads, now = Date.now(), ours }: { store: FollowStore; threads: readonly CodexChatLike[]; now?: number; ours?: Ours },
) {
  const byId = new Map(threads.map((t) => [String(t?.id ?? ''), t]));
  let noted = 0;
  for (const c of store.chatsToFollow(now, ours)) {
    if (c.engine !== 'codex' || !c.follow || c.doneAt || c.replied) continue;
    const t = byId.get(c.chat);
    const words = newWords({ heard: t?.herLast, heardAt: t?.herLastAt }, c.heardThrough);
    if (words) { store.chatSaidOutside(c.product, c.id, words, { at: t!.herLastAt!, now }); noted += 1; }
  }
  return noted;
}

/** Runs after `refreshCodexMirrors` has given each row Codex's latest answer. */
export async function followCodexChats(
  { store, threads, now = Date.now(), ours }: { store: FollowStore; threads: readonly CodexChatLike[]; now?: number; ours?: Ours },
) {
  const byId = new Map(threads.map((t) => [String(t?.id ?? ''), t]));
  let moved = 0;
  for (const c of store.chatsToFollow(now, ours)) {
    if (c.engine !== 'codex') continue;
    const t = byId.get(c.chat);
    if (c.doneAt) {
      // A rollout that marks no turns is at rest once it is no longer written.
      const ended = t?.turnOpen === false || (t?.turnOpen == null && !t?.live);
      if (!t?.waiting || !t.last || !ended || !((t.herLastAt ?? 0) > c.doneAt)) continue;
      const said = Math.max(t.saidAt ?? 0, t.herLastAt ?? 0);
      store.chatAsksAgain(c.product, c.id, [{ who: 'you', at: t.herLastAt ?? 0, text: t.herLast ?? '' }, { who: 'agent', at: said, text: t.last }], null, { now });
      moved += 1;
      continue;
    }
    if (c.follow && !c.replied && codexWorking(t, now)) {
      const got = await store.holdChatOutside(c.product, c.id, HELD_IN.codex, { now });
      if (got && !c.held) moved += 1;
    } else if (c.held) {
      store.letGoOfChat(c.product, c.id, { now });
      moved += 1;
    }
  }
  return { moved };
}

/** Claude Code rewrites a session's file as its agent starts, stops or asks, so
 *  a followed chat's is looked at then. A folder that cannot be watched is left
 *  to the timer. */
function watchSessions(homes: string[], watching: Map<string, fs.FSWatcher>, changed: (sessionId: string) => void) {
  for (const home of homes) {
    const dir = path.join(home, 'sessions');
    if (watching.has(dir)) continue;
    try {
      const watcher = fs.watch(dir, (_event, name) => {
        if (!String(name ?? '').endsWith('.json')) return;
        try { changed(String(JSON.parse(fs.readFileSync(path.join(dir, String(name)), 'utf8'))?.sessionId ?? '')); } catch { /* gone, or being written */ }
      });
      watcher.on('error', () => { watcher.close(); watching.delete(dir); });
      watching.set(dir, watcher);
    } catch { /* no such folder yet */ }
  }
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
  { store, dirs, stateOf, ours, everyMs = FOLLOW_EVERY_MS, firstDelayMs = 20_000, deadlineMs = PASS_DEADLINE_MS, log = console.warn }:
    { store: FollowStore; dirs: () => string[]; stateOf?: StateOf; ours?: Ours } & ChatFollowTiming,
) {
  let chain: Promise<unknown> = Promise.resolve();
  let claudeQueued = false;
  let followed = new Set<string>();
  let soon: ReturnType<typeof setTimeout> | null = null;
  const watching = new Map<string, fs.FSWatcher>();
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
      const homes = dirs();
      watchSessions(homes, watching, (id) => { if (followed.has(id)) soon ??= setTimeout(() => { soon = null; void claude(); }, SOON_MS); });
      const seen = new Set<string>();
      return followClaudeChats({ store, dirs: homes, ours, seen, ...(stateOf ? { stateOf } : {}) }).finally(() => { followed = seen; });
    });
  };
  const first = setTimeout(claude, firstDelayMs);
  const timer = setInterval(claude, everyMs);
  return {
    followNow: claude,
    // Called before the Codex watch writes this read's answers: the words go
    // down now, and the moves after those answers.
    followCodex: (threads: readonly CodexChatLike[]) => {
      try { noteCodexWords({ store, threads, ours }); } catch (e) { log('chat follow (codex words):', (e as Error)?.message ?? e); }
      return queue('codex', () => followCodexChats({ store, threads, ours }));
    },
    stop: () => {
      clearTimeout(first); clearInterval(timer);
      if (soon) clearTimeout(soon);
      for (const w of watching.values()) w.close();
      watching.clear();
    },
  };
}

type RunsHere = HomesSupervisor & { _rowSessions?: Record<string, { sessionId?: unknown } | undefined> };

/** The follow as the app runs it, on the desktop (main/main.mts) and in the browser copy (bin/agentbox.mjs). */
export function followChatsFor(
  { store, config, supervisor, ...timing }:
    { store: FollowStore; config: { authProfiles?: string[] | string | null } | null | undefined; supervisor: RunsHere | null | undefined } & ChatFollowTiming,
) {
  // The same mark that keeps a brought-in chat from being carried on here twice (Supervisor#importedThreadFor).
  const ours = (id: string) => !!supervisor?._rowSessions?.[id]?.sessionId;
  return startChatFollow({ store, dirs: () => appSessionFolders({ config, supervisor }).dirs, ours, ...timing });
}
