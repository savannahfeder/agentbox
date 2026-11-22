// The Codex sessions a person started themselves (the Codex app, the Codex CLI,
// an editor), read off the transcripts Codex writes, as the same kind of record
// main/agents.mts makes for a live Claude Code session. That is what puts them
// in the inbox beside Claude Code's and keeps them in step: Codex working means
// In progress, Codex finished or asking means Needs you.
//
// Only the end of a transcript decides where it stands, so this reads the last
// part of each file, and only files written in the last day. Nothing here
// writes to Codex.

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { cleanAnswer, cleanPrompt, isInjected, listRolloutFiles, readCodexIndex } from './codex-threads.mts';
import { isScratchFolder, isTaskFolder, threadTitle } from './agent-sessions.mts';
import { codexDataDirs } from './agent-homes.mts';
import { WAS_SLUGS, nameSlug } from '../shared/product-name.mjs';
import type { ToolQuestion } from '../shared/session-layout.mts';
import type { Agent, ThreadEvent } from './agents.mts';

/** Sessions written to in this long are read; older ones have left the inbox. */
export const CODEX_LIVE_MS = 24 * 3_600_000;
/** A turn with nothing written for this long is not taken to be running any more. */
export const CODEX_STALE_TURN_MS = 30 * 60_000;
const TAIL_BYTES = 2 * 1024 * 1024;
const HEAD_BYTES = 256 * 1024;
const OURS = new Set([nameSlug, ...WAS_SLUGS]);
const NOT_TYPED = new Set(['exec', 'mcp']);

interface Part { type?: string; text?: string }
interface Payload {
  id?: string; session_id?: string; cwd?: string; timestamp?: string; originator?: string; source?: unknown; thread_source?: string;
  type?: string; role?: string; message?: string; last_agent_message?: string; content?: Part[];
  name?: string; arguments?: string; input?: string; call_id?: string; phase?: string;
  item?: { type?: string; content?: Part[]; phase?: string; questions?: unknown };
}
interface Line { type?: string; timestamp?: string; payload?: Payload }

export interface CodexMeta { id: string; cwd: string; originator: string; source: string; startedAt: number }

/** Who started the session, read off its first line. Null for one this app or a program started. */
export function codexMeta(first: string): CodexMeta | null {
  let j: Line;
  try { j = JSON.parse(first); } catch { return null; }
  if (j?.type !== 'session_meta') return null;
  const p = j.payload ?? {};
  const originator = String(p.originator ?? '');
  const source = typeof p.source === 'string' ? p.source : 'subagent';
  if (OURS.has(originator.toLowerCase())) return null;
  if (NOT_TYPED.has(source) || source === 'subagent') return null;
  if (p.thread_source && p.thread_source !== 'user') return null;
  const id = String(p.session_id ?? p.id ?? '').trim();
  const startedAt = Date.parse(p.timestamp ?? j.timestamp ?? '');
  return id ? { id, cwd: String(p.cwd ?? '').trim(), originator, source, startedAt: Number.isFinite(startedAt) ? startedAt : 0 } : null;
}

/** Where it runs, in the words the page uses. */
export function codexApp(meta: Pick<CodexMeta, 'originator' | 'source'>): string {
  if (/desktop/i.test(meta.originator)) return 'Codex app';
  if (/vscode|cursor|editor/i.test(meta.originator)) return 'Codex in your editor';
  return 'Codex in a terminal';
}

function questionsOf(raw: unknown): ToolQuestion[] {
  const list = (raw as { questions?: unknown })?.questions ?? raw;
  if (!Array.isArray(list)) return [];
  return list.flatMap((q) => {
    const o = q as { question?: unknown; title?: unknown; header?: unknown; options?: unknown };
    const question = String(o?.question ?? o?.title ?? '').trim();
    if (!question) return [];
    const options = (Array.isArray(o.options) ? o.options : [])
      .map((x) => String((typeof x === 'string' ? x : (x as { label?: unknown })?.label) ?? '').trim()).filter(Boolean);
    return [{ question, options }];
  });
}

/** A command Codex has asked permission to run, in its own words, until it is answered. */
export interface CodexApproval { callId: string; command: string; reason: string }

