// The room dialogs (round 23), in the app's own .modal and backdrop: invite,
// start a room, joining from a link, and the members list.
import { useEffect, useState } from 'react';
import type { Room } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { cardName, sentWords } from './room-rules';
import { useOutside } from './RoomsPage';
import { joinLink } from '../../../../shared/room-links.mjs';
import { Name } from '../../../../shared/product-name.mjs';

function Dialog({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <div className="modal rm-dlg" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>;
}

const close = (onClose: () => void) => <button type="button" className="x" aria-label="Close" onClick={onClose}>{I.x()}</button>;

export type Sent = { email: string; at: number; joined: boolean };

export function InviteDialog({ room, link, now, onCopy, onEmail, loadSent, onClose }: {
  room: Room; link: string | null; now: number; onCopy: () => void; onEmail: (email: string) => Promise<string | null>;
  /** The invites I sent to this room, newest first. */
  loadSent: () => Promise<Sent[] | null>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Sent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const others = room.wall.filter((c) => !c.me);
  useEffect(() => { let on = true; void loadSent().then((s) => { if (on && s) setSent(s); }); return () => { on = false; }; }, [loadSent]);
  const send = async () => {
    const clean = email.trim();
    if (!clean) return;
    const err = await onEmail(clean);
    if (err) { setError(err); return; }
    setError(null);
    setSent((s) => [{ email: clean.toLowerCase(), at: Date.now(), joined: false }, ...s.filter((x) => x.email !== clean.toLowerCase())]);
    setEmail('');
  };
  return <Dialog onClose={onClose} label={`Invite people to ${room.name}`}>
    <div className="sec">
      <div className="room"><span className="ttl">{I.hash(15)}{room.name}</span>{close(onClose)}</div>
      <div className="who">
        {others.length > 0 && <span className="rm-faces">{others.slice(0, 7).map((c) => <RoomFace key={c.id} name={c.name} url={c.avatarUrl} size={26} />)}</span>}
        <span>{room.members} {room.members === 1 ? 'person' : 'people'}, {room.agents} {room.agents === 1 ? 'agent' : 'agents'} working right now</span>
      </div>
    </div>
    <div className="sec">
      {!room.inviteOnly && <>
        <span className="rm-label">Invite link</span>
        <div className="rm-field"><span className="rm-input">{I.link()}<span className="v">{link ? joinLink(link).replace(/^https:\/\//, '') : 'Making a link…'}</span></span>
          <button type="button" className="rm-btn" disabled={!link} onClick={onCopy}>Copy link</button></div>
      </>}
      <span className="rm-label" style={room.inviteOnly ? undefined : { marginTop: 8 }}>By email</span>
      <div className="rm-field">
        <input className="rm-input" type="email" value={email} placeholder="name@example.com" aria-label="Email to invite" autoFocus={room.inviteOnly}
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void send(); if (e.key === 'Escape') onClose(); }} />
        <button type="button" className="rm-btn" disabled={!email.trim()} onClick={() => void send()}>Send</button>
      </div>
      {error && <span className="rm-err" role="alert">{error}</span>}
    </div>
    {sent.length > 0 && <div className="sec rm-pend"><span className="rm-label">Invited</span>
      {sent.map((s) => <div className="row2" key={s.email}><RoomFace name={s.email} size={22} />{s.email}<em>{sentWords(s, now)}</em></div>)}
    </div>}
  </Dialog>;
}

type Who = 'link' | 'invite' | 'everyone';

export function StartRoomDialog({ canList, onStart, onClose, onFind }: {
  canList: boolean; onStart: (o: { name: string; who: Who }) => Promise<string | null>; onClose: () => void;
  /** Find a group to join instead. */
  onFind?: () => void;
}) {
  const [name, setName] = useState('');
  const [who, setWho] = useState<Who>('link');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const err = await onStart({ name: name.trim(), who });
    setBusy(false);
    if (err) setError(err);
  };
  const opt = (id: Who, title: string, say: string, disabled = false) =>
    <button type="button" className={`rm-opt${who === id ? ' on' : ''}`} disabled={disabled} onClick={() => setWho(id)} role="radio" aria-checked={who === id}>
      <span className="bx" /><div><b>{title}</b><span>{say}</span></div></button>;
  return <Dialog onClose={onClose} label="Start a group">
    <div className="sec"><div className="t">Start a group{close(onClose)}</div></div>
    <div className="sec">
      <span className="rm-label">Name</span>
      <div className="rm-field"><input className="rm-input" autoFocus maxLength={40} value={name} aria-label="Group name" placeholder="Weekend builds"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void start(); if (e.key === 'Escape') onClose(); }} /></div>
      <span className="rm-label" style={{ marginTop: 8 }}>Who can join</span>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {opt('link', 'Anyone with the link', 'Share it with friends. It is not listed anywhere.')}
        {opt('invite', 'Only people you invite', 'By email, one at a time.')}
        {opt('everyone', `Anyone on ${Name}`, canList ? 'Listed in Find groups, like General.' : 'Needs a team while Groups is in alpha.', !canList)}
      </div>
      {error && <span className="rm-err" role="alert">{error}</span>}
    </div>
    <div className="sec"><div className="rm-acts">
      {onFind && <button type="button" className="rm-btn" style={{ marginRight: 'auto' }} onClick={onFind}>{I.search()}Find a group to join</button>}
      <button type="button" className="rm-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="rm-btn go" disabled={!name.trim() || busy} onClick={() => void start()}>Start group</button>
    </div></div>
  </Dialog>;
}

