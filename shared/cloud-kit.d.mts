// Types for shared/cloud-kit.mjs, the kit a cloud run is started from.
//
// The screen asks it one thing, `runOfClaim` (renderer/src/phone-rows.ts), and
// a declaration that stopped there would come through as `any` the day the
// screen asks it a second. So every export is here, and the kit's own fields
// are the ones `checkKit` reads: that function is the agreement between the
// computer, the server and the phone, and this says the same thing in types.

/** Where a reply goes in a turn's prompt. */
export interface ReplyFrame {
  before: string;
  after: string;
}

/** What an agent said, as this file reads it off a run's event log. */
export interface Answer {
  text: string;
  isError: boolean;
}

/** The lines that open a Codex kit's thread, and the settings its turns carry. */
export interface CodexKit {
  open: string[];
  /** A new thread starts one (`thread/start`); a kept thread resumes one. */
  startId?: number;
  resumeId?: number;
  firstTurnId: number;
  turn: { threadId?: string } & Record<string, unknown>;
}

/** A thread's next turn, left in storage for the cloud to start. */
export interface Kit {
  v: number;
  engine: 'claude' | 'codex';
  madeAt: number;
  cwd: string;
  argv: string[];
  frame: ReplyFrame;
  login: { engine: 'claude' | 'codex'; key: string; id?: string | null };
  /** Which thread, on which computer, in which project. */
  item?: string;
  device?: string;
  project?: string;
  /** What a computer joining this run needs to write its own marker. */
  marker?: { configDir?: string } & Record<string, unknown>;
  /** The cloud's note at the top of the agent's first line. */
  note?: string | null;
  /** Carried into the run's `offline.kept`. */
  kept?: unknown;
  env?: Record<string, string>;
  /** A folder with no repository behind it, so no bundle and no branch. */
  plain?: boolean;
  branch?: string | null;
  bundleKey?: string | null;
  base?: { key: string; sha: string } | null;
  refs?: Record<string, string> | null;
  changesRef?: string;
  remote?: string | null;
  docs?: unknown;
  files?: { path: string; key: string; untar?: string }[];
  homeFiles?: { rel: string; key: string }[];
  bringDirs?: { name: string; dir: string }[];
  /** Servers whose calls wait for an answer rather than being refused. */
  hold?: string[];
  handshakes?: Record<string, unknown>;
  codex?: CodexKit;
  /** On a project's new-thread kit: the first prompt, the main to branch at,
   *  and what that kit runs, which a phone's choices have to match. */
  newThread?: {
    brief: string;
    mainSha: string;
    model?: string | null;
    effort?: string | null;
    defaultEngine?: 'claude' | 'codex';
  };
}

/** What a sandbox is handed to start a run from a kit. */
export interface StartPayload {
  action: 'start';
  runId: string;
  cwd: string;
  branch: string | null;
  bundleUrl?: string;
  plain?: true;
  base?: { url: string; sha: string };
  refs?: Record<string, string> | null;
  argv: string[];
  env: Record<string, string>;
  files: { path: string; url: string; untar?: string }[];
  changesRef?: string;
  remote?: string | null;
  docs?: unknown;
  homeFiles?: { rel: string; url: string }[];
  login: { engine: string; id: string | null; url: string };
  results: {
    bundleUrl: string;
    changesUrl: string;
    docsUrl: string;
    eventsUrl: string;
    doneUrl: string;
    bring: { dir: string; url: string }[];
  };
  tails: true;
  offline: {
    afterMs: number;
    endTurn: string;
    kept: unknown;
    hold?: string[];
    handshakes?: Record<string, unknown>;
    away?: true;
  };
}

/** A turn carried across reads of a Codex run's lines. */
export interface CodexReadState {
  resumeId?: number;
  turnIds?: number[];
  /** True once the resume was answered, or why it was refused. */
  resumed?: true | string;
  threadId?: string;
  result?: string | null;
  final?: boolean;
}

export const KIT_VERSION: number;
export const REPLY_MARK: string;
export const CLOUD_TAKES_AFTER_MS: number;
export const CLOUD_TAKES_UNTIL_MS: number;
export const KIT_FRESH_MS: number;

