// The cards over Everything else: two rows unless you choose otherwise.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { HiddenList } from './TeamStrip';
import { moreLine, rowsAfterDrag, rowsShown, type CardRows, type Member } from './members';

/** One row of cards inside the box: where it starts, where it ends with the strip's padding under it, and how many members it holds. */
type Row = { top: number; end: number; members: number };

function measure(box: HTMLElement): Row[] {
  const origin = box.getBoundingClientRect().top - box.scrollTop;
  const pad = 4;
  const rows = new Map<number, Row>();
  for (const card of box.querySelectorAll<HTMLElement>('.ev-card')) {
    const r = card.getBoundingClientRect();
    const top = Math.round(r.top - origin);
    const row = rows.get(top) ?? { top, end: 0, members: 0 };
    row.end = Math.max(row.end, Math.round(r.bottom - origin) + pad);
    if (!card.classList.contains('ev-add')) row.members += 1;
    rows.set(top, row);
  }
  return [...rows.values()].sort((a, b) => a.top - b.top);
}

const same = (a: Row[], b: Row[]) => a.length === b.length && a.every((r, i) => r.top === b[i].top && r.end === b[i].end && r.members === b[i].members);

export function CardsArea({ rows: choice, onRows, picked, hidden, onShow, children }: {
  rows: CardRows; onRows: (rows: CardRows) => void; picked: string | null;
  hidden: Member[]; onShow: (m: Member) => void; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    const strip = el?.firstElementChild;
    if (!el || !strip) return undefined;
    const look = () => setRows((was) => { const now = measure(el); return same(now, was) ? was : now; });
    look();
    const resized = new ResizeObserver(look);
    resized.observe(strip);
    const changed = new MutationObserver(look);
    changed.observe(strip, { childList: true });
    return () => { resized.disconnect(); changed.disconnect(); };
  }, []);

  // "Show N more" is for finding someone, so it lasts until a card is picked; the grip's choice is what stays.
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { setOpen(false); }, [picked]);
  const choose = (next: CardRows) => { setOpen(false); onRows(next); };

  const total = rows.length;
  const shown = open ? total : rowsShown(choice, total);
  const cut = shown < total;
  const more = rows.slice(shown).reduce((n, r) => n + r.members, 0);
  const line = moreLine(shown, total, more);
  const onLine = () => {
    if (line?.next === 'all') setOpen(true);
    else if (open) setOpen(false);
    else choose(null);
  };

  // The open card can sit past the cut (picked from a face on Needs you, or a chat opened from Messages).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !cut || !picked || shown === 0) return;
    const card = [...el.querySelectorAll<HTMLElement>('.ev-card')].find((c) => c.dataset.key === picked);
    if (!card) return;
    const at = Math.round(card.getBoundingClientRect().top - (el.getBoundingClientRect().top - el.scrollTop));
    const row = rows.find((r) => r.top === at);
    if (!row) return;
    if (row.end > el.scrollTop + el.clientHeight) el.scrollTop = row.end - el.clientHeight;
    else if (row.top - rows[0].top < el.scrollTop) el.scrollTop = row.top - rows[0].top;
  }, [picked, shown, cut, rows]);

  return <>
    <div ref={box} className="ev-cards" style={cut ? { maxHeight: shown === 0 ? 0 : rows[shown - 1].end } : undefined}>{children}</div>
    {(line || hidden.length > 0) && <div className="ev-under">
      {line && <button type="button" className="ev-more" onClick={onLine}>{line.words}</button>}
      <HiddenList hidden={hidden} onShow={onShow} />
    </div>}
    <Grip box={box} ends={rows.map((r) => r.end)} shown={shown} choice={choice} onRows={choose} />
  </>;
}

function Grip({ box, ends, shown, choice, onRows }: {
  box: RefObject<HTMLDivElement | null>; ends: number[]; shown: number; choice: CardRows; onRows: (rows: CardRows) => void;
}) {
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    e.preventDefault();
    const from = el.clientHeight;
    const y0 = e.clientY;
    let last = choice;
    const move = (ev: PointerEvent) => {
      const next = rowsAfterDrag(from + ev.clientY - y0, ends);
      if (next !== last) { last = next; onRows(next); }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = e.key === 'ArrowUp' ? Math.max(0, shown - 1) : shown + 1;
    onRows(next >= ends.length ? 'all' : next);
  };
  return <div className="ev-grip" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the cards"
    title="Drag to resize the cards. Double-click for two rows of cards." tabIndex={0}
    onPointerDown={start} onDoubleClick={() => onRows(null)} onKeyDown={keys} />;
}
