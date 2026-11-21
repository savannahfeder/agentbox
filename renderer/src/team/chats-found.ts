// What Command K finds among the people on your team, your groups and chats, and
// your AI teammates: each by the words of its name only, because a role or a job
// is not on the row. Lines said in them are found with every other line
// (../found-inside).
import type { GroupChoice } from './rooms/GroupList';
import { nameRank } from '../palette-pick';

type Named = { id: string; name: string };

export type ChatFound = { kind: 'person' | 'group' | 'teammate'; key: string; label: string; hint: string };

/** Best named first, and in the order given among those named alike. */
export function chatsFound({ groups, teammates, persons = [], query }: {
  groups: readonly GroupChoice[];
  teammates: readonly Named[];
  persons?: readonly Named[];
  query: string;
}): ChatFound[] {
  const found = [
    ...persons.map((p): ChatFound => ({ kind: 'person', key: p.id, label: p.name, hint: 'Their page in Team' })),
    ...groups.map((g): ChatFound => ({ kind: 'group', key: g.key, label: g.name, hint: g.faces.length ? 'Chat' : 'Group' })),
    ...teammates.map((t): ChatFound => ({ kind: 'teammate', key: t.id, label: t.name, hint: 'AI teammate' })),
  ].map((row) => ({ row, rank: nameRank(query, row.label) })).filter((f) => f.rank <= 2);
  // A chat named for a person found here is drawn as that person.
  const people = new Set(found.filter((f) => f.row.kind === 'person').map((f) => f.row.label));
  return found
    .filter((f) => f.row.kind !== 'group' || !people.has(f.row.label))
    .sort((a, b) => a.rank - b.rank)
    .map((f) => f.row);
}
