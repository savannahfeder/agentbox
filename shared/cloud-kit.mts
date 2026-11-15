// A THREAD'S NEXT TURN, READY FOR THE CLOUD TO START WITH THE COMPUTER SHUT
// (docs/cloud/PHONE-PLAN.md step 2, docs/cloud/PLAN.md "Next" step 4).
//
// After each turn of a thread that is on the phone, the computer leaves a kit
// in the person's cloud storage: everything a cloud start needs (the folder's
// bundle, the files a run takes, the arguments, the sign-in by name) except
// the reply and the run's own links. A reply the computer has not claimed
// within CLOUD_TAKES_AFTER_MS is started from the kit by the cloud server
// (cloud/gateway/phone.mjs), which claims the command `cloud:<run id>`; the
// computer, waking, joins that run as it joins one it left going
// (main/cloud/run.mts `joining`) and brings its work home.
//
// Shared by the computer (main/cloud/kit.mts), the server and the phone, so
// all three agree on the names. Pure: no file, no network.

export const KIT_VERSION = 1;

// Where the reply goes in the turn's prompt. Characters no prompt carries, so
// it is found once or not at all.
export const REPLY_MARK = '⁣AGENTBOX-REPLY⁣';

// A computer that is awake claims a phone command within seconds; one left
// this long is the cloud's to start.
export const CLOUD_TAKES_AFTER_MS = 60_000;
// And one older than this is left to the computer: the phone said it long ago.
export const CLOUD_TAKES_UNTIL_MS = 24 * 60 * 60_000;
// Inside the bucket's seven-day expiry of `runs/`, with a day's room.
export const KIT_FRESH_MS = 6 * 24 * 60 * 60_000;
const KIT_BYTES = 2 * 1024 * 1024;

type Engine = 'claude' | 'codex';

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

/** A thread's next turn, left in storage for the cloud to start. `checkKit` is what the computer, the server and the phone agree a kit is. */
export interface Kit {
  v: number;
  engine: Engine;
  madeAt: number;
  cwd: string;
  argv: string[];
  frame: ReplyFrame;
  login: { engine: Engine; key: string; id?: string | null };
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
    mainSha: string | null;
    model?: string | null;
    effort?: string | null;
    defaultEngine?: Engine;
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

/** One line of a run's event log. */
interface RunEvent {
  kind?: string;
  data?: unknown;
}

/** One of Claude Code's stream-json lines, as far as a `result` goes. */
interface StreamLine {
  type?: string;
  result?: unknown;
  is_error?: unknown;
}

interface CodexItem {
  type?: string;
  phase?: unknown;
  text?: unknown;
}

/** One JSON-RPC line from `codex app-server`, as far as an answer goes. */
interface CodexLine {
  id?: number;
  method?: string;
  error?: { message?: unknown } | null;
  result?: { thread?: { id?: unknown } };
  params?: {
    item?: CodexItem;
    turn?: { status?: unknown; items?: (CodexItem | null)[]; error?: { message?: unknown } };
  };
}

type Name = string | null | undefined;

const CLAIM = /^cloud:([A-Za-z0-9._-]{1,120})$/;
export const cloudClaim = (runId: string): string => `cloud:${runId}`;
export const runOfClaim = (claimedBy: unknown): string | null => (typeof claimedBy === 'string' && CLAIM.test(claimedBy) ? claimedBy.match(CLAIM)![1] : null);

// The same name main/cloud/run.mts gives a run it starts, so a computer
// joining a run the server started asks for it by the name it would have used.
export const cloudSessionId = (item: Name, runId: string): string => `agentbox-${String(item || 'run').replace(/[^a-zA-Z0-9-]/g, '')}-${runId}`;

const seg = (s: Name): string => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120) || '_';
/** Where a thread's kit lives in the person's own storage. */
export const kitKey = (device: Name, project: Name, item: Name): string => `runs/kits/${seg(device)}/${seg(project)}/${seg(item)}.json`;
/** What the server keeps about a run it started, for the moment it ends. */
export const serverRunKey = (runId: Name): string => `runs/server/${seg(runId)}.json`;
/** Written by a computer that has joined a run the server started: the server feeds and closes it no more. */
export const serverJoinedKey = (runId: Name): string => `runs/server/${seg(runId)}.joined.json`;
/** The objects a run writes as it ends, named as main/cloud/run.mts names them. */
export const runKey = (runId: string, name: string): string => `runs/${runId}/${name}`;

