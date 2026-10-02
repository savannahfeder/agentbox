// SETTINGS > PROJECT PRIORITY: the running order over projects, as a page.
//
// The order used to be set only by dragging chips inside the old composer's
// project menu, and most people never found that it could be dragged at all.
// So it has a page with its name on it, reachable from the Settings nav, from
// the composer's project menu ("Reorder") and from ⌘K.
//
// DRAWN THE WAY THE INBOX IS DRAWN, because the first version had its own look
// (filled slabs, a grip column, a sunburst per row) and read as foreign: a
// small-capitals column head, rows on hairlines with nothing filled, the name
// underlined under the pointer, and each project's colour square from the
// composer. The rank sits where the inbox has nothing, and turns into the
// grip when you point at the row, so the handle shows exactly when it is useful.
//
// The whole row drags. Up and down are buttons too, because a drag is the thing
// nobody discovers and an arrow is the thing everybody does; Alt with the arrow
// keys moves the focused row.
//
// The rules (which projects, what a drop does) are ../project-priority.ts; the
// order's worth is shared/rank.mjs.

import { useEffect, useMemo, useRef, useState } from 'react';
import { landingRow, nudge, placeBefore, priorityList } from '../project-priority';
import { ProductMark } from './ProductMark';
import type { Product } from '../types';
import './project-priority.css';

const DRAG_THRESHOLD_PX = 4;

export function ProjectPriority({ ranked, onSetOrder }: {
  /** Every project, already in the running order (App's `rankedProducts`). */
  ranked: Product[];
  onSetOrder: (slugs: string[]) => void | Promise<void>;
}) {
  // THE MOVE SHOWS AT ONCE. The saved order comes back on the next refresh,
  // and a row that sat still until then would read as a press that missed.
  const [pending, setPending] = useState<string[] | null>(null);
  const savedKey = ranked.map((p) => p.slug).join('\n');
  useEffect(() => { setPending(null); }, [savedKey]);

  const bySlug = useMemo(() => new Map(ranked.map((p) => [p.slug, p])), [ranked]);
  const full = pending ?? ranked.map((p) => p.slug);
  const shown = priorityList(full.map((s) => bySlug.get(s)).filter((p): p is Product => !!p));
  const shownSlugs = shown.map((p) => p.slug);

  // The row that just moved keeps a mark for a moment, so the eye can follow it.
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 900);
    return () => clearTimeout(t);
  }, [moved]);

  const commit = (slug: string, next: string[] | null) => {
    if (!next) return;
    setPending(next);
    setMoved(slug);
    void onSetOrder(next);
  };

  /* ------------------------------- drag --------------------------------- */
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ slug: string; dy: number; caret: number } | null>(null);

  const startDrag = (slug: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.pp-row')];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const top = list.getBoundingClientRect().top;
    const startY = e.clientY;
    const row = e.currentTarget;
    let movedPx = false;
    let to = shownSlugs.indexOf(slug);
    row.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!movedPx && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      movedPx = true;
      to = landingRow(rects, ev.clientY);
      // Nothing shifts during the drag; the landing place is drawn as a line.
      const caret = (to < rects.length ? rects[to].top : rects[rects.length - 1].bottom) - top;
      setDrag({ slug, dy, caret });
    };
    const onUp = () => {
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onUp);
      row.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!movedPx) return;
      commit(slug, placeBefore(full, slug, to < shownSlugs.length ? shownSlugs[to] : null));
    };
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      <h1 className="set-title">Project priority</h1>
      <p className="set-lede">
        Agents work from the top down, and a project&rsquo;s place outranks a task&rsquo;s own priority. Drag a project, or use its arrows, to move it.
      </p>
      {!shown.length && <div className="set-nav-empty">No projects yet.</div>}
      {shown.length === 1 && <div className="set-nav-empty">With one project there is nothing to order yet.</div>}
      {shown.length > 0 && (
        <div className="pp-table">
          <div className="pp-head" aria-hidden="true">
            <span className="pp-rank">#</span>
            <span className="pp-head-name">Project</span>
            <span className="pp-head-move">Move</span>
          </div>
          <ol className="pp-list" ref={listRef}>
            {shown.map((p, i) => (
              <li
                key={p.slug}
                className={['pp-row', drag?.slug === p.slug ? 'dragging' : '', moved === p.slug ? 'moved' : '', i === 0 ? 'first' : ''].filter(Boolean).join(' ')}
                style={drag?.slug === p.slug ? { transform: `translateY(${drag.dy}px)` } : undefined}
                tabIndex={0}
                aria-label={`${p.name}, number ${i + 1} of ${shown.length}`}
                onPointerDown={startDrag(p.slug)}
                onKeyDown={(e) => {
                  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                  e.preventDefault();
                  commit(p.slug, nudge(full, shownSlugs, p.slug, e.key === 'ArrowUp' ? -1 : 1));
                }}
              >
                <span className="pp-rank">
                  <span className="pp-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pp-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                </span>
                <ProductMark src={p.logo} name={p.name} slug={p.slug} size={18} />
                <span className="pp-name">{p.name}</span>
                <span className="pp-acts">
                  <button type="button" className="pp-top" disabled={i === 0}
                    onClick={() => commit(p.slug, placeBefore(full, p.slug, shownSlugs[0]))}>To top</button>
                  <button type="button" className="pp-arrow" disabled={i === 0} aria-label={`Move ${p.name} up`}
                    title="Move up (⌥↑)" onClick={() => commit(p.slug, nudge(full, shownSlugs, p.slug, -1))}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5 8 6l3.5 3.5" /></svg>
                  </button>
                  <button type="button" className="pp-arrow" disabled={i === shown.length - 1} aria-label={`Move ${p.name} down`}
                    title="Move down (⌥↓)" onClick={() => commit(p.slug, nudge(full, shownSlugs, p.slug, 1))}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
                  </button>
                </span>
              </li>
            ))}
            {drag && <span className="pp-caret" style={{ top: drag.caret - 1 }} />}
          </ol>
        </div>
      )}
    </>
  );
}
