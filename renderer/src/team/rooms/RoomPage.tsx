// A room (round 23): its board, or the wall of people on one shared grid where
// no board is handed in, and the chat beside it. Also the room's ranks this
// week, and the line that says you are invisible.
import { useRef, useState, type ReactNode } from 'react';
import type { Room, RoomCard, RoomProfile } from '../../types';
import { PersonHover, ProfilePage } from './RoomPerson';
import { LiveMark } from '../../components/LiveMark';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { agentsWords, cardName, invisibleNotice } from './room-rules';
import { joinLink } from '../../../../shared/room-links.mjs';

/** The wall, the room's ranks, or one person's page. */
export type RoomPane = 'wall' | 'ranks' | `person:${string}`;

export function RoomPage({ room, rooms, ranks, me, now, pane, link, chat, board = null, picked, onPick, onPane, onComeBack, onMessage, onCopyLink, onRoom, onSaveBio }: {
  room: Room; rooms: Room[]; ranks: Record<string, number>;
  me: RoomProfile | null; now: number; pane: RoomPane; link: string | null;
  /** The chat panel beside the wall: this room's, or a chat switched to. */
  chat: ReactNode;
  /** Their threads as a board, drawn in place of the wall while the room's view is Board. */
  board?: ReactNode;
  onRoom?: (roomId: string) => void;
  onSaveBio?: (bio: string | null) => Promise<string | null>;
  /** Cards picked to message together. */
  picked: Set<string>; onPick: (ids: string[]) => void;
  onMessage?: (personIds: string[]) => void;
  onPane: (p: RoomPane) => void;
  onComeBack: () => void;
  onCopyLink: () => void;
}) {
  const notice = invisibleNotice(me?.invisible_until, now);
  const alone = room.wall.length <= 1 && room.members <= 1;
  const [hover, setHover] = useState<{ card: RoomCard; at: DOMRect } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const point = (card: RoomCard | null, at?: DOMRect) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(card && at ? { card, at } : null), card ? 450 : 250);
  };
  const person = pane.startsWith('person:') ? room.wall.find((c) => c.id === pane.slice(7)) ?? null : null;
  const justYou = alone && room.kind !== 'group' && <div className="rm-empty">
    <span className="t">It is just you in {room.name}.</span>
    <span className="s">{room.listed ? 'Anyone on the app can find it and join.' : 'Anyone with the link can join.'}</span>
    <div className="rm-field"><span className="rm-input">{I.link()}<span className="v">{link ? joinLink(link).replace(/^https:\/\//, '') : 'Making a link…'}</span></span>
      <button type="button" className="rm-btn" disabled={!link} onClick={onCopyLink}>Copy link</button></div>
  </div>;
  if (person) {
    return <div className="rm-split"><div className="rm-main wide">
      <ProfilePage key={person.id} card={person} room={room} rooms={rooms} rank={ranks[person.id]}
        onRanks={() => onPane('ranks')} onMessage={onMessage ? () => onMessage([person.id]) : undefined}
        onRoom={onRoom} onSaveBio={onSaveBio} />
    </div></div>;
  }
  return <div className="rm-split">
    <div className={`rm-main${board && pane === 'wall' ? ' board' : ''}`}>
      {notice && <div className="rm-notice" role="status">{I.eyeOff()}{notice}<button type="button" className="rm-btn" onClick={onComeBack}>Come back</button></div>}
      {pane === 'ranks'
        ? <Ranks room={room} onBack={() => onPane('wall')} onPerson={(id) => onPane(`person:${id}`)} />
        : board ? <>{justYou}{board}</> : <>
          <Wall cards={room.wall} onPoint={point} picked={picked}
            onCard={(c, many) => {
              setHover(null);
              if (many && !c.me) onPick(picked.has(c.id) ? [...picked].filter((x) => x !== c.id) : [...picked, c.id]);
              else if (!many) onPane(`person:${c.id}`);
            }} />
          {picked.size > 0 && <PickedBar cards={room.wall.filter((c) => picked.has(c.id))} onClear={() => onPick([])}
            onMessage={onMessage ? () => { onMessage([...picked]); onPick([]); } : undefined} />}
          {hover && <div onMouseEnter={() => { if (timer.current) clearTimeout(timer.current); }} onMouseLeave={() => point(null)}>
            <PersonHover card={hover.card} room={room} at={hover.at} onClose={() => setHover(null)}
              onMessage={onMessage ? () => { setHover(null); onMessage([hover.card.id]); } : undefined}
              onProfile={() => { setHover(null); onPane(`person:${hover.card.id}`); }} onRanks={() => { setHover(null); onPane('ranks'); }} />
          </div>}
          {justYou}
        </>}
    </div>
    {chat}
  </div>;
}

// Message a few people (round 23): the faces and names of who is picked.
function PickedBar({ cards, onMessage, onClear }: { cards: RoomCard[]; onMessage?: () => void; onClear: () => void }) {
  const names = cards.map(cardName);
  const said = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return <div className="rm-selbar rm-pop" role="status">
    <span className="faces">{cards.slice(0, 4).map((c) => <RoomFace key={c.id} name={c.name} url={c.avatarUrl} size={20} />)}</span>
    <span>{said}</span>
    {onMessage && <button type="button" className="rm-btn" onClick={onMessage}>{I.chat()}Message</button>}
    <button type="button" className="x" aria-label="Clear" onClick={onClear}>{I.x()}</button>
  </div>;
}

export function Wall({ cards, onCard, onPoint, picked }: {
  cards: RoomCard[]; onCard?: (card: RoomCard, many: boolean) => void; onPoint?: (card: RoomCard | null, at?: DOMRect) => void; picked?: Set<string>;
}) {
  return <div className="rm-grid">
    {cards.map((c) => <WallCard key={c.id} card={c} sel={picked?.has(c.id)} onClick={onCard ? (many) => onCard(c, many) : undefined}
      onPoint={onPoint ? (el) => onPoint(el ? c : null, el?.getBoundingClientRect()) : undefined} />)}
  </div>;
}

export function WallCard({ card, sel = false, onClick, onPoint }: { card: RoomCard; sel?: boolean; onClick?: (many: boolean) => void; onPoint?: (el: HTMLElement | null) => void }) {
  return <div className={`rm-card${sel ? ' sel' : ''}`} data-who={card.id} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
    onClick={onClick ? (e) => onClick(e.shiftKey || e.metaKey || e.ctrlKey) : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(false); } : undefined}
    onMouseEnter={onPoint ? (e) => onPoint(e.currentTarget) : undefined} onMouseLeave={onPoint ? () => onPoint(null) : undefined}>
    {sel && <span className="rm-check">{I.check()}</span>}
    <RoomFace name={card.name} url={card.avatarUrl} size={64} />
    <span className="rm-nm"><span className="n">{cardName(card)}</span>{card.level != null && <span className="rm-quiet">{card.level}</span>}</span>
    <span className="rm-on rm-one">{card.away ? <span className="rm-priv">Not on Rooms yet</span> : card.workingOn ?? (card.workingPrivate ? <span className="rm-priv">Private thread</span> : card.status ? <span className="rm-priv">{card.status}</span> : ' ')}</span>
    {card.away
      ? <span className="rm-ag" aria-hidden="true">{' '}</span>
      : <span className="rm-ag"><LiveMark still={!card.agents} />{card.agents ? <><b>{card.agents}</b>{agentsWords(card.agents).replace(/^\d+ /, ' ')}</> : 'Not running'}</span>}
  </div>;
}

