// Find rooms (round 23): rooms open to everyone, Popular or New, with who is
// here now; a pasted invite link joins the room it is for.
import { useEffect, useState } from 'react';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { findOrder } from './room-rules';
import { tokenFromLink } from '../../../../shared/room-links.mjs';

export type ListedRoom = { id: string; name: string; members: number; hereNow: number; joined: boolean; createdAt: number; faces: { name: string; avatar: string | null }[] };

export function FindRooms({ load, onJoin, onOpen, onLink }: {
  load: () => Promise<ListedRoom[] | null>; onJoin: (id: string) => Promise<string | null>; onOpen: (id: string) => void;
  onLink: (token: string) => void;
}) {
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [order, setOrder] = useState<'popular' | 'new'>('popular');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { let on = true; void load().then((r) => { if (on) setRooms(r ?? []); }); return () => { on = false; }; }, [load]);
  const q = query.trim().toLowerCase();
  const shown = findOrder(rooms ?? [], order).filter((r) => !q || r.name.toLowerCase().includes(q));
  const typed = (text: string) => {
    const token = tokenFromLink(text);
    if (token && /\/join\/|:\/\//.test(text)) { setQuery(''); onLink(token); return; }
    setQuery(text);
  };
  return <div className="rm-find">
    <div className="bar">
      <div className="tm-tabs">
        <button type="button" className={`tm-tab${order === 'popular' ? ' on' : ''}`} onClick={() => setOrder('popular')}>Popular</button>
        <button type="button" className={`tm-tab${order === 'new' ? ' on' : ''}`} onClick={() => setOrder('new')}>New</button>
      </div>
      <label className="rm-search">{I.search()}<input value={query} placeholder="Search groups, or paste an invite link" aria-label="Search groups"
        onChange={(e) => typed(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} /></label>
    </div>
    {error && <div className="rm-err" role="alert">{error}</div>}
    <div className="rm-froom head"><span className="rm-label">Group</span><span className="rm-label">Here now</span><span className="rm-label" style={{ textAlign: 'right' }}>Members</span><span /></div>
    {rooms === null && <div className="rm-froom"><span className="rm-priv">Finding groups…</span></div>}
    {rooms !== null && !shown.length && <div className="rm-froom"><span className="rm-priv">{q ? `No group called “${query.trim()}”.` : 'No groups are open to everyone yet.'}</span></div>}
    {shown.map((r) => <div key={r.id} className="rm-froom">
      <div><span className="rm-nm">{I.hash()}{r.name}</span></div>
      <div className="here">{r.faces.slice(0, 4).map((f, i) => <RoomFace key={i} name={f.name} url={f.avatar} size={22} />)}<em>{r.hereNow} here now</em></div>
      <div className="v">{r.members.toLocaleString('en-US')}</div>
      <div className="j">{r.joined
        ? <button type="button" className="joined" title={`Open ${r.name}`} onClick={() => onOpen(r.id)}>Joined</button>
        : <button type="button" className="rm-btn" disabled={busy === r.id} onClick={async () => {
          setBusy(r.id);
          const err = await onJoin(r.id);
          setBusy(null);
          if (err) setError(err); else onOpen(r.id);
        }}>Join</button>}</div>
    </div>)}
  </div>;
}