/** The text either side of the reply, or null when the prompt has no one place for it. */
export function replyFrame(prompt: string | null | undefined): ReplyFrame | null {
  const text = String(prompt ?? '');
  const at = text.indexOf(REPLY_MARK);
  if (at < 0 || text.indexOf(REPLY_MARK, at + 1) >= 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + REPLY_MARK.length) };
}

export const replyPrompt = (frame: ReplyFrame, reply: string | null | undefined): string => `${frame.before}${String(reply ?? '')}${frame.after}`;

// The first line on the agent's input, as the computer writes one
// (main/claude-input.mts), with the cloud's note at its top the way
// main/cloud/run.mts `claudeLineForTheCloud` puts it on a resumed run.
export function cloudUserLine(text: string, { note = null, uuid }: { note?: string | null; uuid?: string } = {}): string {
  const content = note ? `${note}\n\n${text}` : String(text);
  return `${JSON.stringify({ type: 'user', uuid, message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' })}\n`;
}

const isKey = (k: unknown): boolean => typeof k === 'string' && /^runs\/[A-Za-z0-9._@+=/-]+$/.test(k) && !k.includes('..');
const isLoginKey = (k: unknown): boolean => typeof k === 'string' && /^logins\/[A-Za-z0-9._@+=/-]+$/.test(k) && !k.includes('..');
const isPath = (p: unknown): boolean => typeof p === 'string' && p.startsWith('/') && !p.includes('\0');
const strings = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === 'string');

/**
 * Why a kit cannot be started from, or null. Read by the server before it trusts one.
 * `kit` is as read back from storage: its fields are what they claim only once this says null.
 */
export function checkKit(kit: Partial<Kit> | null | undefined, { now = Date.now() }: { now?: number } = {}): string | null {
  if (!kit || typeof kit !== 'object') return 'not a kit';
  if (kit.v !== KIT_VERSION) return 'another version of kit';
  if (kit.engine !== 'claude' && kit.engine !== 'codex') return 'only Claude Code and Codex threads carry on in the cloud';
  if (kit.engine === 'codex') { const p = codexKitProblem(kit.codex); if (p) return p; }
  if (!(now - Number(kit.madeAt) < KIT_FRESH_MS)) return 'the kit is too old';
  if (!isPath(kit.cwd)) return 'no folder';
  if (!strings(kit.argv) || !kit.argv.length) return 'no command';
  if (!kit.frame || typeof kit.frame.before !== 'string' || typeof kit.frame.after !== 'string') return 'no place for the reply';
  if (!kit.login || kit.login.engine !== kit.engine || !isLoginKey(kit.login.key)) return 'no sign-in';
  if (kit.env && (typeof kit.env !== 'object' || !Object.values(kit.env).every((v) => typeof v === 'string'))) return 'bad environment';
  if (!kit.plain && typeof kit.branch !== 'string') return 'no branch';
  if (kit.bundleKey !== undefined && kit.bundleKey !== null && !isKey(kit.bundleKey)) return 'bad bundle';
  if (kit.base && (!isKey(kit.base.key) || typeof kit.base.sha !== 'string')) return 'bad base';
  if (!kit.plain && !kit.bundleKey && !kit.base) return 'no copy of the folder';
  for (const f of kit.files ?? []) if (!isPath(f?.path) || !isKey(f.key) || (f.untar !== undefined && !isPath(f.untar))) return 'bad file';
  for (const f of kit.homeFiles ?? []) if (typeof f?.rel !== 'string' || f.rel.startsWith('/') || f.rel.includes('..') || !isKey(f.key)) return 'bad home file';
  for (const b of kit.bringDirs ?? []) if (typeof b?.name !== 'string' || !/^[a-z.]+$/.test(b.name) || !isPath(b.dir)) return 'bad folder to bring home';
  if (!kit.bringDirs?.length) return 'nothing to bring home';
  if (kit.hold !== undefined && !(Array.isArray(kit.hold) && kit.hold.every((s) => typeof s === 'string'))) return 'bad held servers';
  if (kit.handshakes !== undefined && (!kit.handshakes || typeof kit.handshakes !== 'object' || Array.isArray(kit.handshakes))) return 'bad handshakes';
  if (JSON.stringify(kit).length > KIT_BYTES) return 'the kit is too large';
  return null;
}

