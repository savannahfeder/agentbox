// SETTINGS > PROJECTS: every project, in the order the agents work them.
//
// ONE PAGE, NOT TWO. Projects and their priority were two pages for a round,
// and they were merged: changing a project's priority and changing its name
// belong in one place, called Projects. So the list IS the running order,
// and each row is still the door to that project's own page, where its name,
// picture and rules are changed.
//
// What the old index promised still holds here:
//   - it filters, by name and by folder, because dozens is past reading;
//   - each row shows the folder, the one thing that tells two projects of the
//     same name apart;
//   - one state word at most per row;
//   - a press on the row opens the project and does nothing else. Renaming and
//     pictures stay on the page it opens.
//
// And what the order needs:
//   - the rank, first one in the accent; under the pointer it becomes the grip;
//   - the whole row drags, and up, down and To top are buttons, because a drag
//     is the thing nobody discovers. Alt with the arrows moves the focused row.
//
// DRAWN IN THE INBOX'S IDIOM (./projects-page.css). The order's rules are
// ../project-priority.ts and its worth is shared/rank.mjs.

import { useEffect, useMemo, useRef, useState } from 'react';
import { landingRow, nudge, placeBefore, priorityList } from '../project-priority';
import { ProductMark } from './ProductMark';
import { shortPath } from './Settings';
import type { Product, ProjectSettings } from '../types';
import './projects-page.css';

const DRAG_THRESHOLD_PX = 4;

interface Row {
  slug: string;
  name: string;
  logo?: string | null;
  dir: string;
  running: number;
  autonomous: boolean;
}

