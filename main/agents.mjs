import { hookFailure } from '../shared/hook-failure.mjs';
// Reads the Claude Code sessions running on this machine, and replies to one.
// What the readings mean is decided in shared/agents.mjs; this file only
// measures and delivers. Everything here is read-only except `reply`, which
// writes one line into the socket a live session already listens on.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NAME, Name, WAS } from '../shared/product-name.mjs';
import { findTranscript, transcriptSearch } from './transcript-search.mjs';
import {
  WORK_CHARS, agentKey, changedFile, commandWork, fullSubject, isBookkeeping, saidCount, sameInstant, threadWindow, workSubject, workVerb,
} from '../shared/agents.mjs';

const run = promisify(execFile);

// Resolved on every call rather than at import, so a test can point the
// transcript reader at a temporary home.
const SESSIONS_DIR = () => path.join(os.homedir(), '.claude', 'sessions');
const PROJECTS_DIR = () => path.join(os.homedir(), '.claude', 'projects');

// One `ps` answers three questions: which pids are alive, who started each one
// (the dedupe key for the app's own workers), and when each one started (the
// guard against pid reuse).
async function processTable() {
  const table = new Map();
  let out = '';
  try {
    ({ stdout: out } = await run('/bin/ps', ['-Ao', 'pid=,ppid=,lstart=,command='], {
      encoding: 'utf8', maxBuffer: 16 << 20, timeout: 5000,
    }));
  } catch { return table; }
  for (const line of out.split('\n')) {
    // pid ppid <lstart: Www Mmm dd hh:mm:ss yyyy = 5 fields> command...
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/);
    if (!m) continue;
    table.set(Number(m[1]), { ppid: Number(m[2]), started: m[3].replace(/\s+/g, ' '), command: m[4] });
  }
  return table;
}

// Is the process at that pid still the session the record describes? The rule,
// and the timezone trap behind it, are in `sameInstant` in shared/agents.mjs.
function stillTheSame(rec, proc) {
  if (!proc) return false;
  if (!/claude/i.test(proc.command)) return false;
  if (!rec.procStart) return true;
  return sameInstant(rec.procStart, proc.started);
}

// Two sources, unioned. `claude agents --json` and the per-session state files
// each list sessions the other misses, and both describe a session in the same
// shape.
function fromStateFiles() {
  const found = [];
  let names = [];
  try { names = fs.readdirSync(SESSIONS_DIR()); } catch { return found; }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR(), name), 'utf8'));
      if (rec && rec.pid) found.push(rec);
    } catch { /* a half-written state file is not a reason to show her nothing */ }
  }
  return found;
}

async function fromCli(claudeBin) {
  if (!claudeBin) return [];
  try {
    const { stdout } = await run(claudeBin, ['agents', '--json'], {
      cwd: os.tmpdir(), encoding: 'utf8', maxBuffer: 8 << 20, timeout: 8000,
      // So the CLI does not think it is a child of this session, and never
      // inherits an API key.
      env: scrubbed(process.env),
    });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// The same scrub the supervisor does before every spawn. `claude agents --json`
// does not call the API, but no claude invocation gets an inherited key.
function scrubbed(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)/.test(key)) delete out[key];
  }
  return out;
}

// The transcript, `~/.claude/projects/<slug>/<sessionId>.jsonl`, says when the
// session last did anything (not when its process started), its `ai-title`,
// the `last-prompt`, the files its tool calls touched, and the human turns.
// The opening human turn can sit hundreds of KB in, behind pasted images, so
// the whole file is read once and after that only the bytes appended since.
// No model sees any of it.
const CHUNK_BYTES = 4 << 20;
const historyCache = new Map(); // sessionId -> { file, size, mtimeMs, offset, ...facts }

// Tools whose file paths count as touched. The card prints at most six, and
// that cap is applied where they are shown, not here.
const TOUCH_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Read', 'MultiEdit']);

const transcriptPath = (sessionId, cwd) => findTranscript(PROJECTS_DIR(), sessionId, cwd);

