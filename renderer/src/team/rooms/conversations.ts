// The conversations the messages page lists (w-3d0fa23ffb): every room and
// group I am in, and every direct record, each once, newest first.
import type { Person, Product, Room, RoomsState, WorkItem } from '../../types';
import { isDirect, messageLine } from '../../threads/page-rules';
import type { Conversation } from './MessagesPage';
import { cardName, chatPeople } from './room-rules';
import { voiceSaid } from '../voice-note';

const nameOf = (p: Person | undefined) => (p?.name ? shortName(p.name) : 'Someone');
const shortName = (name: string) => { const w = name.trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0] ?? ''; };

/** A direct record is its newest row: older records may hold one row per message. */
export function directConversations({ items, products, me, people, waiting, marked = new Set() }: {
  items: readonly WorkItem[]; products: readonly Product[]; me: string | null; people: ReadonlyMap<string, Person>;
  /** Rows in Needs you, which is what unread means for a direct record. */
  waiting: ReadonlySet<string>;
  /** Rows you marked unread yourself, which stay unread until you open them again. */
  marked?: ReadonlySet<string>;
}): (Conversation & { item: WorkItem; people: string[] })[] {
  const newest = new Map<string, WorkItem>();
  for (const i of items) {
    const p = products.find((x) => x.slug === i.product);
    if (!isDirect(p) || (i as { agent?: unknown }).agent) continue;
    const had = newest.get(i.product);
    if (!had || (i.updatedAt ?? 0) > (had.updatedAt ?? 0)) newest.set(i.product, i);
  }
  return [...newest.values()].map((item) => {
    const product = products.find((x) => x.slug === item.product);
    const said = messageLine(item, product, me, (id) => nameOf(people.get(id)).split(' ')[0]);
    const who = said?.people ?? [];
    return {
      key: `direct:${item.id}`, kind: 'direct' as const, id: item.id, item, people: who,
      name: who.map((id) => nameOf(people.get(id))).join(', ') || 'Message',
      faces: who.map((id) => ({ name: nameOf(people.get(id)), url: people.get(id)?.avatarUrl ?? null })),
      last: said ? (said.fromMe ? `You: ${voiceSaid(said.text)}` : voiceSaid(said.text)) : item.title ?? '',
      at: item.updatedAt ?? 0,
      unread: waiting.has(item.id) || marked.has(item.id),
      marked: marked.has(item.id),
    };
  });
}

export function roomConversations(rooms: RoomsState | null | undefined): Conversation[] {
  if (!rooms?.on) return [];
  const meId = rooms.me?.person_id ?? null;
  // A chat nobody has written in yet waits on its starter's list alone.
  const said = (r: Room) => (rooms.messages[r.id] ?? []).some((m) => !m.deleted);
  return rooms.rooms.filter((r) => r.kind !== 'group' || r.role === 'owner' || said(r)).map((r: Room) => {
    const held = rooms.messages[r.id] ?? [];
    const last = [...held].reverse().find((m) => !m.deleted && !m.inReplyTo) ?? held.at(-1);
    // Invisible, I am off my own wall, and my words are still mine.
    const by = !last ? null : meId && last.by === meId ? { me: true, name: '' }
      : r.wall.find((c) => c.id === last.by) ?? chatPeople(r, meId).find((p) => p.id === last.by);
    const others = r.wall.filter((c) => !c.me);
    return {
      key: `room:${r.id}`, kind: r.kind === 'group' ? 'group' as const : 'room' as const, id: r.id,
      name: r.kind === 'group' ? others.map(cardName).join(', ') || r.name : r.name,
      faces: r.kind === 'group' ? others.map((c) => ({ name: c.name, url: c.avatarUrl })) : [],
      last: last ? `${by ? (by.me ? 'You' : cardName(by)) : 'Someone'}: ${last.deleted ? 'Deleted a message' : voiceSaid(last.body)}` : '',
      at: last?.at ?? r.createdAt,
      unread: (r.unread > 0 && !r.muted) || !!r.markedUnread,
      marked: !!r.markedUnread,
      muted: r.muted,
    };
  });
}