function Ranks({ room, onBack, onPerson }: { room: Room; onBack: () => void; onPerson: (id: string) => void }) {
  const [when, setWhen] = useState<'week' | 'today'>('week');
  const hours = (c: RoomCard) => (when === 'week' ? c.hoursWeek : c.hoursToday);
  const rows = [...room.wall].sort((a, b) => hours(b) - hours(a) || a.name.localeCompare(b.name));
  const max = Math.max(...rows.map(hours), 0.01);
  const fmt = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`);
  return <>
    <div className="rm-rhead">
      <button type="button" className="bk" onClick={onBack}>{I.back()}{room.name}</button>
      <span className="rm-sep" />
      <div className="tm-tabs">
        <button type="button" className={`tm-tab${when === 'week' ? ' on' : ''}`} onClick={() => setWhen('week')}>This week</button>
        <button type="button" className={`tm-tab${when === 'today' ? ' on' : ''}`} onClick={() => setWhen('today')}>Today</button>
      </div>
    </div>
    <div className="rm-ranks">
      <div className="hd"><span className="rm-label">Rank</span><span /><span className="rm-label">Person</span><span className="rm-label">{when === 'week' ? 'Agent hours this week' : 'Agent hours today'}</span><span /></div>
      {rows.map((c, i) => <div key={c.id} className={`rm-rrow${c.me ? ' me' : ''}`} role="button" tabIndex={0} onClick={() => onPerson(c.id)}>
        <span className="r">{i + 1}</span><RoomFace name={c.name} url={c.avatarUrl} size={28} />
        <span className="rm-nm"><span className="n">{cardName(c)}</span>{c.level != null && <span className="rm-quiet">{c.level}</span>}</span>
        <span className="bar"><i style={{ width: `${(hours(c) / max) * 100}%` }} /></span><span className="v">{fmt(hours(c))}</span>
      </div>)}
    </div>
  </>;
}