const NOTHING = { lastActiveAt: 0, lastSaid: '', saidAt: 0, saidOpen: false, about: '', lastAsked: '', touched: [], asked: [] };

// The card quotes the end of the last reply, so this bounds the accumulator,
// not what the user reads.
const SAID_CHARS = 8000;

// Claude Code writes tool results, system reminders and expanded slash
// commands as `user` lines too. A turn counts as typed by a person only when it
// is a `user` line that is not meta, not a compaction summary, carries no tool
// result, and does not open with a tag. `herTurnRaw` keeps paragraphs for the
// conversation and `herTurn` flattens them for the card, so the filter has one
// copy.
const RELAY_MARK = `Relayed from ${NAME},`;
// The marker is recognised under every name this app has had, in any letter
// case, because a transcript outlives a rename.
const RELAY_MARKERS = [RELAY_MARK, ...WAS.map((was) => `Relayed from ${was},`)].map((m) => m.toLowerCase());
const wasRelayed = (line) => RELAY_MARKERS.some((m) => line.toLowerCase().startsWith(m));
export { wasRelayed as __wasRelayed };

function herTurnRaw(obj) {
  if (obj.type !== 'user' || obj.isMeta || obj.isCompactSummary || obj.toolUseResult) return '';
  const content = obj.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      : '';
  const clean = String(text).trim();
  const flat = clean.replace(/\s+/g, ' ');
  // Also drop the app's own preamble from `fromTheApp`. Claude Code stamps it
  // `isMeta` today, but if a later version records it as a plain user turn the
  // card would quote it as the user's words.
  if (!flat || flat.startsWith('<') || flat.startsWith('[Request interrupted') || wasRelayed(flat)) return '';
  return clean;
}

function herTurn(obj) {
  return herTurnRaw(obj).replace(/\s+/g, ' ').trim();
}

// Any inbound `user` line ends the reply before it, including the ones
// `herTurnRaw` drops on purpose: messages Agentbox delivered, peer messages and
// delivery notices. A tool result is the exception, because it is part of the
// reply that is still going.
function arrived(obj) {
  return obj?.type === 'user' && !obj.toolUseResult;
}

// Human turns kept per session. The first is kept for good because it is the
// ask; after it, only the most recent.
const KEEP_TURNS = 24;

function remember(acc, line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return; }
  if (obj.timestamp) {
    const ts = Date.parse(obj.timestamp);
    if (Number.isFinite(ts)) acc.lastActiveAt = Math.max(acc.lastActiveAt, ts);
  }
  // Claude Code rewrites the title as the work changes, so the last one wins.
  if (obj.type === 'ai-title' && obj.aiTitle) acc.about = String(obj.aiTitle);
  if (obj.type === 'last-prompt' && obj.lastPrompt) acc.lastAsked = String(obj.lastPrompt);
  const mine = herTurn(obj);
  if (mine) {
    acc.asked.push({ at: Date.parse(obj.timestamp ?? 0) || 0, text: mine });
    // The first turn never leaves; the rest is a window on the end.
    if (acc.asked.length > KEEP_TURNS) acc.asked.splice(1, 1);
  }
  // Claude Code writes one answer as a new line each time it stops for a tool,
  // so the blocks of one reply are joined until the next thing arrives.
  if (arrived(obj)) acc.saidOpen = false;
  if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
    const said = obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (said) {
      const open = acc.saidOpen;
      acc.lastSaid = open ? `${acc.lastSaid}\n\n${said}` : said;
      // A long reply keeps its end, because that is where the answer is. See
      // `howItEnded` in shared/agents.mjs.
      if (acc.lastSaid.length > SAID_CHARS) acc.lastSaid = acc.lastSaid.slice(-SAID_CHARS);
      acc.saidOpen = true;
      // Stamped when the reply began, not when it ended. A reply that started
      // before the user's message is not an answer to it, even if it finished
      // after.
      const at = Date.parse(obj.timestamp ?? 0) || 0;
      if (at && !open) acc.saidAt = at;
    }
    for (const c of obj.message.content) {
      if (c.type !== 'tool_use' || !TOUCH_TOOLS.has(c.name)) continue;
      const p = c.input?.file_path ?? c.input?.notebook_path;
      if (!p) continue;
      const leaf = path.basename(String(p));
      const at = acc.touched.indexOf(leaf);
      if (at >= 0) acc.touched.splice(at, 1);
      acc.touched.push(leaf);
      if (acc.touched.length > 40) acc.touched.shift();
    }
  }
}

