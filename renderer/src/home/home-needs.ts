// Home's Needs you rows: one for each row of the Inbox's (threads/needs-you-list.ts), up to the cap.
import type { NeedsEntry } from '../threads/needs-you-list';
import type { NeedsRow } from './HomePage';
import type { WorkItem } from '../types';
import { cardPlace, rowPriorityId } from '../threads/page-rules';
import { followWords } from '../team/following';
import { firstRealLine } from '../format';

export const HOME_NEEDS_CAP = 80;

const first = (name: string | null | undefined) => String(name ?? '').trim().split(/\s+/)[0] || null;
const letterOf = (name: string | null) => (name ? name.slice(0, 1).toUpperCase() : '·');

export function homeNeedsRows(entries: readonly NeedsEntry[], { item, nameOf }: {
  item: (i: WorkItem) => NeedsRow;
  /** A teammate's full name, or '' when this Mac does not know them. */
  nameOf: (id: string) => string;
}): NeedsRow[] {
  const person = (id: string | null) => first(id ? nameOf(id) : null) ?? 'Someone';
  return entries.slice(0, HOME_NEEDS_CAP).map((e): NeedsRow => {
    const row = { key: e.key, priority: null, unread: true };
    if (e.kind === 'item') return { ...item(e.item), key: e.key };
    if (e.kind === 'card') {
      const from = person(e.card.personId);
      return { ...row, letter: letterOf(from), title: e.card.title ?? 'A thread', from, priority: rowPriorityId(e.card.priority), project: cardPlace(e.card), at: e.card.updatedAt, unread: false };
    }
    if (e.kind === 'file') {
      const from = person(e.news.by);
      return { ...row, letter: letterOf(from), title: `named you on ${e.news.file.replace(/#\d+$/, '')}: ${e.news.text}`, from, project: e.card.title ?? 'Shared thread', at: e.news.ts };
    }
    if (e.kind === 'follow') {
      const from = person(e.news.owner);
      return { ...row, letter: letterOf(from), title: followWords(e.news, from), from, project: cardPlace(e.news.card), at: e.news.at };
    }
    const m = e.lead.mention;
    if (m) {
      const from = first(m.byName) ?? person(m.by);
      // A two-person chat is named for the sender, who is already on the row.
      const project = m.roomName === m.byName ? '' : m.roomName;
      return { ...row, letter: letterOf(from), title: firstRealLine(m.body) || 'sent a file', from, project, at: m.at, unread: m.unread !== false };
    }
    return { ...row, letter: letterOf(first(e.lead.invite?.words)), title: e.lead.invite?.words ?? 'An invitation', from: null, project: '', at: null };
  });
}
