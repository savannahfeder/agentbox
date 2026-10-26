// A group as the Groups page: its chat filling the page, and down the right
// who is in it and what they are working on.
import type { ReactNode } from 'react';
import type { Room, RoomCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from './RoomFace';
import { cardName } from './room-rules';

/** You first; then working, most agents first; then the rest; people not on yet last. */
export function inGroupOrder(cards: readonly RoomCard[]): RoomCard[] {
  const rank = (c: RoomCard) => (c.me ? -1 : c.away ? 2 : (c.agents ?? 0) > 0 ? 0 : 1);
  return [...cards].sort((a, b) => rank(a) - rank(b) || (b.agents ?? 0) - (a.agents ?? 0));
}

/** Past this many, the list is who is working and the rest are a count. */
export const BIG_GROUP = 12;

/** Who the list draws: everyone in a small group; in a big one, you and up to ten who are working. */
export function peopleShown(room: Pick<Room, 'members' | 'wall'>): { cards: RoomCard[]; working: number; more: number } {
  const all = inGroupOrder(room.wall);
  const cards = room.members > BIG_GROUP ? all.filter((c) => c.me || c.agents).slice(0, 10) : all;
  return { cards, working: all.filter((c) => c.agents).length, more: Math.max(0, room.members - cards.length) };
}

// Where their thread is kept from you, the line they wrote about themselves.
const onWords = (c: RoomCard) => c.away ? 'Not on Groups yet' : c.agents ? c.workingOn ?? c.bio ?? 'Private thread' : c.status ?? 'Not running';

export function PeoplePanel({ room, onPerson }: { room: Pick<Room, 'members' | 'wall'>; onPerson: (id: string) => void }) {
  const { cards, working, more } = peopleShown(room);
  return <aside className="gr-side">
    <div className="gr-ph"><span className="gr-pt">People</span><span className="gr-pn">{working} of {room.members} working</span></div>
    {cards.map((c) => <button type="button" key={c.id} className="gr-prow" title={`Open ${cardName(c)}'s page`} onClick={() => onPerson(c.id)}>
      <RoomFace name={c.name} url={c.avatarUrl} size={32} />
      <span className="gr-pw">
        <span className="gr-l1"><span className="rm-one">{cardName(c)}</span>{c.level != null && <span className="gr-lv">{c.level}</span>}</span>
        <span className={`gr-l2 rm-one${c.agents ? '' : ' idle'}`}>{onWords(c)}</span>
      </span>
      {c.agents ? <span className="gr-ag"><LiveMark /><span>{c.agents} {c.agents === 1 ? 'agent' : 'agents'}</span></span> : null}
    </button>)}
    {more > 0 && <div className="gr-pmore">{more} more not working now</div>}
  </aside>;
}

/** Every group down the left, the open one's chat, and who is in it. */
export function GroupPage({ notice = null, chat, people, list = null }: { notice?: ReactNode; chat: ReactNode; people: ReactNode; list?: ReactNode }) {
  return <div className="gr-page"><div className="gr-body">{list}<div className="gr-chat">{notice}{chat}</div>{people}</div></div>;
}