// Folds every whole line in [from, size) into the accumulator and returns the
// offset the next read starts at. The transcript is appended to while this
// runs, so a trailing half line is left for the next pass.
function fold(file, acc, from, size) {
  let at = from;
  let rest = '';
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return from; }
  try {
    while (at < size) {
      const want = Math.min(CHUNK_BYTES, size - at);
      const buf = Buffer.alloc(want);
      const got = fs.readSync(fd, buf, 0, want, at);
      if (got <= 0) break;
      const text = rest + buf.slice(0, got).toString('utf8');
      const cut = text.lastIndexOf('\n');
      at += got;
      if (cut < 0) { rest = text; continue; }
      rest = text.slice(cut + 1);
      for (const line of text.slice(0, cut).split('\n')) {
        if (line.trim()) remember(acc, line);
      }
    }
  } catch { /* a partly-read transcript is still worth what it gave us */ }
  finally { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  return at - Buffer.byteLength(rest);
}

function readHistory(sessionId, cwd) {
  const file = transcriptPath(sessionId, cwd);
  if (!file) return { ...NOTHING, transcript: null };
  let stat;
  try { stat = fs.statSync(file); } catch { return { ...NOTHING, transcript: null }; }
  const hit = historyCache.get(sessionId);
  if (hit && hit.file === file && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) {
    return { ...hit, transcript: file };
  }

  // Carry on from the last read unless the file shrank. A smaller file was
  // rotated or rewritten, and the old offset points into a different
  // conversation.
  const resume = hit && hit.file === file && stat.size >= hit.size;
  const acc = resume
    ? {
      lastActiveAt: hit.lastActiveAt,
      lastSaid: hit.lastSaid,
      saidAt: hit.saidAt ?? 0,
      // The last pass may have stopped mid-reply, so the reply stays open
      // across the seam.
      saidOpen: hit.saidOpen ?? false,
      about: hit.about,
      lastAsked: hit.lastAsked,
      touched: [...hit.touched],
      asked: [...hit.asked],
    }
    : { ...NOTHING, touched: [], asked: [] };
  const offset = fold(file, acc, resume ? hit.offset : 0, stat.size);

  const entry = { file, size: stat.size, mtimeMs: stat.mtimeMs, offset, ...acc };
  historyCache.set(sessionId, entry);
  return { ...entry, transcript: file };
}

// Exported for tests/one-inbox-no-agents-tab.test.mjs. The fields it reads are
// Claude Code's, so an upstream rename would blank the card without an error.
export { readHistory as __readTail, readHistory as __readHistory };
export const __transcriptSearch = transcriptSearch;

// The list rides the snapshot, which the main process answers, and a `ps` plus
// `claude agents --json` take a quarter of a second. So `listAgents` returns the
// last reading and starts a fresh one in the background when it is stale. The
// first call after boot returns nothing.
let cache = { at: 0, agents: [] };
let inFlight = null;
// Remembered so a later `refresh()` with no options measures the same way.
// Without the binary path it skips `claude agents --json`, and a session only
// that source sees could not be replied to.
let lastOpts = {};
const TTL_MS = 4000;

// Called only when the list changes, so a ticking `lastActiveAt` does not
// re-render the window.
export let onChange = null;
export function setOnChange(fn) { onChange = fn; }

