// Who is in a group, from its header.
import type { Room } from '../../types';
import { Face } from '../people';
import { cardName } from './room-rules';
import { useOutside } from './RoomsPage';

export function MembersMenu({ room, at, onClose, onPerson }: { room: Room; at: DOMRect; onClose: () => void; onPerson?: (id: string) => void }) {
  const ref = useOutside(onClose);
  const people = [...room.wall].sort((a, b) => cardName(a).localeCompare(cardName(b)));
  const hidden = Math.max(0, room.members - people.length);
  return <div ref={ref} className="rm-menu rm-pop members" style={{ left: Math.max(8, at.left - 8), top: at.bottom + 6, width: 280 }}>
    <div className="head"><span className="rm-label">{room.members} {room.members === 1 ? 'member' : 'members'}</span></div>
    {people.map((c) => <button type="button" key={c.id} className="row" onClick={() => onPerson?.(c.id)}>
      <Face name={c.name} url={c.avatarUrl} size={18} /><span>{cardName(c)}</span></button>)}
    {hidden > 0 && <div className="row" style={{ color: 'var(--text-faint)' }}>{hidden} more not showing</div>}
  </div>;
}

