import { hookFailure } from '../shared/hook-failure.mjs';
// HER CLAUDE CODE AGENTS, READ OFF THE MACHINE — and the one way Agentbox speaks
// back to one. The rules about what any of it MEANS are in shared/agents.mjs,
// pure and pinned; this file only measures and delivers.
//
// Everything here is READ-ONLY except `reply`, which writes one line into a
// socket a live session is already listening on. Agentbox writes nothing to disk
// outside its own store, and in particular it does not touch
// ~/.claude/settings.json. That was the one thing the build was told to ask
// before doing, and it turned out not to be needed: see the note on `reply`.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NAME, Name, WAS } from '../shared/product-name.mjs';
import {
  WORK_CHARS, agentKey, changedFile, commandWork, fullSubject, isBookkeeping, saidCount, sameInstant, threadWindow, workSubject, workVerb,
} from '../shared/agents.mjs';

const run = promisify(execFile);

// Asked for each time rather than resolved once at import. It costs nothing —
// os.homedir is a syscall-free read of the environment — and it is what lets
// the transcript reader be driven over a temporary home in a test, which is the
// only way the SHAPE of Claude Code's own jsonl gets checked at all.
const SESSIONS_DIR = () => path.join(os.homedir(), '.claude', 'sessions');
const PROJECTS_DIR = () => path.join(os.homedir(), '.claude', 'projects');

/* ---------------------------- what is actually up ------------------------ */
// ONE `ps`, FOR EVERYTHING. It answers three questions at once and each of them
// costs a process otherwise: which pids are alive, who started each one (the
// dedupe key for the app's own workers), and when each one started (the guard
// against pid reuse). Sixteen sessions on her machine at the time of writing,
// so sixteen separate `ps` calls per snapshot poll is not a thing to do.
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

// Is the process at that pid still the session the record describes? The rule
// and the timezone trap behind it are in shared/agents.mjs, pure and pinned:
// getting it wrong showed her three of her sixteen live agents.
function stillTheSame(rec, proc) {
  if (!proc) return false;
  if (!/claude/i.test(proc.command)) return false;
  if (!rec.procStart) return true;
  return sameInstant(rec.procStart, proc.started);
}

/* ------------------------------- the sources ----------------------------- */
// TWO SOURCES, UNIONED, because when measured neither one alone saw the whole
// machine. `claude agents --json` (the public scripting flag) listed 3 sessions
// while 16 were live with sockets bound; the per-session state files listed
// those 16 and none of the 3. They disagree about which sessions they know, and
// they agree about the shape of a session, so the honest read is both.
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
      // The CLI must not think it is a child of this session, and the app's own
      // billing rule applies to every claude invocation it makes.
      env: scrubbed(process.env),
    });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// The same scrub the supervisor does before every spawn, for the same reason:
// an inherited ANTHROPIC_API_KEY silently redirects billing off her
// subscription. `claude agents --json` does not talk to the API, but the rule
// in CLAUDE.md is about never handing one to the CLI at all, not about which
// subcommand it happens to be.
function scrubbed(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)/.test(key)) delete out[key];
  }
  return out;
}

/* ------------------------------ the transcript --------------------------- */
// WHEN IT LAST DID ANYTHING, which is a very different number from when its
// process started: her six forgotten agents were all opened within five seconds
// of each other on 12 August and the last thing anyone said in them was 29 and
// 30 July. Started-at would have called them minutes old.
//
// The transcript is `~/.claude/projects/<slug>/<sessionId>.jsonl` and it can be
// megabytes, so only the tail is read, and only when the file has moved since
// last time. Without the cache this runs on every snapshot poll.
//
// AND WHAT THE SESSION IS ABOUT, which is the half of this that was missing.
//
// Claude Code already writes three facts into the same transcript this function
// is already reading, and they were simply being skipped:
//
//   ai-title    a one-line title the session wrote for ITSELF. Every session
//               measured had one inside the 96KB tail, and it is usually the
//               sentence a person would use to recall the session.
//   last-prompt the last thing the user typed into that session.
//   tool_use    the files it has been editing, reading and writing.
//
// So the reading is one pass over a tail that was already being read, and the
// card goes from three lines about a pid to what the work actually is.
//
// WHAT WAS MISSING WAS THE BEGINNING. The human side of a conversation fits on
// a card. The agent's side is what is megabytes.
//
// AND THE TAIL CANNOT SEE IT. The opening turn lands between 11KB and 614KB in
// (pasted images are single transcript lines of hundreds of KB), and 96KB
// off the end reaches none of it. Measured: a 1MB head plus a 512KB tail still
// saw only 46% of the human turns.
//
// So the whole file is read, ONCE, and then only what has been appended since.
// Measured: the first pass over 15 transcripts, 117MB, costs 353ms in total
// and never happens again for that session; after it, a refresh reads only the
// bytes that arrived. This is the same read the tail was already doing, moved
// from "the last 96KB" to "everything, once". No model sees any of it, by
// design.
const CHUNK_BYTES = 4 << 20;
const historyCache = new Map(); // sessionId -> { file, size, mtimeMs, offset, ...facts }
const dirCache = new Map();    // sessionId -> transcript path

