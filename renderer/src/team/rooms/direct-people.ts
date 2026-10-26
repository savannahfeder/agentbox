// Who a chat with teammates (a direct record) lists down its right, the way a
// group lists who is in it: you, then each person, from the card Groups holds.
import type { Person, Room, RoomCard } from '../../types';

const blank = (p: Pick<Person, 'id' | 'name' | 'avatarUrl'>, me: boolean): RoomCard => ({
  id: p.id, me, name: p.name, avatarUrl: p.avatarUrl, headline: null, bio: null, agents: 0, level: null,
  hoursTotal: 0, hoursWeek: 0, hoursToday: 0, streak: 0, byMonth: [], teammate: true, showActivity: false,
  activity: null, away: !me, status: null, workingOn: null, workingPrivate: false,
});

/** `roomOf` names a group each person's card came from, where their page opens. */
export function directPeople({ people, rooms, team, meId }: {
  people: readonly string[]; rooms: readonly Pick<Room, 'id' | 'teamId' | 'wall'>[]; team: readonly Person[]; meId: string | null;
}): { members: number; wall: RoomCard[]; roomOf: Record<string, string> } {
  // The team's own group first: it carries what teammates share with each other.
  const ordered = [...rooms].sort((a, b) => Number(!!b.teamId) - Number(!!a.teamId));
  const roomOf: Record<string, string> = {};
  const cardOf = (id: string, me: boolean): RoomCard | null => {
    for (const r of ordered) {
      const c = r.wall.find((x) => x.id === id && !x.away);
      if (c) { roomOf[id] = r.id; return c; }
    }
    const p = team.find((x) => x.id === id);
    return p ? blank(p, me) : null;
  };
  const ids = [...new Set(people)].filter((id) => id !== meId);
  const wall = [meId ? cardOf(meId, true) : null, ...ids.map((id) => cardOf(id, false))].filter((c): c is RoomCard => !!c);
  return { members: wall.length, wall, roomOf };
}