/** The command a cloud run claims a reply with. */
export function cloudClaim(runId: string): string;
/** The run id inside such a claim, or null when it is not one. */
export function runOfClaim(claimedBy: unknown): string | null;
/** The session name a run gets, whoever starts it. */
export function cloudSessionId(item: string | null | undefined, runId: string): string;

/** Where a thread's kit lives in the person's own storage. */
export function kitKey(device: string | null | undefined, project: string | null | undefined, item: string | null | undefined): string;
/** What the server keeps about a run it started, for the moment it ends. */
export function serverRunKey(runId: string | null | undefined): string;
/** Written by a computer that has joined a run the server started. */
export function serverJoinedKey(runId: string | null | undefined): string;
/** The objects a run writes as it ends. */
export function runKey(runId: string, name: string): string;

/** The text either side of the reply, or null when the prompt has no one place for it. */
export function replyFrame(prompt: string | null | undefined): ReplyFrame | null;
export function replyPrompt(frame: ReplyFrame, reply: string | null | undefined): string;
/** The first line on the agent's input, as the computer writes one. */
export function cloudUserLine(text: string, opts?: { note?: string | null; uuid?: string }): string;

/** Why a kit cannot be started from, or null. */
export function checkKit(kit: unknown, opts?: { now?: number }): string | null;

/** The sandbox's `start` for a run from this kit. */
export function startPayload(kit: Kit, opts: {
  runId: string;
  getUrl: (key: string) => string | Promise<string>;
  putUrl: (key: string) => string | Promise<string>;
  loginName: (key: string) => string;
  offlineAfterMs?: number;
  kept?: unknown;
  endTurn?: string;
  refs?: Record<string, string> | null;
  away?: boolean;
}): Promise<StartPayload>;

export const APPROVALS_SERVER: string;
/** A held request's card id, marked as the cloud's. */
export function askId(runId: string | number, conn: string | number, id: string | number): string;
/** Whether a card's id is one the cloud put on the phone. */
export function cloudCard(approval: unknown): boolean;
export const DECLINED: string;
/** The answer to a held approval_prompt call, as the app's own server would write it. */
export function approvalAnswerLine(id: string | number, opts?: { allow: boolean; note?: string | null; input?: Record<string, unknown> }): string;

/** Each of Claude Code's `result` lines, in order, off a run's event log. */
export function answersIn(eventsText: string | null | undefined): Answer[];
/** The `result`s among stream-json lines. */
export function resultsInLines(lines: string[]): Answer[];
/** What the agent last said, or null when the run never got that far. */
export function lastAnswerIn(eventsText: string | null | undefined): Answer | null;

// These two take the parts of a kit they read rather than a whole one, because
// the server writes a turn from what it kept of a run and not from the kit
// (cloud/gateway/phone.mjs).
/** What opens a Codex kit's thread in the cloud, as one input. */
export function codexOpenLines(kit: { codex: Pick<CodexKit, 'open'> }): string;
/** A reply as one turn of the kit's thread, with request id `id`. */
export function codexTurnLines(
  kit: { frame: ReplyFrame; codex: Pick<CodexKit, 'turn'> },
  reply: string | null | undefined,
  opts: { id: number; raw?: string | null; threadId?: string | null },
): string;
/** Each answer among a Codex run's lines, with `state` carrying a turn across reads. */
export function codexReadLines(lines: string[], state?: CodexReadState): Answer[];
/** Each Codex turn's answer, in order, off a run's event log. */
export function codexAnswersIn(eventsText: string | null | undefined, state?: CodexReadState): Answer[];
/** A Codex run's last answer off its event log, or null. */
export function codexAnswerIn(eventsText: string | null | undefined): Answer | null;

export const NEW_THREAD: string;
export const NEW_ITEM_MARK: string;
export const NEW_TITLE_MARK: string;
export const NEW_BODY_MARK: string;
export const NEW_THREAD_CODEX: string;
export function newThreadKitKey(device: string | null | undefined, project: string | null | undefined, engine?: 'claude' | 'codex'): string;

/**
 * A project's new-thread kit made the kit of thread `itemId`, or null for a kit
 * that is not one. */
export function fillNewThreadKit(kit: Kit | null | undefined, who: { itemId: string; title?: string; body?: string }): {
  kit: Kit;
  prompt: string;
  refs: Record<string, string>;
  mainSha: string;
} | null;
