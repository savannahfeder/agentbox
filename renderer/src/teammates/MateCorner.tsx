// The ⋯ in the window's corner on your AI teammate's page, where a thread keeps
// its own: pause it, open its settings, make it primary, delete it.
import { useEffect, useRef, useState } from 'react';
import type { Teammate } from '../types';
import { api } from '../api';
import { AskBeforeDeleting } from '../team/MessageMore';

const mark = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const MARK = {
  pause: <svg {...mark}><path d="M9 6v12M15 6v12" /></svg>,
  resume: <svg {...mark}><path d="m8 5 11 7-11 7z" /></svg>,
  settings: <svg {...mark}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  primary: <svg {...mark}><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" /></svg>,
  delete: <svg {...mark}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>,
};
const DOTS = <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2.5" y="7" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="11.5" y="7" width="2" height="2" /></svg>;

/** A row of the menu above Delete: what it says, and what it changes on the teammate, or none for Settings. */
export type MateMenuRow = { id: 'pause' | 'resume' | 'settings' | 'primary'; label: string; patch?: Record<string, unknown> };

export function mateMenuRows(t: Pick<Teammate, 'paused' | 'primary' | 'status'>): MateMenuRow[] {
  return [
    t.paused ? { id: 'resume', label: 'Resume', patch: { paused: false } } : { id: 'pause', label: 'Pause', patch: { paused: true } },
    { id: 'settings', label: 'Settings' },
    ...(!t.primary && t.status === 'active' ? [{ id: 'primary' as const, label: 'Make primary', patch: { primary: true } }] : []),
  ];
}

type Row = { id: keyof typeof MARK; label: string; act: () => void };

export function MateCorner({ t, onSettings, onChanged, onDeleted }: {
  t: Teammate;
  /** Opens its About at Settings. */
  onSettings: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    // Before the page's own Escape, which leaves the teammate.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const update = async (patch: Record<string, unknown>) => { const r = await api.teammates('update', { id: t.id, patch }); if (r.ok) onChanged(); };
  const rows: Row[] = mateMenuRows(t).map(({ id, label, patch }) => ({ id, label, act: patch ? () => { void update(patch); } : onSettings }));
  // A refusal has to be read, so the question comes back with the reason in it.
  const remove = async () => {
    const r = await api.teammates('remove', { id: t.id });
    if (!r.ok) { setRefused(r.error); setAsking(true); return; }
    onDeleted();
  };
  const row = (r: Row) => <button key={r.id} type="button" role="menuitem" className="row-i ts-more-row" onClick={() => { setOpen(false); r.act(); }}>
    <span className="ico">{MARK[r.id]}</span><span className="ts-more-label">{r.label}</span>
  </button>;
  return <span className="ts-more-wrap" ref={wrap}>
    <button type="button" className="ts-more" aria-label={`${t.name} options`} title="Pause, settings and more" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{DOTS}</button>
    {open && <div className="th-menu ts-more-menu mate-menu" role="menu" aria-label={`${t.name} options`}>
      {rows.map(row)}
      <span className="sep" aria-hidden="true" />
      {row({ id: 'delete', label: 'Delete', act: () => setAsking(true) })}
    </div>}
    {asking && <AskBeforeDeleting title={`Delete ${t.name}?`} label={`Delete ${t.name}`}
      body={refused ?? 'It stops working, and its open threads close.'}
      onDelete={() => { void remove(); }} onClose={() => { setAsking(false); setRefused(null); }} />}
  </span>;
}
