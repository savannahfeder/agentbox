// What Command K finds among your chats by name: groups and chats by name or the
// people in them, and AI teammates by name or job. Lines said in them are found
// with every other line (../found-inside).
import type { GroupChoice } from './rooms/GroupList';

type MateLike = { id: string; name: string; role?: string | null; job?: string | null };

export type ChatFound =
  | { kind: 'group'; key: string; label: string; hint: string }
  | { kind: 'teammate'; key: string; label: string; hint: string };

const wordsOf = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const hasAll = (text: string, words: string[]) => { const t = text.toLowerCase(); return words.every((w) => t.includes(w)); };

export function chatsFound({ groups, teammates, query }: {
  groups: GroupChoice[];
  teammates: MateLike[];
  query: string;
}): ChatFound[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  const out: ChatFound[] = [];
  for (const g of groups) {
    if (hasAll([g.name, ...g.faces.map((f) => f.name)].join(' '), words)) {
      out.push({ kind: 'group', key: g.key, label: g.name, hint: g.faces.length ? 'Chat' : 'Group' });
    }
  }
  for (const t of teammates) {
    if (hasAll([t.name, t.role ?? '', t.job ?? ''].join(' '), words)) out.push({ kind: 'teammate', key: t.id, label: t.name, hint: 'AI teammate' });
  }
  return out;
}
