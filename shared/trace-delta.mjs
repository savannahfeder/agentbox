// AN OPEN THREAD IS SENT ONLY THE AGENT LOGS THAT CHANGED, AND ONLY WHAT THEY
// GREW BY (tests/an-open-thread-is-sent-only-the-agent-logs-that-changed.test.mjs).
//
// The window sends the stamps of the logs it holds. `traceAnswer` is the
// computer's half, and `traceReader` the window's: a log marked the same comes
// from what it holds, and the read is asked again with no stamps when it cannot
// be put together.

const CAP = 120_000;
// Most of a log a window draws, in bytes: every character past the cap can be four.
const READ_AT_MOST = CAP * 4;
const GROWTH_AT_MOST = 1024 * 1024;

const sizeOf = (stamp) => Number(String(stamp).split(':')[0]);
const timeOf = (stamp) => Number(String(stamp).split(':')[1]);
const drawn = (raw, size, cut) => (cut ? `… truncated (${size} bytes total)\n\n${raw}` : raw);

// How many of the first n bytes end on a whole character. A character the
// writer has not finished waits for the next read, since each piece of it
// decoded alone comes out as "�".
function wholeUpTo(buf, n) {
  for (let i = n - 1; i >= Math.max(0, n - 3); i--) {
    const b = buf[i];
    if ((b & 0xc0) === 0x80) continue;
    const len = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 1;
    return i + len > n ? i : n;
  }
  return n;
}

function readBytes(fs, file, from, to) {
  const buf = Buffer.allocUnsafe(Math.max(0, to - from));
  const fd = fs.openSync(file, 'r');
  let n;
  try { n = wholeUpTo(buf, fs.readSync(fd, buf, 0, buf.length, from)); } finally { fs.closeSync(fd); }
  return { text: buf.toString('utf8', 0, n), end: from + n };
}

/** One log for a screen that holds the stamp `had`, or none. */
export function traceAnswer({ fs, file, startedAt, had }) {
  let st = null;
  try { st = fs.statSync(file); } catch { return { startedAt, text: '' }; }
  const stamp = `${st.size}:${st.mtimeMs}`;
  if (had === stamp) return { startedAt, stamp, same: true };
  const from = had ? sizeOf(had) : NaN;
  try {
    // The stamp says how far the read got, which is short of the file's size
    // while a character is unfinished, so the next read starts there.
    const upTo = (end) => `${end}:${st.mtimeMs}`;
    if (from > 0 && st.size > from && st.size - from <= GROWTH_AT_MOST) {
      const { text, end } = readBytes(fs, file, from, st.size);
      return { startedAt, stamp: upTo(end), from, more: text };
    }
    const start = Math.max(0, st.size - READ_AT_MOST);
    const { text: raw, end } = readBytes(fs, file, start, st.size);
    const cut = start > 0 || raw.length > CAP;
    return { startedAt, stamp: upTo(end), text: drawn(cut ? raw.slice(-CAP) : raw, end, cut), ...(cut ? { cut } : {}) };
  } catch {
    return { startedAt, stamp, text: '' };
  }
}

export function traceReader({ keep = 4 } = {}) {
  const held = new Map();
  return {
    have(key) {
      const logs = held.get(key)?.logs;
      return logs ? Object.fromEntries([...logs].map(([at, log]) => [at, log.stamp])) : undefined;
    },
    take(key, answer) {
      if (!Array.isArray(answer?.sessions)) return answer;
      const before = held.get(key);
      if (!answer.sessions.every((s) => s.stamp)) { held.delete(key); return answer; }
      const logs = new Map();
      for (const s of answer.sessions) {
        const log = settle(before?.logs.get(s.startedAt), s);
        if (!log) { held.delete(key); return null; }
        logs.set(s.startedAt, log);
      }
      const sessions = [...logs.values()].map((log) => log.session);
      // Nothing changed: the same list goes back, so a screen holding it need not draw again.
      const list = before && sessions.length === before.sessions.length && sessions.every((s, i) => s === before.sessions[i]) ? before.sessions : sessions;
      held.delete(key);
      held.set(key, { logs, sessions: list });
      while (held.size > keep) held.delete(held.keys().next().value);
      return { ...answer, sessions: list };
    },
  };
}

// The log this window should hold after one answer about it, or null when the
// answer cannot be used. Logs only grow, so an answer behind what is held is an
// older read landing late, unless the file was replaced, which its time says.
function settle(log, s) {
  const stale = log && sizeOf(s.stamp) <= log.size && timeOf(s.stamp) <= timeOf(log.stamp);
  if (s.same) return log ?? null;
  if (stale) return log;
  if (typeof s.more === 'string') {
    if (!log || s.from !== log.size) return null;
    const all = log.raw + s.more;
    const cut = log.cut || all.length > CAP;
    return entry(s.startedAt, s.stamp, cut ? all.slice(-CAP) : all, cut);
  }
  if (typeof s.text !== 'string') return null;
  return entry(s.startedAt, s.stamp, s.cut ? s.text.slice(s.text.indexOf('\n\n') + 2) : s.text, !!s.cut);
}

function entry(startedAt, stamp, raw, cut) {
  const size = sizeOf(stamp);
  return { stamp, size, raw, cut, session: { startedAt, text: drawn(raw, size, cut) } };
}