export type Preview = {
  name: string; members: number; agentsRunning: number; faces: { name: string; avatar: string | null }[];
  /** Whoever made the link. */
  invitedBy: { name: string; avatar: string | null } | null;
};

export function JoinDialog({ preview, myName, onJoin, onClose }: {
  preview: Preview | null; myName: string; onJoin: () => Promise<string | null>; onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return <Dialog onClose={onClose} label="Join a group">
    {!preview
      ? <div className="sec"><div className="t">That invite link does not work any more{close(onClose)}</div>
        <span className="rm-note">Ask whoever sent it for a new one.</span></div>
      : <>
        <div className="sec">
          <div className="rm-from">{preview.invitedBy
            ? <><RoomFace name={preview.invitedBy.name} url={preview.invitedBy.avatar} size={20} />{preview.invitedBy.name} invited you to</>
            : 'You are invited to'}</div>
          <span className="rm-big">{I.hash(24)}{preview.name}</span>
          {preview.faces.length > 0 && <div className="rm-joinfaces">{preview.faces.slice(0, 8).map((f, i) => <RoomFace key={i} name={f.name} url={f.avatar} size={48} />)}</div>}
          <span className="rm-live"><LiveMark still={!preview.agentsRunning} />{preview.members} {preview.members === 1 ? 'person' : 'people'} working with {preview.agentsRunning} {preview.agentsRunning === 1 ? 'agent' : 'agents'} right now</span>
        </div>
        <div className="sec">
          <span className="rm-note">People in {preview.name} will see your name as {myName}, your level and the short name of what you are working on. You can change this in Settings.</span>
          {error && <span className="rm-err" role="alert">{error}</span>}
          <div className="rm-acts">
            <button type="button" className="rm-btn" onClick={onClose}>Not now</button>
            <button type="button" className="rm-btn go" disabled={busy} onClick={async () => { setBusy(true); const err = await onJoin(); setBusy(false); if (err) setError(err); }}>Join {preview.name}</button>
          </div>
        </div>
      </>}
  </Dialog>;
}

export function MembersMenu({ room, at, onInvite, onClose, onPerson }: { room: Room; at: DOMRect; onInvite: () => void; onClose: () => void; onPerson?: (id: string) => void }) {
  const ref = useOutside(onClose);
  const people = [...room.wall].sort((a, b) => cardName(a).localeCompare(cardName(b)));
  const hidden = Math.max(0, room.members - people.length);
  return <div ref={ref} className="rm-menu rm-pop members" style={{ left: Math.max(8, at.left - 8), top: at.bottom + 6, width: 280 }}>
    <div className="head"><span className="rm-label">{room.members} {room.members === 1 ? 'member' : 'members'}</span></div>
    {room.kind !== 'group' && <><button type="button" className="row" onClick={onInvite}>{I.invite()}<span>Invite people</span></button><div className="rule" /></>}
    {people.map((c) => <button type="button" key={c.id} className="row" onClick={() => onPerson?.(c.id)}>
      <RoomFace name={c.name} url={c.avatarUrl} size={18} /><span>{cardName(c)}</span>{c.level != null && <span className="k">{c.level}</span>}</button>)}
    {hidden > 0 && <div className="row" style={{ color: 'var(--text-faint)' }}>{hidden} more not showing</div>}
  </div>;
}

