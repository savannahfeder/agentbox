// The Tasks page: every task on the team, late and blocked first, done this week folded away.
import { useEffect, useRef, useState } from 'react';
import { MemberFace } from './everything/TeamStrip';
import type { Member } from './everything/members';
import { agentOnTaskWord, tasksInOrder, tasksLine, type TaskGroups, type TaskRow } from './tasks';
import './tasks.css';

interface TaskPerson { name: string; face?: Member }

function Person({ p }: { p: TaskPerson | null }) {
  return <span className="tk-person">{p && <>{p.face && <MemberFace m={p.face} size={18} />}{p.name}</>}</span>;
}

function Row({ r, picked, doing, asked, onOpen, onOpenBlock, onOpenAgent }: {
  r: TaskRow; picked: boolean; doing: TaskPerson | null; asked: TaskPerson | null;
  onOpen: (r: TaskRow) => void; onOpenBlock: (r: TaskRow) => void; onOpenAgent?: (r: TaskRow) => void;
}) {
  const opens = !!r.block?.opens;
  return <li>
    <div role="button" tabIndex={-1} className={`tk-row${picked ? ' is-picked' : ''}${r.done ? ' is-done' : ''}`} data-key={r.key} onClick={() => onOpen(r)}>
      <span className="tk-t">{r.unread && <i className="tk-new" aria-label="New" />}<span className="tk-name">{r.title}</span>
        {r.block && <span className="tk-block">Blocked on {opens
          ? <button type="button" className="tk-link" onClick={(e) => { e.stopPropagation(); onOpenBlock(r); }}>{r.block.on}</button>
          : <span className="tk-on">{r.block.on}</span>}</span>}
        {!r.block && r.agent && !r.done && <span className="tk-block"><button type="button" className="tk-link" onClick={(e) => { e.stopPropagation(); onOpenAgent?.(r); }}>{agentOnTaskWord(r.agent)}</button></span>}</span>
      <Person p={doing} />
      <Person p={asked} />
      <span className={`tk-due${r.due?.late ? ' late' : ''}`}>{r.due?.word}</span>
    </div>
  </li>;
}

export function TasksPage({ groups, faces, nameOf, me, picked, onPicked, keys, onOpen, onOpenBlock, onOpenAgent, onDone, title }: {
  groups: TaskGroups;
  /** On the Team page: its heading. */
  title?: string;
  /** By member key: `me` or `person:<id>`. */
  faces: ReadonlyMap<string, Member>;
  nameOf: (id: string) => string;
  me: string | null;
  picked: string | null; onPicked: (key: string | null) => void;
  /** False while something is drawn over the page, which then keeps the keys. */
  keys: boolean;
  onOpen: (r: TaskRow) => void;
  onOpenBlock: (r: TaskRow) => void;
  /** The agent thread a task was handed to. */
  onOpenAgent?: (r: TaskRow) => void;
  /** E on a task this Mac holds a row for. */
  onDone: (r: TaskRow) => void;
}) {
  const [doneShown, setDoneShown] = useState(false);
  const order = tasksInOrder(groups, doneShown);
  const held = useRef({ order, picked, onPicked, onOpen, onDone });
  held.current = { order, picked, onPicked, onOpen, onDone };
  // In the capture phase, or App's own keys act on the list hidden under this page.
  useEffect(() => {
    if (!keys) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const now = held.current;
      const at = now.order.findIndex((r) => r.key === now.picked);
      const down = e.key === 'j' || e.key === 'ArrowDown';
      if (down || e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const next = at < 0 ? 0 : Math.max(0, Math.min(now.order.length - 1, at + (down ? 1 : -1)));
        now.onPicked(now.order[next]?.key ?? null);
      } else if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        const hit = now.order[at];
        e.preventDefault(); e.stopPropagation();
        if (!hit) return;
        if (e.key === 'Enter') now.onOpen(hit); else if (hit.item && !hit.done) now.onDone(hit);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [keys]);
  const page = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (picked) page.current?.querySelector('.tk-row.is-picked')?.scrollIntoView({ block: 'nearest' });
  }, [picked]);

  const personOf = (id: string | null): TaskPerson | null => (!id ? null
    : { name: id === me ? 'You' : nameOf(id), face: faces.get(id === me ? 'me' : `person:${id}`) });
  const rowOf = (r: TaskRow) => <Row key={r.key} r={r} picked={picked === r.key} doing={personOf(r.holder)} asked={personOf(r.giver)} onOpen={onOpen} onOpenBlock={onOpenBlock} onOpenAgent={onOpenAgent} />;
  const open = order.filter((r) => !r.done);

  return <div className="tk" aria-label="Tasks" ref={page}>
    <div className="tk-col">
      {title && <h2 className="td-title">{title}</h2>}
      <p className="tk-sum">{tasksLine(groups)}</p>
      {order.length > 0 && <div className="tk-row tk-head"><span>Task</span><span>Doing it</span><span>Asked by</span><span className="tk-due">Due</span></div>}
      {open.length > 0 && <section className="tk-sec" aria-label="Open tasks"><ul>{open.map(rowOf)}</ul></section>}
      {groups.done.length > 0 && <section className="tk-sec tk-done" aria-label="Done this week">
        <h2 className="tk-label"><button type="button" className="tk-fold" aria-expanded={doneShown} onClick={() => setDoneShown((o) => !o)}>Done this week<b>{groups.done.length}</b></button></h2>
        {doneShown && <ul>{groups.done.map(rowOf)}</ul>}
      </section>}
    </div>
  </div>;
}
