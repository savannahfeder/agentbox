// A room's filters button, in the place the Inbox has its View and filters
// button: whether the board shows Later, and whose threads it shows. A room is
// always its board, so there is no view to pick.
import { useEffect, useRef, useState } from 'react';
import type { RoomCard } from '../../types';
import { SlidersIcon, StateGlyph } from '../../threads/Pages';
import { togglePicked } from '../../threads/people-rules';
import { RoomFace } from './RoomFace';
import { cardName } from './room-rules';

type Props = {
  /** Who can be on the board (`boardPeople`), and who is. */
  people: RoomCard[]; picked: string[]; onPick: (ids: string[]) => void;
  /** How many people here have no threads that reach me. */
  unseen: number;
  /** Whether the board shows its Later column. */
  later: boolean; onLater: (shown: boolean) => void;
};

export function RoomViewButton(props: Props) {
  const { people, picked } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);
  // Later off is how the board starts, so only leaving someone out lights it.
  const narrowed = picked.length < people.length;
  return <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" className={`th-disp${open ? ' open' : ''}`} aria-label="Filters" title="Filters" onClick={() => setOpen((o) => !o)}>
      <SlidersIcon />{narrowed && <i />}
    </button>
    {open && <RoomViewMenu {...props} />}
  </span>;
}

export function RoomViewMenu({ people, picked, onPick, unseen, later, onLater }: Props) {
  const everyone = picked.length >= people.length;
  const ordered = [...people.filter((p) => p.me), ...people.filter((p) => !p.me)];
  return <div className="th-pop rm-viewpop" role="dialog" aria-label="Room filters">
    <div className="line"><span className="lab">Show</span><span className="opts">
      <button type="button" className={later ? 'on' : ''} aria-pressed={later} onClick={() => onLater(!later)}><StateGlyph state="scheduled" />Later</button>
    </span></div>
    {people.length > 1 && <>
      <div className="rule" />
      <div className="line"><span className="lab">People</span><span className="opts">
        <button type="button" className={everyone ? 'on' : ''} onClick={() => onPick(people.map((p) => p.id))}>Everyone</button>
        {ordered.map((p) => <button type="button" key={p.id} aria-pressed={picked.includes(p.id)} className={picked.includes(p.id) && !everyone ? 'on' : ''}
          onClick={() => onPick(everyone ? [p.id] : togglePicked(picked, p.id, null))}>
          <RoomFace name={p.name} url={p.avatarUrl} size={16} />{cardName(p)}
        </button>)}
      </span></div>
    </>}
    {unseen > 0 && <div className="line"><span className="lab" /><span className="rm-viewnote">Only teammates who share their threads are on the board.</span></div>}
  </div>;
}
