// The Rooms page (w-a0429b3d5e): the rooms you are in, drawn as the threads
// table is, each row opening its room. Pointing at a row shows dots for the
// room menu where its time was. Group chats are not here; they are Messages'.
import { useEffect, useRef, useState } from 'react';
import type { Room, RoomsState } from '../../types';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { agentsWords, peopleCount } from './room-rules';
import { roomConversations } from './conversations';
import { updatedWords } from '../../threads/page-rules';
import './rooms.css';

export type RoomMenuAction = 'read' | 'unread' | 'invite' | 'members' | 'ranks' | 'tab' | 'mute' | 'unmute' | 'leave';

export function RoomsPage({ state, invisible, now, onOpen, onFind, onMenu, tabbedId = null }: {
  state: RoomsState; invisible: boolean; now: number;
  /** The room in the Threads tab. */
  tabbedId?: string | null;
  onOpen: (id: string) => void; onFind: () => void;
  onMenu: (id: string, action: RoomMenuAction, anchor: DOMRect) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const rooms = state.rooms.filter((r) => r.kind !== 'group');
  const said = new Map(roomConversations(state).map((c) => [c.id, c]));
  const find = <div role="button" tabIndex={0} className="row rm-rfind" onClick={onFind} onKeyDown={(e) => { if (e.key === 'Enter') onFind(); }}>
    <span className="mark" aria-hidden="true" /><div className="row-main rm-rnm">{I.search()}<span>Find rooms to join</span></div>
  </div>;
  // Before the first read, "none" would be the one thing not true.
  if (!state.ready) return <div className="list th-table rm-rooms" />;
  if (!rooms.length) return <div className="list th-table rm-rooms"><div className="th-empty">You are not in any rooms yet.</div>{find}</div>;
  return <div className="list th-table rm-rooms">
    <div className="row th-head"><span className="mark" aria-hidden="true" /><div className="row-main th-grid rm-rgrid">
      <div>Room</div><div>People</div><div>Working</div><div>Last message</div><div className="num">Updated</div>
    </div></div>
    {rooms.map((r) => {
      const c = said.get(r.id);
      const open = (e: { currentTarget: HTMLElement }) => setMenu(menu?.id === r.id ? null : { id: r.id, at: e.currentTarget.getBoundingClientRect() });
      return <div role="button" tabIndex={0} key={r.id} className={`row${c?.unread ? ' unread' : ''}${menu?.id === r.id ? ' menu' : ''}`}
        onClick={() => onOpen(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.id); }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ id: r.id, at: new DOMRect(e.clientX, e.clientY, 0, 0) }); }}>
        <span className="mark" aria-hidden="true" /><div className="row-main th-grid rm-rgrid">
          <div className={`th-cell-title rm-rnm${r.muted ? ' muted' : ''}`}>{I.hash(14)}<span>{r.name}</span></div>
          <div className="rm-rpp"><span className="fs">{r.wall.slice(0, 4).map((p) => <RoomFace key={p.id} name={p.name} url={p.avatarUrl} size={20} />)}</span><span className="n">{peopleCount(r, invisible)}</span></div>
          <div className="th-cell-state">{agentsWords(r.agents)}</div>
          <div className="th-cell-title rm-rlast">{c?.last ?? ''}</div>
          <div className="th-cell-when num has-act"><span className="th-when">{c?.last ? updatedWords(c.at, now) : ''}</span>
            <button type="button" className="th-row-act rm-rdots" aria-label={`Menu for ${r.name}`} title="More"
              onClick={(e) => { e.stopPropagation(); open(e); }}>{I.dots()}</button></div>
        </div>
      </div>;
    })}
    {find}
    {menu && (() => {
      const r = rooms.find((x) => x.id === menu.id);
      if (!r) return null;
      return <RoomMenu room={r} at={menu.at} tabbed={r.id === tabbedId} onClose={() => setMenu(null)} onPick={(a) => { setMenu(null); onMenu(r.id, a, menu.at); }} />;
    })()}
  </div>;
}

export function RoomMenu({ room, at, onPick, onClose, tabbed = false }: {
  room: Room; at: DOMRect; onPick: (a: RoomMenuAction) => void; onClose: () => void;
  /** It is the room in the Threads tab already. */
  tabbed?: boolean;
}) {
  const ref = useOutside(onClose);
  const row = (a: RoomMenuAction, icon: JSX.Element, label: string, k?: string | number) =>
    <button type="button" className="row" onClick={() => onPick(a)}>{icon}<span>{label}</span>{k != null && <span className="k">{k}</span>}</button>;
  const unread = (room.unread > 0 && !room.muted) || !!room.markedUnread;
  const left = menuLeft(at.left, at.right, typeof window === 'undefined' ? Infinity : window.innerWidth);
  return <div ref={ref} className="rm-menu rm-pop" role="menu" style={{ left, top: at.bottom + 6 }}>
    {unread ? row('read', I.check(), 'Mark as read') : row('unread', I.chat(), 'Mark as unread')}
    {room.kind !== 'group' && row('invite', I.invite(), 'Invite people')}
    {row('members', I.people(), 'Members', room.members)}
    {row('ranks', I.trophy(), 'Ranks this week')}
    {room.kind !== 'group' && !tabbed && row('tab', I.hash(), 'Show in the Threads tab')}
    <div className="rule" />
    {room.muted ? row('unmute', I.bell(), 'Unmute room') : row('mute', I.bell(), 'Mute room')}
    {!room.teamId && row('leave', I.out(), 'Leave room')}
  </div>;
}

/** The 250-wide menu hangs right from what opened it, or, where that would leave the window, ends under its right edge. */
export function menuLeft(left: number, right: number, windowWidth: number): number {
  return Math.max(8, left - 8 + 258 <= windowWidth ? left - 8 : right - 250);
}

/** Closes on a click outside the element or on Escape. */
export function useOutside<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, []);
  return ref;
}