// The files it has had its hands on, newest last, deduplicated, and only the
// ones a person would recognise: the basename, never the path. Six is the most
// the card will print and reading more of them is free, so the cap is applied
// where it is shown rather than here.
const TOUCH_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Read', 'MultiEdit']);

function slugFor(cwd) {
  return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
}

function transcriptPath(sessionId, cwd) {
  const cached = dirCache.get(sessionId);
  if (cached && fs.existsSync(cached)) return cached;
  const direct = path.join(PROJECTS_DIR(), slugFor(cwd), `${sessionId}.jsonl`);
  if (fs.existsSync(direct)) { dirCache.set(sessionId, direct); return direct; }
  // The slug rule is Claude Code's, not ours, so a miss falls back to looking.
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR()); } catch { return null; }
  for (const dir of dirs) {
    const p = path.join(PROJECTS_DIR(), dir, `${sessionId}.jsonl`);
    if (fs.existsSync(p)) { dirCache.set(sessionId, p); return p; }
  }
  return null;
}

const NOTHING = { lastActiveAt: 0, lastSaid: '', saidAt: 0, saidOpen: false, about: '', lastAsked: '', touched: [], asked: [] };

// HOW MUCH OF THE LAST REPLY IS KEPT. The card quotes the end of it, so this is
// a bound on the accumulator and not on what the user reads. A human reply is
// rarely anywhere near 6KB.
const SAID_CHARS = 8000;

// WHAT COUNTS AS SOMETHING THE USER TYPED. A Claude Code transcript calls a great
// many things a `user` message that no human wrote: every tool result comes
// back as one, every system reminder is one, every slash command expands into
// one. Reading those onto the card would fill her recall with the machine
// talking to itself, which is worse than the blank it replaces.
//
// So a turn is hers only when it is a `user` line that is not flagged meta, is
// not a compaction summary, carries no tool result, and whose text does not
// open with a tag. Checked against 155 real human turns.
//
// THE CARD AND THE CONVERSATION READ THE SAME LINE DIFFERENTLY, which is why
// this is two functions and not one. A card quotes a sentence, so it flattens
// her paragraphs to a single line; the conversation shows what she actually
// typed, so it keeps them. Splitting it here means the FILTER — the part that
// decides what was written by a human at all — has one copy, and a transcript
// change breaks both at once instead of only the one nobody is looking at.
const RELAY_MARK = `Relayed from ${NAME},`;
// WRITTEN UNDER THE CURRENT NAME, RECOGNISED UNDER EVERY NAME THIS APP HAS
// HAD. A transcript is a file on her disk and it outlives a rename, so a
// marker matched on the current name alone stops matching the day the name
// changes, and the app's own preamble starts reading as something the user typed.
// The letter case is ignored as well: the name was written lowercase until
// 2026-10-02, and those transcripts say "Relayed from agentbox,".
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
  // AND NEVER AGENTBOX'S OWN PREAMBLE. `fromTheApp` puts a sentence of context in
  // front of what the user typed, and today Claude Code stamps the result `isMeta`
  // so this never sees it. If a future one records it as a plain user turn
  // instead, the card would quote Agentbox talking to an agent back at the user
  // as their own words. `spoke` already holds what the user actually typed.
  if (!flat || flat.startsWith('<') || flat.startsWith('[Request interrupted') || wasRelayed(flat)) return '';
  return clean;
}

function herTurn(obj) {
  return herTurnRaw(obj).replace(/\s+/g, ' ').trim();
}

// SOMETHING ARRIVED, SO WHATEVER IT WAS SAYING IS FINISHED. An assistant does
// not speak twice without being spoken to, so the line that ends a reply is the
// next inbound one — and MOST OF THOSE ARE NOT QUOTED ANYWHERE. A message
// Agentbox delivers comes back as `isMeta`, a peer's comes back wrapped, a
// delivery notice comes back as neither, and `herTurnRaw` drops all three on
// purpose. Dropping them from the READING was right; dropping them from the
// COUNTING is what folded two days of separate answers into one bubble.
//
// MEASURED on session-46: its whole conversation came out as three turns, and
// the last one was stamped 2:48pm today while opening with a sentence it had
// said at 7:47pm two days earlier. She read that as the answer to what she had
// just asked. It was not.
//
// A tool result is also a `user` line and is the one thing that does NOT end a
// reply: it is the reply, still going.
function arrived(obj) {
  return obj?.type === 'user' && !obj.toolUseResult;
}

