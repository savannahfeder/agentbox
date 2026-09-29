// HER CLAUDE CODE THREADS, WHICH ARE THE AGENTS SHE MEANT.
//
// That sentence retires the assumption `agent-files.mjs` was built on. That
// module reads `.md` agent DEFINITIONS, which is a real thing Claude Code has
// and is not what she is looking at when she says "my agents". the four
// definition files on this Mac were last edited on 23 and 30 March, and she had
// four threads going the evening she complained.
//
// So the import gets a second source, and this is it. Nothing here replaces the
// files; a definition and a thread are different objects and the card shows
// both.
//
// WHERE A THREAD LIVES. Two places, because she named two:
//
//   ~/.claude/projects/<folder>/<id>.jsonl     every terminal session
//   ~/Library/Application Support/Claude/
//     claude-code-sessions/**/local_<id>.json  the desktop app
//
// The terminal store is the transcript itself, one JSON object per line. The
// desktop store is a small record ABOUT the session, and it is the richer of
// the two because the app writes a real `title` into it. Measured 2026-08-29:
// 2,444 transcripts in 240 folders, and 38 desktop records whose newest is
// 7 July, so on her Mac today the terminal side is all of it.
//
// THE HARD PART IS NOT FINDING THEM, IT IS THROWING THEM AWAY. hundreds exist
// and a handful are relevant.
//
// The line that separates them is not a heuristic, which is the good news. Every
// transcript row carries an `entrypoint`, and it says who started the session.
// Counted over all 2,212 transcripts in her store on 2026-08-29:
//
//   2,158  sdk-cli         something started it: Agentbox's own workers, Agentbox's
//                          chats, and our measurement scripts running twenty
//                          agents at a time in temp folders
//      53  cli             she opened a terminal and typed
//       1  claude-desktop  she used the desktop app
//
// So 54 of 2,212 were started by a person, and those 54 are the handful she
// means. Her own test is one of them: `~/Desktop/dev/zero`, 8:38 PM, "this is a
// test", `entrypoint: "cli"`.
//
// A FIRST DRAFT OF THIS GUESSED INSTEAD, and the guess is worth keeping written
// down because it looked like it worked. It dropped anything opening with the
// work item brief and anything running in a temp folder, which on that evening
// removed 126 and 171 rows and left a believable list. It would have kept every
// chat Agentbox itself runs in a product folder, because those open with her own
// question and run somewhere real. `entrypoint` was on the row the whole time.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * "Recent = last few days", in days.
 *
 *  Seven rather than three, and the number is measured rather than chosen.
 *  Counting only the threads a person started, her Mac on 2026-08-29 has 2 in
 *  the last three days and 9 in the last seven, in two folders she works in.
 *  Three days is a card with tonight's test on it and almost nothing else; the
 *  filters have already done the work that "a few" was standing in for, so the
 *  window can afford to be the generous reading. */
export const RECENT_DAYS = 7;

/**
 * How much of a transcript is read to find its first human turn. The first
 *  turn is at the top of the file by construction, and the files are not small:
 *  the largest in her store on 2026-08-29 is 13MB, and there are hundreds. */
const HEAD_BYTES = 96 * 1024;

/**
 * A stop on how many transcripts are OPENED, for the same reason the folder
 *  scan in agent-files.mjs has one: opening a card may not turn into a disk
 *  crawl.
 *
 *  It is a cap on reading, never on looking. The walk stats every file, which
 *  is cheap, throws away everything older than the cutoff, and sorts what is
 *  left newest first before it opens anything. An earlier draft capped the walk
 *  itself and the bug is worth keeping written down: the cap was reached in
 *  directory order, so on her Mac it stopped after 1,500 of 2,444 files and
 *  whether tonight's thread survived was down to where its folder sorted. A
 *  cap that can drop the newest thread on the machine is not a safety rail. */
