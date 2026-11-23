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
import { theirWords, type ToolQuestion } from '../shared/session-layout.mts';
import type { Agent, ThreadEvent } from './agents.mts';
import { bringToFront, codexProcessFor, parsePs, type BringResult, type ProcRow } from './bring-to-front.mts';

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

/** The string a key is given in the JavaScript Codex writes for a tool call, in any of its three quotes. */
export function jsString(text: string, key: string): string {
  const m = new RegExp(`["']?\\b${key}["']?\\s*:\\s*(["'\`])`).exec(text);
  if (!m) return '';
  const quote = m[1];
  const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
  let out = '';
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { const e = text[i + 1] ?? ''; out += escapes[e] ?? e; i += 1; continue; }
    if (c === quote) return out;
    out += c;
  }
  return out;
}
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
    command = jsString(text, 'cmd') || jsString(text, 'command');
    reason = jsString(text, 'justification');
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
  /** When it last stopped on a question or a permission prompt. */
  waitingAt: number;
}

export const freshFold = (): CodexFold => ({ approval: null, turnStartedAt: 0, turnEndedAt: 0, lastSaid: '', saidAt: 0, asked: [], question: [], pendingCall: '', lastActiveAt: 0, events: [], sawEventTurns: false, waitingAt: 0 });

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
    // Her pick on Codex's question card comes back as a tagged message, which is her answer, not Codex's own text.
    const picked = /<send_user_message_question_reply>/.test(text) ? theirWords(text) : '';
    const t = picked || cleanPrompt(text);
    if (!t || (!picked && isInjected(t))) return;
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
        if (qs.length) { acc.question = qs; acc.waitingAt = at; }
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
    const last = acc.events[acc.events.length - 1];
    const lead = last && last.who === 'it' && last.at >= acc.turnStartedAt ? last.text : '';
    if (qs.length) { acc.question = lead ? [{ ...qs[0], lead }, ...qs.slice(1)] : qs; acc.pendingCall = String(p.call_id ?? 'pending'); acc.waitingAt = at; }
  } else if (p.type === 'function_call_output' && acc.pendingCall && p.call_id === acc.pendingCall) {
    // Her answer to its question is her turn, so the row moves to In progress while it goes on.
    const out = (p as { output?: unknown }).output;
    const said = (typeof out === 'string' ? out : JSON.stringify(out ?? '')).replace(/\s+/g, ' ').trim().slice(0, 400);
    acc.asked.push({ at, text: said || 'Answered its question' });
    acc.pendingCall = ''; acc.question = [];
  }
  if (p.type === 'function_call' || p.type === 'custom_tool_call') {
    const asked = approvalAsked(String(p.call_id ?? ''), String(p.arguments ?? p.input ?? ''));
    if (asked) { acc.approval = asked; acc.waitingAt = at; }
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

/** Whether a transcript's first line is a session a person started, read once. A half-written first line is not decided. */
function isHersHead(file: string): boolean {
  let first = '';
  try { first = readSlice(file, 0, 64 * 1024).split('\n', 1)[0] ?? ''; } catch { return true; }
  try { JSON.parse(first); } catch { return true; }
  return codexMeta(first) !== null;
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
  // Codex asks with request_user_input_async and works on while the question
  // stays open in its window, so an open question is waiting on her either way.
  if (fold.pendingCall || fold.question.length) return 'waiting';
  if (fold.approval && fold.turnStartedAt > fold.turnEndedAt && now - mtime < CODEX_STALE_TURN_MS) return 'waiting';
  const running = fold.turnStartedAt > fold.turnEndedAt && now - mtime < CODEX_STALE_TURN_MS;
  if (running) return 'busy';
  return fold.question.length ? 'waiting' : 'idle';
}

interface Owner { slug?: string | null; name?: string | null; repoPath?: string | null }

/** A process Codex started, with the folder it runs in when that can be read. */
export interface CodexChild { command: string; cwd: string | null }

/** The processes under a Codex process, out of `ps -o pid=,ppid=,command=`. */
export function codexChildren(table: string): (CodexChild & { pid: number })[] {
  const rows = new Map<number, { ppid: number; command: string }>();
  for (const line of table.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.set(Number(m[1]), { ppid: Number(m[2]), command: m[3].trimEnd() });
  }
  const codex = (cmd: string) => /(^|\/)codex(\s|$)|\bcodex app-server\b/.test(cmd);
  const out: (CodexChild & { pid: number })[] = [];
  for (const [pid, row] of rows) {
    if (codex(row.command)) continue;
    let up = row.ppid;
    for (let i = 0; i < 8 && up > 1; i++) {
      const parent = rows.get(up);
      if (!parent) break;
      if (codex(parent.command)) { out.push({ pid, command: row.command, cwd: null }); break; }
      up = parent.ppid;
    }
  }
  return out;
}

export function cwdOf(pids: number[]): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  if (!pids.length) return Promise.resolve(found);
  if (process.platform === 'linux') {
    for (const pid of pids) { try { found.set(pid, fs.readlinkSync(`/proc/${pid}/cwd`)); } catch { /* gone */ } }
    return Promise.resolve(found);
  }
  return new Promise((resolve) => {
    execFile('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], { timeout: 3_000, encoding: 'utf8', windowsHide: true }, (_err, out) => {
      let pid = 0;
      for (const l of String(out ?? '').split('\n')) {
        if (l.startsWith('p')) pid = Number(l.slice(1));
        else if (l.startsWith('n') && pid) found.set(pid, l.slice(1));
      }
      resolve(found);
    });
  });
}

