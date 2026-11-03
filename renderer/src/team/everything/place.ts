// A person's or an AI teammate's place: what pressing them opens, the one
// quiet word their card and rail row wear, who is waiting on whom, and which
// home the page draws.
import type { Member } from './members';

/** What pressing a member opens. A place is the person or AI teammate themselves; you and the team keep their boards; a group chat opens on Chats. */
export type Press = 'place' | 'board' | 'chat';

export function pressOpens(key: string): Press {
  if (key.startsWith('person:') || key.startsWith('mate:') || key.startsWith('theirmate:')) return 'place';
  if (key === 'me' || key === 'new') return 'board';
  return key.startsWith('room:') || key.startsWith('direct:') ? 'chat' : 'board';
}

/** The team's own room is a board of everybody's work, not a chat to open. */
export function pressOpensIn(key: string, teamKey: string | null): Press {
  return teamKey && key === teamKey ? 'board' : pressOpens(key);
}

/** A person's direct conversation predates chat rooms; their page opens whichever was written in last. */
export function personChatOpens(direct: { at: number } | null, room: { at: number } | null): 'direct' | 'room' | null {
  if (direct && (!room || direct.at > room.at)) return 'direct';
  return room ? 'room' : null;
}

const ASKS_YOU = new Set(['Waiting on you', 'Has a question for you', 'Asking you to allow a command', 'Holding work for your go-ahead']);

/** The one short word under a name: how they are, never what they are on. */
export function statusWord(m: Pick<Member, 'kind' | 'agents' | 'starting' | 'inProgress' | 'now' | 'key' | 'running'>, waitsOnYou = 0): string {
  if (waitsOnYou > 0 && m.kind !== 'me') return waitsOnYou === 1 ? 'Waiting on you' : `${waitsOnYou} waiting on you`;
  if (m.kind === 'mate') {
    if (m.agents || m.running) return 'Working';
    if (m.starting) return 'Starting';
    if (m.key.startsWith('theirmate:') && m.now && (ASKS_YOU.has(m.now) || m.now === 'Waiting on its owner')) return 'Waiting on its owner';
    if (m.now && ASKS_YOU.has(m.now)) return 'Waiting on you';
    if (m.now === 'Paused' || m.now === 'Setting up') return m.now;
    return 'Free';
  }
  if (m.kind === 'chat') return '';
  // Agents when agents are all of it; a task they hold on top makes it work in progress.
  if (m.agents && (m.inProgress ?? 0) <= m.agents) return m.agents === 1 ? '1 agent working' : `${m.agents} agents working`;
  if (m.inProgress) return `${m.inProgress} in progress`;
  return m.agents == null ? '' : 'Nothing in progress';
}

/** Whether the word is a live one, so its mark moves. */
export const isBusy = (word: string) => word === 'Working' || word === 'Starting' || / working$/.test(word);

type NeedRow = { createdBy?: string | null; labels?: string[]; product: string };
type Mention = { by: string | null };

/**
 * How many things wait on you from each member, by key: a task a person gave
 * you or their mention, a run of your AI teammate that stopped for you. Only
 * rows already in Needs you count, so this never says more than that list does.
 */
export function waitsOnYou({ needs, mentions = [], me, mateOf, directWith = () => null }: {
  needs: readonly NeedRow[]; mentions?: readonly Mention[]; me: string | null;
  mateOf: (row: NeedRow) => string | null;
  /** The person a direct conversation is with, by its project. */
  directWith?: (product: string) => string | null;
}): Map<string, number> {
  const out = new Map<string, number>();
  const add = (key: string) => out.set(key, (out.get(key) ?? 0) + 1);
  for (const row of needs) {
    const mate = mateOf(row);
    if (mate) { add(`mate:${mate}`); continue; }
    const from = row.createdBy && row.createdBy !== me ? row.createdBy : directWith(row.product);
    if (from && from !== me) add(`person:${from}`);
  }
  for (const m of mentions) if (m.by && m.by !== me) add(`person:${m.by}`);
  return out;
}

type Given = { assignee?: string; createdBy?: string | null; status: string };

/** What you are waiting on a person for: tasks you gave them that are not done. */
export function youWaitOn<T extends Given>(items: readonly T[], me: string | null, personId: string): T[] {
  return items.filter((i) => i.assignee === personId && i.status !== 'done' && (!i.createdBy || i.createdBy === me));
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** A place's two lists: what is under way, then what finished in the last week, newest first. */
export function nowAndFinished<T>(rows: readonly T[], { done, at, now }: { done: (r: T) => boolean; at: (r: T) => number; now: number }): { now: T[]; finished: T[] } {
  const on = rows.filter((r) => !done(r)).sort((a, b) => at(b) - at(a));
  const finished = rows.filter((r) => done(r) && at(r) >= now - WEEK).sort((a, b) => at(b) - at(a));
  return { now: on, finished };
}

/** You, the team's chat, people, then AI teammates (yours, then everyone else's). Nobody to show when you are alone. */
export function faceRow(members: readonly Member[]): Member[] {
  const row = [
    ...members.filter((m) => m.kind === 'me'),
    ...members.filter((m) => m.kind === 'chat' && m.team),
    ...members.filter((m) => m.kind === 'person'),
    ...members.filter((m) => m.key.startsWith('mate:')),
    ...members.filter((m) => m.key.startsWith('theirmate:')),
  ];
  return row.some((m) => m.kind !== 'me') ? row : [];
}

/** With a team, the team lives in Team beside the inbox; alone, the inbox is one list. */
export type HomeLayout = 'list' | 'chats';