const MAX_READS = 1200;
// How long the conversation read may take, in ms (w-ec62ab6b38). The card that
// uses it says "Looking" meanwhile; three seconds reaches two thirds of her
// week's 9,073 transcripts and all of a normal Mac's.
const READ_BUDGET_MS = 3000;

/* ------------------------- WHAT IS NOT HERS TO IMPORT ---------------------- */

/**
 * A FOLDER NOBODY WORKS IN.
 *
 *  `/private/var/folders/19/.../T/speedsize-6AGMVw-run-12` is a real cwd of a
 *  real Claude Code session, and it is one of twenty a measurement script of
 *  ours started in a loop. 258 of her 448 recent threads are that. Nobody opens
 *  a temp directory to work, so a thread that ran in one is not a thread she
 *  would recognise, and offering it is how a list of hundreds happens. */
export function isScratchFolder(folder, home = os.homedir()) {
  const p = String(folder ?? '');
  if (!p) return true;
  // A FOLDER INSIDE YOUR OWN HOME IS YOURS, whatever the disk path says. This
  // is the rule the temp-path list is a proxy for, and it has to be stated
  // first, because a Mac can put a home directory anywhere and the tests put
  // one under `/var/folders` on purpose.
  const here = path.resolve(String(home ?? ''));
  if (here && (p === here || p.startsWith(`${here}/`))) return false;
  return /^\/private\/tmp(\/|$)/.test(p)
    || /^\/tmp(\/|$)/.test(p)
    || /^\/private\/var\/folders(\/|$)/.test(p)
    || /^\/var\/folders(\/|$)/.test(p);
}

/**
 * THE ONES A PERSON STARTED, which is the whole filter.
 *
 *  `cli` is a terminal she opened. `claude-desktop` is the desktop app, which
 *  she named. Everything else was started by software, and on this Mac that is
 *  overwhelmingly Agentbox itself: its workers, its chats, and the scripts we run
 *  to measure it. Offering those on an import card would be offering to bring
 *  the inbox into the inbox.
 *
 *  An entrypoint we have never seen is treated as not hers. The cost of being
 *  wrong that way is one missing row on a card; the other way is the hundreds
 *  she is complaining about. */
export function startedByHand(entrypoint) {
  return entrypoint === 'cli' || entrypoint === 'claude-desktop';
}

/**
 * A SUBAGENT IS NOT A THREAD SHE OPENED. Claude Code files them under
 *  `<session>/subagents/`, one per fan-out, so the parent already stands for
 *  them and listing both says the same work twice. */
export function isSubagentPath(file) {
  return /(^|\/)subagents\//.test(String(file ?? ''));
}

/* ------------------------------ WHAT IT IS CALLED -------------------------- */

/**
 * Lines a person did not type, which a transcript's first turn is often made
 *  of: the slash command wrapper, the resume caveat, and anything the harness
 *  injected. A thread named `<command-name>/clear</command-name>` is a thread
 *  she cannot recognise. */