// Codex writes nothing between asking to run a command and the command
// finishing, so a granted command is told from a pending one by Codex running
// it. Read in the background, at most every few seconds.
let ps: { at: number; children: CodexChild[]; busy: boolean } = { at: 0, children: [], busy: false };
export function codexRunning(now = Date.now()): CodexChild[] {
  if (now - ps.at > 3_000 && !ps.busy) {
    ps.busy = true;
    execFile('/bin/ps', ['-Aww', '-o', 'pid=,ppid=,command='], { timeout: 3_000, maxBuffer: 16 << 20, encoding: 'utf8', windowsHide: true }, (err, out) => {
      if (err) { ps = { ...ps, at: Date.now(), busy: false }; return; }
      const kids = codexChildren(String(out));
      void cwdOf(kids.map((k) => k.pid)).then((cwds) => {
        ps = { at: Date.now(), children: kids.map((k) => ({ command: k.command, cwd: cwds.get(k.pid) ?? null })), busy: false };
      });
    });
  }
  return ps.children;
}
/**
 * Whether Codex is running that command for a session in that folder. Codex
 * hands it to a shell (`bash -lc <command>`), so its line ends with it. Only a
 * process Codex started counts, in the session's own folder: a short `ls` is
 * inside half the lines on a machine, your own `npm test` in another terminal
 * is not Codex's, and two sessions can ask for the same command (power testers).
 */
export function runsIn(children: readonly CodexChild[], command: string, cwd: string): boolean {
  const c = command.trim();
  if (!c) return false;
  const here = (d: string | null) => !d || d === cwd || d.startsWith(`${cwd}${path.sep}`) || cwd.startsWith(`${d}${path.sep}`);
  return children.some((k) => { const t = k.command.trimEnd(); return (t === c || t.endsWith(` ${c}`)) && here(k.cwd); });
}
const commandRuns = (command: string, cwd: string) => runsIn(codexRunning(), command, cwd);

export interface CodexLiveOptions {
  home?: string;
  codexDirs?: string[] | null;
  products?: Owner[];
  now?: number;
  /** Session ids this app is running, which are its own work. */
  ours?: Set<string>;
  /** Whether Codex is running a command for a session in that folder now. */
  isRunning?: (command: string, cwd: string) => boolean;
}