// HOW MUCH OF HER SIDE IS KEPT. The opening is kept forever because it is the
// ask; after that the most recent are what tell her where the thread got to.
// Her longest session had 29 turns, so this loses nothing on today's machine
// and cannot grow without bound on a session that runs for a month.
const KEEP_TURNS = 24;

function remember(acc, line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return; }
  if (obj.timestamp) {
    const ts = Date.parse(obj.timestamp);
    if (Number.isFinite(ts)) acc.lastActiveAt = Math.max(acc.lastActiveAt, ts);
  }
  // The session's own one-line title, rewritten as the work changes, so the
  // LAST one in the file is the current one.
  if (obj.type === 'ai-title' && obj.aiTitle) acc.about = String(obj.aiTitle);
  // The last thing a HUMAN typed into it. Claude Code records it as its own
  // line, so this needs no walking back through tool results to find the one
  // user turn that was not a tool answering a tool.
  if (obj.type === 'last-prompt' && obj.lastPrompt) acc.lastAsked = String(obj.lastPrompt);
  const mine = herTurn(obj);
  if (mine) {
    acc.asked.push({ at: Date.parse(obj.timestamp ?? 0) || 0, text: mine });
    // The first one never leaves. Everything after it is a window on the end.
    if (acc.asked.length > KEEP_TURNS) acc.asked.splice(1, 1);
  }
  // ONE REPLY IS SEVERAL LINES AND THE CARD WANTS THE REPLY. Claude Code writes
  // an answer as a new line every time it stops to use a tool, so this used to
  // keep whichever block came last — routinely a "Done." under four paragraphs
  // that said what was actually done. The blocks of one reply are joined, and
  // the next thing to ARRIVE starts a new one.
  if (arrived(obj)) acc.saidOpen = false;
  if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
    const said = obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (said) {
      const open = acc.saidOpen;
      acc.lastSaid = open ? `${acc.lastSaid}\n\n${said}` : said;
      // The END is what is kept when a reply runs long, because the end is
      // where an answer is. See `howItEnded` in shared/agents.mjs.
      if (acc.lastSaid.length > SAID_CHARS) acc.lastSaid = acc.lastSaid.slice(-SAID_CHARS);
      acc.saidOpen = true;
      // WHEN IT SAID IT, which is the fact the card was missing entirely: six
      // pings and six cards that looked the same, because the quote underneath
      // them carried no time and could not be told from the last one.
      //
      // WHEN IT BEGAN, not when it stopped, and the card's heading is why. A
      // reply that STARTED after her message is an answer to it; one that
      // started before and only finished after is not, and stamping the end
      // would draw it as one.
      const at = Date.parse(obj.timestamp ?? 0) || 0;
      if (at && !open) acc.saidAt = at;
    }
    for (const c of obj.message.content) {
      if (c.type !== 'tool_use' || !TOUCH_TOOLS.has(c.name)) continue;
      const p = c.input?.file_path ?? c.input?.notebook_path;
      if (!p) continue;
      const leaf = path.basename(String(p));
      // Newest wins its place: a file touched again moves to the end rather
      // than keeping the position it had an hour ago.
      const at = acc.touched.indexOf(leaf);
      if (at >= 0) acc.touched.splice(at, 1);
      acc.touched.push(leaf);
      if (acc.touched.length > 40) acc.touched.shift();
    }
  }
}

