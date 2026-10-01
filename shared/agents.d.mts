// Types for shared/agents.mjs, which is plain ESM so that main (Node), the
// renderer (Vite) and the tests share one copy of the rules.

export interface AgentLike {
  pid?: number;
  ppid?: number;
  sessionId?: string | null;
  name?: string;
  cwd?: string;
  startedAt?: number;
  status?: string | null;
  waitingFor?: string | null;
  lastActiveAt?: number;
  // THE WHOLE OF ITS LAST REPLY, and the moment it began saying it. Not the
  // last block of it: Claude Code writes one answer as a new line every time it
  // stops for a tool, so the last block is routinely a "Done." under the four
  // paragraphs that said what was done.
  lastSaid?: string;
  saidAt?: number;
  // The session's own one-line title of itself, the last thing the user typed into
  // it, and the files it has had its hands on. Read off the transcript tail
  // that main/agents.mjs was already reading.
  about?: string;
  lastAsked?: string;
  touched?: string[];
  // EVERY MESSAGE THE USER TYPED into that session, oldest first. The first one is
  // the ask and is what makes a five-day-old card recallable; the rest say
  // where the thread got to.
  asked?: { at: number; text: string }[];
  product?: string | null;
  productName?: string | null;
  startedByZero?: boolean;
  // The moment the user said they would come back to it, and when they said so.
  // Set by the founder alone; main/agent-schedule.mjs keeps it.
  runAt?: number;
  runAtSetAt?: number;
  // The agent's own last activity at the moment she closed the row. It comes
  // back when the agent does something newer than this.
  doneThrough?: number;
  repliedAt?: number;
  statusAt?: number;
}

export function sameInstant(a: string, b: string): boolean;
export function startedByZero(
  agent: AgentLike,
  keys?: { pids?: Set<number>; sessionIds?: Set<string> },
): boolean;
export function asksSomething(agent: AgentLike): boolean;
export function replyReaches(agent: AgentLike): boolean;
export function replyIsSwallowed(agent: AgentLike): boolean;
// She spoke to it and it has not come back to a stop since.
export function tookHerReply(agent: AgentLike): boolean;
export function stoppedSince(agent: AgentLike, since: number): boolean;
export function howLong(ms: number): string;
export function whereItRuns(agent: AgentLike): string;
export function lastWord(agent: AgentLike, budget?: number): string;
// The END of its last reply, which is where an agent puts its answer. `lastWord`
// takes the front, which is right for the user's words and wrong for its own.
export function howItEnded(raw: string | null | undefined, budget?: number): string;
export function lastAsk(agent: AgentLike, budget?: number): string;
export function whatItIs(agent: AgentLike): string;
export function agentTitle(agent: AgentLike, now?: number): string;
export function herWords(agent: AgentLike): { at: number; text: string }[];

// One shape: the message the user started it with, up to three later messages
// of theirs, where it stopped, where it is working. There is
// no setting and no second shape on purpose.
export function agentRow(
  agent: AgentLike,
  now?: number,
): { title: string; body: string };

// How many of her own sessions the inbox takes. One list, no second
// tab.
export type AgentMode = 'all' | 'waiting' | 'off';
export const AGENT_MODES: AgentMode[];
export function reachesInbox(agent: AgentLike, now?: number, mode?: AgentMode): boolean;
export function progressAfterReply(agent: AgentLike, now?: number, mode?: AgentMode): boolean;
export function listed(agent: AgentLike): boolean;
export function agentKey(agent: AgentLike): string;
export function putOff(agent: AgentLike, now?: number): boolean;
export function putAway(agent: AgentLike): boolean;
export function byRecency(a: AgentLike, b: AgentLike): number;

/**
 * Active agents, in the sidebar. The cut is a day: a session leaves the
 * panel once the clock beside it would stop saying hours. */
export const RAIL_CUT_MS: number;
export function onTheRail(agent: AgentLike, now?: number): boolean;
/** The one line a rail row says: the session's own sentence, uncut. */
export function railLine(agent: AgentLike): string;

