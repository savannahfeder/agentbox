// The Groups page's own column of every group, the header over it and over
// the open group, and the finder G opens from anywhere (w-dcaa2c122e).
import { useContext, useEffect, useRef, useState } from 'react';
import type { GroupChoice } from './GroupList';
import { GroupMark } from './GroupList';
import { I } from './icons';
import { updatedWords } from '../../threads/page-rules';
import { ChatsColumn, ChatsContext } from '../../teammates/ChatsColumn';

/** Groups whose name matches, the name's start first, then a word's start, then anywhere in it.
 *  Names only: what was said last matches nearly every group. */
export function findGroups<T extends { name: string }>(rows: T[], q: string): T[] {
  const want = q.trim().toLowerCase();
  if (!want) return rows;
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith(want)) return 0;
    if (n.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(want))) return 1;
    return n.includes(want) ? 2 : -1;
  };
  return rows.map((g) => ({ g, r: rank(g.name) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r).map((x) => x.g);
}

/** Every group down the page's left, the open one lit; something new is a dot at the row's end. */
export function GroupsColumn({ rows, current, now, onOpen }: { rows: GroupChoice[]; current: string | null; now: number; onOpen: (key: string) => void }) {
  // With teammates on, this column is the Chats list.
  if (useContext(ChatsContext)) return <ChatsColumn current={current} />;
  return <aside className="gc-list" aria-label="Groups">{rows.map((g) => {
    const on = g.key === current;
    const fresh = g.unread && !on;
    return <button type="button" key={g.key} className={`gc-row${on ? ' on' : ''}${fresh ? ' unread' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => onOpen(g.key)}>
      <GroupMark g={g} size={20} />
      <span className="gc-w">
        <span className="gc-1"><span className="rm-one">{g.name}</span><span className="gc-t">{g.at ? updatedWords(g.at, now) : ''}</span></span>
        <span className="gc-2"><span className="rm-one">{g.last}</span>{fresh && <i className="gc-dot" aria-label="New messages" />}</span>
      </span>
    </button>;
  })}</aside>;
}

/** The top bar over both: Groups and the finder's button over the column, the open group's name over its chat. */
export function GroupsHead({ current, onFind }: { current: GroupChoice | undefined; onFind: () => void }) {
  const chats = !!useContext(ChatsContext);
  return <div className="gc-head">
    <div className="gc-head-col"><span className="workspace-title gc-col-title">{chats ? 'Chats' : 'Groups'}</span>
      <button type="button" className="gc-find" aria-label="Find a group" title="Find a group (G)" onClick={onFind}>{I.search()}<kbd>G</kbd></button></div>
    <h1 className="workspace-title gc-head-group">
      {current && (current.faces.length ? <GroupMark g={current} size={20} /> : <span className="gt-hh">{I.hash(15)}</span>)}
      <span className="rm-one">{current?.name ?? 'Groups'}</span>
    </h1>
  </div>;
}

/** The command bar's frame over your groups. With nothing typed it starts on a group other
 *  than the open one, so G then Enter switches. */
export function GroupFinder({ rows, current = null, now, onOpen, onClose }: { rows: GroupChoice[]; current?: string | null; now: number; onOpen: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [chosen, setAt] = useState<number | null>(null);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const shown = findGroups(rows, q);
  const at = chosen ?? (q.trim() ? 0 : Math.max(0, shown.findIndex((g) => g.key !== current)));
  const pick = shown[Math.min(at, shown.length - 1)];
  return <div className="modal-backdrop palette-backdrop" onClick={onClose}>
    <div className="modal palette gc-finder" role="dialog" aria-label="Find a group" onClick={(e) => e.stopPropagation()}>
      <input ref={box} className="palette-input" value={q} placeholder="Find a group…" aria-label="Find a group"
        onChange={(e) => { setQ(e.target.value); setAt(null); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.max(0, Math.min(at + 1, shown.length - 1))); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(at - 1, 0)); }
          if (e.key === 'Enter' && pick) onOpen(pick.key);
        }} />
      {/* As tall as it opened, so the centred box does not jump as matches drop away. */}
      <div className="palette-list gc-flist" style={{ height: Math.max(1, Math.min(rows.length, 9)) * 60 + 12 }}>
        {!shown.length && <div className="palette-empty">{rows.length ? `No group matches “${q.trim()}”.` : 'You are not in any groups yet.'}</div>}
        {shown.map((g) => <div key={g.key} className={`palette-item gc-frow${g === pick ? ' selected' : ''}`} onMouseEnter={() => setAt(shown.indexOf(g))} onClick={() => onOpen(g.key)}>
          <GroupMark g={g} size={20} />
          <span className="gc-fw"><span className="gc-f1"><span className="rm-one">{g.name}</span>{g.unread && g.key !== current && <i className="gc-dot" aria-label="New messages" />}</span>
            <span className="gc-f2 rm-one">{g.last}</span></span>
          <span className="gc-fm">{g.at ? updatedWords(g.at, now) : ''}</span>
        </div>)}
      </div>
    </div>
  </div>;
}