function fingerprint(agents) {
  // `lastActiveAt` is left out because it ticks. `statusAt` and `saidAt` are in,
  // because a session can go busy and back to idle, or answer, between two
  // readings that both see it idle, and the row still has to move.
  return agents.map((a) => `${a.pid}:${a.status ?? ''}:${a.statusAt ?? 0}:${a.waitingFor ?? ''}:${a.saidAt ?? 0}`).sort().join('|');
}

export function listAgents(opts = {}) {
  if (Date.now() - cache.at >= TTL_MS) refresh(opts).catch(() => {});
  return cache.agents;
}

export async function refresh(opts) {
  if (opts) lastOpts = opts;
  const { zeroPid = process.pid, sessionIds = [], products = [], claudeBin = null } = opts ?? lastOpts;
  // One measurement at a time, so a burst of pushes does not queue a
  // `claude agents --json` each.
  if (inFlight) return inFlight;
  inFlight = measure({ zeroPid, sessionIds, products, claudeBin })
    .then((agents) => {
      const changed = fingerprint(agents) !== fingerprint(cache.agents);
      cache = { at: Date.now(), agents };
      if (changed && onChange) { try { onChange(); } catch { /* a push is not worth a crash */ } }
      return agents;
    })
    .catch(() => {
      // A failed `ps` keeps the last good reading. The stamp moves so the
      // next call retries.
      cache = { ...cache, at: Date.now() };
      return cache.agents;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

async function measure({ zeroPid, sessionIds, products, claudeBin }) {
  const [table, cliRecords] = await Promise.all([processTable(), fromCli(claudeBin)]);
  const zeroSessionIds = new Set(sessionIds.filter(Boolean));

  // A product owns an agent when the agent is working in that product's repo.
  const owners = new Map();
  for (const p of products) {
    if (p?.repoPath) owners.set(path.resolve(p.repoPath), p);
  }

  const byPid = new Map();
  const add = (rec, source) => {
    if (!rec?.pid) return;
    const proc = table.get(rec.pid);
    if (!stillTheSame(rec, proc)) return;
    const prev = byPid.get(rec.pid) ?? {};
    byPid.set(rec.pid, {
      ...prev,
      ...rec,
      ppid: proc.ppid,
      sources: [...(prev.sources ?? []), source],
    });
  };
  for (const rec of fromStateFiles()) add(rec, 'state-file');
  for (const rec of cliRecords) add(rec, 'cli');

  const agents = [];
  for (const rec of byPid.values()) {
    const { lastActiveAt, lastSaid, saidAt, about, lastAsked, touched, asked, transcript } = rec.sessionId
      ? readHistory(rec.sessionId, rec.cwd)
      : { ...NOTHING, transcript: null };
    const owner = owners.get(path.resolve(rec.cwd ?? '/')) ?? null;
    agents.push({
      pid: rec.pid,
      ppid: rec.ppid,
      sessionId: rec.sessionId ?? null,
      name: rec.name ?? `session ${rec.pid}`,
      cwd: rec.cwd ?? '',
      startedAt: rec.startedAt ?? 0,
      status: rec.status ?? null,
      // Claude Code stamps `statusUpdatedAt` whenever `status` moves. It tells a
      // stop before the user's reply from one after, while the session is still
      // idle for a moment before it picks the message up.
      statusAt: Number(rec.statusUpdatedAt) || 0,
      waitingFor: rec.waitingFor ?? null,
      socket: rec.messagingSocketPath ?? defaultSocket(rec.pid),
      lastActiveAt: lastActiveAt || rec.startedAt || 0,
      lastSaid,
      // Tells an answer to the newest message from an older one.
      saidAt,
      about,
      lastAsked,
      touched,
      // No model reads any of it.
      asked,
      transcript,
      product: owner?.slug ?? null,
      productName: owner?.name ?? null,
      // The dedupe key for the app's own workers.
      startedByZero: rec.ppid === zeroPid || (!!rec.sessionId && zeroSessionIds.has(rec.sessionId)),
    });
  }
  return agents;
}

function defaultSocket(pid) {
  const base = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(base, 'cc-socks', `${pid}.sock`);
}

// Tells the session where the message came from and what it is about, which it
// has no other way to know; a session given the bare message did not answer.
// `spoke` records only what the user typed, so the card never quotes this.
export function fromTheApp(message) {
  return [
    `${RELAY_MARK} the inbox your user reads. A person typed this, not an agent,`,
    "and they are asking about THIS session's own work. \"this\", \"it\" and \"the project\"",
    'mean what you are doing here, not another session\'s. Answer in a few plain sentences',
    'they can read on a card, and do not go looking for other sessions to ask.',
    '',
    'They said:',
    message,
  ].join('\n');
}

// The one write. A Claude Code session listens on a Unix socket for
// newline-delimited JSON, in the shape the CLI prints when it binds one. An
// auth line is needed only when the session published a key file,
// ~/.claude/sessions/<pid>.<hash>.key. A plain injected user turn needs no
// change to ~/.claude/settings.json.
//
// The socket does not acknowledge, so a result of ok means the message was
// handed to a live, listening process, and `working` says the session was then
// seen going to work. The movement check is best effort and never a gate.
export async function reply(pid, text, { timeoutMs = 3000 } = {}) {
  const message = String(text ?? '').trim();
  if (!message) return { ok: false, reason: 'There was nothing to send.' };

  const agent = (await refresh()).find((a) => a.pid === pid);
  if (!agent) return { ok: false, reason: 'That agent is no longer running.' };
  if (agent.waitingFor === 'permission prompt') {
    return { ok: false, reason: 'It is waiting on a permission box, which only its own window can answer.' };
  }

  const before = await watermark(agent);
  try {
    // The wire carries the wrapped message. Matching and recording below use
    // the user's own words, so `heldNotice` does not match on the shared
    // preamble.
    await writeToSocket(agent.socket, fromTheApp(message), tokenFor(pid));
  } catch (err) {
    return { ok: false, reason: reasonFor(err) };
  }

  const moved = await waitForMovement(agent, before, timeoutMs);

  // Claude Code holds an incoming socket message for its own user to approve
  // when the session bypasses permission prompts and the sender did not attest
  // a matching permission mode, which Agentbox cannot do. The held session
  // still burns CPU drawing the warning, so it looks like movement. A hold that
  // is found outranks everything above; one that is not found proves nothing.
  // Looked for a few times, because `waitForMovement` returns at the first CPU
  // and the hold line may not be on disk yet.
  let held = null;
  for (let i = 0; i < 6 && !held; i += 1) {
    held = heldNotice(agent, before.size, message);
    if (!held) await new Promise((r) => setTimeout(r, 250));
  }
  if (held) {
    cache = { ...cache, at: 0 };
    return { ok: false, held: true, reason: held };
  }
  cache = { ...cache, at: 0 };   // the agent has moved; the next look re-measures
  // The key is worked out here, where the agent record is, because a pid alone
  // is not an identity (`agentKey`, shared/agents.mjs).
  return { ok: true, delivered: true, working: moved, name: agent.name, key: agentKey(agent), at: Date.now() };
}

function tokenFor(pid) {
  let names = [];
  try { names = fs.readdirSync(SESSIONS_DIR()); } catch { return null; }
  const key = names.find((n) => n.startsWith(`${pid}.`) && n.endsWith('.key'));
  if (!key) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR(), key), 'utf8')).peerToken ?? null;
  } catch { return null; }
}