// Read [from, size) and fold every WHOLE line into the accumulator, returning
// the offset the next read should start at. A transcript is appended to while
// this runs, so the last line in the buffer is routinely half a line; it is
// left behind rather than parsed, and the next pass picks it up entire.
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
  // Whatever is after the last newline has not been counted, so the next read
  // starts there and sees that line whole.
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

  // Carry on from where the last read stopped, unless the file is not the same
  // file any more. A transcript that SHRANK was rotated or rewritten and the
  // old cursor points into the middle of a different conversation, so that
  // case starts over rather than folding two sessions into one card.
  const resume = hit && hit.file === file && stat.size >= hit.size;
  const acc = resume
    ? {
      lastActiveAt: hit.lastActiveAt,
      lastSaid: hit.lastSaid,
      saidAt: hit.saidAt ?? 0,
      // A RESUMED READ IS MID-REPLY UNTIL PROVEN OTHERWISE. The last line the
      // previous pass folded may well have been one block of an answer that is
      // still being written, so the reply stays open across the seam and the
      // next block joins it rather than replacing it.
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

// Exported for the test that drives this against a real transcript's shape.
// The fields it reads are Claude Code's, not ours, so a rename upstream is a
// card that quietly goes back to saying nothing, and only a test against real
// jsonl notices (tests/one-inbox-no-agents-tab.test.mjs).
export { readHistory as __readTail, readHistory as __readHistory };

/* --------------------------------- the list ------------------------------ */
// NOTHING IN HERE MAY EVER BLOCK THE MAIN PROCESS. The list rides the snapshot,
// the snapshot is answered on the main thread, and the main thread is also the
// app: measured 2026-08-16, one `ps` costs 45ms and `claude agents --json`
// costs 215ms, so reading this synchronously on every refetch would freeze the
// window for a quarter of a second at a time, every couple of seconds, forever.
//
// So the read is asynchronous and `listAgents` is a pure lookup that returns
// whatever was last measured and quietly asks for a fresh one when it is stale.
// The first call after boot returns nothing and the one a moment later is
// right, which is exactly the shape of every other live fact in this app.
let cache = { at: 0, agents: [] };
let inFlight = null;
// HOW THE LIST WAS MEASURED LAST TIME, so that anything measuring again does it
// the same way. This is not tidiness: `reply` re-read the list with default
// options, which drops `claude agents --json` (no binary path), and the probe
// on 2026-08-16 came back "That agent is no longer running" while it was
// sitting there listening on its socket. Anything visible through only one of
// the two sources was unreplyable.
let lastOpts = {};
const TTL_MS = 4000;

// Called when the measured list actually CHANGES, not on every refresh: the
// renderer already refetches on a push, and pushing at the refresh rate would
// re-render the window for a `lastActiveAt` that ticked.
export let onChange = null;
export function setOnChange(fn) { onChange = fn; }

function fingerprint(agents) {
  // `statusAt` is in here and `lastActiveAt` is deliberately not. The second is
  // a tick and pushing on it re-renders her window for nothing. The first moves
  // only when the session's status moves, and since a row's LIST depends on it:
  // a session that went busy and back to idle between two readings shows the
  // same `status` both times, and without this the row the user replied to would sit
  // in In progress until some other push happened to come. AND WHEN IT LAST
  // SAID SOMETHING, which is the fact this list existed to notice and did
  // not.An agent that answers her while she is looking at its card moves
  // `saidAt` and nothing else — the status was idle before the reply and is
  // idle after it, and on a quiet machine the two readings either side can both
  // catch it idle — so the row went on showing the answer to the message
  // before. This is not the tick `lastActiveAt` is: it moves only when the
  // session actually says something new.
  return agents.map((a) => `${a.pid}:${a.status ?? ''}:${a.statusAt ?? 0}:${a.waitingFor ?? ''}:${a.saidAt ?? 0}`).sort().join('|');
}

export function listAgents(opts = {}) {
  if (Date.now() - cache.at >= TTL_MS) refresh(opts).catch(() => {});
  return cache.agents;
}

export async function refresh(opts) {
  if (opts) lastOpts = opts;
  const { zeroPid = process.pid, sessionIds = [], products = [], claudeBin = null } = opts ?? lastOpts;
  // One measurement at a time. Without this a burst of pushes starts a `claude
  // agents --json` per push and they queue up behind each other.
  if (inFlight) return inFlight;
  inFlight = measure({ zeroPid, sessionIds, products, claudeBin })
    .then((agents) => {
      const changed = fingerprint(agents) !== fingerprint(cache.agents);
      cache = { at: Date.now(), agents };
      if (changed && onChange) { try { onChange(); } catch { /* a push is not worth a crash */ } }
      return agents;
    })
    .catch(() => {
      // Her inbox is not allowed to go empty because a `ps` failed. The last
      // good reading stands, and the stamp moves so the next call retries.
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
  // all 13 outside agents were in folders no the app product points at.
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
      // WHEN IT LAST SAID WHAT IT WAS DOING, which is the only way to tell a
      // stop that happened BEFORE she spoke to it from one that happened after.
      // The CLI publishes it beside `status` on every change (measured in
      // 2.1.234: the status is one of busy, shell, idle, waiting, and
      // `statusUpdatedAt` is stamped whenever it moves). Without it a reply
      // could never leave In progress, because the session is still idle for
      // the moment or two before it picks the message up.
      statusAt: Number(rec.statusUpdatedAt) || 0,
      waitingFor: rec.waitingFor ?? null,
      socket: rec.messagingSocketPath ?? defaultSocket(rec.pid),
      lastActiveAt: lastActiveAt || rec.startedAt || 0,
      lastSaid,
      // WHEN IT LAST SAID SOMETHING, which is how the card can tell an answer
      // to her newest message from a sentence it left there two days ago.
      // Without it every reply reads as "It stopped here" and nothing more, so
      // six pings produced six cards she could not tell apart.
      saidAt,
      // What the session is about, what she last told it, and what it has been
      // touching. All three come free with the read above.
      about,
      lastAsked,
      touched,
      // No model reads any of it.
      asked,
      transcript,
      product: owner?.slug ?? null,
      productName: owner?.name ?? null,
      // The dedupe key. Both halves of it, so it cannot drift as either changes.
      startedByZero: rec.ppid === zeroPid || (!!rec.sessionId && zeroSessionIds.has(rec.sessionId)),
    });
  }
  return agents;
}

