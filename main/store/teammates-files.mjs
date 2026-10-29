// The two files behind teammates, per account: the teammates themselves and
// the one team chat. Append-only JSON lines, read whole and folded, the way
// repeats.jsonl is. The app and the store tools both write here, so this is
// the only code that knows where they live.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { foldTeammates, foldChat, foldPlaybooks } from '../../shared/teammates.mjs';

const MAX_READ = 4 * 1024 * 1024;
const MAX_LINE = 64 * 1024;

export function teamDir(storeRoot, accountId) {
  if (!storeRoot || !accountId) throw new Error('teammates need a store root and an account');
  return path.join(storeRoot, 'teammates', String(accountId).replace(/[^A-Za-z0-9_-]/g, '-'));
}

export const teammatesFile = (dir) => path.join(dir, 'teammates.jsonl');
export const chatFile = (dir) => path.join(dir, 'chat.jsonl');
export const playbooksFile = (dir) => path.join(dir, 'playbooks.jsonl');
// A teammate's method, which its own runs edit, and the threads it learns
// from, which the app writes out whole.
export const methodFile = (dir, id) => path.join(dir, 'methods', `${id}.md`);
export const sourcesDir = (dir, id) => path.join(dir, 'sources', id);

const VERSIONS_KEPT = 30;

/** Writes the method whole, keeping the text it replaces so a bad change can be undone. */
export function writeMethod(dir, id, text) {
  const file = methodFile(dir, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let before = '';
  try { before = fs.readFileSync(file, 'utf8'); } catch { /* the first one */ }
  if (before.trim() && before !== text) {
    const versions = path.join(path.dirname(file), `${id}.versions`);
    fs.mkdirSync(versions, { recursive: true });
    fs.writeFileSync(path.join(versions, `${Date.now()}.md`), before);
    const old = fs.readdirSync(versions).sort();
    for (const f of old.slice(0, Math.max(0, old.length - VERSIONS_KEPT))) fs.rmSync(path.join(versions, f), { force: true });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return file;
}

/** The method's text and when it last changed, or null when it has none. */
export function readMethod(dir, id) {
  try {
    const file = methodFile(dir, id);
    const st = fs.statSync(file);
    const text = fs.readFileSync(file, 'utf8');
    return text.trim() ? { file, text, changedAt: st.mtimeMs } : null;
  } catch {
    return null;
  }
}

// The screen asks for these on every refresh; a file only read again when it
// has changed keeps a long chat from costing a parse each time.
const READ = new Map();

function readLines(file) {
  let text;
  let key;
  try {
    const st = fs.statSync(file);
    const size = st.size;
    key = `${size}:${st.mtimeMs}`;
    const had = READ.get(file);
    if (had?.key === key) return had.lines.slice();
    if (size > MAX_READ) {
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.allocUnsafe(MAX_READ);
        const n = fs.readSync(fd, buf, 0, MAX_READ, size - MAX_READ);
        text = buf.toString('utf8', 0, n);
        text = text.slice(text.indexOf('\n') + 1);
      } finally { fs.closeSync(fd); }
    } else {
      text = fs.readFileSync(file, 'utf8');
    }
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try { out.push(JSON.parse(raw)); } catch { /* a torn last line from a crash; the rest still reads */ }
  }
  READ.set(file, { key, lines: out });
  return out.slice();
}

function append(file, obj) {
  const buf = Buffer.from(JSON.stringify(obj) + '\n', 'utf8');
  if (buf.length > MAX_LINE) throw new Error(`teammates line too large (${buf.length} bytes)`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  try { fs.writeSync(fd, buf, 0, buf.length); } finally { fs.closeSync(fd); }
  return obj;
}

export const newTeammateId = () => `t-${crypto.randomBytes(5).toString('hex')}`;
export const newMessageId = () => `m-${crypto.randomBytes(6).toString('hex')}`;
export const newMemoryId = () => `k-${crypto.randomBytes(5).toString('hex')}`;
export const newPlaybookId = () => `p-${crypto.randomBytes(5).toString('hex')}`;
export const newLessonId = () => `l-${crypto.randomBytes(5).toString('hex')}`;
export const newDutyId = () => `d-${crypto.randomBytes(4).toString('hex')}`;

export function readTeammates(dir, now = Date.now()) {
  return foldTeammates(readLines(teammatesFile(dir)), now);
}

export function readChat(dir) {
  return foldChat(readLines(chatFile(dir)));
}

export function writeTeammate(dir, id, patch, now = Date.now()) {
  return append(teammatesFile(dir), { id, ts: now, patch });
}

export function writeChat(dir, line, now = Date.now()) {
  const full = { ...line, ts: line.ts ?? now };
  if (full.kind !== 'seen' && !full.id) full.id = newMessageId();
  return append(chatFile(dir), full);
}

export function readPlaybooks(dir) {
  return foldPlaybooks(readLines(playbooksFile(dir)));
}

export function writePlaybook(dir, line, now = Date.now()) {
  return append(playbooksFile(dir), { ...line, ts: line.ts ?? now });
}
