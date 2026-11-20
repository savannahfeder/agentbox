// Each sync, the waits people set that have ended come back to Needs you
// (shared/thread-waits.mts), and so do the tasks you hold whose blocks have
// ended (shared/team-tasks.mts). The wait is cleared as it is told, so it is
// told once.
import { endedWaits } from '../../shared/thread-waits.mts';
import { endedTaskBlocks } from '../../shared/team-tasks.mts';
import type { TeamProduct } from './index.mts';
import type { LedgerLine } from './sync.mts';
import type { TaskRow } from '../../shared/team-tasks.mts';
import type { WaitCard, WaitingItem } from '../../shared/thread-waits.mts';
import { askedThread } from '../../shared/thread-ask.mts';
import { sentBackWords } from '../../shared/review-sent-back.mts';
import { askFiles, shownRoomFile } from '../../shared/room-needs-you.mts';

/** A chat as these rules read it: its messages and the marks on its files. */
export interface ReviewChat {
  messages: readonly { by: string | null; body: string; at: number; deleted?: boolean }[];
  marks: readonly { by: string | null; mark: object; at: number }[];
}

/**
 * A review of a thread's files asked in a chat (main/team/file-to-chat.mts)
 * and answered there with notes or an approval on those files: what came back,
 * in the words of the verdict's comment (shared/review-sent-back.mts).
 */
export function reviewedInChat(chats: readonly ReviewChat[], me: string | null, item: Pick<WaitingItem, 'id'>, person: string): string | null {
  const theirs = reviewMarksInChat(chats, me, item, person).map((m) => m.mark);
  const notes = theirs.filter((m) => m.do === 'note');
  const note = String(notes[0]?.text ?? '');
  if (theirs.some((m) => m.do === 'approve')) return sentBackWords({ verdict: 'approved', notes: notes.length, note });
  return notes.length ? sentBackWords({ verdict: 'changes', notes: notes.length, note }) : null;
}

type ReviewMark = { do?: unknown; file?: unknown; text?: unknown; v?: unknown; owner?: unknown };

/** Their notes and approvals (anyone's but mine, with no person) on the files of the newest review ask about this thread in a chat. */
function reviewMarksInChat(chats: readonly ReviewChat[], me: string | null, item: Pick<WaitingItem, 'id'>, person: string | null): { at: number; by: string; mark: ReviewMark }[] {
  for (const chat of chats) {
    const ask = chat.messages.filter((m) => m.by === me && !m.deleted && askedThread(m.body)?.id === item.id).at(-1);
    if (!ask) continue;
    const files = new Set(askFiles(ask.body));
    const theirs = chat.marks.filter((m) => !!m.by && m.by !== me && (person === null || m.by === person) && m.at > ask.at)
      .map((m) => ({ at: m.at, by: m.by!, mark: m.mark as ReviewMark }))
      .filter((m) => (m.mark.do === 'note' || m.mark.do === 'approve') && files.has(String(m.mark.file ?? '').replace(/#\d+$/, '')));
    if (theirs.length) return theirs;
  }
  return [];
}

/**
 * Those notes and approvals as lines on the owner's thread, on the file as the
 * owner named it, so its Notes panel holds them. The chat's version number is
 * the chat's own, so it does not come along.
 */
export function reviewLinesFromChat(chats: readonly ReviewChat[], me: string | null, item: Pick<WaitingItem, 'id'>, person: string | null = null): LedgerLine[] {
  return reviewMarksInChat(chats, me, item, person).map(({ at, by, mark }) => {
    const { v: _v, owner: _owner, ...rest } = mark;
    const file = shownRoomFile(String(mark.file ?? '').replace(/#\d+$/, ''));
    return { id: item.id, ts: at, source: 'system', by, uid: `review-${item.id}-${String((mark as { id?: unknown }).id ?? `${String(mark.do)}-${at}`)}`, patch: { artifact: { ...rest, file } } };
  });
}

export type WaitRow = TaskRow & { id: string };

const lastWordIn = (rows: WaitRow[], person: string): { ts: number; text: string | null } => {
  let last = { ts: 0, text: null as string | null };
  for (const row of rows) {
    for (const [field, w] of Object.entries(row.wrote ?? {})) {
      const text = (row as unknown as Record<string, unknown>)[field];
      if (w?.by === person && (w.ts ?? 0) > last.ts) last = { ts: w.ts, text: typeof text === 'string' ? text : null };
    }
    for (const said of row.talk?.chat ?? []) if (said.by === person && said.ts > last.ts) last = { ts: said.ts, text: said.text ?? null };
  }
  return last;
};

/** The chats in the rooms' state, for reviewedInChat. */
export const chatsForReviews = (rooms: { messages?: Record<string, ReviewChat['messages']>; fileMarks?: Record<string, ReviewChat['marks']> } | null | undefined): ReviewChat[] =>
  Object.keys(rooms?.messages ?? {}).map((id) => ({ messages: rooms!.messages![id] ?? [], marks: rooms?.fileMarks?.[id] ?? [] }));

export function noticeEndedWaits({ products, read, write, cards, nameOf, now, me = null, chats: talks = [], append }: {
  products: TeamProduct[];
  read: (product: TeamProduct) => WaitRow[];
  write: (dir: string, id: string, patch: Record<string, unknown>) => unknown;
  cards: readonly WaitCard[];
  nameOf: (id: string) => string;
  now: number;
  me?: string | null;
  chats?: readonly ReviewChat[];
  /** Lines written under someone else's name (main/store/work-items.mts appendForeignLines). */
  append?: (dir: string, lines: LedgerLine[]) => unknown;
}): number {
  const chats = products.filter((p) => p.team?.direct);
  // `chats` holds only projects with a team record.
  const lastIn = (person: string) => chats
    .filter((p) => new Set([...(p.team!.people ?? []), ...(p.team!.sharedBy ? [p.team!.sharedBy] : [])]).has(person))
    .filter((p) => new Set([...(p.team!.people ?? []), ...(p.team!.sharedBy ? [p.team!.sharedBy] : [])]).size <= 2)
    .map((p) => lastWordIn(read(p), person))
    .reduce((a, b) => (b.ts > a.ts ? b : a), { ts: 0, text: null as string | null });
  const lastWordFrom = (person: string) => lastIn(person).ts;
  const lastWordsFrom = (person: string) => lastIn(person).text;
  let told = 0;
  const reviewed = new Set(talks.flatMap((c) => c.messages.filter((m) => m.by === me && !m.deleted).map((m) => askedThread(m.body)?.id).filter((id): id is string => !!id)));
  const everything = me ? products.flatMap((p) => read(p)) : [];
  for (const product of products) {
    const items = read(product);
    // Only the holder's Mac clears a task's block: the clear syncs, the telling
    // does not, so a giver's copy clearing first would leave the holder untold.
    const ended = product.team?.direct
      ? (me ? endedTaskBlocks(items, { items: everything, cards, me, lastWordFrom, nameOf }) : [])
      : endedWaits(items, { items, cards, lastWordFrom, lastWordsFrom, nameOf, now, reviewedIn: (item, person) => reviewedInChat(talks, me, item, person) });
    // Whether or not the thread still waits on them: a second ask may have taken the wait over.
    if (append && !product.team?.direct && reviewed.size) {
      for (const item of items) { const lines = reviewed.has(item.id) ? reviewLinesFromChat(talks, me, item) : []; if (lines.length) append(product.dir, lines); }
    }
    for (const { item, said } of ended) {
      write(product.dir, item.id, { blockedBy: [], waitEnded: { said, at: now } });
      told += 1;
    }
  }
  return told;
}
