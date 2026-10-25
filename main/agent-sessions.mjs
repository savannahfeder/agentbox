// Claude Code conversation threads for the import card. These are separate from
// the `.md` agent definitions that agent-files.mjs reads, and the card shows both.
//
// A thread lives in one of two places:
//
//   <claude data folder>/projects/<folder>/<id>.jsonl   a terminal or editor
//       session, one JSON object per line (data folders: main/agent-homes.mjs)
//   ~/Library/Application Support/Claude/claude-code-sessions/**/local_<id>.json
//       the desktop app's small record about a session, with a real `title`
//
// Most transcripts on a machine running Agentbox were started by Agentbox. The
// `entrypoint` on every transcript row says who started the session, so the
// filter reads that rather than guessing from the prompt or the folder.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeDataDirs } from './agent-homes.mjs';
import { howTheChatEnded } from '../shared/agent-import.mjs';

/** How many days back counts as recent. Codex reads the same number
 *  (main/codex-threads.mjs), so the two halves of the card agree. */
export const RECENT_DAYS = 10;

/** How much of a transcript is read to find its first human turn, which is at
 *  the top of the file. Transcripts run to many megabytes. */
const HEAD_BYTES = 96 * 1024;

/** How far past the head one cut-off first message may be followed. A
 *  screenshot pasted into the first message is written into that row as
 *  base64, so the row can be hundreds of KB. Eight MB matches the Codex
 *  reader's ceiling (main/codex-threads.mjs). */
const FIRST_TURN_BYTES = 8 * 1024 * 1024;

/** How much of a transcript's end is read for its title and last reply. */
const TAIL_BYTES = 256 * 1024;
/** The longest last reply kept, from its end, which is where the answer is. */
const SAID_CHARS = 8000;
/** The longest first prompt kept for an imported row's opening message. */
const FIRST_CHARS = 4000;

/** A cap on how many threads are kept, so opening the card is not a disk
 *  crawl. It caps reading, never looking: the terminal walk stats every file
 *  and sorts newest first before it opens any, so the cap only drops older
 *  threads. */
const MAX_READS = 1200;
// The card shows "Looking" while this runs.
const READ_BUDGET_MS = 3000;

/** A temp folder, where nobody works. Agentbox's own scripts and workers run
 *  Claude Code sessions there, so a thread from one is not the person's. */
export function isScratchFolder(folder, home = os.homedir()) {
  const p = String(folder ?? '');
  if (!p) return true;
  // A folder inside the home folder is the person's, whatever the path. This
  // check comes first because a Mac can put a home folder anywhere, and the
  // tests put one under `/var/folders`.
  const here = path.resolve(String(home ?? ''));
  if (here && (p === here || p.startsWith(`${here}/`))) return false;
  return /^\/private\/tmp(\/|$)/.test(p)
    || /^\/tmp(\/|$)/.test(p)
    || /^\/private\/var\/folders(\/|$)/.test(p)
    || /^\/var\/folders(\/|$)/.test(p);
}

/** The same rule read off the folder Claude Code filed the transcript in, so
 *  a temp-folder transcript is refused without being opened. Claude Code names
 *  that folder after the working folder with every character that is not a
 *  letter or digit turned into `-`, so `/private/tmp/w-1` is `-private-tmp-w-1`. */
export function isScratchProjectDir(name, home = os.homedir()) {
  const n = String(name ?? '');
  const here = path.resolve(String(home ?? '')).replace(/[^a-zA-Z0-9]/g, '-');
  if (here.length > 1 && (n === here || n.startsWith(`${here}-`))) return false;
  return /^-(private-)?(tmp|var-folders)(-|$)/.test(n);
}

/** Entrypoints a person starts. `cli` is a terminal, `claude-desktop` the
 *  desktop app, and `claude-vscode` the Claude Code extension in VS Code,
 *  Cursor and Windsurf. Everything else, mostly `sdk-cli`, was started by
 *  software, usually Agentbox's own workers and chats. An unknown entrypoint
 *  counts as not the person's: a missing row costs less than hundreds of
 *  wrong ones. `remote*` sessions run in the cloud, not on this disk. */
const BY_HAND = new Set(['cli', 'claude-desktop', 'claude-vscode']);
export function startedByHand(entrypoint) {
  return BY_HAND.has(entrypoint);
}

/** Which of the three places a person starts Claude Code a session came from. */
export function sourceOf(entrypoint) {
  if (entrypoint === 'claude-desktop') return 'desktop';
  return entrypoint === 'claude-vscode' ? 'editor' : 'terminal';
}

/** Claude Code files subagent transcripts under `<session>/subagents/`. The
 *  parent session already stands for that work. */
