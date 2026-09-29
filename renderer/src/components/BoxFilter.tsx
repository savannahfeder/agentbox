// The filter in the corner: one icon left of the plus, a menu under it, and a
// tag beside it for each part that is on.
//
// w-aa3fa4cbf0. The icon has to read clearly both resting and clicked, and the
// tag stays behind because a filtered state is easy to forget. The rule
// underneath is ../box-filter.ts; this file only draws it.
//
// THE ICON IS THE PLUS'S OWN RECIPE: a 24 grid, a 1.1 hairline, round caps, 22
// across. Three shrinking lines, so it reads as narrowing without a funnel's
// weight. THE MENU IS THE WHEN MENU'S CLASSES, so it is the same object as every
// other menu in the app and inherits whatever theme she is wearing.

import { useEffect, useRef, useState } from 'react';
import type { BoxFilter as Filter, FilterMenu, FilterPart, FilterTag, MenuRow } from '../box-filter';
import { CrossIcon } from './CrossIcon';

export function FilterIcon() {
  return (
    <svg
      width="22" height="22"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.1" strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4.6 7.4h14.8M7.4 12h9.2M10.2 16.6h3.6" />
    </svg>
  );
}

type Pick = { part: FilterPart; value: string };
type Line =
  | { kind: 'head'; label: string }
  | { kind: 'sep' }
  | { kind: 'row'; row: MenuRow; pick: Pick }
  | { kind: 'more' }
  | { kind: 'back' };

function linesFor(menu: FilterMenu, page: 'main' | 'more'): Line[] {
  const rows = (part: FilterPart, list: MenuRow[]): Line[] => list.map((row) => ({ kind: 'row', row, pick: { part, value: row.value } }));
  if (page === 'more') return [{ kind: 'back' }, ...rows('project', menu.moreProjects)];
  const out: Line[] = [];
  if (menu.projects.length) {
    out.push({ kind: 'head', label: 'Project' }, ...rows('project', menu.projects));
    if (menu.moreProjects.length) out.push({ kind: 'more' });
    out.push({ kind: 'sep' });
  }
  out.push({ kind: 'head', label: 'Priority' }, ...rows('priority', menu.priorities));
  if (menu.harnesses.length) out.push({ kind: 'sep' }, { kind: 'head', label: 'Agent' }, ...rows('harness', menu.harnesses));
  return out;
}

const actionable = (l: Line) => l.kind === 'row' || l.kind === 'more' || l.kind === 'back';

export function BoxFilter({ filter, menu, tags, open, onOpen, onClose, onPick, onClear }: {
  filter: Filter;
  menu: FilterMenu;
  tags: FilterTag[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (part: FilterPart, value: string) => void;
  onClear: (part: FilterPart) => void;
}) {
  const [page, setPage] = useState<'main' | 'more'>('main');
  const [cursor, setCursor] = useState(-1);
  const wrap = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const lines = linesFor(menu, page);
  const stops = lines.map((l, i) => (actionable(l) ? i : -1)).filter((i) => i >= 0);

  // Every time it opens it opens on the first page, with the keyboard in it, so
  // ⌘K's "Filter…" lands somewhere the arrows already work.
  useEffect(() => {
    if (!open) return;
    setPage('main');
    setCursor(-1);
    box.current?.focus();
  }, [open]);

  // Click anywhere else and it folds, the way every menu here does.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onClose]);

  const act = (l: Line) => {
    if (l.kind === 'more') { setPage('more'); setCursor(-1); return; }
    if (l.kind === 'back') { setPage('main'); setCursor(-1); return; }
    if (l.kind === 'row') onPick(l.pick.part, l.pick.value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const at = stops.indexOf(cursor);
    if (e.key === 'Escape') { e.preventDefault(); if (page === 'more') { setPage('main'); setCursor(-1); } else onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(stops[Math.min(at + 1, stops.length - 1)] ?? -1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(stops[Math.max(at - 1, 0)] ?? -1); }
    else if (e.key === 'ArrowRight' && lines[cursor]?.kind === 'more') { e.preventDefault(); act(lines[cursor]); }
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && page === 'more') { e.preventDefault(); setPage('main'); setCursor(-1); }
    else if (e.key === 'Enter' && lines[cursor]) { e.preventDefault(); act(lines[cursor]); }
  };

  const on = tags.length > 0;
  return (
    <>
      {tags.map((t) => (
        <button key={t.part} className="box-filter-tag" title={`Stop filtering by ${t.label}`} onClick={() => onClear(t.part)}>
          <span>{t.label}</span>
          <CrossIcon />
        </button>
      ))}
      <span className="when-wrap box-filter" ref={wrap}>
        <button
          className={`icon-btn${open || on ? ' on' : ''}`}
          title="Filter"
          aria-label="Filter"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? onClose() : onOpen())}
        >
          <FilterIcon />
        </button>
        {open && (
          <div className="when-menu box-filter-menu" role="menu" tabIndex={-1} ref={box} onKeyDown={onKeyDown}>
            {lines.map((l, i) => {
              if (l.kind === 'head') return <div key={i} className="when-head">{l.label}</div>;
              if (l.kind === 'sep') return <span key={i} className="when-sep" />;
              const hot = i === cursor ? ' hot' : '';
              if (l.kind === 'more' || l.kind === 'back') {
                return (
                  <button key={i} className={`when-door${l.kind === 'back' ? ' back' : ''}${hot}`} onMouseEnter={() => setCursor(i)} onClick={() => act(l)}>
                    <span className="when-door-label">{l.kind === 'more' ? 'More projects' : '‹ Projects'}</span>
                    {l.kind === 'more' && <span className="when-door-arrow">›</span>}
                  </button>
                );
              }
              return (
                <button key={i} role="menuitemradio" aria-checked={l.row.on} className={`when-row${l.row.on ? ' on' : ''}${hot}`} onMouseEnter={() => setCursor(i)} onClick={() => act(l)}>
                  {/* THE NAME COMES FIRST, so it lines up under its heading. Hers,
                      on the built menu: "These things aren't left-aligned and it
                      looks a little bit weird." An empty tick column used to sit
                      in front of every name; the tick lives at the end now. */}
                  <span className="when-row-label">{l.row.label}</span>
                  {l.row.on && <span className="box-filter-tick" aria-hidden="true">✓</span>}
                  <span className="when-row-hint">{l.row.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </span>
    </>
  );
}

export type { Filter };