const unquote = (s: string) => { try { return JSON.parse(`"${s}"`) as string; } catch { return s; } };
/** The command and Codex's reason, when a tool call asks to run outside the sandbox. Null for one that needs no permission. */
export function approvalAsked(callId: string, text: string): CodexApproval | null {
  if (!/require_escalated|with_escalated_permissions["']?\s*:\s*true/.test(text)) return null;
  let command = '';
  let reason = '';
  try {
    const j = JSON.parse(text) as { cmd?: unknown; command?: unknown; justification?: unknown };
    const c = j.cmd ?? j.command;
    command = Array.isArray(c) ? c.map(String).join(' ') : String(c ?? '');
    reason = String(j.justification ?? '');
  } catch {
    command = unquote(text.match(/\bcmd:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '');
    reason = unquote(text.match(/\bjustification:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '');
  }
  return { callId, command: command.trim(), reason: reason.trim() };
}

export interface CodexFold {
  approval: CodexApproval | null;
  turnStartedAt: number;
  turnEndedAt: number;
  lastSaid: string;
  saidAt: number;
  asked: { at: number; text: string }[];
  question: ToolQuestion[];
  pendingCall: string;
  lastActiveAt: number;
  events: ThreadEvent[];
  sawEventTurns: boolean;
}

export const freshFold = (): CodexFold => ({ approval: null, turnStartedAt: 0, turnEndedAt: 0, lastSaid: '', saidAt: 0, asked: [], question: [], pendingCall: '', lastActiveAt: 0, events: [], sawEventTurns: false });

const said = (parts: Part[] | undefined, kinds: string[]) => (Array.isArray(parts) ? parts : [])
  .filter((c) => c && kinds.includes(String(c.type)) && typeof c.text === 'string').map((c) => c.text).join('\n').trim();

/** One transcript line into what is known. Lines are taken in order. */
export function foldCodexLine(acc: CodexFold, line: string): void {
  if (!line.trim()) return;
  let j: Line;
  try { j = JSON.parse(line); } catch { return; }
  const at = Date.parse(j.timestamp ?? '') || 0;
  if (at > acc.lastActiveAt) acc.lastActiveAt = at;
  const p = j.payload ?? {};
  const hers = (text: string, fromEvent: boolean) => {
    const t = cleanPrompt(text);
    if (!t || isInjected(t)) return;
    if (fromEvent) acc.sawEventTurns = true;
    else if (acc.sawEventTurns) return;
    const last = acc.asked[acc.asked.length - 1];
    if (last && last.text === t && Math.abs(last.at - at) < 5_000) return;
    acc.asked.push({ at, text: t });
    if (acc.asked.length > 24) acc.asked.splice(1, 1);
    acc.question = []; acc.pendingCall = ''; acc.approval = null;
    acc.events.push({ who: 'you', at, text: t });
  };
  const its = (text: string) => {
    const t = cleanAnswer(text);
    if (!t) return;
    const prev = acc.events[acc.events.length - 1];
    if (prev && prev.who === 'it' && prev.text === t) return;
    acc.events.push({ who: 'it', at, text: t });
  };
  if (j.type === 'event_msg') {
    if (p.type === 'task_started') acc.turnStartedAt = at;
    else if (p.type === 'task_complete' || p.type === 'turn_aborted') {
      acc.turnEndedAt = at;
      acc.approval = null;
      const last = cleanAnswer(p.last_agent_message ?? '');
      if (last) { acc.lastSaid = last; acc.saidAt = at; }
    } else if (p.type === 'user_message') hers(String(p.message ?? ''), true);
    else if (p.type === 'agent_message') its(String(p.message ?? ''));
    else if (p.type === 'item_completed') {
      const it = p.item ?? {};
      if (it.type === 'UserMessage') hers(said(it.content, ['text']), true);
      if (it.type === 'AgentMessage') {
        const qs = questionsOf(it.questions);
        if (qs.length) acc.question = qs;
        its(said(it.content, ['Text', 'text']));
      }
    }
    return;
  }
  if (j.type !== 'response_item') return;
  if (p.type === 'message' && p.role === 'user') hers(said(p.content, ['input_text']), false);
  else if (p.type === 'message' && p.role === 'assistant' && !acc.sawEventTurns) its(said(p.content, ['output_text']));
  else if (p.type === 'function_call' && p.name === 'request_user_input') {
    let args: unknown = null;
    try { args = JSON.parse(p.arguments ?? 'null'); } catch { args = null; }
    const qs = questionsOf(args);
    if (qs.length) { acc.question = qs; acc.pendingCall = String(p.call_id ?? 'pending'); }
  } else if (p.type === 'function_call_output' && acc.pendingCall && p.call_id === acc.pendingCall) {
    acc.pendingCall = ''; acc.question = [];
  }
  if (p.type === 'function_call' || p.type === 'custom_tool_call') {
    const asked = approvalAsked(String(p.call_id ?? ''), String(p.arguments ?? p.input ?? ''));
    if (asked) acc.approval = asked;
  } else if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && acc.approval && p.call_id === acc.approval.callId) {
    acc.approval = null;
  }
}

function readSlice(file: string, from: number, size: number): string {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size);
    const got = fs.readSync(fd, buf, 0, size, from);
    return buf.subarray(0, got).toString('utf8');
  } finally { fs.closeSync(fd); }
}

/** A transcript's tail folded, with its first line for who started it. */
export function readCodexSession(file: string, { whole = false }: { whole?: boolean } = {}): { meta: CodexMeta; fold: CodexFold; firstSaid: string } | null {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return null; }
  let head = '';
  try { head = readSlice(file, 0, Math.min(size, HEAD_BYTES)); } catch { return null; }
  const meta = codexMeta(head.split('\n', 1)[0] ?? '');
  if (!meta) return null;
  const opening = freshFold();
  for (const l of head.split('\n').slice(1, -1)) { foldCodexLine(opening, l); if (opening.asked.length) break; }
  const from = whole ? 0 : Math.max(0, size - TAIL_BYTES);
  let text = '';
  try { text = from === 0 && size <= HEAD_BYTES ? head : readSlice(file, from, size - from); } catch { return null; }
  const lines = text.split('\n');
  if (from > 0) lines.shift();
  const fold = freshFold();
  for (const l of lines) foldCodexLine(fold, l);
  return { meta, fold, firstSaid: opening.asked[0]?.text ?? fold.asked[0]?.text ?? '' };
}

