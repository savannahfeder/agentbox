// Everything else on the phone: your team as cards, built by the desktop's own
// rules (renderer/src/team/everything/members.ts, whose-board.ts) from what the
// phone can read, and whose work goes under the card that is lit.
import { buildMembers, mateRunsOf, moreLine, orderMembers, personCardsOf, readOrder, rowsShown, teamRunsOf, type Member } from '../../../renderer/src/team/everything/members';
import { boardItems, flipEvView, readEvView, writeEvView, type EvView } from '../../../renderer/src/team/everything/whose-board';
import { teammateIdOf } from '../../../shared/teammates.mjs';
import type { Room, RoomMessage, Teammate, ThreadCard } from '../../../renderer/src/types';
import { groupName } from './groups';
import type { KeptStore } from './compose';

export { flipEvView, mateRunsOf, personCardsOf, teamRunsOf, type EvView, type Member };

const asStorage = (store: KeptStore) => store as unknown as Storage;
export const evViewOf = (store: KeptStore): EvView => readEvView(asStorage(store));
export const keepEvView = (view: EvView, store: KeptStore) => writeEvView(view, asStorage(store));

/** Everyone on the team's shared threads. Only what a teammate's line may carry is on them (20261001000400_thread_cards.sql). */
export const THREAD_CARDS_SELECT = 'select=person_id,thread_id,visible,title,project,state,priority,problem,progress,solution,updated_at&order=updated_at.desc&limit=300';
export function threadCardOf(r: any): ThreadCard {
  return {
    personId: r.person_id, threadId: r.thread_id, visible: r.visible !== false, title: r.title ?? null, project: r.project ?? null, state: r.state,
    priority: r.priority ?? null, problem: r.problem ?? null, progress: r.progress ?? null, solution: r.solution ?? null, blockedBy: [], blocks: [], people: null, updatedAt: Date.parse(r.updated_at) || 0,
  } as ThreadCard;
}

/** The cards in the order the desktop draws them, with the agents each runs. */
export function phoneMembers({ meId, rooms, messages, teamPeople = [], cards = [], mates = [], items = [], running = [], store }: {
  meId: string | null;
  rooms: readonly Room[];
  messages: Record<string, readonly RoomMessage[] | undefined>;
  /** The people on your team (renderer/src/phone-team.ts), for when no team group names them. */
  teamPeople?: readonly { id: string; name: string | null; email?: string | null }[];
  cards?: readonly ThreadCard[];
  mates?: readonly Teammate[];
  items?: readonly any[];
  running?: readonly { itemId: string }[];
  store: KeptStore;
}): Member[] {
  const teamRoom = rooms.find((r) => r.teamId) ?? null;
  const wall = teamRoom?.wall ?? null;
  const live = new Set(running.map((r) => r.itemId));
  const mateAgents = new Map<string, number>();
  const mineRunning: any[] = [];
  for (const i of items) {
    if (!live.has(i.id)) continue;
    const mate = teammateIdOf(i);
    if (mate) mateAgents.set(mate, (mateAgents.get(mate) ?? 0) + 1); else mineRunning.push(i);
  }
  const named = teamRoom?.people?.length ? teamRoom.people : teamPeople.map((p) => ({ id: p.id, name: p.name || p.email || '', avatarUrl: null }));
  const meCard = wall?.find((c) => c.me);
  const me = meId ? { id: meId, name: meCard?.name ?? named.find((p) => p.id === meId)?.name ?? '', avatarUrl: meCard?.avatarUrl ?? null } : null;
  // A chat with one other person is that person's card.
  const personChats = new Map<string, string>();
  for (const r of rooms) {
    if (r.kind !== 'group') continue;
    const others = r.wall.filter((c) => !c.me);
    if (others.length === 1) personChats.set(others[0].id, `room:${r.id}`);
  }
  const chats = rooms.map((r) => ({
    key: `room:${r.id}`, name: r.teamId ? r.name : groupName(r), at: r.lastAt, unread: r.unread > 0,
    faces: r.kind === 'group' ? r.wall.filter((c) => !c.me).map((c) => ({ name: c.name, url: c.avatarUrl ?? null })) : [],
    last: messages[r.id]?.at(-1)?.body ?? '',
  }));
  return orderMembers(buildMembers({
    me, people: named, wall: wall as any, cards: cards as any, teammates: mates as any, mateAgents, chats, personChats, teamRoomId: teamRoom?.id ?? null,
    myAgents: mineRunning.length, myNow: mineRunning[0]?.title ?? null,
  }), readOrder(asStorage(store)));
}

/** Your own threads, without your AI teammates' runs, which their cards hold. */
export const myItems = <T>(items: readonly T[]) => boardItems(items, { picked: [], mate: null, mineOnly: true }, (i) => teammateIdOf(i as any));

/** Two cards a row on a phone. One row usually, and the line that shows the rest (CardsArea.tsx). */
export const CARDS_PER_ROW = 2;
export function cardsShown(total: number, open: boolean): { count: number; line: string | null } {
  const rows = Math.ceil(total / CARDS_PER_ROW);
  const shown = open ? rows : rowsShown(null, rows);
  const count = Math.min(total, shown * CARDS_PER_ROW);
  return { count, line: moreLine(shown, rows, total - count)?.words ?? null };
}

/** The picked card, keeping it in view when it sits past the cut. */
export function cardsDrawn<T extends { key: string }>(members: readonly T[], picked: string | null, open: boolean): T[] {
  const { count } = cardsShown(members.length, open);
  const drawn = members.slice(0, count);
  const lit = members.find((m) => m.key === picked);
  return lit && !drawn.includes(lit) && drawn.length ? [...drawn.slice(0, -1), lit] : drawn;
}