const kept = new Map<string, { size: number; mtimeMs: number; value: ReturnType<typeof readCodexSession> }>();
// Who started a session never changes, so a transcript that is not hers (this
// app's own Codex runs, `codex exec`, a subagent) is not opened again.
const notHers = new Set<string>();

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
      if (now - st.mtimeMs > CODEX_LIVE_MS || notHers.has(file)) continue;
      const had = kept.get(file);
      const read = had && had.size === st.size && had.mtimeMs === st.mtimeMs ? had.value : readCodexSession(file);
      kept.set(file, { size: st.size, mtimeMs: st.mtimeMs, value: read });
      if (!read) {
        if (st.size > 0 && !isHersHead(file)) notHers.add(file);
        continue;
      }
      const { meta, fold, firstSaid } = read;
      const owner = meta.cwd ? ownerOf(path.resolve(meta.cwd)) : null;
      // A temp folder is nobody's work, unless it is one of the person's own projects.
      if (ours.has(meta.id) || !meta.cwd || (isScratchFolder(meta.cwd, home) && !owner) || isTaskFolder(meta.cwd)) continue;
      if (!fold.asked.length && !firstSaid) continue;
      const prev = byId.get(meta.id);
      if (prev && prev.lastActiveAt >= Math.max(fold.lastActiveAt, st.mtimeMs)) continue;
      const granted = !!fold.approval && isRunning(fold.approval.command, meta.cwd);
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
        // Stopped on her mid-turn is a stop after anything she typed before it (shared/agents.mts tookHerReply).
        statusAt: Math.max(fold.turnStartedAt, fold.turnEndedAt, status === 'waiting' ? fold.waitingAt : 0),
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
  if (notHers.size > 20000) notHers.clear();
  return [...byId.values()];
}

/** The whole conversation of one Codex session, for "Show the full conversation". */
export function codexConversation(file: string, { now = Date.now(), isRunning = commandRuns }: { now?: number; isRunning?: (command: string, cwd: string) => boolean } = {}): { ok: true; turns: ThreadEvent[]; omitted: number; total: number } | { ok: false; reason: string } {
  const read = readCodexSession(file, { whole: true });
  if (!read) return { ok: false, reason: 'That Codex conversation could not be read.' };
  const { fold, meta } = read;
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { mtime = 0; }
  // A permission it is waiting on is its newest word, though Codex keeps it in a tool call.
  const a = fold.approval;
  const waits = a && !isRunning(a.command, meta.cwd) && codexStatus(fold, mtime, now) === 'waiting';
  const turns = waits ? [...fold.events, { who: 'it' as const, at: fold.lastActiveAt, text: [a.reason && `**${a.reason}**`, a.command && `\`\`\`\n${a.command}\n\`\`\``].filter(Boolean).join('\n\n') }] : fold.events;
  return { ok: true, turns, omitted: 0, total: turns.length };
}

/** "Take me to it" for a Codex session: the Codex app when it runs there. A terminal or editor cannot be found from here. */
/** A Codex session's terminal or editor tab, found by its process, else where to look. */
export async function revealCodex(agent: Pick<Agent, 'app' | 'sessionId' | 'cwd'> | null, {
  platform = process.platform, open = openApp, bring = bringToFront, ps = readPs, cwds = cwdOf,
}: { platform?: NodeJS.Platform; open?: (name: string) => Promise<boolean>; bring?: (pid: number) => Promise<BringResult>; ps?: () => Promise<string>; cwds?: (pids: number[]) => Promise<Map<number, string>> } = {}): Promise<BringResult> {
  if (!agent) return { ok: false, reason: 'That Codex session has closed.' };
  const where = agent.app === 'Codex in your editor' ? 'your editor' : 'the terminal it is running in';
  if (agent.app === 'Codex app') {
    if (platform !== 'darwin') return { ok: false, reason: 'Open the Codex app to answer it.' };
    return (await open('Codex')) ? { ok: true, name: 'Codex' } : { ok: false, reason: 'The Codex app could not be opened.' };
  }
  let table: Map<number, ProcRow>;
  try { table = parsePs(await ps()); } catch { return { ok: false, reason: `Switch to ${where} to answer it.` }; }
  const codexLike = [...table.values()].filter((r) => /(^|\/)codex(\s|$)/.test(r.command)).map((r) => r.pid);
  const pid = codexProcessFor(table, await cwds(codexLike), { sessionId: agent.sessionId ?? '', cwd: agent.cwd });
  if (!pid) return { ok: false, reason: `That Codex has closed. Switch to ${where} to answer it.` };
  return bring(pid);
}

const readPs = () => new Promise<string>((resolve, reject) => {
  execFile('/bin/ps', ['-Aww', '-o', 'pid=,ppid=,tty=,command='], { timeout: 3_000, maxBuffer: 16 << 20, encoding: 'utf8', windowsHide: true }, (err, out) => (err ? reject(err) : resolve(String(out))));
});

function openApp(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('/usr/bin/open', ['-a', name], { timeout: 5000, windowsHide: true }, (err) => resolve(!err));
  });
}