function defaultSocket(pid) {
  const base = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(base, 'cc-socks', `${pid}.sock`);
}

/* ------------------------------ speaking to one -------------------------- */
// THE ONE WRITE. Claude Code sessions listen on a Unix socket and take
// newline-delimited JSON; the CLI prints the shape itself when it binds one
// ("[uds-messaging] Inject messages { echo '{"type":"auth",...}'; echo
// '{"type":"user","message":{"role":"user","content":"hello"}}'; } | socat").
// An auth line is required only when the session published a key file; when it
// did, the token is in ~/.claude/sessions/<pid>.<hash>.key.
//
// MEASURED, NOT REASONED, 2026-08-16: sent into a throwaway session spawned in
// /tmp, the message arrived, was read as her turn, and the agent went back to
// work. It was NOT held for approval, and NO line was added to
// ~/.claude/settings.json. The `crossSessionInbound: "hold"` gate the research
// found applies to messages that carry a peer identity and assert a permission
// mode; a plain injected user turn does not, so the settings line this build
// was told to ask about is not needed and was never written.
//
// TWO DIFFERENT FACTS, AND NEITHER IS OVERSTATED. The socket takes the message
// and does not acknowledge it, so what `reply` can honestly report has two
// levels and it reports whichever one it actually has:
//
//   ok, no movement seen   The message was handed to a live process that was
//                          listening. That IS a fact and it is what "Sent"
//                          means everywhere else in this app.
//   ok, movement seen      The session was then observed going to work, which
//                          is strictly better news and says so.
//
// A failed connect is neither, and says so loudly. What is never done is the
// third thing: a green toast over a message that went nowhere. That is the failure
// this codebase cares about most.
//
// The movement check is BEST EFFORT and is honestly not proven on a real
// waiting agent: no throwaway session could be made to publish the state file
// that carries `status`, so it was only ever exercised against sessions that
// publish neither that nor a transcript. It is written to be a bonus, never a
// gate, precisely because of that.
// WHO IS ASKING, WHICH THE SESSION HAS NO OTHER WAY TO KNOW.
//
// Nothing here claims her authority.
//
// What it does say is the part the wrapper cannot: WHERE the message came from
// and WHAT it is about. MEASURED on a session that had given no response
// without it; one sentence of context is the whole of the difference.
//
// THE USER'S OWN TEXT IS UNCHANGED AND IS WHAT THE CARD QUOTES: `spoke` records
// what the user typed, never this, so nothing the user never wrote is ever drawn
// as their words.
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
    // What goes on the wire says who is asking; what is matched and recorded
    // below stays the user's words, so `heldNotice` cannot start matching every
    // message by its shared opening and the card cannot quote a preamble.
    await writeToSocket(agent.socket, fromTheApp(message), tokenFor(pid));
  } catch (err) {
    return { ok: false, reason: reasonFor(err) };
  }

  const moved = await waitForMovement(agent, before, timeoutMs);

  // A THIRD ANSWER, AND IT IS A FAILURE: THE SESSION HELD IT AND HAS NOT READ
  // IT. Claude Code parks an incoming socket message for the session's own user
  // to approve when the session bypasses permission prompts and the sender did
  // not attest a matching permission mode, which Agentbox cannot do. MEASURED
  // 2026-08-17 against a session started with --permission-mode
  // bypassPermissions: the message never became a turn, the agent never saw it,
  // and this function returned ok, delivered and working, because the session
  // burned CPU drawing the warning. That is the green toast over a message that
  // went nowhere this file says it will never write, so it is checked for.
  //
  // It is BEST EFFORT in one direction only: a session with no transcript
  // cannot be seen holding anything, so a hold that is not found is not a
  // promise there was none. A hold that IS found is a fact and outranks
  // everything above it.
  // Looked for a few times rather than once: `waitForMovement` returns the
  // instant it sees CPU, which on a held message is the session drawing the
  // warning, so the line saying so is often not on disk yet.
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
  // The KEY goes back with the answer so the caller can record that she spoke,
  // and it is worked out HERE because this is where the agent record is. A
  // caller re-deriving it from a pid would be using the one thing that is not an
  // identity (`agentKey`, shared/agents.mjs).
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
        // Half-close: the session reads to end of line, and an abrupt destroy
        // has been seen to drop the final frame.
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