/** Where a session stands. Waiting means stopped on its own question; idle means its turn ended and it is your move. */
export function codexStatus(fold: CodexFold, mtime: number, now: number): 'busy' | 'waiting' | 'idle' {
  if (fold.pendingCall) return 'waiting';
  if (fold.approval && fold.turnStartedAt > fold.turnEndedAt && now - mtime < CODEX_STALE_TURN_MS) return 'waiting';
  const running = fold.turnStartedAt > fold.turnEndedAt && now - mtime < CODEX_STALE_TURN_MS;
  if (running) return 'busy';
  return fold.question.length ? 'waiting' : 'idle';
}

interface Owner { slug?: string | null; name?: string | null; repoPath?: string | null }

// Codex writes nothing between asking to run a command and the command
// finishing, so a granted command is told from a pending one by the command
// being in the process list. Read in the background, at most every few seconds.
let ps: { at: number; lines: string[]; busy: boolean } = { at: 0, lines: [], busy: false };
export function runningCommands(now = Date.now()): string[] {
  if (now - ps.at > 3_000 && !ps.busy) {
    ps.busy = true;
    execFile('/bin/ps', ['-Ao', 'command='], { timeout: 3_000, maxBuffer: 16 << 20, encoding: 'utf8', windowsHide: true }, (err, out) => {
      ps = { at: Date.now(), lines: err ? ps.lines : String(out).split('\n'), busy: false };
    });
  }
  return ps.lines;
}
const commandRuns = (command: string) => {
  const c = command.trim().slice(0, 120);
  return !!c && runningCommands().some((l) => l.includes(c));
};

export interface CodexLiveOptions {
  home?: string;
  codexDirs?: string[] | null;
  products?: Owner[];
  now?: number;
  /** Session ids this app is running, which are its own work. */
  ours?: Set<string>;
  /** Whether a command is running on this machine now. */
  isRunning?: (command: string) => boolean;
}

const kept = new Map<string, { size: number; mtimeMs: number; value: ReturnType<typeof readCodexSession> }>();

