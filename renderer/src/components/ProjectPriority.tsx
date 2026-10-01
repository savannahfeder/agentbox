// SETTINGS > PROJECT PRIORITY: the running order over projects, as a page.
//
// The order used to be set only by dragging chips inside the old composer's
// project menu, and most people never found that it could be dragged at all.
// So it has a page with its name on it, reachable from the Settings nav, from
// the composer's project menu ("Reorder") and from ⌘K.
//
// Every row can be dragged by its grip AND moved with buttons, because a drag
// is the thing nobody discovers and a button with an arrow on it is the thing
// everybody does. Alt with the arrow keys moves the focused row.
//
// The rules (which projects, what a drop does) are ../project-priority.ts; the
// order's worth is shared/rank.mjs.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductMark } from './ProductMark';
import { landingRow, nudge, placeBefore, priorityList } from '../project-priority';
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

  const commit = (next: string[] | null) => {
    if (!next) return;
    setPending(next);
    void onSetOrder(next);
  };

  /* ------------------------------- drag --------------------------------- */
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ slug: string; dy: number; caret: number } | null>(null);

  const startDrag = (slug: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.pp-row')];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const top = list.getBoundingClientRect().top;
    const startY = e.clientY;
    const grip = e.currentTarget;
    let moved = false;
    let to = shownSlugs.indexOf(slug);
    grip.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
      to = landingRow(rects, ev.clientY);
      // Nothing shifts during the drag; the landing place is drawn as a line.
      const caret = (to < rects.length ? rects[to].top : rects[rects.length - 1].bottom) - top;
      setDrag({ slug, dy, caret });
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!moved) return;
      commit(placeBefore(full, slug, to < shownSlugs.length ? shownSlugs[to] : null));
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      <h1 className="set-title">Project priority</h1>
      <p className="set-lede">
        Agents work on these from the top down. A project&rsquo;s place counts for more than a task&rsquo;s own priority, so its Low tasks still go ahead of Urgent ones further down.
      </p>
      {!shown.length && <div className="set-nav-empty">No projects yet.</div>}
      {shown.length === 1 && <div className="set-nav-empty">With one project there is nothing to order yet.</div>}
      <ol className="pp-list" ref={listRef}>
        {shown.map((p, i) => (
          <li
            key={p.slug}
            className={`pp-row ${drag?.slug === p.slug ? 'dragging' : ''}`}
            style={drag?.slug === p.slug ? { transform: `translateY(${drag.dy}px)` } : undefined}
            tabIndex={0}
            aria-label={`${p.name}, number ${i + 1} of ${shown.length}`}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
              e.preventDefault();
              commit(nudge(full, shownSlugs, p.slug, e.key === 'ArrowUp' ? -1 : 1));
            }}
          >
            <span className="pp-grip" title="Drag to reorder" aria-hidden="true" onPointerDown={startDrag(p.slug)}>
              <i /><i /><i /><i /><i /><i />
            </span>
            <span className="pp-num">{i + 1}</span>
            <ProductMark src={p.logo} name={p.name} size={20} />
            <span className="pp-name">{p.name}</span>
            <span className="pp-acts">
              <button type="button" className="pp-btn pp-top" disabled={i === 0}
                title="Move to the top" onClick={() => commit(placeBefore(full, p.slug, shownSlugs[0]))}>Top</button>
              <button type="button" className="pp-btn" disabled={i === 0} aria-label={`Move ${p.name} up`}
                title="Move up (⌥↑)" onClick={() => commit(nudge(full, shownSlugs, p.slug, -1))}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l4-4 4 4" /></svg>
              </button>
              <button type="button" className="pp-btn" disabled={i === shown.length - 1} aria-label={`Move ${p.name} down`}
                title="Move down (⌥↓)" onClick={() => commit(nudge(full, shownSlugs, p.slug, 1))}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
              </button>
            </span>
          </li>
        ))}
        {drag && <span className="pp-caret" style={{ top: drag.caret - 1 }} />}
      </ol>
    </>
  );
}