// THREE WAYS TO SEE AN AGENT MOVE, because no single one of them is always
// there. The transcript grows when the session writes the new turn (absent when
// the session has transcript saving off); the state file's status leaves
// `waiting` (absent when a session never published one); and the process starts
// burning CPU, which is true of every session that took a turn and needs
// nothing published anywhere.
//
// The CPU signal was added after the probe on 2026-08-16: a throwaway session
// with no transcript and no state file took the message, answered it on screen,
// and `reply` still had to report that it could not see it move. `ps -o time`
// resolves to a hundredth of a second and an idle session drifts about 0.02s
// in three, so a third of a second of new CPU is a session that went to work.
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

// THE SESSION SAYS SO ITSELF, in the lines written after the send: a `system`
// line whose content opens "Held peer message" and quotes the message back.
// Only the bytes appended since the watermark are read, because the biggest
// transcript on her machine is 160MB and this runs on a click.
const HOLD_LINE = /Held peer message/;

function heldNotice(agent, sinceSize, message) {
  // Resolved rather than taken off the record: a session that had not written a
  // transcript when it was last measured has one by the time it holds a
  // message, and that is exactly the session this is for.
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
    // Said in plain words, not the CLI's. What the user can DO about it is the point:
    // the message is sitting in that session's own window waiting for a yes.
    return `${agent.name} held your message for approval in its own window, so it has not read it yet.`;
  }
  return null;
}

// Exported for the test that pins the hold, under a name that says it is not
// part of the surface: what `reply` returns is.
export const __heldNotice = heldNotice;

function readState(pid) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR(), `${pid}.json`), 'utf8'));
  } catch { return null; }
}