/** Every Codex session a person started that was written to in the last day, as a live agent record. */
export function readCodexLive({ home = os.homedir(), codexDirs = null, products = [], now = Date.now(), ours = new Set(), isRunning = commandRuns }: CodexLiveOptions = {}): Agent[] {
  const dirs = codexDirs ?? codexDataDirs({ home });
  const roots = products.filter((p) => p?.repoPath).map((p) => ({ root: path.resolve(p.repoPath!), p }));
  // The project a folder is in, the deepest one when projects nest.
  const ownerOf = (cwd: string) => roots.filter(({ root }) => cwd === root || cwd.startsWith(`${root}${path.sep}`))
    .sort((a, b) => b.root.length - a.root.length)[0]?.p ?? null;
  const byId = new Map<string, Agent>();
  for (const dir of dirs) {
    const names = readCodexIndex(dir);
    for (const file of listRolloutFiles(dir, { days: 2, since: now - CODEX_LIVE_MS })) {
      let st: fs.Stats;
      try { st = fs.statSync(file); } catch { continue; }
      if (now - st.mtimeMs > CODEX_LIVE_MS) continue;
      const had = kept.get(file);
      const read = had && had.size === st.size && had.mtimeMs === st.mtimeMs ? had.value : readCodexSession(file);
      kept.set(file, { size: st.size, mtimeMs: st.mtimeMs, value: read });
      if (!read) continue;
      const { meta, fold, firstSaid } = read;
      const owner = meta.cwd ? ownerOf(path.resolve(meta.cwd)) : null;
      // A temp folder is nobody's work, unless it is one of the person's own projects.
      if (ours.has(meta.id) || !meta.cwd || (isScratchFolder(meta.cwd, home) && !owner) || isTaskFolder(meta.cwd)) continue;
      if (!fold.asked.length && !firstSaid) continue;
      const prev = byId.get(meta.id);
      if (prev && prev.lastActiveAt >= Math.max(fold.lastActiveAt, st.mtimeMs)) continue;
      const granted = !!fold.approval && isRunning(fold.approval.command);
      const status = codexStatus(granted ? { ...fold, approval: null } : fold, st.mtimeMs, now);
      const asked = fold.asked.length ? fold.asked : [{ at: meta.startedAt, text: firstSaid }];
      byId.set(meta.id, {
        pid: 0,
        ppid: 0,
        sessionId: meta.id,
        name: 'Codex',
        cwd: meta.cwd,
        startedAt: meta.startedAt,
        status,
        statusAt: Math.max(fold.turnStartedAt, fold.turnEndedAt),
        waitingFor: status === 'waiting' && fold.approval ? 'permission prompt' : null,
        approval: status === 'waiting' && fold.approval ? { command: fold.approval.command, reason: fold.approval.reason } : null,
        socket: '',
        lastActiveAt: Math.max(fold.lastActiveAt, st.mtimeMs),
        lastSaid: fold.lastSaid,
        saidAt: fold.saidAt,
        about: names.get(meta.id)?.name || threadTitle([firstSaid]) || '',
        lastAsked: asked[asked.length - 1]?.text ?? '',
        touched: [],
        asked,
        question: fold.question,
        transcript: file,
        product: owner?.slug ?? null,
        productName: owner?.name ?? null,
        startedByZero: false,
        engine: 'codex',
        app: codexApp(meta),
      });
    }
  }
  if (kept.size > 2000) kept.clear();
  return [...byId.values()];
}

/** The whole conversation of one Codex session, for "Show the full conversation". */
export function codexConversation(file: string): { ok: true; turns: ThreadEvent[]; omitted: number; total: number } | { ok: false; reason: string } {
  const read = readCodexSession(file, { whole: true });
  if (!read) return { ok: false, reason: 'That Codex conversation could not be read.' };
  const turns = read.fold.events;
  return { ok: true, turns, omitted: 0, total: turns.length };
}

/** "Take me to it" for a Codex session: the Codex app when it runs there. A terminal or editor cannot be found from here. */
export async function revealCodex(agent: Pick<Agent, 'app'> | null, { platform = process.platform, open = openApp }: { platform?: NodeJS.Platform; open?: (name: string) => Promise<boolean> } = {}): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  if (!agent) return { ok: false, reason: 'That Codex session has closed.' };
  if (agent.app !== 'Codex app') return { ok: false, reason: `It is running in ${agent.app === 'Codex in your editor' ? 'your editor' : 'a terminal'}. Switch to it there.` };
  if (platform !== 'darwin') return { ok: false, reason: 'Open the Codex app to answer it.' };
  return (await open('Codex')) ? { ok: true, name: 'Codex' } : { ok: false, reason: 'The Codex app could not be opened.' };
}

function openApp(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('/usr/bin/open', ['-a', name], { timeout: 5000, windowsHide: true }, (err) => resolve(!err));
  });
}
