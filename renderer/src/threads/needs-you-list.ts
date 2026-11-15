// HOME'S NEEDS YOU ROWS, in the order the Inbox's tab draws them: a teammate's
// file news, the threads you follow that finished, invitations and groups with
// a message to you, then your threads and your picked teammates' waiting ones.
// Home's number is its length, so it never counts a row Home leaves out
// (tests/home-lists-every-row-its-needs-you-number-counts).
import type { Product, SharedFileNews, ThreadCard, WorkItem } from '../types';
import type { FollowNews } from '../team/following';
import type { LeadRow } from './needs-you-rows';
import type { Display } from './page-rules';
import { mergeRows, teammateRows, type MixedRow } from './people-rules';

export type NeedsEntry =
  | { kind: 'file'; key: string; news: SharedFileNews; card: ThreadCard }
  | { kind: 'follow'; key: string; news: FollowNews }
  | { kind: 'lead'; key: string; lead: LeadRow }
  | { kind: 'item'; key: string; item: WorkItem }
  | { kind: 'card'; key: string; card: ThreadCard };

export function needsYouList({ mine, withOthers, cards, picked, me, display, products, now, order, leads, fileNews, follows }: {
  /** Your rows, filtered and sorted already. */
  mine: WorkItem[];
  /** A teammate is picked: only then does the page draw their rows. */
  withOthers: boolean;
  cards: ThreadCard[]; picked: string[]; me: string | null; display: Display; products: Product[]; now: number;
  /** Your project order, which the merge reads for Sort by Priority. */
  order: string[];
  leads: readonly LeadRow[]; fileNews: readonly SharedFileNews[]; follows: readonly FollowNews[];
}): NeedsEntry[] {
  const theirs = !withOthers ? [] : teammateRows(cards, { tab: 'inbox', picked, me, display, products, now });
  const rows: MixedRow[] = theirs.length ? mergeRows(mine, theirs, display.sort, { order, products }) : mine.map((item) => ({ item }));
  return [
    // A note on a thread that is not here to open is not drawn (SharedFileRows).
    ...fileNews.flatMap((news): NeedsEntry[] => {
      const card = cards.find((c) => c.personId === news.owner && c.threadId === news.threadId);
      return card ? [{ kind: 'file', key: `file/${news.id}`, news, card }] : [];
    }),
    ...follows.map((news): NeedsEntry => ({ kind: 'follow', key: `follow/${news.key}`, news })),
    ...leads.map((lead): NeedsEntry => ({ kind: 'lead', key: `lead/${lead.key}`, lead })),
    ...rows.map((r): NeedsEntry => (r.card
      ? { kind: 'card', key: `card/${r.card.personId}/${r.card.threadId}`, card: r.card }
      : { kind: 'item', key: `${r.item.product}/${r.item.id}`, item: r.item })),
  ];
}

export function openNeedsEntry(e: NeedsEntry, on: {
  item: (item: WorkItem) => void; card: (card: ThreadCard) => void; lead: (lead: LeadRow) => void;
  file: (news: SharedFileNews, card: ThreadCard) => void; follow: (news: FollowNews, card: ThreadCard) => void;
}) {
  if (e.kind === 'item') on.item(e.item);
  else if (e.kind === 'card') on.card(e.card);
  else if (e.kind === 'lead') on.lead(e.lead);
  else if (e.kind === 'file') on.file(e.news, e.card);
  else on.follow(e.news, e.news.card);
}