/* ----------------------------- taking her to it -------------------------- */
// A REPLY CANNOT CLEAR A PERMISSION BOX, so that agent needs her where it is
// running, and the honest version of "take me there" is smaller than it sounds.
// All 13 of her outside agents are panes inside another app (CNVS), and there
// is no public command that focuses one: `claude` in this version has no
// `attach` and no `logs`, whatever the earlier write-up said. What CAN be done
// is bring the app that owns the process to the front, so this walks the parent
// chain to the first real application and offers that by name. If it finds
// none, it says so rather than pretending.
export function owningApp(pid) {
  const table = processTable();
  let cur = table.get(pid);
  for (let hops = 0; cur && hops < 12; hops += 1) {
    const m = cur.command.match(/^(\/(?:Applications|System\/Applications)\/[^/]*?\.app)\//);
    if (m) return { path: m[1], name: path.basename(m[1], '.app') };
    cur = table.get(cur.ppid);
  }
  return null;
}

export function reveal(pid) {
  const app = owningApp(pid);
  if (!app) return { ok: false, reason: `${Name} cannot tell which window it is running in.` };
  return new Promise((resolve) => {
    execFile('/usr/bin/open', ['-a', app.path], (err) => {
      resolve(err ? { ok: false, reason: `${app.name} would not come to the front.` } : { ok: true, name: app.name });
    });
  });
}

/* ------------------------------ THE CONVERSATION -------------------------- */
// What the rest of this file reads on a draw is the four facts a card needs;
// this reads what the two of them actually SAID, and only ever because she
// pressed something.
//
// IT IS STREAMED, AND THAT IS NOT A FLOURISH. The biggest transcript on her
// machine is 160MB and costs 729ms to pull the readable text out of (measured
// 2026-08-17 over all 1,250 files). Doing that with readFileSync on the main
// process is the window frozen for three quarters of a second on a click, on
// the one surface built to make her trust the app. readline hands the lines
// back a chunk at a time and the app draws in between.
//
// NO MODEL SEES ANY OF IT, which is a condition of the whole feature, and
// nothing is written anywhere: this opens a file the user already has and reads it.

// One turn is capped here rather than where it is drawn, so a pasted 600KB
// blob never becomes 600KB of React. It is far more than anybody reads and far
// less than a session can hold.
const TURN_CHARS = 4000;

// A session id is used as a FILENAME, so it is checked before it is one. The
// renderer is ours, but a path with a slash in it reaching this would be a read
// outside ~/.claude/projects and there is no reason to leave that open.
function safeSessionId(id) {
  return /^[A-Za-z0-9._-]+$/.test(String(id ?? '')) ? String(id) : null;
}

function saidByIt(obj) {
  if (obj.type !== 'assistant' || !Array.isArray(obj.message?.content)) return '';
  return obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

/* --------------------------- THE WORK IN BETWEEN -------------------------- */
// WHAT IT DID lives in the assistant line; WHAT CAME BACK arrives later, in the
// user line that answers it, keyed by the tool's id. So the events are built
// forwards and their output is filled in behind them, which is why `byId` is
// held across the read.

// Output keeps its HEAD, unlike a turn, which keeps its tail. An answer puts
// its conclusion at the end; a command puts the thing that went wrong at the
// start, and `ls` of a big folder is alphabetical. The count of what was cut
// goes on the line so nothing is rounded off in silence.
function cappedHead(text) {
  const s = String(text ?? '');
  return s.length > WORK_CHARS ? `${s.slice(0, WORK_CHARS - 1)}…` : s;
}

// `dir` IS THE FOLDER THIS SESSION RUNS IN, and it is what turns
// `/Users/you/Desktop/dev/zero/renderer/src/components/Tweaks.tsx` into
// `renderer/src/components/Tweaks.tsx` on her screen.
//
// `full` IS THE WHOLE STRING, and it only travels when shortening actually
// changed something. Her standing objection to every cap in this codebase is
// one that rounds off without saying so, and the fix for a line she cannot read
// cannot be a line she cannot recover.
function workedOn(obj, events, byId, dir = '') {
  if (obj.type !== 'assistant' || !Array.isArray(obj.message?.content)) return;
  const at = Date.parse(obj.timestamp ?? 0) || 0;
  for (const c of obj.message.content) {
    if (c.type !== 'tool_use') continue;
    // The store's own records are how a session talks to the app, not work it
    // did, and a thread that opens on them reads as noise (w-0bd0d8b2ef).
    if (isBookkeeping(c.name)) continue;
    // WHAT A COMMAND DID, IN WORDS, when the whole of it is recognised; null on
    // anything else, and the line is then the command it always was.
    const plain = c.name === 'Bash' ? commandWork(c.input?.command, dir, os.homedir()) : null;
    const subject = plain ? plain.subject : workSubject(c.input, dir, os.homedir());
    const whole = fullSubject(c.input);
    // THE FILE IT CHANGED, WHOLE, so the thread can offer it as a chip into the
    // code. Empty on everything that did not write a file, which is most calls:
    // a command, a search, a read.
    const changed = changedFile(c.name, c.input);
    const event = {
      kind: 'work',
      at,
      verb: plain ? plain.verb : workVerb(c.name),
      subject,
      ...(changed ? { file: changed } : {}),
      // A line put in words always carries the command, even when the words name
      // nothing ("Checked what changed"): the words replaced the only copy of it
      // on the screen, so it has to stay one press behind them.
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
    // THE ONLY COLOUR ON THE WHOLE SURFACE, and it is the tool's own verdict
    // rather than ours: nothing here reads the output looking for the word
    // error, because "0 errors" is not a failure and guessing at one on her
    // screen is worse than saying nothing.
    event.failed = b.is_error === true;
  }
}

// CONSECUTIVE LINES FROM THE SAME SIDE ARE ONE TURN. Claude Code writes an
// assistant's answer as several lines when it stops to use a tool half way
// through, so a single reply arrives here as three. Folding them keeps the
// count honest: "40 messages" should mean forty things somebody said, not forty
// rows in a file.
//
// UNTIL SOMETHING ARRIVES. Folding on the SIDE alone folded every answer a
// session ever gave into one bubble, because the things that end an answer —
// her message from Agentbox, a peer's, a delivery notice — are all dropped from
// the reading and so could not end anything. `seal` is that missing edge, and
// `arrived` above is what calls it.
//
// A TURN IS STAMPED WHEN IT BEGAN, not when it ended, and that is the other
// half of the same bug. The old code moved the stamp forward on every fold
// while the text she reads is the head, so session-46's last bubble said 2:48pm
// today over a sentence from 7:47pm two days earlier and she took it for the
// answer to what she had just asked. The time and the first line she sees now
// come from the same moment, and cannot drift apart again. The ellipsis is
// INSIDE the cap, not on top of it: this is a bound on what the screen is
// handed, and a bound that can be exceeded by one is not one.
function capped(text) {
  return text.length > TURN_CHARS ? `…${text.slice(-(TURN_CHARS - 1))}` : text;
}

// The last thing anybody SAID, looking back past however many things it ran in
// between. Shape B puts work lines in the thread, so the block above a block is
// routinely a command rather than a sentence.
function lastSpoken(turns) {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].kind !== 'work') return turns[i];
  }
  return null;
}

