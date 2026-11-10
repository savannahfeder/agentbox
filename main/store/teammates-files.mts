// The two files behind teammates, per account: the teammates themselves and
// the one team chat. Append-only JSON lines, read whole and folded, the way
// repeats.jsonl is. The app and the store tools both write here, so this is
// the only code that knows where they live.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { foldTeammates, foldChat, foldPlaybooks } from '../../shared/teammates.mts';
import type { ChatKind, Playbook, TeamChat, Teammate } from '../../shared/teammates.mts';
import { foldOutbox } from '../../shared/teammate-reach.mts';
import type { Outbox, OutboxLine, TeamView } from '../../shared/teammate-reach.mts';
import { replaceFileSync } from '../replace-file.mts';

const MAX_READ = 4 * 1024 * 1024;
const MAX_LINE = 64 * 1024;

// The writers fill in a line's time when it has none.
type Unwritten<L> = L extends unknown ? Omit<L, 'ts'> & { ts?: number } : never;

export interface ChatWrite { kind: ChatKind; id?: string; ts?: number; [field: string]: unknown }

export interface PlaybookWrite { kind: string; ts?: number; [field: string]: unknown }

export function teamDir(storeRoot: string | null | undefined, accountId: string | null | undefined): string {
  if (!storeRoot || !accountId) throw new Error('teammates need a store root and an account');
  return path.join(storeRoot, 'teammates', String(accountId).replace(/[^A-Za-z0-9_-]/g, '-'));
}

export const teammatesFile = (dir: string): string => path.join(dir, 'teammates.jsonl');
export const chatFile = (dir: string): string => path.join(dir, 'chat.jsonl');
export const playbooksFile = (dir: string): string => path.join(dir, 'playbooks.jsonl');
// What agents asked to say to people, which only the app can send, and who is on
// the team and what the owner can read, which only the app can know.
export const outboxFile = (dir: string): string => path.join(dir, 'outbox.jsonl');
export const teamViewFile = (dir: string): string => path.join(dir, 'team-view.json');
// A teammate's method, which its own runs edit, and the threads it learns
// from, which the app writes out whole.
export const methodFile = (dir: string, id: string): string => path.join(dir, 'methods', `${id}.md`);
export const sourcesDir = (dir: string, id: string): string => path.join(dir, 'sources', id);

const VERSIONS_KEPT = 30;

/** Writes the method whole, keeping the text it replaces so a bad change can be undone. */
export function writeMethod(dir: string, id: string, text: string): string {
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
  replaceFileSync(tmp, file);
  return file;
}

/** The method's text and when it last changed, or null when it has none. */
export function readMethod(dir: string, id: string): { file: string; text: string; changedAt: number } | null {
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
const READ = new Map<string, { key: string; lines: unknown[] }>();

function readLines(file: string): unknown[] {
  let text: string;
  let key: string;
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
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const out: unknown[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try { out.push(JSON.parse(raw)); } catch { /* a torn last line from a crash; the rest still reads */ }
  }
  READ.set(file, { key, lines: out });
  return out.slice();
}

function append<T>(file: string, obj: T): T {
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

export function readTeammates(dir: string, now = Date.now()): Teammate[] {
  return foldTeammates(readLines(teammatesFile(dir)), now);
}

export function readChat(dir: string): TeamChat {
  return foldChat(readLines(chatFile(dir)));
}

export function writeTeammate(dir: string, id: string, patch: Record<string, unknown>, now = Date.now()) {
  return append(teammatesFile(dir), { id, ts: now, patch });
}

export function writeChat(dir: string, line: ChatWrite, now = Date.now()): ChatWrite & { ts: number } {
  const full = { ...line, ts: line.ts ?? now };
  if (full.kind !== 'seen' && !full.id) full.id = newMessageId();
  return append(chatFile(dir), full);
}

export function readOutbox(dir: string): Outbox {
  return foldOutbox(readLines(outboxFile(dir)));
}

export function writeOutbox(dir: string, line: Unwritten<OutboxLine>, now = Date.now()) {
  return append(outboxFile(dir), { ...line, ts: line.ts ?? now });
}

export const newOutId = () => `o-${crypto.randomBytes(6).toString('hex')}`;

export function readTeamView(dir: string): TeamView | null {
  try { return JSON.parse(fs.readFileSync(teamViewFile(dir), 'utf8')); } catch { return null; }
}

export function writeTeamView(dir: string, view: TeamView): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = teamViewFile(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(view));
  replaceFileSync(tmp, file);
}

export function readPlaybooks(dir: string): Playbook[] {
  return foldPlaybooks(readLines(playbooksFile(dir)));
}

export function writePlaybook(dir: string, line: PlaybookWrite, now = Date.now()) {
  return append(playbooksFile(dir), { ...line, ts: line.ts ?? now });
}
