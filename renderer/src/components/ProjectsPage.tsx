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
//   - no state words on a row: "2 running" and "on its own" read as one
//     unclear phrase, and both live where they mean something, the inbox and
//     the project's own page (w-bb5047e258);
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
import type { ReactNode } from 'react';
import { landingRow, nudge, placeBefore, priorityList } from '../project-priority';
import { ProductMark } from './ProductMark';
import { shortPath } from './Settings';
import { archiveLabel, archivedLine, keepShown, selectionLine, togglePick } from '../project-archive';
import type { Product, ProjectSettings } from '../types';
import './projects-page.css';

const DRAG_THRESHOLD_PX = 4;

interface Row {
  slug: string;
  name: string;
  logo?: string | null;
  dir: string;
}

export function ProjectsPage({ ranked, details, onSetOrder, onOpen, onNew, archived = [], onUnarchive, onArchive, who }: {
  /** Every project, already in the running order (App's `rankedProducts`). */
  ranked: Product[];
  /** What Settings knows about each project: its folder, what is running, its mode. */
  details: ProjectSettings[];
  /** Writes the order. Absent means the list is shown in order but cannot be moved. */
  onSetOrder?: (slugs: string[]) => void | Promise<void>;
  onOpen: (slug: string) => void;
  onNew?: () => void;
  /** Projects archived from their own page: off every list but this one. */
  archived?: { slug: string; name: string; dir: string }[];
  onUnarchive?: (slug: string) => void;
  /** Archive several at once from Select mode: with thirty-odd projects,
   *  opening each one to archive it from its own page is a headache. */
  onArchive?: (slugs: string[]) => void | Promise<void>;
  /** The Who sees it cell for a project (w-b989839656), handed in by the
   *  team build. Absent with nobody signed in, and then there is no column. */
  who?: (product: Product) => ReactNode;
}) {
  // FOLDED AWAY until asked for. An archived project is one you chose not to
  // see, so the list of them stays one quiet line unless you open it.
  const [showArchived, setShowArchived] = useState(false);

  // SELECT MODE (w-bb5047e258). Chosen over an Archive mark on every row,
  // which was "ugly/bad ux": the rows stay as they are until you ask to tidy
  // them. While selecting, a press ticks a row instead of opening it, the
  // move controls step aside, and the table's own header line becomes the
  // action line, so nothing on the page jumps. After the press the same line
  // says what went, with an Undo, until the next thing you do.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [undone, setUndone] = useState<string[] | null>(null);
  const startSelecting = () => { setSelecting(true); setPicked(new Set()); setUndone(null); };
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const archivePicked = async () => {
    if (!picked.size || !onArchive) return;
    const batch = [...picked];
    stopSelecting();
    setUndone(batch);
    await onArchive(batch);
  };
  const undo = () => {
    if (!undone) return;
    undone.forEach((slug) => onUnarchive?.(slug));
    setUndone(null);
  };
  // The Undo line is for the moment just after; it goes on its own.
  useEffect(() => {
    if (!undone) return;
    const t = setTimeout(() => setUndone(null), 12_000);
    const off = () => clearTimeout(t);
    return off;
  }, [undone]);
  useEffect(() => {
    if (!selecting) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') stopSelecting(); };
    window.addEventListener('keydown', esc);
    const off = () => window.removeEventListener('keydown', esc);
    return off;
  }, [selecting]);
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
    // ONE JUST ARCHIVED LEAVES AT ONCE. The order comes off the inbox's list,
    // which catches up a moment after the archive is saved.
    const gone = new Set(archived.map((a) => a.slug));
    const ordered = priorityList(full.map((s) => bySlug.get(s)).filter((p): p is Product => !!p && !gone.has(p.slug)));
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const p of ordered) {
      const d = info.get(p.slug);
      seen.add(p.slug);
      out.push({ slug: p.slug, name: d?.name ?? p.name, logo: d?.logo ?? p.logo, dir: d?.dir ?? p.dir });
    }
    for (const d of details) {
      // In the order but left off on purpose (a conversation, the practice
      // project) stays off; only one the order has never heard of is added.
      if (seen.has(d.slug) || bySlug.has(d.slug)) continue;
      out.push({ slug: d.slug, name: d.name, logo: d.logo, dir: d.dir ?? '' });
    }
    return out;
  }, [full.join('\n'), ranked, details, archived]);
  const allSlugs = rows.map((r) => r.slug);
  // The project as the snapshot has it, for the Who sees it column.
  const project = useMemo(() => new Map(ranked.map((p) => [p.slug, p])), [ranked]);

  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? rows.filter((p) => p.name.toLowerCase().includes(needle)
      || p.slug.toLowerCase().includes(needle)
      || (p.dir ?? '').toLowerCase().includes(needle))
    : rows;
  const shownSlugs = shown.map((r) => r.slug);
  // A tick on a row the search has hidden, or that left the list, is dropped,
  // so the press only ever archives what is on the screen.
  const shownKey = shownSlugs.join('\n');
  useEffect(() => { setPicked((prev) => (prev.size ? keepShown(prev, shownSlugs) : prev)); }, [shownKey]);

  // The row that just moved keeps a mark for a moment, so the eye can follow it.
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 900);
    return () => clearTimeout(t);
  }, [moved]);

  const commit = (slug: string, next: string[] | null) => {
    if (!next || !onSetOrder) return;
    setUndone(null);
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
      if (!onSetOrder || selecting) return;
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
      if (!travelled && selecting) { setPicked((prev) => togglePick(prev, slug)); return; }
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
        {/* A SEARCH THAT LOOKS LIKE ONE: the magnifier, the word Search, and
            a clear button once something is typed. A plain box reading "Find a
            project" did not read as a search. */}
        <label className="proj-search">
          <svg className="proj-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" /><path d="m10.2 10.2 3.3 3.3" />
          </svg>
          <input
            className="proj-index-find"
            type="search"
            value={filter}
            placeholder="Search projects"
            aria-label="Search projects"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && filter) { e.stopPropagation(); setFilter(''); } }}
          />
          {filter && (
            <button type="button" className="proj-search-clear" aria-label="Clear the search" onClick={() => setFilter('')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6" /></svg>
            </button>
          )}
        </label>
        {onArchive && rows.length > 0 && (
          <button type="button" className="set-ghost pp-select" aria-pressed={selecting}
            onClick={selecting ? stopSelecting : startSelecting}>{selecting ? 'Cancel' : 'Select'}</button>
        )}
        {onNew && <button type="button" className="set-ghost" onClick={onNew}>New project</button>}
      </div>
      {!rows.length && <div className="set-nav-empty">No projects yet.</div>}
      {!!rows.length && !shown.length && (
        <div className="set-nav-empty">Nothing here matches “{filter.trim()}”.</div>
      )}
      {shown.length > 0 && (
        <div className="pp-table">
          {/* THE HEADER LINE IS ALSO THE ACTION LINE: column names normally,
              the count and the press while selecting, what went and Undo just
              after. Same height in all three, so the list never moves. */}
          {selecting ? (
            <div className="pp-head pp-head-act">
              <span className="pp-rank" />
              <span className="pp-head-name" aria-live="polite">{selectionLine(picked.size)}</span>
              <button type="button" className="pp-head-btn" disabled={!picked.size} onClick={archivePicked}>
                {archiveLabel(picked.size)}
              </button>
            </div>
          ) : undone ? (
            <div className="pp-head pp-head-act">
              <span className="pp-rank" />
              <span className="pp-head-name" aria-live="polite">{archivedLine(undone.length)}</span>
              <button type="button" className="pp-head-btn" onClick={undo}>Undo</button>
            </div>
          ) : (
            <div className="pp-head" aria-hidden="true">
              <span className="pp-rank">#</span>
              <span className="pp-head-name">Project</span>
              {who && <span className="pp-head-who">Who sees it</span>}
              {onSetOrder && <span className="pp-head-move">Move</span>}
            </div>
          )}
          <ol className="pp-list" ref={listRef}>
            {shown.map((p, i) => {
              const rank = allSlugs.indexOf(p.slug);
              const on = picked.has(p.slug);
              return (
                <li
                  key={p.slug}
                  className={['pp-row', drag?.slug === p.slug ? 'dragging' : '', moved === p.slug ? 'moved' : '', rank === 0 ? 'first' : '', onSetOrder && !selecting ? 'can-move' : '', selecting ? 'selecting' : '', on ? 'picked' : ''].filter(Boolean).join(' ')}
                  style={drag?.slug === p.slug ? { transform: `translateY(${drag.dy}px)` } : undefined}
                  tabIndex={0}
                  role={selecting ? 'checkbox' : 'button'}
                  aria-checked={selecting ? on : undefined}
                  aria-label={selecting ? p.name : `${p.name}, number ${rank + 1} of ${rows.length}. Open`}
                  onPointerDown={press(p.slug)}
                  onKeyDown={(e) => {
                    if (selecting && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPicked((prev) => togglePick(prev, p.slug)); return; }
                    if (selecting) return;
                    if (e.key === 'Enter') { e.preventDefault(); onOpen(p.slug); return; }
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    commit(p.slug, nudge(full, shownSlugs, p.slug, e.key === 'ArrowUp' ? -1 : 1));
                  }}
                >
                  <span className="pp-rank">
                    {selecting ? (
                      // THE TICK TAKES THE NUMBER'S PLACE, in ink and not the
                      // accent: the accent on this page means "first in line".
                      <span className={`pp-check${on ? ' on' : ''}`} aria-hidden="true">
                        {on && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.8 8.4 6.6 11.2 12.2 5" /></svg>}
                      </span>
                    ) : (
                      <>
                        <span className="pp-num">{String(rank + 1).padStart(2, '0')}</span>
                        {onSetOrder && <span className="pp-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
                      </>
                    )}
                  </span>
                  <ProductMark src={p.logo} name={p.name} slug={p.slug} size={18} />
                  <span className="pp-text">
                    <span className="pp-name">{p.name}</span>
                    {/* THE FOLDER, which tells two projects of the same name apart. */}
                    {p.dir && <span className="pp-where">{shortPath(p.dir)}</span>}
                  </span>
                  {/* WHO SEES ITS THREADS (design 1B, w-b989839656), only on a
                      team, where the question exists. */}
                  {who && <span className="pp-who">{who(project.get(p.slug) ?? (p as unknown as Product))}</span>}
                  {onSetOrder && !selecting && (
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
                  {!selecting && (
                    <span className="pp-open" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4 10.5 8l-4 4" /></svg>
                    </span>
                  )}
                </li>
              );
            })}
            {drag && <span className="pp-caret" style={{ top: drag.caret - 1 }} />}
          </ol>
        </div>
      )}
      {/* ARCHIVED PROJECTS. Archiving keeps the folder and only takes the
          project off every list, so this is where one comes back. */}
      {archived.length > 0 && (
        <div className="pp-archived">
          <button type="button" className="pp-archived-toggle" aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived projects' : 'Show archived projects'}
          </button>
          {showArchived && (
            <ul className="pp-archived-list">
              {archived.map((p) => (
                <li key={p.slug} className="pp-archived-row">
                  <span className="pp-text">
                    <span className="pp-name">{p.name}</span>
                    {p.dir && <span className="pp-where">{shortPath(p.dir)}</span>}
                  </span>
                  {onUnarchive && (
                    <button type="button" className="set-ghost" onClick={() => onUnarchive(p.slug)}>Bring back</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