/**
 * The sandbox's `start` for a run from this kit (cloud/sandbox/server.mjs),
 * built as main/cloud/run.mts builds one. `getUrl(key)` and `putUrl(key)` make
 * links; the sign-in goes by name (`loginName(key)`) for the server to swap.
 */
export async function startPayload(kit: Kit, { runId, getUrl, putUrl, loginName, offlineAfterMs = 90_000, kept = null, endTurn = 'claude-stream-json', refs = null, away = false }: {
  runId: string;
  getUrl: (key: string) => string | Promise<string>;
  putUrl: (key: string) => string | Promise<string>;
  loginName: (key: string) => string;
  offlineAfterMs?: number;
  kept?: unknown;
  endTurn?: string;
  refs?: Record<string, string> | null;
  away?: boolean;
}): Promise<StartPayload> {
  // `checkKit` has said there is a folder to bring home.
  const results = {
    bundleUrl: await putUrl(runKey(runId, 'out.bundle')),
    changesUrl: await putUrl(runKey(runId, 'changes.bundle')),
    docsUrl: await putUrl(runKey(runId, 'docs.tgz')),
    eventsUrl: await putUrl(runKey(runId, 'events.jsonl')),
    doneUrl: await putUrl(runKey(runId, 'done.json')),
    bring: await Promise.all(kit.bringDirs!.map(async (b) => ({ dir: b.dir, url: await putUrl(runKey(runId, b.name)) }))),
  };
  const files = await Promise.all((kit.files ?? []).map(async (f) => ({ path: f.path, url: await getUrl(f.key), ...(f.untar ? { untar: f.untar } : {}) })));
  const homeFiles = await Promise.all((kit.homeFiles ?? []).map(async (f) => ({ rel: f.rel, url: await getUrl(f.key) })));
  return {
    action: 'start', runId, cwd: kit.cwd, branch: kit.branch ?? null,
    ...(kit.bundleKey ? { bundleUrl: await getUrl(kit.bundleKey) } : {}),
    ...(kit.plain ? { plain: true } : {}),
    ...(kit.base ? { base: { url: await getUrl(kit.base.key), sha: kit.base.sha }, refs: refs ? { ...(kit.refs ?? {}), ...refs } : (kit.refs ?? null) } : {}),
    // A new thread's branch, made at the main its kit saw (`fillNewThreadKit`).
    ...(!kit.base && refs ? { refs } : {}),
    argv: kit.argv, env: kit.env ?? {}, files,
    ...(kit.changesRef ? { changesRef: kit.changesRef } : {}),
    ...(kit.remote ? { remote: kit.remote } : {}),
    ...(kit.docs ? { docs: kit.docs } : {}),
    ...(homeFiles.length ? { homeFiles } : {}),
    login: { engine: kit.login.engine, id: kit.login.id ?? null, url: loginName(kit.login.key) },
    results,
    tails: true,
    // Null keeps the agent's input open while the computer is away, for a run
    // the server feeds more replies to (cloud/gateway/phone.mjs).
    offline: { afterMs: offlineAfterMs, endTurn, kept, ...heldFor(kit), ...(away ? { away: true } : {}) },
  };
}

