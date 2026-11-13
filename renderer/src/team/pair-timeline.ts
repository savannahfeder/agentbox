// Everything that passed between two people, in time order, for the person's
// page. Built from what each side holds on its own computer, so both screens
// draw the same entries: nothing in an entry depends on who is looking.
import { baseName, numberInName } from '../../../shared/artifact-marks.mts';
import { isTaskRow, taskGiver } from '../../../shared/team-rules.mts';
import { handedFrom } from '../../../shared/thread-link.mts';
import type { RoomMessage, ThreadTalk } from '../types';

export type { ThreadTalk };

export interface PairTask {
  id: string;
  title: string;
  label?: string;
  body?: string;
  people?: string[];
  assignee?: string;
  createdBy?: string | null;
  createdAt?: number;
  labels?: string[];
  talk?: { chat: readonly { by: string; ts: number; text: string }[] } | null;
}

export type PairOpens =
  | { to: 'task'; id: string }
  | { to: 'thread'; owner: string; threadId: string }
  | { to: 'file'; owner: string; threadId: string; file: string; note: string };

export type PairKind = 'message' | 'task' | 'handoff' | 'reply' | 'comment' | 'note';

export interface PairEntry {
  key: string;
  at: number;
  kind: PairKind;
  by: string;
  /** Whom a task or hand-off went to. */
  to: string | null;
  /** The words; a task's or hand-off's title. */
  text: string;
  where: { label: string; open: PairOpens } | null;
}

export interface PairInput {
  me: string;
  other: string;
  /** The pair's chat rooms: twins started at once are one conversation. */
  rooms: readonly string[];
  messages: readonly RoomMessage[];
  directItems: readonly PairTask[];
  talk: readonly ThreadTalk[];
  titleOf: (owner: string, threadId: string) => string | null;
}

// A reply typed into a task and sent to the chat as well arrives as two lines a moment apart.
const SAME_REPLY_MS = 10 * 60 * 1000;

const said = (s: string) => s.trim().replace(/\s+/g, ' ');

/** A note's file as people say it: its name and version. */
export function fileLabel(file: string): string {
  const [, id, mark, num] = /^(.*?)(?:([#@])(\d+))?$/.exec(file)!;
  const name = id.split('/').pop() || id;
  // A version saved under a new name, `report-v2.md`, is report.md's v2 in the review too.
  const named = baseName(name) !== name ? numberInName(name) : null;
  return `${named ? baseName(name) : name} v${mark === '@' ? num : named ?? num ?? '1'}`;
}

export function pairTimeline({ me, other, rooms, messages, directItems, talk, titleOf }: PairInput): PairEntry[] {
  const pair = new Set([me, other]);
  const otherOf = (by: string) => (by === me ? other : me);
  const out: PairEntry[] = [];
  const chat = messages.filter((m) => rooms.includes(m.roomId) && !m.deleted && !m.inReplyTo && m.by && pair.has(m.by));
  const wheres = new Map<string, PairEntry['where']>();

  for (const t of directItems) {
    if (!isTaskRow(t) || t.people?.length !== 2 || !t.people.every((p) => pair.has(p))) continue;
    const giver = taskGiver(t);
    if (!giver || !pair.has(giver)) continue;
    const title = t.label || t.title;
    const open: PairOpens = { to: 'task', id: t.id };
    const handoff = !!handedFrom(t.body, giver);
    out.push({ key: `task:${t.id}`, at: t.createdAt ?? 0, kind: handoff ? 'handoff' : 'task', by: giver, to: otherOf(giver), text: title, where: { label: title, open } });
    const brief = said(t.body ?? '');
    let briefSeen = false;
    for (const [k, line] of (t.talk?.chat ?? []).entries()) {
      if (!pair.has(line.by) || !said(line.text)) continue;
      if (!briefSeen && line.by === giver && brief.startsWith(said(line.text))) { briefSeen = true; continue; }
      const where = { label: `on ${title}`, open };
      const twin = chat.find((m) => m.by === line.by && said(m.body) === said(line.text) && Math.abs(m.at - line.ts) <= SAME_REPLY_MS && !wheres.has(m.id));
      if (twin) { wheres.set(twin.id, where); continue; }
      out.push({ key: `reply:${t.id}:${k}`, at: line.ts, kind: 'reply', by: line.by, to: otherOf(line.by), text: line.text, where });
    }
  }

  for (const c of talk) {
    const to = otherOf(c.by);
    if (!pair.has(c.by) || !(c.to ?? [c.owner]).includes(to)) continue;
    if (c.kind === 'note') {
      if (!c.file || !c.note) continue;
      out.push({ key: `note:${c.id}`, at: c.at, kind: 'note', by: c.by, to, text: c.text, where: { label: fileLabel(c.file), open: { to: 'file', owner: c.owner, threadId: c.threadId, file: c.file, note: c.note } } });
    } else {
      out.push({ key: `comment:${c.id}`, at: c.at, kind: 'comment', by: c.by, to: c.owner, text: c.text, where: { label: `on ${titleOf(c.owner, c.threadId) ?? 'a thread'}`, open: { to: 'thread', owner: c.owner, threadId: c.threadId } } });
    }
  }

  for (const m of chat) out.push({ key: m.id, at: m.at, kind: 'message', by: m.by!, to: null, text: m.body, where: wheres.get(m.id) ?? null });

  return out.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The words an entry draws under its person's name, as the one looking says it. */
export function pairLine(e: PairEntry, me: string, nameOf: (id: string) => string): string {
  const whom = e.to === me ? 'you' : nameOf(e.to ?? '').split(' ')[0];
  if (e.kind === 'task') return `Gave ${whom} a task`;
  if (e.kind === 'handoff') return `Handed ${whom} a thread`;
  return e.text;
}
