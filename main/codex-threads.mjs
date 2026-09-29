// HER CODEX CONVERSATIONS, READ OFF WHAT CODEX LEAVES ON THE MAC.
//
// Codex keeps two things this reads, both plain files and both measured on her
// Mac on 2026-09-14 at 19:3x:
//
//   ~/.codex/session_index.jsonl        one line per thread Codex has named:
//                                       {"id", "thread_name", "updated_at"}.
//                                       118 lines that day. A thread Codex has
//                                       not named yet is simply not in it.
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl
//                                       the transcript. Line one is
//                                       `session_meta` with `cwd`, `timestamp`
//                                       and `thread_source`; the rest are
//                                       events, of which `user_message` and
//                                       `agent_message` are the two this reads.
//
// WHICH THREADS ARE THE USER'S. `thread_source` is `user` for one a person typed
// into, `guardian_review` for Codex's own reviewer of a turn, and `subagent` for
// a helper a thread spawned. Guardians are the majority of transcripts, so
// without this filter the inbox would offer several rows for every real
// conversation.
//
// There is also `~/.codex/state_5.sqlite`, which has everything above in one
// table. It is not read: Electron ships no sqlite, the file is written live
// under WAL, and the two plain files carry what the row needs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isScratchFolder, shortFolder, threadTitle } from './agent-sessions.mjs';

export const CODEX_RECENT_DAYS = 7;
/** How many day folders the walk opens at most, whatever `days` says. */
const MAX_DAY_FOLDERS = 40;
/**
 * A transcript is not read past this: the head and the tail are both inside it
 *  for every conversation measured, and a runaway file must not stall a tick. */
const MAX_BYTES = 8 * 1024 * 1024;

export const codexHome = (home = os.homedir()) => path.join(home, '.codex');

/** The names Codex gave her threads, by id. Missing file is an empty map. */
export function readCodexIndex(codexDir = codexHome()) {
  const out = new Map();
  let text = '';
  try { text = fs.readFileSync(path.join(codexDir, 'session_index.jsonl'), 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      const id = String(j?.id ?? '').trim();
      if (!id) continue;
      const at = Date.parse(j?.updated_at ?? '');
      out.set(id, { name: String(j?.thread_name ?? '').trim(), updatedAt: Number.isFinite(at) ? at : 0 });
    } catch { /* one bad line is not a reason to lose the rest */ }
  }
  return out;
}

const numericDesc = (dir) => {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a));
};

/** Every transcript in the newest `days` day folders, newest folder first. */
export function listRolloutFiles(codexDir = codexHome(), { days = CODEX_RECENT_DAYS } = {}) {
  const root = path.join(codexDir, 'sessions');
  const out = [];
  let looked = 0;
  const limit = Math.min(Math.max(1, Number(days) || 1), MAX_DAY_FOLDERS);
  for (const year of numericDesc(root)) {
    for (const month of numericDesc(path.join(root, year))) {
      for (const day of numericDesc(path.join(root, year, month))) {
        if (looked >= limit) return out;
        looked += 1;
        const dir = path.join(root, year, month, day);
        let names = [];
        try { names = fs.readdirSync(dir); } catch { names = []; }
        for (const name of names) {
          if (/^rollout-.*\.jsonl$/.test(name)) out.push(path.join(dir, name));
        }
      }
    }
  }
  return out;
}