// PERMISSION REQUESTS WITH THE COMPUTER AWAY. A kit for a run that asks names
// the app's approvals server as held (cloud/sandbox/server.mjs): its calls
// wait for an answer instead of being refused, and its handshake is the
// computer's own, carried in the kit. `away`: the server starts it, so the
// computer is not there from its first moment.
const heldFor = (kit: Pick<Kit, 'hold' | 'handshakes'>): Pick<StartPayload['offline'], 'hold' | 'handshakes'> => (Array.isArray(kit.hold) && kit.hold.length
  ? { hold: kit.hold, ...(kit.handshakes && typeof kit.handshakes === 'object' ? { handshakes: kit.handshakes } : {}) }
  : {});

/** The app's approvals server, by the name a run's tools give it (`mcp__zero-approvals__approval_prompt`). */
export const APPROVALS_SERVER = 'zero-approvals';

/** A held request's card id: one the phone may send back (`^[\w-]{1,80}$`), and marked as the cloud's. */
export const askId = (runId: string | number, conn: string | number, id: string | number): string => `cloud-${String(runId)}-${String(conn)}-${String(id)}`.replace(/[^\w-]/g, '_').slice(0, 80);
/** Whether a card's id is one the cloud put on the phone, so its answer is the cloud's to give. */
export const cloudCard = (approval: unknown): boolean => typeof approval === 'string' && approval.startsWith('cloud-');

// What the app's approvals server answers (main/approval-prompt-core.mts).
export const DECLINED = 'The founder declined this action. Work with what you are already allowed to do, or park the remainder as a review.';
/** The answer to a held approval_prompt call, as the app's own server would write it. */
export function approvalAnswerLine(id: string | number, { allow, note = null, input = {} }: { allow?: boolean; note?: string | null; input?: Record<string, unknown> } = {}): string {
  const said = allow ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: note || DECLINED };
  return JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(said) }] } });
}

/** Each of Claude Code's `result` lines, in order, off a run's event log. */
export function answersIn(eventsText: string | null | undefined): Answer[] {
  let out = '';
  for (const raw of String(eventsText ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let e: RunEvent | null;
    try { e = JSON.parse(raw); } catch { continue; }
    if (e?.kind === 'stdout' && typeof e.data === 'string') out += Buffer.from(e.data, 'base64').toString('utf8');
  }
  return resultsInLines(out.split('\n'));
}

/** The `result`s among stream-json lines: { text, isError } each. */
export function resultsInLines(lines: string[]): Answer[] {
  const found: Answer[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg: StreamLine | null;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg?.type === 'result') found.push({ text: String(msg.result ?? ''), isError: msg.is_error === true });
  }
  return found;
}

// WHAT THE AGENT LAST SAID, off a run's event log (one JSON event a line, its
// output in base64): the text of Claude Code's last `result`, and whether it
// was an error. Null when the run never got that far.
export function lastAnswerIn(eventsText: string | null | undefined): Answer | null {
  let out = '';
  for (const raw of String(eventsText ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let e: RunEvent | null;
    try { e = JSON.parse(raw); } catch { continue; }
    if (e?.kind === 'stdout' && typeof e.data === 'string') out += Buffer.from(e.data, 'base64').toString('utf8');
  }
  let answer: Answer | null = null;
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    let msg: StreamLine | null;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg?.type === 'result') answer = { text: String(msg.result ?? ''), isError: msg.is_error === true };
  }
  return answer;
}