export function isSubagentPath(file) {
  return /(^|\/)subagents\//.test(String(file ?? ''));
}

/** Lines Claude Code writes into a first turn that a person did not type: the
 *  slash command wrapper, the resume caveat and injected reminders. */
const NOT_TYPED = [
  /^<command-name>/, /^<command-message>/, /^<command-args>/, /^<local-command/,
  /^<system-reminder>/, /^<user-memory/, /^Caveat: The messages below/,
  /^This session is being continued from/, /^\[Request interrupted/,
];

/** The row's name, from the first line a person typed. Terminal transcripts
 *  carry no title, so the conversation is all there is. Takes several messages
 *  because a session that opens with a slash command has the wrapper first and
 *  the person's words second. Returns '' when nobody typed anything, and the
 *  caller drops that thread. */
export function threadTitle(texts, max = 72) {
  for (const text of Array.isArray(texts) ? texts : [texts]) {
    const got = titleFromOne(text, max);
    if (got) return got;
  }
  return '';
}

function titleFromOne(text, max) {
  const raw = String(text ?? '').replace(/\r/g, '');
  for (const line of raw.split('\n')) {
    // `[Image #1]` and `[Pasted text #1 +40 lines]` are Claude Code's stand-ins
    // for what was pasted.
    const t = line.replace(/\[(?:Image|Pasted text) #\d+[^\]]*\]/g, '').trim();
    if (!t) continue;
    if (NOT_TYPED.some((re) => re.test(t))) return '';
    const clean = t
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (!clean) continue;
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return `${(sp > 30 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '')}...`;
  }
  return '';
}

/** Writes a folder under home as `~/...`. */
export function shortFolder(folder, home = os.homedir()) {
  const here = path.resolve(home);
  const full = path.resolve(String(folder ?? '') || here);
  return full === here || full.startsWith(`${here}/`) ? `~${full.slice(here.length)}` : full;
}

/** Reads a transcript's head for who started the session, which folder it ran
 *  in and the first messages the person typed. `entrypoint` and `cwd` are on
 *  every message row and the first human turn comes first, so a fixed head is
 *  enough. */
export function readTranscriptHead(file, bytes = HEAD_BYTES, most = FIRST_TURN_BYTES) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    const text = buf.slice(0, n).toString('utf8');
    // The last line of a full-size read is usually cut in half, so it is set
    // aside. When the whole file fit, the last line is complete and is kept.
    const lines = text.split('\n');
    const cut = n < bytes ? null : lines.pop();
    let cwd = null;
    let entrypoint = null;
    let firstAt = 0;
    const said = [];
    const take = (line) => {
      let row;
      try { row = JSON.parse(line); } catch { return; }
      if (!firstAt && row.timestamp) firstAt = Date.parse(row.timestamp) || 0;
      if (!cwd && typeof row.cwd === 'string' && row.cwd) cwd = row.cwd;
      if (!entrypoint && typeof row.entrypoint === 'string' && row.entrypoint) entrypoint = row.entrypoint;
      if (row.type === 'user' && said.length < 5) {
        const t = messageText(row);
        if (t.trim()) said.push(t);
      }
    };
    for (const line of lines) {
      if (!line.trim()) continue;
      take(line);
      if (cwd && entrypoint && said.length >= 5) break;
    }
    // If the cut line is the first user message, cut because a screenshot was
    // pasted into it, read it to its end, up to `most`. Only when nothing typed
    // was found and the session is not known to be the app's own, so worker
    // transcripts are never read past their head.
    if (!said.length && n === bytes && cut && /"type"\s*:\s*"user"/.test(cut.slice(0, 2048))
      && (!entrypoint || startedByHand(entrypoint))) {
      const rest = restOfLine(fd, n, most - n);
      if (rest) take(Buffer.concat([buf.subarray(buf.lastIndexOf(0x0a, n - 1) + 1, n), rest]).toString('utf8'));
    }
    return { cwd, entrypoint, said, firstAt };
  } catch {
    return { cwd: null, entrypoint: null, said: [], firstAt: 0 };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

/** A `user` line a person typed, as opposed to a tool result, a reminder or a
 *  command's wrapper. Only these end the agent's reply. */
function typedTurn(row) {
  if (row?.type !== 'user' || row.toolUseResult || row.isMeta || row.isCompactSummary) return false;
  return threadTitle(messageText(row)) !== '';
}

/** Reads a transcript's end for Claude Code's own title (`ai-title`, the last
 *  one wins) and the agent's last reply, every text block of it since the last
 *  thing a person typed. */
export function readTranscriptTail(file, bytes = TAIL_BYTES) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const from = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - from);
    const n = fs.readSync(fd, buf, 0, buf.length, from);
    const lines = buf.slice(0, n).toString('utf8').split('\n');
    if (from > 0) lines.shift();
    let aiTitle = '';
    let reply = '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (row.type === 'ai-title' && row.aiTitle) aiTitle = String(row.aiTitle);
      else if (typedTurn(row)) reply = '';
      else if (row.type === 'assistant') {
        const text = messageText(row).trim();
        if (text) reply = reply ? `${reply}\n\n${text}` : text;
      }
    }
    return { aiTitle, lastSaid: reply.slice(-SAID_CHARS) };
  } catch {
    return { aiTitle: '', lastSaid: '' };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

/** What a finished read knows about how a chat ended, for its row and the
 *  setup card. */
function endOf(file) {
  const { aiTitle, lastSaid } = file ? readTranscriptTail(file) : { aiTitle: '', lastSaid: '' };
  return { aiTitle, lastSaid, ...howTheChatEnded(lastSaid) };
}

/** The first message a person typed, whole, for an imported row's opening. */
function firstTyped(said) {
  for (const text of said) {
    if (threadTitle(text)) return String(text).trim().slice(0, FIRST_CHARS);
  }
  return '';
}

/** The bytes from `from` up to the next newline or the end of the file, or
 *  null if neither comes within `budget` bytes. */
function restOfLine(fd, from, budget) {
  const parts = [];
  let at = from;
  const chunk = Buffer.alloc(256 * 1024);
  while (at - from < budget) {
    const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, budget - (at - from)), at);
    if (n <= 0) return Buffer.concat(parts);
    const nl = chunk.subarray(0, n).indexOf(0x0a);
    if (nl >= 0) { parts.push(Buffer.from(chunk.subarray(0, nl))); return Buffer.concat(parts); }
    parts.push(Buffer.from(chunk.subarray(0, n)));
    at += n;
  }
  return null;
}