function writeToSocket(socketPath, message, token) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ path: socketPath });
    const fail = (err) => { sock.destroy(); reject(err); };
    sock.setTimeout(4000, () => fail(new Error('ETIMEDOUT')));
    sock.on('error', fail);
    sock.on('connect', () => {
      if (token) sock.write(`${JSON.stringify({ type: 'auth', token })}\n`);
      sock.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: message } })}\n`, () => {
        // Half-close, because an abrupt destroy has been seen to drop the final
        // frame.
        sock.end();
        resolve();
      });
    });
    sock.on('close', () => resolve());
  });
}

function reasonFor(err) {
  const code = err?.code ?? err?.message ?? '';
  if (String(code).includes('ENOENT')) return 'That agent is not listening any more.';
  if (String(code).includes('ECONNREFUSED')) return 'That agent stopped listening.';
  return 'The message could not be handed over.';
}

// Three signs of movement, because none is always there: the transcript grows,
// the state file's status changes, or the process burns CPU. CPU needs nothing
// published. `ps -o time` resolves to a hundredth of a second and an idle
// session drifts about 0.02 s in three, so this is well clear of idle.
const CPU_MOVED = 0.15;

async function cpuSeconds(pid) {
  try {
    const { stdout } = await run('/bin/ps', ['-o', 'time=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 });
    const m = stdout.trim().match(/(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const [, d = 0, h = 0, mi, sec] = m;
    return Number(d) * 86400 + Number(h) * 3600 + Number(mi) * 60 + Number(sec);
  } catch { return null; }
}

async function watermark(agent) {
  let size = 0;
  let mtimeMs = 0;
  try {
    if (agent.transcript) { const s = fs.statSync(agent.transcript); size = s.size; mtimeMs = s.mtimeMs; }
  } catch { /* no transcript is not a failure; there are two other signals */ }
  return { size, mtimeMs, status: agent.status, cpu: await cpuSeconds(agent.pid) };
}

async function waitForMovement(agent, before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if (agent.transcript) {
        const s = fs.statSync(agent.transcript);
        if (s.size > before.size || s.mtimeMs > before.mtimeMs) return true;
      }
    } catch { /* keep watching the other two */ }
    const state = readState(agent.pid);
    if (state && state.status !== before.status) return true;
    if (before.cpu != null) {
      const now = await cpuSeconds(agent.pid);
      if (now != null && now - before.cpu >= CPU_MOVED) return true;
    }
  }
  return false;
}

// A held session writes a `system` line that opens "Held peer message" and
// quotes the message back. Only bytes appended since the watermark are read,
// because a transcript can be over 100 MB and this runs on a click.
const HOLD_LINE = /Held peer message/;

function heldNotice(agent, sinceSize, message) {
  // Resolved again, because a session may have written its first transcript
  // since it was last measured.
  const file = agent.transcript
    ?? (agent.sessionId ? transcriptPath(agent.sessionId, agent.cwd ?? '') : null);
  if (!file) return null;
  let tail = '';
  try {
    const s = fs.statSync(file);
    if (s.size <= sinceSize) return null;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(s.size - sinceSize, 1 << 20));
      fs.readSync(fd, buf, 0, buf.length, sinceSize);
      tail = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return null; }

  const opening = message.slice(0, 60);
  for (const line of tail.split('\n')) {
    if (!HOLD_LINE.test(line)) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = String(obj?.content ?? '');
    if (!HOLD_LINE.test(content)) continue;
    if (opening && !content.includes(opening.slice(0, 40))) continue;
    return `${agent.name} held your message for approval in its own window, so it has not read it yet.`;
  }
  return null;
}

// Exported for tests/a-held-message-is-not-delivered.test.mjs.
export const __heldNotice = heldNotice;

function readState(pid) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR(), `${pid}.json`), 'utf8'));
  } catch { return null; }
}

// A reply cannot clear a permission box, so that agent needs the user at its
// own window. Claude Code has no command to focus a session, so this walks the
// parent chain to the first macOS .app and brings that to the front.
export async function owningApp(pid) {
  const table = await processTable();
  let cur = table.get(pid);
  for (let hops = 0; cur && hops < 12; hops += 1) {
    const m = cur.command.match(/^(\/(?:Applications|System\/Applications)\/[^/]*?\.app)\//);
    if (m) return { path: m[1], name: path.basename(m[1], '.app') };
    cur = table.get(cur.ppid);
  }
  return null;
}

export async function reveal(pid) {
  const app = await owningApp(pid);
  if (!app) return { ok: false, reason: `${Name} cannot tell which window it is running in.` };
  return new Promise((resolve) => {
    execFile('/usr/bin/open', ['-a', app.path], (err) => {
      resolve(err ? { ok: false, reason: `${app.name} would not come to the front.` } : { ok: true, name: app.name });
    });
  });
}

// The conversation: what both sides said, read only when the user asks for it.
// It is streamed because a transcript can be over 100 MB, and reading that
// whole on the main process freezes the window. No model sees any of it.

// A turn is capped here rather than where it is drawn, so a pasted 600 KB blob
// never reaches React.
const TURN_CHARS = 4000;

// A session id becomes a filename, so it is checked first: a slash in it would
// read outside ~/.claude/projects.
function safeSessionId(id) {
  return /^[A-Za-z0-9._-]+$/.test(String(id ?? '')) ? String(id) : null;
}

function saidByIt(obj) {
  if (obj.type !== 'assistant' || !Array.isArray(obj.message?.content)) return '';
  return obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

// Tool output keeps its head, unlike a turn, which keeps its tail: a command
// puts what went wrong at the start.
function cappedHead(text) {
  const s = String(text ?? '');
  return s.length > WORK_CHARS ? `${s.slice(0, WORK_CHARS - 1)}…` : s;
}

// `dir` is the session's folder, used to shorten paths on screen. `full`
// carries the whole string only when shortening changed it, so a shortened line
// can always be recovered.
function workedOn(obj, events, byId, dir = '') {
  if (obj.type !== 'assistant' || !Array.isArray(obj.message?.content)) return;
  const at = Date.parse(obj.timestamp ?? 0) || 0;
  for (const c of obj.message.content) {
    if (c.type !== 'tool_use') continue;
    // Store tool calls are how a session talks to the app, not work it did.
    if (isBookkeeping(c.name)) continue;
    // A command in plain words when the whole of it is recognised; otherwise
    // null, and the line shows the command.
    const plain = c.name === 'Bash' ? commandWork(c.input?.command, dir, os.homedir()) : null;
    const subject = plain ? plain.subject : workSubject(c.input, dir, os.homedir());
    const whole = fullSubject(c.input);
    // The file it changed, so the thread can offer a chip into the code. Empty
    // for calls that wrote no file.
    const changed = changedFile(c.name, c.input);
    const event = {
      kind: 'work',
      at,
      verb: plain ? plain.verb : workVerb(c.name),
      subject,
      ...(changed ? { file: changed } : {}),
      // A line put in words always carries the command, because the words
      // replaced the only copy of it on screen.
      full: plain || (whole && whole.replace(/\s+/g, ' ').trim() !== subject) ? cappedHead(whole) : '',
      output: '',
      lines: 0,
      failed: false,
    };
    if (c.id) byId.set(c.id, event);
    events.push(event);
  }
}

function cameBack(obj, byId) {
  if (!obj?.toolUseResult || !Array.isArray(obj.message?.content)) return;
  for (const b of obj.message.content) {
    if (b.type !== 'tool_result') continue;
    const event = byId.get(b.tool_use_id);
    if (!event) continue;
    const text = typeof b.content === 'string'
      ? b.content
      : Array.isArray(b.content)
        ? b.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n')
        : '';
    const all = String(text ?? '').replace(/\s+$/, '');
    event.output = cappedHead(all);
    event.lines = all ? all.split('\n').length : 0;
    // The tool's own verdict. The output is never searched for "error",
    // because "0 errors" is not a failure.
    event.failed = b.is_error === true;
  }
}

// The ellipsis is inside the cap, so the result is never longer than
// TURN_CHARS.
function capped(text) {
  return text.length > TURN_CHARS ? `…${text.slice(-(TURN_CHARS - 1))}` : text;
}

// The last thing anybody said, skipping the work lines that sit between
// messages in the thread.
function lastSpoken(turns) {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].kind !== 'work') return turns[i];
  }
  return null;
}

function seal(turns) {
  const last = turns[turns.length - 1];
  if (last) last.sealed = true;
  // Also seal the last spoken turn, which is not the last entry once work lines
  // are in the thread. Otherwise two different answers would count as one.
  const spoken = lastSpoken(turns);
  if (spoken) spoken.sealed = true;
}

// Consecutive lines from the same side are one turn, because Claude Code splits
// one answer into several lines when it stops for a tool. A sealed turn takes
// nothing more, so separate answers never fold together. A turn keeps the time
// it began, so its time and its first line come from the same moment.
function addTurn(turns, who, text, at) {
  const last = turns[turns.length - 1];
  if (last && !last.sealed && last.who === who) {
    // Overflow drops the oldest text, so a long answer keeps its conclusion.
    last.text = capped(`${last.text}\n\n${text}`);
    return;
  }
  // A continuation, not a new message: work between two blocks of one reply
  // splits them on screen, but the count and the heading treat them as one.
  const spoken = lastSpoken(turns);
  const same = !!spoken && !spoken.sealed && spoken.who === who && turns[turns.length - 1] !== spoken;
  turns.push(same ? { who, at, text: capped(text), same: true } : { who, at, text: capped(text) });
}

// Uses the session id the row already has, because `refresh` runs `ps` over
// the whole machine and that is a visible delay on a click. The pid is walked
// back to a live session only when there is no session id. `whole` asks for
// every message, so `omitted` comes back zero; only the work stays capped.
export async function conversation({ pid, sessionId, cwd, spoke = [], whole = false } = {}) {
  let id = safeSessionId(sessionId);
  let dir = cwd ?? '';
  let name = null;
  if (!id) {
    const live = (await refresh()).find((a) => a.pid === Number(pid));
    id = safeSessionId(live?.sessionId);
    dir = live?.cwd ?? dir;
    name = live?.name ?? null;
  }
  if (!id) return { ok: false, reason: `${Name} cannot tell which conversation this is.` };

  const file = transcriptPath(id, dir);
  if (!file) return { ok: false, reason: 'This session has not written a transcript yet.' };

  const turns = [];
  // Tool calls by id. A call is in an assistant line and its output arrives
  // later in a user line, so the events are filled in behind.
  const byId = new Map();
  try {
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const at = Date.parse(obj.timestamp ?? 0) || 0;
      // Anything inbound ends the answer above it, shown or not.
      if (arrived(obj)) seal(turns);
      cameBack(obj, byId);
      const hook = hookFailure(obj);
      if (hook) {
        seal(turns);
        addTurn(turns, 'it', hook, at);
        seal(turns);
        continue;
      }
      const mine = herTurnRaw(obj);
      if (mine) { addTurn(turns, 'you', mine, at); seal(turns); continue; }
      const its = saidByIt(obj);
      if (its) addTurn(turns, 'it', its, at);
      // Work goes in the thread in the order it happened, between messages.
      // This is the one place the fold is broken on purpose.
      workedOn(obj, turns, byId, dir);
    }
  } catch {
    // A half-read transcript still shows what it gave.
  }

  // Replies sent from Agentbox are not in the file as the user's. The caller
  // passes what Agentbox delivered, and each is slotted in by time.
  const said = new Set(turns.filter((t) => t.who === 'you').map((t) => t.text.replace(/\s+/g, ' ').trim()));
  for (const t of Array.isArray(spoke) ? spoke : []) {
    const text = String(t?.text ?? '').trim();
    const at = Number(t?.at) || 0;
    if (!text || !at || said.has(text.replace(/\s+/g, ' ').trim())) continue;
    let i = turns.length;
    while (i > 0 && (turns[i - 1].at ?? 0) > at) i -= 1;
    turns.splice(i, 0, { who: 'you', at, text: text.slice(0, TURN_CHARS) });
  }

  // `sealed` is scaffolding for the fold, not a fact about a turn.
  for (const t of turns) delete t.sealed;

  const { events: shown, omitted } = threadWindow(turns, { whole: !!whole });
  // `total` counts what somebody said; tool calls are not messages.
  const total = saidCount(turns);
  return { ok: true, name, turns: shown, omitted, total };
}