// A CODEX KIT'S THREAD (main/codex-app-server.mts). A Codex run is
// `codex app-server` spoken to in JSON-RPC, so the kit holds the lines the
// computer's own client would send to open the thread in the cloud
// (initialize, initialized, thread/resume rewritten as main/cloud/run.mts
// rewrites them) and the turn's settings; her reply goes into a `turn/start`
// whose input is the turn's prompt. Request ids are fixed: `resumeId` names
// the resume's answer, and turns go from `firstTurnId` on.
// A new thread's Codex kit starts its thread (`startId`, the `thread/start`'s
// own id) instead, and learns the thread's id from that answer.
function codexKitProblem(c: Partial<CodexKit> | null | undefined): string | null {
  if (!c || !strings(c.open) || c.open.length < 3) return 'a Codex kit with no lines to open its thread';
  const opens = Number.isInteger(c.startId) ? c.startId : c.resumeId;
  if (!Number.isInteger(opens) || !Number.isInteger(c.firstTurnId) || c.firstTurnId! <= opens!) return 'a Codex kit with no request ids';
  if (!c.turn || typeof c.turn !== 'object') return 'a Codex kit with no turn';
  if (Number.isInteger(c.startId)) return c.turn.threadId === undefined ? null : 'a Codex kit that starts a thread and resumes one';
  if (typeof c.turn.threadId !== 'string' || !c.turn.threadId) return 'a Codex kit with no thread to resume';
  return null;
}

/** What opens a Codex kit's thread in the cloud, as one input. */
export const codexOpenLines = (kit: { codex: Pick<CodexKit, 'open'> }): string => kit.codex.open.map((l) => (l.endsWith('\n') ? l : `${l}\n`)).join('');

/** Her reply as one turn of the kit's thread, with request id `id`. */
// `raw` is a new thread's first turn, its brief as it stands; `threadId` the
// id a new thread's start answered with.
export function codexTurnLines(
  kit: { frame: ReplyFrame; codex: Pick<CodexKit, 'turn'> },
  reply: string | null | undefined,
  { id, raw = null, threadId: named = null }: { id: number; raw?: string | null; threadId?: string | null },
): string {
  const { threadId: kept, ...settings } = kit.codex.turn;
  const text = typeof raw === 'string' ? raw : replyPrompt(kit.frame, reply);
  return `${JSON.stringify({ jsonrpc: '2.0', id, method: 'turn/start', params: { threadId: named ?? kept, ...settings, input: [{ type: 'text', text }] } })}\n`;
}

// WHAT A CODEX RUN SAID, read as main/codex.mts `captureCodexEvent` reads it:
// a turn's answer is its `agentMessage` with `phase: "final_answer"` (one with
// no phase still counts, a `commentary` never does), or the final answer in
// `turn.items`; a failed turn says why. `state` carries a turn across reads
// and is told the resume's answer (`resumed`: true, or why it was refused);
// a refused `turn/start` (one of `turnIds`) is a failed turn of its own.
export function codexReadLines(lines: string[], state: CodexReadState = {}): Answer[] {
  const answers: Answer[] = [];
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    let msg: CodexLine | null;
    try { msg = JSON.parse(raw); } catch { continue; }
    if (!msg || typeof msg !== 'object') continue;
    if (msg.id !== undefined && msg.method === undefined) {
      const why = msg.error ? String(msg.error.message ?? 'refused') : null;
      if (msg.id === state.resumeId) {
        state.resumed = why ?? true;
        if (!why && typeof msg.result?.thread?.id === 'string') state.threadId = msg.result.thread.id;
      }
      else if (why && (state.turnIds ?? []).includes(msg.id)) answers.push({ text: why, isError: true });
      continue;
    }
    const p = msg.params ?? {};
    if (msg.method === 'item/completed') {
      const item = p.item ?? {};
      if (item.type !== 'agentMessage') continue;
      const phase = typeof item.phase === 'string' ? item.phase : null;
      if (phase === 'commentary' || (state.final && phase !== 'final_answer')) continue;
      state.result = String(item.text ?? '');
      if (phase === 'final_answer') state.final = true;
      continue;
    }
    if (msg.method === 'turn/completed' || msg.method === 'turn/failed') {
      const turn = p.turn ?? {};
      const status = typeof turn.status === 'string' ? turn.status : msg.method === 'turn/failed' ? 'failed' : 'completed';
      if (status === 'completed') {
        const kept = Array.isArray(turn.items) ? [...turn.items].reverse().find((i) => i?.type === 'agentMessage' && i.phase === 'final_answer') : null;
        const text = state.result ?? (kept ? String(kept.text ?? '') : null);
        answers.push(text == null ? { text: '', isError: true } : { text, isError: false });
      } else {
        const why = String(turn.error?.message ?? '').trim() || (status === 'interrupted' ? 'the turn was interrupted' : `the turn ${status}`);
        answers.push({ text: why, isError: true });
      }
      state.result = null;
      state.final = false;
    }
  }
  return answers;
}

