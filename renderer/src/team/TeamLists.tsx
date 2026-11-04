// Two short lists over whatever is on screen, found from Ctrl+K and a quiet
// button: what a group or project has decided, and what shipped this week.
import { createContext, useEffect, type ReactNode } from 'react';
import type { RoomDecision } from '../types';
import { decisionRows } from './decisions';
import { shippedWords, type ShippedRow } from './shipped';
import { I } from './rooms/icons';
import './rooms/rooms.css';

/** A conversation's message filed into the team's list, where there is one. */
export const DecideContext = createContext<{ label: string; mark: (message: { uid: string; text: string; by: string | null }) => void } | null>(null);

function List({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <div className="modal rm-dlg tl-list" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
      <div className="sec tl-head"><div className="t">{title}<button type="button" className="x" aria-label="Close" onClick={onClose}>{I.x()}</button></div></div>
      <div className="tl-body">{children}</div>
    </div>
  </div>;
}

const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function DecisionsList({ title, project, rows, nameOf, onTakeBack, onClose }: {
  title: string; project: string | null; rows: readonly RoomDecision[];
  nameOf: (id: string | null) => string;
  onTakeBack: (row: RoomDecision) => void; onClose: () => void;
}) {
  const { priority, decisions } = decisionRows(rows, { project });
  const row = (d: RoomDecision) => <div key={`${d.messageId}/${d.kind}`} className="tl-row">
    <p className="tl-words">{d.body}</p>
    <div className="tl-foot"><span>{nameOf(d.saidBy)}, {day(d.at)}</span>
      <button type="button" className="tl-back" onClick={() => onTakeBack(d)}>{d.kind === 'priority' ? 'Unpin' : 'Not a decision'}</button></div>
  </div>;
  return <List title={title} label={title} onClose={onClose}>
    {priority && <section className="tl-sec"><h3>This week’s priorities</h3>{row(priority)}</section>}
    {decisions.length > 0 && <section className="tl-sec">{priority && <h3>Decisions</h3>}{decisions.map(row)}</section>}
    {!priority && !decisions.length && <p className="tl-none">Nothing is marked yet.</p>}
  </List>;
}

export function ShippedList({ rows, now, nameOf, onOpen, onClose }: {
  rows: readonly ShippedRow[]; now: number; nameOf: (id: string | null) => string;
  onOpen: (row: ShippedRow) => void; onClose: () => void;
}) {
  return <List title="Shipped this week" label="Shipped this week" onClose={onClose}>
    {rows.map((r) => <button type="button" key={r.key} className="tl-ship" onClick={() => onOpen(r)}>
      <span className="tl-title">{r.title}</span><span className="tl-who">{nameOf(r.ownerId)}</span><span className="tl-when">{shippedWords(r.at, now)}</span>
    </button>)}
    {!rows.length && <p className="tl-none">Nothing has shipped this week.</p>}
  </List>;
}
