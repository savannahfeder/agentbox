// The Tasks page: every task on the team, late and blocked first, done this week folded away.
import { useEffect, useRef, useState } from 'react';
import { MemberFace } from './everything/TeamStrip';
import type { Member } from './everything/members';
import { tasksInOrder, tasksLine, type TaskGroups, type TaskRow } from './tasks';
import './tasks.css';

function Row({ r, picked, face, from, onOpen, onOpenBlock, onOpenAgent }: {
  r: TaskRow; picked: boolean; face?: Member; from: string | null;
  onOpen: (r: TaskRow) => void; onOpenBlock: (r: TaskRow) => void; onOpenAgent?: (r: TaskRow) => void;
}) {
  const opens = !!r.block?.opens;
  return <li>
    <div role="button" tabIndex={-1} className={`tk-row${picked ? ' is-picked' : ''}${r.done ? ' is-done' : ''}`} data-key={r.key} onClick={() => onOpen(r)}>
      <span className="tk-who" title={face?.name}>{face && <MemberFace m={face} size={20} />}</span>
      <span className="tk-t">{r.unread && <i className="tk-new" aria-label="New" />}{r.title}</span>
      <span className="tk-block">{r.block && <>Blocked on {opens
        ? <button type="button" className="tk-link" onClick={(e) => { e.stopPropagation(); onOpenBlock(r); }}>{r.block.on}</button>
        : <span className="tk-on">{r.block.on}</span>}</>}
        {!r.block && r.agent && !r.done && <button type="button" className="tk-link" onClick={(e) => { e.stopPropagation(); onOpenAgent?.(r); }}>With {r.agent.name}</button>}</span>
      <span className="tk-from">{from && `from ${from}`}</span>
      <span className={`tk-due${r.due?.late ? ' late' : ''}`}>{r.due?.word}</span>
    </div>
  </li>;
}

export function TasksPage({ groups, faces, nameOf, me, picked, onPicked, keys, onOpen, onOpenBlock, onOpenAgent, onDone }: {
  groups: TaskGroups;
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

  const faceOf = (id: string | null) => (!id ? undefined : faces.get(id === me ? 'me' : `person:${id}`));
  const fromOf = (id: string | null) => (!id ? null : id === me ? 'you' : nameOf(id));
  const section = (label: string, rows: TaskRow[]) => (rows.length ? <section className="tk-sec" aria-label={label}>
    <h2 className="tk-label">{label}</h2>
    <ul>{rows.map((r) => <Row key={r.key} r={r} picked={picked === r.key} face={faceOf(r.holder)} from={fromOf(r.giver)} onOpen={onOpen} onOpenBlock={onOpenBlock} onOpenAgent={onOpenAgent} />)}</ul>
  </section> : null);

  return <div className="tk" aria-label="Tasks" ref={page}>
    <div className="tk-col">
      <p className="tk-sum">{tasksLine(groups)}</p>
      {section('Late', groups.late)}
      {section('Blocked', groups.blocked)}
      {section(groups.late.length || groups.blocked.length ? 'Open' : 'All open', groups.open)}
      {groups.done.length > 0 && <section className="tk-sec tk-done" aria-label="Done this week">
        <h2 className="tk-label"><button type="button" className="tk-fold" aria-expanded={doneShown} onClick={() => setDoneShown((o) => !o)}>Done this week<b>{groups.done.length}</b></button></h2>
        {doneShown && <ul>{groups.done.map((r) => <Row key={r.key} r={r} picked={picked === r.key} face={faceOf(r.holder)} from={fromOf(r.giver)} onOpen={onOpen} onOpenBlock={onOpenBlock} />)}</ul>}
      </section>}
    </div>
  </div>;
}
