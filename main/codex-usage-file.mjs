// THE CODEX FIGURE SHE ALREADY HAS ON THIS MAC, WHEN NOTHING HAS PUSHED ONE.
//
// IT WAS NOT A BUG, AND IT WAS STILL WRONG. main/codex-usage.mjs holds one rule
// and it is a good one: never spawn anything and never ask OpenAI anything to
// draw a picture. Codex's figures ride the app-server the fleet is already
// running and arrive unprompted during a turn. The unstated cost of that rule is
// that the app only ever learns a number for work POWERUP ITSELF RAN. She runs
// Codex in its own app all day, so on her Mac the push had never arrived and the
// panel was empty while her weekly limit sat at 100% used.
//
// SO THERE IS A THIRD SOURCE, AND IT BREAKS NEITHER HALF OF THAT RULE. Codex
// writes every rate-limit report it receives into its own session log under
// CODEX_HOME, as a `rate_limits` object on the `token_count` events. Reading it
// starts no process, sends nothing anywhere, and touches no credential: it is a
// file on her disk that Codex put there. Measured on her Mac 2026-09-18: 1,140
// such records across her twenty-five most recent sessions, the newest written
// the same minute she filed the row.
//
// THE PUSH STILL WINS. A live notification is this second's truth and a log is
// the last thing anybody wrote down, so main/codex-usage.mjs reads this only when
// it has nothing of its own. Nothing about the existing path changes.
//
// IT IS THE SAME ACCOUNT OR IT IS NOT READ. One CODEX_HOME is one login, and the
// log lives inside the home, so a reading taken from `~/.codex/sessions` is a
// fact about whoever is signed into `~/.codex` and about nobody else. The home is
// handed in for exactly that reason, never guessed at here.
//
// THE FILES ARE ENORMOUS AND ARE NEVER READ WHOLE. Her newest session log was
// 791 MB on the day this was written. Only the tail of each is read, newest
// first, and the answer is cached against the file's own modified time so an idle
// app re-reads nothing.

import fs from 'node:fs';
import path from 'node:path';

/**
 * How much of the end of a session log to read. Her records sit roughly 1.6 MB
 *  apart in the biggest file measured, so this holds several of them; a file
 *  whose tail has none simply falls through to the next one. */
const TAIL_BYTES = 8 * 1024 * 1024;

/**
 * How many session logs to look back through before giving up. A log with no
 *  rate limits in its tail is ordinary: a session can end on a long tool output.
 *  Three is enough to cross that and is still three cheap reads. */
const FILES = 3;

/**
 * Don't answer out of a log nobody has written to in a fortnight. A stale
 *  percentage is worse than no percentage, and the panel says how old its reading
 *  is rather than hiding it, so this only has to catch the absurd cases. */
const TOO_OLD_MS = 14 * 24 * 60 * 60 * 1000;

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A window is only worth having if it says how much is spent. Either spelling,
 *  because the log is snake_case and the push is camel. */
const usable = (window) => plain(window)
  && (Number.isFinite(window.used_percent) || Number.isFinite(window.usedPercent));

/**
 * THE NEWEST SESSION LOGS UNDER THIS HOME, newest first.
 *
 * Codex files them by date (`sessions/2026/09/18/rollout-....jsonl`), so the
 * walk is three levels of directory and never a full recursive scan of a folder
 * holding a thousand files. Only the newest day or two is ever opened.
 */
function newestLogs(home, limit = FILES) {
  const root = path.join(home, 'sessions');
  const found = [];
  const descend = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (depth === 0) {
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        const file = path.join(dir, entry.name);
        try { found.push({ file, at: fs.statSync(file).mtimeMs }); } catch { /* it went away */ }
      }
      return;
    }
    // Newest folder first, and only a couple of them: the name sorts as the date
    // because Codex names them for the date.
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse().slice(0, 2);
    for (const name of dirs) descend(path.join(dir, name), depth - 1);
  };
  descend(root, 3);
  return found.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** The end of a file, without reading the front of it. */
function tail(file, bytes = TAIL_BYTES) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const take = Math.min(size, bytes);
    const buffer = Buffer.allocUnsafe(take);
    fs.readSync(fd, buffer, 0, take, size - take);
    return { text: buffer.toString('utf8'), whole: take === size };
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

/**
 * THE LAST RATE LIMITS THIS LOG RECORDS, or null.
 *
 * Lines are walked backwards because the last report is the one that is true. A
 * report carrying no usable window is skipped rather than accepted: Codex emits
 * an all-null snapshot for limit families that do not apply to the account (her
 * `premium` family, every field null), and taking one of those would blank a
 * panel that had a real figure a moment earlier.
 */
function lastLimitsIn(file) {
  const read = tail(file);
  if (!read) return null;
  const lines = read.text.split('\n');
  // The first line is a fragment unless the whole file was read, and a fragment
  // is not JSON.
  if (!read.whole) lines.shift();
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line || !line.includes('"rate_limits"')) continue;
    let event = null;
    try { event = JSON.parse(line); } catch { continue; }
    const limits = find(event);
    if (!limits) continue;
    if (!usable(limits.primary) && !usable(limits.secondary)) continue;
    const at = Date.parse(event?.timestamp ?? '');
    return {
      snapshot: { primary: limits.primary ?? null, secondary: limits.secondary ?? null },
      at: Number.isFinite(at) ? at : null,
    };
  }
  return null;
}

/**
 * `rate_limits` sits a couple of levels inside the event and Codex has moved it
 *  before, so it is looked for rather than reached for. */
function find(node, depth = 0) {
  if (!plain(node) || depth > 6) return null;
  if (plain(node.rate_limits)) return node.rate_limits;
  for (const value of Object.values(node)) {
    const hit = find(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * What was read last, so an app nobody is touching re-reads nothing. Keyed by
 *  home, and thrown away when the newest log is written to again. */
const remembered = new Map();

/**
 * THE LAST FIGURE CODEX WROTE DOWN UNDER THIS HOME, or null because it never
 * wrote one. Null is an ordinary answer on a Mac where Codex has never run.
 *
 * @param {string|null} home The CODEX_HOME this reading would belong to.
 * @returns {{ snapshot: object, at: number }|null}
 */
export function loggedCodexLimits(home, { now = Date.now() } = {}) {
  if (!home) return null;
  const logs = newestLogs(home);
  if (!logs.length) return null;
  if (now - logs[0].at > TOO_OLD_MS) return null;

  const seen = remembered.get(home);
  if (seen && seen.file === logs[0].file && seen.at === logs[0].at) return seen.reading;

  let reading = null;
  for (const log of logs) {
    reading = lastLimitsIn(log.file);
    if (reading) {
      // The event's own timestamp when it has one, and the file's otherwise.
      if (reading.at === null) reading = { ...reading, at: log.at };
      break;
    }
  }
  remembered.set(home, { file: logs[0].file, at: logs[0].at, reading });
  return reading;
}

/** Drop what was remembered. For tests, and for a home that has changed under us. */
export function forgetLoggedLimits() {
  remembered.clear();
}