/** A row's content is either a string or a list of blocks. */
function messageText(row) {
  const c = row?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

/** `skipped` counts why each transcript was left out, so a change to a filter
 *  can be measured. */
function readTerminalThreads({ home, dirs, cutoff, max, budgetMs = READ_BUDGET_MS, skipIds = new Set() }) {
  const skipped = { old: 0, scratch: 0, started: 0, subagent: 0, empty: 0, unread: 0, desktopDupe: 0, copy: 0 };
  const out = [];
  // Every data folder is pooled and sorted newest first before any file is
  // opened, so `max` and the time budget only ever cut off older sessions.
  const recent = [];
  for (const dir of dirs) {
    const root = path.join(dir, 'projects');
    const all = [];
    walkTranscripts(root, all);
    for (const file of all) {
      let when = 0;
      try { when = fs.statSync(file).mtimeMs; } catch { continue; }
      if (when < cutoff) { skipped.old += 1; continue; }
      if (isSubagentPath(file.slice(root.length))) { skipped.subagent += 1; continue; }
      if (isScratchProjectDir(path.relative(root, file).split(path.sep)[0], home)) { skipped.scratch += 1; continue; }
      recent.push({ file, when });
    }
  }
  recent.sort((a, b) => b.when - a.when);
  // One session is one row even when two data folders hold a copy. Newest
  // first, so the copy kept is the one still being written to.
  const seenIds = new Set();
  // The cap counts threads kept, not files opened: on a machine running many
  // workers, the newest thousand transcripts can all be Agentbox's own.
  const started = Date.now();
  let opened = 0;
  // The moment the read gave up at, zero when it read the whole window. A
  // name is only known once the file is open, so a search that stopped in
  // August must not answer "no such chat" as if it had looked at September.
  let reached = 0;
  let lastOpened = 0;
  // The desktop app's own record wins over its transcript, but how the chat
  // ended is only in the transcript.
  const desktopFiles = new Map();
  for (const { file, when } of recent) {
    if (out.length >= max || Date.now() - started > budgetMs) {
      skipped.unread = recent.length - opened;
      reached = lastOpened;
      break;
    }
    opened += 1;
    lastOpened = when;
    const id = path.basename(file, '.jsonl');
    // The desktop app writes a thread twice, as a transcript here and as its
    // own record joined by `cliSessionId`. Its record wins because it has a
    // real title.
    if (skipIds.has(id)) {
      skipped.desktopDupe += 1;
      if (!desktopFiles.has(id)) desktopFiles.set(id, file);
      continue;
    }
    if (seenIds.has(id)) { skipped.copy += 1; continue; }
    const { cwd, entrypoint, said, firstAt } = readTranscriptHead(file);
    // Only a readable copy counts, so a newer copy cut off mid-write does not
    // hide a good older one.
    if (cwd || entrypoint) seenIds.add(id);
    if (!startedByHand(entrypoint)) { skipped.started += 1; continue; }
    if (isScratchFolder(cwd, home)) { skipped.scratch += 1; continue; }
    const title = threadTitle(said);
    if (!title) { skipped.empty += 1; continue; }
    out.push({
      id,
      source: sourceOf(entrypoint),
      folder: cwd,
      folderName: path.basename(cwd),
      short: shortFolder(cwd, home),
      title,
      when,
      path: file,
      firstSaid: firstTyped(said),
      startedAt: firstAt || when,
    });
  }
  return { threads: out, skipped, reached, desktopFiles };
}

/** How many of the newest threads get their end read, and for how long. The
 *  head walk above has its own budget, so this one only ever adds detail to
 *  threads already listed. */
const ENDS_MOST = 120;
const ENDS_BUDGET_MS = 2000;

function withEnds(threads, desktopFiles) {
  const started = Date.now();
  return threads.map((t, i) => {
    const file = t.source === 'desktop' ? desktopFiles.get(t.id) ?? null : t.path;
    if (i >= ENDS_MOST || Date.now() - started > ENDS_BUDGET_MS || !file) {
      // Not "finished": nothing is known of how it ended until it is picked.
      return { ...t, waiting: false, ask: '', lastSaid: '', endUnknown: true };
    }
    const end = endOf(file);
    const firstSaid = t.firstSaid ?? firstTyped(readTranscriptHead(file).said);
    return {
      ...t,
      title: t.source === 'desktop' ? t.title : threadTitle(end.aiTitle) || t.title,
      waiting: end.waiting,
      ask: end.ask,
      lastSaid: end.lastSaid,
      firstSaid,
    };
  });
}

/** The chats somebody picked, with the end read for any the list left unread
 *  (past its cap, or found by name). Codex and desktop chats come read. */
export function readChatEnds(threads) {
  return threads.map((t) => {
    if (t.source === 'codex' || t.source === 'desktop' || !t.path) return t;
    if (t.lastSaid !== undefined && !t.endUnknown) return t;
    const { endUnknown, ...rest } = t;
    return withEnds([rest], new Map())[0];
  });
}

/** Lists every transcript, subagents included so the caller can count them.
 *  Not capped: listing names is cheap, and the cap is on opening. */
function walkTranscripts(dir, into, depth = 4) {
  if (depth < 0) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkTranscripts(full, into, depth - 1);
    else if (e.isFile() && e.name.endsWith('.jsonl')) into.push(full);
  }
}

