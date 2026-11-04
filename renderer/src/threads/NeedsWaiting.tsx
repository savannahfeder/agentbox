import { useContext, useState, type ReactNode } from 'react';
import type { WorkItem } from '../types';
import { needId, needsLeft, type Need } from '../../../shared/cloud-needs.mjs';
import { HELD, focusNeedOnOpen } from '../components/NeedCard';
import { rowTitle } from '../list-rules';
import { SavedKeysContext } from './Pages';
import { keyWords } from '../../../shared/cloud-keys.mjs';
import { DARK_INK, logoOf } from '../connections/logos';

type Row = { key: string; need: string; mark: string | null; glyph: 'key' | 'file'; title: string; act: string; items: WorkItem[] };

// One row per thing, not per thread: a sign-in two threads wait on is one row,
// and connecting it frees both (main/ipc.mjs zero:cloud-key).
export function waitingRows(items: WorkItem[], saved: readonly string[] = []): Row[] {
  const rows = new Map<string, Row>();
  // Oldest ask first: it has waited longest (round eight: the first stuck thread was folded under "more").
  const byAsk = [...items].sort((a, b) => (a.wrote?.result?.ts ?? 0) - (b.wrote?.result?.ts ?? 0));
  for (const item of byAsk) {
    for (const n of needsLeft(item, saved) as Need[]) {
      const need = needId(n);
      if (HELD.get(item.id)?.some((h) => h.need === need)) continue;
      const row: Omit<Row, 'items'> = n.kind === 'sign-in' ? { key: `s:${n.service.id}`, need, mark: n.service.id, glyph: 'key', title: `Connect ${n.service.name}`, act: 'Connect' }
        : n.kind === 'key' ? { key: `k:${n.name}`, need, mark: null, glyph: 'key', title: `Add the ${keyWords(n.what) ?? n.name}`, act: 'Add' }
        : n.kind === 'file' ? { key: `f:${item.id}:${n.path}`, need, mark: null, glyph: 'file', title: `Send ${n.path.split('/').pop()}`, act: 'Send' }
        : { key: `c:${item.id}:${n.about}`, need, mark: n.about, glyph: 'key', title: `Enter the ${n.about} code`, act: 'Enter code' };
      const had = rows.get(row.key);
      if (had) { if (!had.items.includes(item)) had.items.push(item); } else rows.set(row.key, { ...row, items: [item] });
    }
  }
  return [...rows.values()];
}

const GLYPH: Record<Row['glyph'], ReactNode> = {
  key: <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8M16 6l2 2M14 8l2 2" /></svg>,
  file: <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
};

/** At the top of Needs you: what cloud threads wait on before they can go on, each opening the thread that asks. */
export function NeedsWaiting({ items, onOpen }: { items: WorkItem[]; onOpen: (item: WorkItem) => void }) {
  const saved = useContext(SavedKeysContext);
  const rows = waitingRows(items, saved);
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  // Four, so the threads themselves stay in sight (round seven).
  const shown = all || rows.length <= 5 ? rows : rows.slice(0, 4);
  // A code waits for the sign-ins on its ask, so its row lands on the first of those (round ten).
  const go = (r: Row) => {
    const item = r.items[0];
    const first = r.need.startsWith('code:') ? needsLeft(item, saved).find((n) => n.kind === 'sign-in' || n.kind === 'key') : null;
    focusNeedOnOpen(item.id, first ? needId(first) : r.need);
    onOpen(item);
  };
  return <div className="nw">
    <div className="nw-label">Waiting on you before they can go on</div>
    <div className="nw-box">
      {shown.map((r) => {
        const src = r.mark ? logoOf(r.mark) : null;
        const threads = r.items.map((i) => rowTitle(i)).join(', ');
        return <div key={r.key} className="nw-row" onClick={() => go(r)}>
          <span className={`nw-mark${r.mark && DARK_INK.has(r.mark) ? ' need-mark-ink' : ''}`} aria-hidden="true">{src ? <img src={src} alt="" draggable={false} /> : GLYPH[r.glyph]}</span>
          <span className="nw-what"><span className="nw-t">{r.title}</span><span className="nw-s">{r.items.length > 1 ? `${r.items.length} threads · ${threads}` : threads}</span></span>
          <button type="button" className="need-btn" onClick={(e) => { e.stopPropagation(); go(r); }}>{r.act}</button>
        </div>;
      })}
      {shown.length < rows.length && <button type="button" className="nw-more" onClick={() => setAll(true)}>{rows.length - shown.length} more</button>}
    </div>
  </div>;
}