function seal(turns) {
  const last = turns[turns.length - 1];
  if (last) last.sealed = true;
  // AND THE LAST THING SAID, which is not the last thing in the list once work
  // lines are in the thread. Without this, a reminder arriving between a tool
  // call and the next sentence would seal the tool call, leave the sentence
  // above it open, and the two halves of two different answers would be counted
  // as one message.
  const spoken = lastSpoken(turns);
  if (spoken) spoken.sealed = true;
}

function addTurn(turns, who, text, at) {
  const last = turns[turns.length - 1];
  if (last && !last.sealed && last.who === who) {
    // WHAT OVERFLOWS IS THE OLDEST, NEVER THE NEWEST. This used to cut from the
    // front, so the longer an answer ran the more surely its conclusion was the
    // part thrown away. Measured on session-46: a bubble sat at exactly 4000
    // characters with everything after the first 4000 gone.
    last.text = capped(`${last.text}\n\n${text}`);
    return;
  }
  // A CONTINUATION, NOT A NEW MESSAGE. The work between these two blocks is why
  // they are two blocks, and the thread draws them in that order because that
  // is what happened. But it is still one reply: the count says so, and the
  // screen does not put a second name and time over the second half of a
  // sentence somebody was in the middle of.
  const spoken = lastSpoken(turns);
  const same = !!spoken && !spoken.sealed && spoken.who === who && turns[turns.length - 1] !== spoken;
  turns.push(same ? { who, at, text: capped(text), same: true } : { who, at, text: capped(text) });
}

// THE ROW ALREADY KNOWS WHICH SESSION IT IS, so this does not re-measure the
// machine to find out. That is not a saving of milliseconds: `refresh` runs a
// `ps` over every process on the machine, and doing it on a click would put a
// third of a second between her pressing the line and anything happening. The
// pid is only walked back to a live session when the caller has no session id,
// which is the case a dead session leaves behind. `whole` is the gap line in
// the thread being pressed: she is asking for the middle of the conversation
// back, so every message is sent and `omitted` comes back zero. Only the work
// stays capped.
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
  // WHAT IT RAN, KEYED BY ITS ID, because the tool call and the thing that came
  // back from it are two lines apart in the file and the second one is the only
  // place the output exists.
  const byId = new Map();
  try {
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const at = Date.parse(obj.timestamp ?? 0) || 0;
      // Anything inbound closes whatever was being said, whether or not it is
      // shown: a message Agentbox delivered, a peer's, a delivery notice. None of
      // those are quoted here and all of them mean the answer above is over.
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
      // THE WORK GOES IN THE THREAD, IN THE ORDER IT HAPPENED, and it ends the
      // message above it. The chosen shape says each thing it ran sits BETWEEN the
      // messages, so a reply that stopped twice for a tool is three things on
      // the screen in the order they occurred rather than one bubble with the
      // work swept behind it. This is the one place the fold is deliberately
      // broken, and breaking it is the shape that was chosen.
      workedOn(obj, turns, byId, dir);
    }
  } catch {
    // A half-read transcript is still worth what it gave us: a conversation
    // missing its last line beats an empty screen and a shrug.
  }

  // HER REPLIES FROM AGENTBOX ARE NOT IN THE FILE AS HERS. What IS hers is what
  // Agentbox itself delivered, which the caller passes in from the record
  // written at the moment of delivery. Slotted by time, so the thread still
  // reads in the order it happened.
  const said = new Set(turns.filter((t) => t.who === 'you').map((t) => t.text.replace(/\s+/g, ' ').trim()));
  for (const t of Array.isArray(spoke) ? spoke : []) {
    const text = String(t?.text ?? '').trim();
    const at = Number(t?.at) || 0;
    if (!text || !at || said.has(text.replace(/\s+/g, ' ').trim())) continue;
    let i = turns.length;
    while (i > 0 && (turns[i - 1].at ?? 0) > at) i -= 1;
    turns.splice(i, 0, { who: 'you', at, text: text.slice(0, TURN_CHARS) });
  }

  // The seal is scaffolding for the fold above and not a fact about a turn, so
  // it does not go over the wire pretending to be one.
  for (const t of turns) delete t.sealed;

  const { events: shown, omitted } = threadWindow(turns, { whole: !!whole });
  // `total` counts what somebody SAID, not what is on the screen. The header
  // reads "40 messages, oldest first", and a run of tool calls is not messages.
  const total = saidCount(turns);
  return { ok: true, name, turns: shown, omitted, total };
}