export function desktopSessionsDir(home = os.homedir()) {
  return path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
}

/** The desktop app's record carries a real `title`, the folder and the time of
 *  the last turn, so no transcript is read. Archived sessions are left out. */
function readDesktopThreads({ home, cutoff, max }) {
  const root = desktopSessionsDir(home);
  const skipped = { old: 0, scratch: 0, archived: 0, empty: 0 };
  const out = [];
  // Every id this side owns, recent or not, so the transcript walk skips them.
  const owned = new Set();
  const files = [];
  walkDesktop(root, files, max);
  for (const file of files) {
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (typeof rec?.cliSessionId === 'string' && rec.cliSessionId) owned.add(rec.cliSessionId);
    const when = Number(rec?.lastActivityAt || rec?.createdAt || 0);
    if (!when || when < cutoff) { skipped.old += 1; continue; }
    if (rec?.isArchived) { skipped.archived += 1; continue; }
    const folder = String(rec?.originCwd || rec?.cwd || '');
    if (isScratchFolder(folder, home)) { skipped.scratch += 1; continue; }
    const title = threadTitle(rec?.title || '');
    if (!title) { skipped.empty += 1; continue; }
    out.push({
      id: String(rec?.cliSessionId || rec?.sessionId || path.basename(file, '.json')),
      source: 'desktop',
      folder,
      folderName: path.basename(folder),
      short: shortFolder(folder, home),
      title,
      when,
      path: file,
      startedAt: Number(rec?.createdAt || when),
    });
  }
  return { threads: out, skipped, owned };
}

function walkDesktop(dir, into, max, depth = 3) {
  if (into.length >= max || depth < 0) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (into.length >= max) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDesktop(full, into, max, depth - 1);
    else if (e.isFile() && e.name.endsWith('.json')) into.push(full);
  }
}

/** Terminal, editor and desktop threads a person started, newest first, one
 *  row per thread. */
