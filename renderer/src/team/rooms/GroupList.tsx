// Every group you are in, each chat its own: a named group, a chat with one
// person, and a chat with that person and someone else are three entries.
// Listed in the narrow sidebar (GroupsSidebar.tsx).
import { useRef, useState } from 'react';
import type { Conversation } from './MessagesPage';
import { Face } from '../people';
import { I } from './icons';
import { SlidersIcon } from '../../threads/Pages';
import { useOutside } from './RoomsPage';

export type GroupChoice = {
  /** The conversation's key: `room:<id>` for a group or a chat in rooms, `direct:<id>` for a teammate's direct record. */
  key: string;
  /** A named group's name, or the people in a chat by first name: "Maya, Priya". */
  name: string;
  /** Everyone but you, for a chat with people; empty for a named group. */
  faces: { name: string; url: string | null }[];
  last: string; at: number; unread: boolean;
  /** Pinned by you, or your team's group. */
  pinned: boolean;
  /** Your team's own group, which leads the list. */
  team?: boolean;
  /** Anyone on the app can join it, and it goes after your own groups. */
  open?: boolean;
};

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Maya Chen: Yes" says "Maya: Yes", and in a chat with only Maya just "Yes". "You:" stays. */
export function lastWords(last: string, onlyOne: boolean): string {
  const at = last.indexOf(': ');
  if (at < 0) return last;
  const who = last.slice(0, at);
  const said = last.slice(at + 2);
  if (who === 'You') return last;
  return onlyOne ? said : `${first(who)}: ${said}`;
}

export function groupChoices(list: readonly Conversation[], pinned: ReadonlySet<string> = new Set(), { team, open }: { team?: ReadonlySet<string>; open?: ReadonlySet<string> } = {}): GroupChoice[] {
  // A room chat with Maya and her direct record are one person: the newest stays.
  const withSeen = new Set<string>();
  const once = [...list].sort((a, b) => b.at - a.at).filter((c) => {
    if (!c.faces.length) return true;
    const who = [...(c.people?.length ? c.people : c.faces.map((f) => f.name))].sort().join('\0');
    if (withSeen.has(who)) return false;
    withSeen.add(who);
    return true;
  });
  return once.map((c) => ({
    key: c.key, faces: c.faces, at: c.at, unread: c.unread, pinned: pinned.has(c.key),
    team: !!team?.has(c.key), open: !!open?.has(c.key),
    last: lastWords(c.last, c.faces.length === 1),
    name: c.faces.length ? c.faces.map((f) => first(f.name)).join(', ') : c.name,
  }));
}

/** A named group wears a #; a chat wears the faces in it, side by side in the row. */
export function GroupMark({ g, size = 20, row = false }: { g: GroupChoice; size?: number; row?: boolean }) {
  if (!g.faces.length) return <span className="gr-tile" style={{ width: size, height: size }} aria-hidden="true">{I.hash(Math.round(size * 0.5))}</span>;
  if (g.faces.length === 1) return <Face name={g.faces[0].name} url={g.faces[0].url} size={size} />;
  if (row) return <span className="gr-faces">{g.faces.slice(0, 3).map((f, i) => <Face key={i} name={f.name} url={f.url} size={size} />)}</span>;
  const small = Math.round(size * 0.72);
  return <span className="gr-two" style={{ width: size, height: size }}>
    {g.faces.slice(0, 2).map((f, i) => <Face key={i} name={f.name} url={f.url} size={small} />)}
  </span>;
}

export type GroupMenuAction = 'board' | 'decisions' | 'invite' | 'members' | 'mute' | 'unmute' | 'leave' | 'new' | 'find';

/** The group's own button in the top bar, where the Inbox keeps its filters: everything else a group does. */
export function GroupMenuButton({ named, members, muted, canLeave, board, decisions, onPick }: {
  named: boolean; members: number; muted: boolean; canLeave: boolean;
  /** How many it has marked, or null where it keeps no list. */
  decisions: number | null;
  /** Everyone's threads, where their threads may reach you. */
  board: boolean;
  onPick: (a: GroupMenuAction, at: DOMRect) => void;
}) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  return <span ref={ref} className="gr-opts">
    {/* A press on the button while its menu is open is the menu's to close, not to open again. */}
    <button type="button" className={`th-disp${at ? ' open' : ''}`} aria-label="Group options" title="Group options"
      onMouseDown={(e) => { if (at) e.stopPropagation(); }} onClick={() => setAt(at ? null : ref.current!.getBoundingClientRect())}><SlidersIcon /></button>
    {at && <GroupOptions named={named} members={members} muted={muted} canLeave={canLeave} board={board} decisions={decisions} onClose={() => setAt(null)}
      onPick={(a) => { setAt(null); onPick(a, at); }} />}
  </span>;
}

export function GroupOptions({ named, members, muted, canLeave, board, decisions, onPick, onClose }: {
  named: boolean; members: number; muted: boolean; canLeave: boolean; board: boolean; decisions: number | null;
  onPick: (a: GroupMenuAction) => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  const row = (a: GroupMenuAction, icon: JSX.Element, label: string, k?: number) =>
    <button type="button" className="row" onClick={() => onPick(a)}>{icon}<span>{label}</span>{k != null && <span className="k">{k}</span>}</button>;
  return <div ref={ref} className="rm-pop gr-optmenu" role="menu">
    {board && row('board', BOARD, 'Everyone’s threads')}
    {decisions != null && row('decisions', DECISION, 'Decisions', decisions || undefined)}
    {named && row('invite', I.invite(), 'Invite people')}
    {row('members', I.people(), 'Members', members)}
    <div className="rule" />
    {muted ? row('unmute', I.bell(), 'Unmute') : row('mute', I.bell(), 'Mute')}
    {canLeave && row('leave', I.out(), named ? 'Leave group' : 'Leave chat')}
    <div className="rule" />
    {row('new', I.plus(), 'New group')}
    {row('find', I.search(), 'Find groups to join')}
  </div>;
}

const DECISION = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>;
const BOARD = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z" /></svg>;