// THE CONVERSATION, on demand and only because she pressed something. The
// window keeps the opening and the end and counts the middle out loud, because
// 3,800 turns is a scroll bar rather than a recall.
export interface AgentTurnLike {
  at: number;
  who: 'you' | 'it';
  text: string;
  // A continuation of the block above rather than a new message: her shape B
  // puts the work between the messages, so one reply can be several blocks.
  same?: boolean;
  // Set by `threadWindow` on the first block after the cut: counted as a
  // continuation, drawn with its name back.
  resumed?: boolean;
  kind?: undefined;
}

// ONE THING THE AGENT RAN, between two messages. Shape B.
export interface AgentWorkLike {
  kind: 'work';
  at: number;
  verb: string;
  subject: string;
  output: string;
  lines: number;
  failed: boolean;
  more?: number;
}

export type AgentEventLike = AgentTurnLike | AgentWorkLike;

// The caps, all three measured over the 40 largest transcripts on her machine
// on 2026-08-19: 6,070 tool calls in one session, 8MB of output, and a run of
// 111 tool calls standing between two messages.
export const WORK_CHARS: number;
export const WORK_RUN: number;
export const WORK_TOTAL: number;
// WHAT A TOOL CALL SAYS, in three rules:
// the verb, the subject and the fold. Implemented in shared/work-lines.mjs and
// re-exported from shared/agents.mjs so nothing needs a second import.
export function workVerb(name: string): string;
export function workSubject(
  input: Record<string, unknown> | null | undefined,
  cwd?: string,
  home?: string,
): string;
export function fullSubject(input: Record<string, unknown> | null | undefined): string;
export function shortPath(raw: string, cwd?: string, home?: string): string;
export function plainCommand(raw: string): string;
// What a shell command did, in words, or null to leave it as the command. And
// the steps that are the store's own records rather than the work, which are
// not drawn at all.
export function commandWork(
  raw: string | null | undefined,
  cwd?: string,
  home?: string,
): { verb: string; doing: string; subject: string } | null;
export function isBookkeeping(name: string | null | undefined): boolean;
export const RUN_MIN: number;
export function groupWork<T extends { kind?: string }>(
  events: T[],
  bounds?: { min?: number },
): (T | { kind: 'run'; at: number; items: T[] })[];
export function runSummary(items: { verb: string }[]): string;
export function runFailures(items: { failed?: boolean }[]): string;
// THE FILE A WORK LINE CHANGED, and which entry of a change it is. The first
// returns '' on everything that is not an edit; the second returns null when
// the change does not hold the file, which is what keeps a chip from being
// drawn over something that would open nothing.
export const CHANGES_A_FILE: Set<string>;
export function changedFile(
  name: string,
  input: Record<string, unknown> | null | undefined,
): string;
export function fileInChange(
  paths: readonly string[] | null | undefined,
  raw: string | null | undefined,
): string | null;
export function runOverflow(more: number): string;
export function outputCut(shownLines: number, allLines: number): string;
// The window, message-aware: a run of tool calls must never push her own
// messages out of it. `whole` is the gap line being pressed: every message
// stands and only the work stays capped.
export function threadWindow(
  events: AgentEventLike[],
  bounds?: { opening?: number; keep?: number; whole?: boolean },
): { events: AgentEventLike[]; omitted: number };
// Where the gap line stands in a windowed thread: the last event the opening
// kept, or -1 when nothing is missing. Beside the cut, so the two cannot drift.
export function gapIndex(
  events: AgentEventLike[],
  omitted: number,
  bounds?: { opening?: number },
): number;
export function capRuns(
  events: AgentEventLike[],
  bounds?: { run?: number; total?: number },
): AgentEventLike[];
// How many MESSAGES that is, which is not how many blocks are on the screen.
export function saidCount(events: AgentEventLike[]): number;
export const TRAIL_OPENING: number;
export const TRAIL_TURNS: number;
export function conversationWindow(
  turns: AgentTurnLike[],
  bounds?: { opening?: number; keep?: number },
): { turns: AgentTurnLike[]; omitted: number };
export function conversationGap(omitted: number): string;
