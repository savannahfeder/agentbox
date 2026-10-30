// The Chats list: AI teammates, the people you talk to and your groups, each a
// section that folds. It is the left column of a teammate's page and, with
// teammates on, of the Groups page too, so the two read as one page.
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Teammate } from '../types';
import type { GroupChoice } from '../team/rooms/GroupList';
import { GroupMark } from '../team/rooms/GroupList';
import { groupsInOrder } from '../team/rooms/GroupsSidebar';
import { I } from '../team/rooms/icons';
import { TeammateMark } from './TeammatesRail';
import { FOLD_KEY, foldedSet, matesInOrder, rowName, toggleFold } from './chat-lines';

export interface ChatsValue {
  teammates: Teammate[];
  groups: GroupChoice[];
  now: number;
  onTeammate: (id: string) => void;
  onNew: () => void;
  onGroup: (key: string) => void;
}

/** Set while teammates are on; null keeps every page as it was. */
export const ChatsContext = createContext<ChatsValue | null>(null);

export const LAST_CHAT_KEY = 'zero.chats.last';
const store = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function rememberChat(key: string) { try { store()?.setItem(LAST_CHAT_KEY, key); } catch { /* remembered next time */ } }

const waitsOnYou = (t: Teammate) => t.waiting.length > 0 || !!t.asking || !!t.question || !!t.held;
const CHEVRON = (open: boolean) => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{open ? <path d="m4 6 4 4 4-4" /> : <path d="m6 4 4 4-4 4" />}</svg>;

/** `current` is `teammate:<id>`, `new`, or a group's key (`room:<id>`, `direct:<id>`). */
export function ChatsColumn({ current }: { current: string | null }) {
  const c = useContext(ChatsContext);
  const [folded, setFolded] = useState(() => foldedSet(store()?.getItem(FOLD_KEY) ?? null));
  const [q, setQ] = useState('');
  if (!c) return null;
  const want = q.trim().toLowerCase();
  const match = (name: string) => !want || name.toLowerCase().includes(want);
  const fold = (id: string) => {
    const next = toggleFold(JSON.stringify([...folded]), id);
    try { store()?.setItem(FOLD_KEY, next); } catch { /* folds for this window only */ }
    setFolded(foldedSet(next));
  };
  const ordered = groupsInOrder(c.groups);
  const people = ordered.filter((g) => g.faces.length && match(g.name));
  const named = ordered.filter((g) => !g.faces.length && match(g.name));
  const mates = matesInOrder(c.teammates).filter((t) => match(t.name));
  const openGroup = (key: string) => { rememberChat(key); c.onGroup(key); };
  const openMate = (id: string) => { rememberChat(`teammate:${id}`); c.onTeammate(id); };

  const section = (id: string, title: string, count: number, rows: ReactNode, plus?: ReactNode) => {
    const open = !folded.has(id);
    return <div className="cx-sec" key={id}>
      <div className="cx-head">
        <button type="button" className="cx-fold" aria-expanded={open} onClick={() => fold(id)}>{CHEVRON(open)}<span>{title}</span><em>{count}</em></button>
        {plus}
      </div>
      {open && rows}
    </div>;
  };
  return <aside className="gc-list cx-list" aria-label="Chats">
    <label className="cx-search">{I.search()}<input value={q} placeholder="Search" aria-label="Search your chats" onChange={(e) => setQ(e.target.value)} /></label>
    {section('teammates', 'AI teammates', c.teammates.length, <>
      {mates.map((t) => {
        const on = current === `teammate:${t.id}`;
        return <button type="button" key={t.id} className={`cx-row${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => openMate(t.id)}>
          <TeammateMark t={t} /><span className="cx-n">{rowName(t)}</span>{waitsOnYou(t) ? <i className="cx-need" aria-label="Waiting on you" /> : t.paused ? <span className="cx-st">Paused</span> : t.primary ? <span className="cx-st">Primary</span> : null}
        </button>;
      })}
      {!c.teammates.length && <button type="button" className={`cx-row cx-add${current === 'new' ? ' on' : ''}`} onClick={c.onNew}><i className="tq tq-sm tq-hash" aria-hidden="true">+</i><span className="cx-n">New teammate</span></button>}
    </>, <button type="button" className="cx-plus" aria-label="New teammate" title="New teammate" onClick={c.onNew}>{I.plus()}</button>)}
    {c.groups.some((g) => g.faces.length) && section('people', 'People', c.groups.filter((g) => g.faces.length).length, people.map((g) => row(g)))}
    {c.groups.some((g) => !g.faces.length) && section('groups', 'Groups', c.groups.filter((g) => !g.faces.length).length, named.map((g) => row(g)))}
  </aside>;

  function row(g: GroupChoice) {
    const on = current === g.key;
    return <button type="button" key={g.key} className={`cx-row${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => openGroup(g.key)}>
      <GroupMark g={g} size={20} /><span className="cx-n">{g.name}</span>{g.unread && !on && <i className="cx-need" aria-label="New messages" />}
    </button>;
  }
}

/** A page drawn inside Chats, with the list on its left. With no `current` the page is drawn as it is. */
export function ChatsFrame({ current, children }: { current: string | null; children: ReactNode }) {
  if (!current) return <>{children}</>;
  return <div className="gr-page tq-chats cx-frame"><div className="gr-body"><ChatsColumn current={current} /><div className="cx-frame-main">{children}</div></div></div>;
}