export function readSessionThreads({
  home = os.homedir(),
  // The app passes the data folders it found with its own environment and
  // settings. The default is the folders under `home`, ignoring whatever
  // CLAUDE_CONFIG_DIR the calling process has.
  dirs = claudeDataDirs({ home }),
  days = RECENT_DAYS,
  now = Date.now(),
  max = MAX_READS,
  // The card's list keeps the three seconds it was measured for; a search is
  // allowed longer, reaching back a year with somebody waiting on it.
  budgetMs = READ_BUDGET_MS,
  // Whether to read each listed chat's end too: its own title, its last reply
  // and whether it is waiting on you. The year-long search does not need it.
  ends = true,
} = {}) {
  const cutoff = now - Math.max(0, Number(days) || 0) * 86400 * 1000;
  // The desktop side goes first so its ids are known before the transcripts
  // are walked, which stops one thread appearing twice.
  const desk = readDesktopThreads({ home, cutoff, max });
  const term = readTerminalThreads({ home, dirs, cutoff, max, budgetMs, skipIds: desk.owned });
  const listed = [...term.threads, ...desk.threads].sort((a, b) => b.when - a.when);
  const threads = ends ? withEnds(listed, term.desktopFiles) : listed;
  return {
    threads,
    skipped: { ...term.skipped, desktopOld: desk.skipped.old, archived: desk.skipped.archived },
    /** Zero when the whole window was read. See `reached` above. */
    reached: term.reached,
  };
}

/* -------------------- AND THE ONE THE NEW-CHATS WATCH USES ------------------ */
// The watch (main/new-chats-watch.mjs) runs every minute on the main process,
// so it reads only the folders the projects point at, which also leaves out
// Agentbox's own runs in their task folders, only files changed since the
// switch went on, and each file once until it changes.

const PROJECT_CHATS_KEPT = 2000;
const projectChats = new Map();
const slugOf = (folder) => String(folder ?? '').replace(/[^a-zA-Z0-9]/g, '-');
const sameFolder = (a, b) => String(a ?? '').replace(/\/+$/, '') === String(b ?? '').replace(/\/+$/, '');

function readOneChat(file, { id, folder, home, when }) {
  const { cwd, entrypoint, said, firstAt } = readTranscriptHead(file);
  if (!startedByHand(entrypoint) || !sameFolder(cwd, folder)) return null;
  const title = threadTitle(said);
  if (!title) return null;
  const end = endOf(file);
  return {
    id, source: sourceOf(entrypoint), folder: cwd, folderName: path.basename(cwd), short: shortFolder(cwd, home),
    title: threadTitle(end.aiTitle) || title, when, path: file,
    waiting: end.waiting, ask: end.ask, lastSaid: end.lastSaid, firstSaid: firstTyped(said), startedAt: firstAt || when,
  };
}

export function readProjectChats({ home = os.homedir(), dirs = claudeDataDirs({ home }), folders = [], since = 0 } = {}) {
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const folder of folders) {
      const at = path.join(dir, 'projects', slugOf(folder));
      let names = [];
      try { names = fs.readdirSync(at); } catch { continue; }
      for (const name of names) {
        if (!name.endsWith('.jsonl')) continue;
        const id = name.slice(0, -'.jsonl'.length);
        if (seen.has(id)) continue;
        const file = path.join(at, name);
        let st;
        try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < since) continue;
        const kept = projectChats.get(file);
        let thread = kept?.thread ?? null;
        if (!kept || kept.size !== st.size || kept.mtimeMs !== st.mtimeMs) {
          thread = readOneChat(file, { id, folder, home, when: st.mtimeMs });
          projectChats.delete(file);
          projectChats.set(file, { size: st.size, mtimeMs: st.mtimeMs, thread });
          if (projectChats.size > PROJECT_CHATS_KEPT) projectChats.delete(projectChats.keys().next().value);
        }
        if (thread) { seen.add(id); out.push(thread); }
      }
    }
  }
  return out.sort((a, b) => b.when - a.when);
}

/** Groups threads by folder, each folder sorted by its newest thread. Expects
 *  the threads newest first, as readSessionThreads returns them. */
export function threadsByFolder(threads = []) {
  const byFolder = new Map();
  for (const t of threads) {
    const key = t.folder || '';
    if (!byFolder.has(key)) {
      byFolder.set(key, { folder: key, name: t.folderName, short: t.short, threads: [] });
    }
    byFolder.get(key).threads.push(t);
  }
  return [...byFolder.values()].sort((a, b) => (b.threads[0]?.when ?? 0) - (a.threads[0]?.when ?? 0));
}