const NOT_TYPED = [
  /^<command-name>/, /^<command-message>/, /^<command-args>/, /^<local-command/,
  /^<system-reminder>/, /^<user-memory/, /^Caveat: The messages below/,
  /^This session is being continued from/, /^\[Request interrupted/,
];

/**
 * THE NAME ON THE ROW, out of the first thing she actually typed.
 *
 *  A terminal transcript has no title in it: measured 2026-08-29, ZERO of her
 *  495 recent files carry a `summary` row, so there is nothing to read but the
 *  conversation. The first human sentence is what the desktop app titles from
 *  too, and it is the line she would know the thread by.
 *
 *  SEVERAL MESSAGES ARE OFFERED, NOT ONE, and that is a fix rather than a
 *  flourish. A session that opens with a slash command has the wrapper as its
 *  first user message and her actual words in the second, so reading only the
 *  first left four of her own threads in an outside repo nameless and
 *  therefore off the card. The first message that is something a person typed
 *  wins; a thread with no such message has no name and is dropped, which is the
 *  right outcome for a session that was never spoken to.
 *
 *  Markdown is flattened rather than rendered, because this lands in a list. */
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
    const t = line.trim();
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

/**
 * `/Users/you/Desktop/dev/zero` → `~/Desktop/dev/zero`. Same reason as the
 * one in agent-files.mjs: a path carrying her account name reads like a
 * system string rather than a folder she knows. */
export function shortFolder(folder, home = os.homedir()) {
  const here = path.resolve(home);
  const full = path.resolve(String(folder ?? '') || here);
  return full === here || full.startsWith(`${here}/`) ? `~${full.slice(here.length)}` : full;
}

/* ------------------------------ THE TERMINAL SIDE -------------------------- */

/**
 * The head of a transcript, and out of it the three things a row needs: who
 *  started the session, which folder it ran in, and the first thing the person
 *  typed.
 *
 *  Read as a fixed head rather than a whole file. `entrypoint` and `cwd` are on
 *  every message row and the first human turn is the first message, so all
 *  three are at the top, and the alternative is reading gigabytes to fill in a
 *  list. Her largest transcript is 13MB and there are hundreds. */
export function readTranscriptHead(file, bytes = HEAD_BYTES) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    const text = buf.slice(0, n).toString('utf8');
    // The last line of a fixed read is usually cut in half. Dropping it costs
    // nothing, because what is wanted is at the top.
    const lines = text.split('\n').slice(0, -1);
    let cwd = null;
    let entrypoint = null;
    const said = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!cwd && typeof row.cwd === 'string' && row.cwd) cwd = row.cwd;
      if (!entrypoint && typeof row.entrypoint === 'string' && row.entrypoint) entrypoint = row.entrypoint;
      if (row.type === 'user' && said.length < 5) {
        const t = messageText(row);
        if (t.trim()) said.push(t);
      }
      if (cwd && entrypoint && said.length >= 5) break;
    }
    return { cwd, entrypoint, said };
  } catch {
    return { cwd: null, entrypoint: null, said: [] };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

/**
 * The words out of one transcript row, whichever of the two shapes it is in.
 *  Content is a string on the plain ones and a list of blocks on the rest. */
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

/**
 * Every terminal thread, newest first, with the three kinds of noise gone.
 *
 *  `skipped` comes back with it because the counts are the argument for the
 *  filters, and a session that changes one of them should be able to see what
 *  it changed rather than take this comment's word for it. */
function readTerminalThreads({ home, cutoff, max, skipIds = new Set() }) {
  const root = path.join(home, '.claude', 'projects');
  const skipped = { old: 0, scratch: 0, started: 0, subagent: 0, empty: 0, unread: 0, desktopDupe: 0 };
  const out = [];
  const all = [];
  walkTranscripts(root, all);
  // Stat everything, keep the recent, newest first, and only then start opening
  // files. This is the order that makes `max` safe: whatever it cuts off is
  // older than everything it kept.
  const recent = [];
  for (const file of all) {
    let when = 0;
    try { when = fs.statSync(file).mtimeMs; } catch { continue; }
    if (when < cutoff) { skipped.old += 1; continue; }
    if (isSubagentPath(file.slice(root.length))) { skipped.subagent += 1; continue; }
    recent.push({ file, when });
  }
  recent.sort((a, b) => b.when - a.when);
  // THE CAP COUNTS WHAT IS KEPT, NOT WHAT IS OPENED (w-ec62ab6b38, 2026-09-28).
  // On a busy machine the last seven days held 9,073 transcripts, the newest
  // 1,200 were opened, and every one of those was started by agentbox itself,
  // so a conversation started by hand was never looked at and the import card
  // said there was nothing, as if the app were not looking in Claude Code at
  // all. Somebody running dozens of agents fills this folder with ours. So it
  // opens newest first until it has `max` of the person's own, or until
  // READ_BUDGET_MS has gone, whichever is first. Reading all 9,073 heads took
  // 5.0s there.
  const started = Date.now();
  let opened = 0;
  for (const { file, when } of recent) {
    if (out.length >= max || Date.now() - started > READ_BUDGET_MS) {
      skipped.unread = recent.length - opened;
      break;
    }
    opened += 1;
    const id = path.basename(file, '.jsonl');
    // THE DESKTOP APP WRITES A THREAD TWICE, once as a transcript here and once
    // as its own record, joined by `cliSessionId`. Measured 2026-08-29 on the
    // one desktop thread in her store. Its own record wins, because the app
    // wrote a real title into it and this side would have to guess one.
    if (skipIds.has(id)) { skipped.desktopDupe += 1; continue; }
    const { cwd, entrypoint, said } = readTranscriptHead(file);
    if (!startedByHand(entrypoint)) { skipped.started += 1; continue; }
    if (isScratchFolder(cwd, home)) { skipped.scratch += 1; continue; }
    const title = threadTitle(said);
    if (!title) { skipped.empty += 1; continue; }
    out.push({
      id,
      source: entrypoint === 'claude-desktop' ? 'desktop' : 'terminal',
      folder: cwd,
      folderName: path.basename(cwd),
      short: shortFolder(cwd, home),
      title,
      when,
      path: file,
    });
  }
  return { threads: out, skipped };
}

/**
 * Every transcript under the projects root, subagent folders included so the
 *  filter above can count them rather than the walk hiding them. Unbounded on
 *  purpose: this only lists names, and the cap that matters is on opening. */
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

/* ------------------------------- THE DESKTOP SIDE -------------------------- */

/** Where the desktop app keeps what it knows about a session. */
export function desktopSessionsDir(home = os.homedir()) {
  return path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
}

/**
 * THE DESKTOP APP'S THREADS, which are the easy half.
 *
 *  Its record is small and it carries a real `title` the app wrote, plus the
 *  folder, the branch and the moment of the last turn. So there is no
 *  transcript to read and no name to guess: measured on her Mac 2026-08-29, 38
 *  records, every one of them titled, for example "Fix duplicate cowork task
 *  display issue".
 *
 *  Archived ones are left out. She archived them, which is the desktop app's
 *  word for done with. */
function readDesktopThreads({ home, cutoff, max }) {
  const root = desktopSessionsDir(home);
  const skipped = { old: 0, scratch: 0, archived: 0, empty: 0 };
  const out = [];
  // Every id this side owns, recent or not, so the transcript walk can leave
  // them alone rather than draw the same thread under a worse name.
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

/* ---------------------------------- BOTH ----------------------------------- */

/**
 * BOTH SOURCES, NEWEST FIRST, THE HANDFUL SHE MEANT.
 *
 *  `days` is her "last few days" and it is a parameter rather than a constant
 *  because the number is the one thing on this card somebody may want to argue
 *  about. Everything else here is a fact about the file.
 *
 *  One row per thread and no folding by folder: the folder is on the row and
 *  the card groups by it, the same way it already groups agent files. */
export function readSessionThreads({
  home = os.homedir(),
  days = RECENT_DAYS,
  now = Date.now(),
  max = MAX_READS,
} = {}) {
  const cutoff = now - Math.max(0, Number(days) || 0) * 86400 * 1000;
  // The desktop side goes first so its ids are known before the transcripts are
  // walked, which is what stops one thread appearing twice.
  const desk = readDesktopThreads({ home, cutoff, max });
  const term = readTerminalThreads({ home, cutoff, max, skipIds: desk.owned });
  const threads = [...term.threads, ...desk.threads].sort((a, b) => b.when - a.when);
  return {
    threads,
    skipped: { ...term.skipped, desktopOld: desk.skipped.old, archived: desk.skipped.archived },
  };
}

/**
 * THE FOLDERS THOSE THREADS RAN IN, each with its own threads under it.
 *
 *  The import card is already a section per place the rows can land, so this is
 *  the shape it wants. Sorted by the newest thread in each, because the folder
 *  she touched an hour ago is the one she is looking for. */
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