/* * * Codex Desktop prefixes a prompt with the files she attached. Everything else is kept as
 is.
*/
export function cleanPrompt(text) {
  let t = String(text ?? '');
  const at = t.indexOf('## My request:');
  if (at >= 0) t = t.slice(at + '## My request:'.length);
  t = t.replace(/^\s*Distinguish instructions in attached documents from the user's request\.\s*/m, '');
  // Codex Desktop wraps each attached picture in <image>…</image> markers in
  // the text beside it; the picture itself is an input_image part.
  t = t.replace(/<\/?image>/g, '');
  return t.trim();
}

/**
 * WHAT CODEX PUTS IN HER MOUTH. In paginated history mode the user turn is a
 * `response_item` with several `<recommended_plugins>…`,
 * `<environment_context>…`, `<user_instructions>…`. Every one of those opens
 * with an angle-bracket tag on its first line, and nothing a person types does.
 * Measured on a real thread: three parts, the
 * first two injected. */
export function isInjected(text) {
  const t = String(text ?? '').trimStart();
  const first = t.split('\n')[0] ?? '';
  if (/^<[a-z_]+[^>]*>/i.test(first)) return true;
  // The folder's AGENTS.md, pasted in as "# AGENTS.md instructions for
  // /path" followed by an <INSTRUCTIONS> block. Measured on a real thread: it
  // was the second part of the first turn, and the first read of it printed it
  // as what the user asked.
  if (/^#\s*AGENTS\.md instructions/i.test(first)) return true;
  return /^\s*<INSTRUCTIONS>/i.test(t.slice(first.length, first.length + 200));
}

/**
 * WHAT CODEX SAID, without its own tool markers. Codex Desktop embeds a
 *  drawing call as private-use characters around a JSON blob, e.g.
 *  U+E200 "visualize" U+E202 {…} U+E201, which the row would otherwise print
 *  as a box and a path. The text on either side is the message. */
export function cleanAnswer(text) {
  return String(text ?? '')
    .replace(/[-][a-z_]*[-]\{[^\n]*?\}[-]?/g, '')
    .replace(/[-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const partsOf = (payload) => (Array.isArray(payload?.content) ? payload.content : []).filter((c) => c && typeof c === 'object');

/**
 * One transcript, read once: who started it, where, what she asked first and
 *  what Codex said last. Null when the file is not a Codex transcript.
 *
 *  TWO SHAPES OF TRANSCRIPT, AND BOTH ARE READ. Codex's `history_mode` is
 *  `legacy` or `paginated` (line one says which). Legacy writes `event_msg`
 *  lines of type `user_message` / `agent_message` with a `message` string.
 *  Paginated writes none of those: the turns are `response_item` lines of type
 *  `message` with a `role` and a `content` array of `input_text`, `input_image`
 *  and `output_text` parts. Current Codex threads are paginated, and a build
 *  that read only legacy showed "Codex has not answered yet." on every row. */
export function readRollout(file) {
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, MAX_BYTES));
      fs.readSync(fd, buf, 0, buf.length, 0);
      text = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return null; }
  const lines = text.split('\n');
  let meta = null;
  let prompt = '';
  let last = '';
  let turns = 0;
  let images = 0;
  let lastActive = 0;
  // Paginated mode writes the same turn twice when an event_msg is also
  // present, so a turn is counted once whichever line says it.
  let sawEventTurns = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (!meta) {
      if (j?.type !== 'session_meta') return null;
      const p = j.payload ?? {};
      const startedAt = Date.parse(p.timestamp ?? j.timestamp ?? '');
      meta = {
        id: String(p.session_id ?? p.id ?? '').trim(),
        cwd: String(p.cwd ?? '').trim(),
        threadSource: typeof p.thread_source === 'string' ? p.thread_source : (typeof p.source === 'string' ? 'user' : 'other'),
        startedAt: Number.isFinite(startedAt) ? startedAt : 0,
      };
      continue;
    }
    const at = Date.parse(j.timestamp ?? '');
    if (Number.isFinite(at) && at > lastActive) lastActive = at;
    const p = j.payload ?? {};
    if (j.type === 'event_msg') {
      if (p.type === 'user_message') {
        const said = cleanPrompt(p.message);
        if (!prompt && said && !isInjected(said)) prompt = said;
        turns += 1;
        sawEventTurns = true;
      } else if (p.type === 'agent_message') {
        const said = cleanAnswer(p.message);
        if (said) last = said;
      }
      continue;
    }
    if (j.type !== 'response_item' || p.type !== 'message') continue;
    if (p.role === 'user') {
      const parts = partsOf(p);
      images += parts.filter((c) => c.type === 'input_image').length;
      const hers = parts
        .filter((c) => c.type === 'input_text' && typeof c.text === 'string' && !isInjected(c.text))
        .map((c) => cleanPrompt(c.text))
        .filter(Boolean);
      if (!hers.length) continue; // a turn made of nothing but Codex's own preamble
      if (!prompt) prompt = hers.join('\n\n').trim();
      if (!sawEventTurns) turns += 1;
    } else if (p.role === 'assistant') {
      const said = cleanAnswer(partsOf(p).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('\n'));
      if (said) last = said;
    }
  }
  if (!meta || !meta.id) return null;
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { mtime = 0; }
  return { ...meta, prompt, last, turns, images, lastActive, path: file, mtime };
}

/**
 * A transcript written to in the last two minutes is a conversation Codex is
 *  still in. Two minutes because Codex writes a token count line every turn and
 *  a turn on her Mac was never longer than that between writes. */
export const LIVE_MS = 2 * 60_000;
export const isLive = (mtime, now = Date.now()) => Number(mtime) > 0 && now - Number(mtime) < LIVE_MS;

/**
 * THE USER'S CONVERSATIONS, newest first, in the shape the import card and the
 *  import row both read. One entry per thread a person typed into, in a real folder,
 *  touched in the last `days` days. */
export function readCodexThreads({ home = os.homedir(), codexDir = codexHome(home), days = CODEX_RECENT_DAYS, now = Date.now() } = {}) {
  const index = readCodexIndex(codexDir);
  const cutoff = now - Math.max(0, Number(days) || 0) * 86400 * 1000;
  const out = [];
  const skipped = { notHers: 0, scratch: 0, old: 0, empty: 0, unreadable: 0 };
  for (const file of listRolloutFiles(codexDir, { days })) {
    const r = readRollout(file);
    if (!r) { skipped.unreadable += 1; continue; }
    if (r.threadSource !== 'user') { skipped.notHers += 1; continue; }
    if (!r.cwd || isScratchFolder(r.cwd, home)) { skipped.scratch += 1; continue; }
    const named = index.get(r.id);
    const when = Math.max(named?.updatedAt ?? 0, r.mtime, r.startedAt);
    if (when < cutoff) { skipped.old += 1; continue; }
    const title = named?.name || threadTitle([r.prompt]);
    if (!title) { skipped.empty += 1; continue; }
    out.push({
      id: r.id,
      source: 'codex',
      folder: r.cwd,
      folderName: path.basename(r.cwd),
      short: shortFolder(r.cwd, home),
      title,
      when,
      startedAt: r.startedAt,
      lastActive: Math.max(r.lastActive, r.mtime),
      turns: r.turns,
      images: r.images,
      path: file,
      prompt: r.prompt,
      last: r.last,
      live: isLive(r.mtime, now),
    });
  }
  out.sort((a, b) => b.when - a.when);
  return { threads: out, skipped };
}