const stdoutOf = (eventsText: string | null | undefined): string => {
  let out = '';
  for (const raw of String(eventsText ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let e: RunEvent | null;
    try { e = JSON.parse(raw); } catch { continue; }
    if (e?.kind === 'stdout' && typeof e.data === 'string') out += Buffer.from(e.data, 'base64').toString('utf8');
  }
  return out;
};

/** Each Codex turn's answer, in order, off a run's event log. */
export const codexAnswersIn = (eventsText: string | null | undefined, state: CodexReadState = {}): Answer[] => codexReadLines(stdoutOf(eventsText).split('\n'), state);

/** A Codex run's last answer off its event log, or null. */
export function codexAnswerIn(eventsText: string | null | undefined): Answer | null {
  const all = codexAnswersIn(eventsText);
  return all.length ? all[all.length - 1] : null;
}

// A NEW THREAD FROM THE PHONE WITH THE COMPUTER SHUT. Each project on the
// phone keeps a kit for a fresh thread beside its threads' kits, built for a
// stand-in item whose id, title and body are these marks and packed from
// main (main/cloud/run.mts, Supervisor#_leaveNewThreadKit). The item's mark
// is plain letters, so a folder name made from a path that holds it
// (Claude Code's transcripts) holds it unchanged too.
export const NEW_THREAD = '_new';
export const NEW_ITEM_MARK = 'xagentboxnewitemx';
export const NEW_TITLE_MARK = '⁣AGENTBOX-NEW-TITLE⁣';
export const NEW_BODY_MARK = '⁣AGENTBOX-NEW-BODY⁣';
// A Codex one, when the computer has a Codex sign-in for the cloud, beside it.
export const NEW_THREAD_CODEX = '_new-codex';
export const newThreadKitKey = (device: Name, project: Name, engine: Engine = 'claude'): string => kitKey(device, project, engine === 'codex' ? NEW_THREAD_CODEX : NEW_THREAD);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORDS = new RegExp(`${esc(NEW_TITLE_MARK)}|${esc(NEW_BODY_MARK)}`, 'g');

/**
 * A project's new-thread kit made the kit of thread `itemId`, the id the
 * computer gives a thread the phone started (madeHere): every mark of the
 * item put in, her title and body in its first prompt, and the branch to make
 * at the main the kit saw. Null for a kit that is not one, or an id no folder
 * may have.
 */
export function fillNewThreadKit(kit: Kit | null | undefined, { itemId, title = '', body = '' }: { itemId: string; title?: string; body?: string }): {
  kit: Kit;
  prompt: string;
  refs: Record<string, string> | null;
  mainSha: string | null;
} | null {
  const n = kit?.newThread;
  if (!n || typeof n.brief !== 'string' || (!kit.plain && typeof n.mainSha !== 'string') || !ID.test(String(itemId ?? ''))) return null;
  // Keeps the shape of what it is given, so its answers are cast back to it below.
  const swap = (v: unknown): unknown => (typeof v === 'string' ? v.split(NEW_ITEM_MARK).join(itemId)
    : Array.isArray(v) ? v.map(swap)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
  const { newThread: _n, ...rest } = kit;
  const filled = { ...(swap(rest) as Omit<Kit, 'newThread'>), item: itemId };
  const prompt = (swap(n.brief) as string).replace(WORDS, (m) => (m === NEW_TITLE_MARK ? String(title) : String(body)));
  // Checked above: a kit with a repository has the main its branch is made at.
  return { kit: filled, prompt, refs: kit.plain ? null : { [`refs/heads/${filled.branch}`]: n.mainSha! }, mainSha: kit.plain ? null : n.mainSha };
}