export function ProjectsPage({ ranked, details, onSetOrder, onOpen, onNew }: {
  /** Every project, already in the running order (App's `rankedProducts`). */
  ranked: Product[];
  /** What Settings knows about each project: its folder, what is running, its mode. */
  details: ProjectSettings[];
  /** Writes the order. Absent means the list is shown in order but cannot be moved. */
  onSetOrder?: (slugs: string[]) => void | Promise<void>;
  onOpen: (slug: string) => void;
  onNew?: () => void;
}) {
  // THE MOVE SHOWS AT ONCE. The saved order comes back on the next refresh,
  // and a row that sat still until then would read as a press that missed.
  const [pending, setPending] = useState<string[] | null>(null);
  const savedKey = ranked.map((p) => p.slug).join('\n');
  useEffect(() => { setPending(null); }, [savedKey]);

  const full = pending ?? ranked.map((p) => p.slug);

  // The rows, in order. A project Settings knows that the order has never heard
  // of still gets a row, at the end, so nothing goes missing from this page.
  const rows: Row[] = useMemo(() => {
    const bySlug = new Map(ranked.map((p) => [p.slug, p]));
    const info = new Map(details.map((d) => [d.slug, d]));
    const ordered = priorityList(full.map((s) => bySlug.get(s)).filter((p): p is Product => !!p));
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const p of ordered) {
      const d = info.get(p.slug);
      seen.add(p.slug);
      out.push({ slug: p.slug, name: d?.name ?? p.name, logo: d?.logo ?? p.logo, dir: d?.dir ?? p.dir, running: d?.running ?? 0, autonomous: !!d?.autonomous });
    }
    for (const d of details) {
      // In the order but left off on purpose (a conversation, the practice
      // project) stays off; only one the order has never heard of is added.
      if (seen.has(d.slug) || bySlug.has(d.slug)) continue;
      out.push({ slug: d.slug, name: d.name, logo: d.logo, dir: d.dir ?? '', running: d.running ?? 0, autonomous: !!d.autonomous });
    }
    return out;
  }, [full.join('\n'), ranked, details]);
  const allSlugs = rows.map((r) => r.slug);

  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? rows.filter((p) => p.name.toLowerCase().includes(needle)
      || p.slug.toLowerCase().includes(needle)
      || (p.dir ?? '').toLowerCase().includes(needle))
    : rows;
  const shownSlugs = shown.map((r) => r.slug);

  // THE STATE IN WORDS, at most one. Null on an ordinary project, which is
  // nearly all of them, and then the row is just a name.
  const flag = (p: Row) => (p.autonomous ? 'on its own' : null);

  // The row that just moved keeps a mark for a moment, so the eye can follow it.
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 900);
    return () => clearTimeout(t);
  }, [moved]);

  const commit = (slug: string, next: string[] | null) => {
    if (!next || !onSetOrder) return;
    setPending(next);
    setMoved(slug);
    void onSetOrder(next);
  };

  /* ------------------------------- drag --------------------------------- */
  // A press that does not travel is a click, and a click opens the project.
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ slug: string; dy: number; caret: number } | null>(null);

  const press = (slug: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const list = listRef.current;
    if (!list) return;
    const rects = [...list.querySelectorAll<HTMLElement>('.pp-row')].map((r) => r.getBoundingClientRect());
    const top = list.getBoundingClientRect().top;
    const startY = e.clientY;
    const row = e.currentTarget;
    let travelled = false;
    let to = shownSlugs.indexOf(slug);
    row.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!onSetOrder) return;
      const dy = ev.clientY - startY;
      if (!travelled && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      travelled = true;
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
      if (!travelled) { onOpen(slug); return; }
      // Worked out on the FULL order, so rows this page never lists
      // (conversations, the practice project) keep their place.
      commit(slug, placeBefore(full, slug, to < shownSlugs.length ? shownSlugs[to] : null));
    };
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      <h1 className="set-title">Projects</h1>
      <p className="set-lede">
        {onSetOrder
          ? 'Agents work from the top down, and a project’s place outranks a task’s own priority. Drag a project or use its arrows to move it, and open it to rename it or change its rules.'
          : 'Open a project to change its name, its picture and how its agents run.'}
      </p>
      <div className="proj-index-top">
        <input
          className="proj-index-find"
          type="search"
          value={filter}
          placeholder="Find a project"
          aria-label="Find a project"
          onChange={(e) => setFilter(e.target.value)}
        />
        {onNew && <button type="button" className="set-ghost" onClick={onNew}>New project</button>}
      </div>
      {!rows.length && <div className="set-nav-empty">No projects yet.</div>}
      {!!rows.length && !shown.length && (
        <div className="set-nav-empty">Nothing here matches “{filter.trim()}”.</div>
      )}
      {shown.length > 0 && (
        <div className="pp-table">
          <div className="pp-head" aria-hidden="true">
            <span className="pp-rank">#</span>
            <span className="pp-head-name">Project</span>
            {onSetOrder && <span className="pp-head-move">Move</span>}
          </div>
          <ol className="pp-list" ref={listRef}>
            {shown.map((p, i) => {
              const rank = allSlugs.indexOf(p.slug);
              return (
                <li
                  key={p.slug}
                  className={['pp-row', drag?.slug === p.slug ? 'dragging' : '', moved === p.slug ? 'moved' : '', rank === 0 ? 'first' : '', onSetOrder ? 'can-move' : ''].filter(Boolean).join(' ')}
                  style={drag?.slug === p.slug ? { transform: `translateY(${drag.dy}px)` } : undefined}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.name}, number ${rank + 1} of ${rows.length}. Open`}
                  onPointerDown={press(p.slug)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onOpen(p.slug); return; }
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    commit(p.slug, nudge(full, shownSlugs, p.slug, e.key === 'ArrowUp' ? -1 : 1));
                  }}
                >
                  <span className="pp-rank">
                    <span className="pp-num">{String(rank + 1).padStart(2, '0')}</span>
                    {onSetOrder && <span className="pp-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
                  </span>
                  <ProductMark src={p.logo} name={p.name} slug={p.slug} size={18} />
                  <span className="pp-text">
                    <span className="pp-name">{p.name}</span>
                    {/* THE FOLDER, which tells two projects of the same name apart. */}
                    {p.dir && <span className="pp-where">{shortPath(p.dir)}</span>}
                  </span>
                  {p.running > 0 && <span className="pp-flag">{p.running} running</span>}
                  {flag(p) && <span className="pp-flag">{flag(p)}</span>}
                  {onSetOrder && (
                    <span className="pp-acts">
                      <button type="button" className="pp-top" disabled={rank === 0}
                        onClick={() => commit(p.slug, placeBefore(full, p.slug, allSlugs[0]))}>To top</button>
                      <button type="button" className="pp-arrow" disabled={i === 0} aria-label={`Move ${p.name} up`}
                        title="Move up (⌥↑)" onClick={() => commit(p.slug, nudge(full, shownSlugs, p.slug, -1))}>
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5 8 6l3.5 3.5" /></svg>
                      </button>
                      <button type="button" className="pp-arrow" disabled={i === shown.length - 1} aria-label={`Move ${p.name} down`}
                        title="Move down (⌥↓)" onClick={() => commit(p.slug, nudge(full, shownSlugs, p.slug, 1))}>
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
                      </button>
                    </span>
                  )}
                  <span className="pp-open" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4 10.5 8l-4 4" /></svg>
                  </span>
                </li>
              );
            })}
            {drag && <span className="pp-caret" style={{ top: drag.caret - 1 }} />}
          </ol>
        </div>
      )}
    </>
  );
}
