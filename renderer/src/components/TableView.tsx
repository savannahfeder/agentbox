// A CSV drawn as a table: in the message as a preview, beside it, and full
// screen. The reading is ../table-file.ts; the look is ./table-view.css, as
// approved in designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { filterRows, hrefOf, logoFor, readTable, shownLink, sortRows, type Column, type Sort, type Table } from '../table-file';
import './table-view.css';

export type TableMode = 'preview' | 'pane' | 'full';

export const PREVIEW_ROWS = 6;
// Rows drawn above and below the ones in view, so a fast scroll does not show a gap.
const SPARE = 12;
// .tbl-td's height in table-view.css; the spacers above and below are counted in it.
const ROW_H = 46;

function Logo({ host, name }: { host: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [host]);
  // A site the service does not know comes back as its 16px grey globe, which
  // reads worse than the letter. A picture already in the cache has finished
  // loading before React listens, so the size is also read when it mounts.
  const seen = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0 && img.naturalWidth <= 16) setFailed(true);
  }, []);
  if (host && !failed) {
    // Google's favicon service rather than the site itself, so the company
    // never sees a request from someone reading a list they are on.
    return <img ref={seen} className="tbl-logo" alt="" referrerPolicy="no-referrer"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} onError={() => setFailed(true)} />;
  }
  return <span className="tbl-logo tbl-letter" aria-hidden="true">{(name.trim()[0] ?? '?').toUpperCase()}</span>;
}

function Cell({ table, col, row, value }: { table: Table; col: number; row: string[]; value: string }) {
  const column = table.columns[col];
  const v = value.trim();
  if (!v) return <div className="tbl-td" />;
  if (column.kind === 'name') {
    return <div className="tbl-td tbl-name" title={v}>
      {table.logoCol >= 0 && <Logo host={logoFor(table, row)} name={v} />}<span className="tbl-ell">{v}</span>
    </div>;
  }
  if (column.kind === 'tag') {
    // "won", "Won" and "WON" are one tag, written the way it was first written.
    const key = v.toLowerCase();
    return <div className="tbl-td"><span className={`tbl-tag tone-${column.tones[key] ?? 'grey'}`}>{column.values.find((x) => x.toLowerCase() === key) ?? v}</span></div>;
  }
  if (column.kind === 'number') return <div className="tbl-td tbl-num">{v}</div>;
  if (column.kind === 'date') return <div className="tbl-td tbl-date">{v}</div>;
  if (column.kind === 'link') return <div className="tbl-td tbl-link" title={v}><a className="tbl-ell" href={hrefOf(v)} target="_blank" rel="noreferrer">{shownLink(v)}</a></div>;
  if (column.kind === 'email') return <div className="tbl-td tbl-link" title={v}><a className="tbl-ell" href={`mailto:${v}`}>{v}</a></div>;
  return <div className="tbl-td" title={v.length > 40 ? v : undefined}><span className="tbl-ell">{v}</span></div>;
}

const Row = memo(function Row({ table, row, n }: { table: Table; row: string[]; n: number }) {
  return <div className="tbl-tr" role="row">
    <div className="tbl-td tbl-rn">{n}</div>
    {row.map((v, i) => <Cell key={i} table={table} col={i} row={row} value={v} />)}
  </div>;
});

// WIDTHS ARE MEASURED ONCE, FROM THE WHOLE FILE. Only the rows in view are
// drawn, so a width the browser worked out from them would jump as you scroll.
// Long text is capped at `cap` (the .tbl-ell max-width) so the short columns
// after it stay in view, and only the longest text column takes spare width.
function widths(table: Table, cap: number): string {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const family = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily;
  const step = Math.max(1, Math.floor(table.rows.length / 3000));
  const measure = (font: string, s: string) => {
    if (!canvas) return s.length * 7.5;
    canvas.font = font;
    return canvas.measureText(s).width;
  };
  const longest = table.columns.map((_, i) => {
    let best = '';
    for (let r = 0; r < table.rows.length; r += step) { const v = table.rows[r][i] ?? ''; if (v.length > best.length) best = v; }
    return best;
  });
  const content = table.columns.map((c, i) => {
    let w = 0;
    if (c.kind === 'tag') for (const v of c.values) w = Math.max(w, measure(`13px ${family}`, v) + 32);
    else for (let r = 0; r < table.rows.length; r += step) {
      const v = table.rows[r][i] ?? '';
      // Only strings near the longest can be the widest; measuring each would be slow.
      if (v.length >= longest[i].length * 0.7) w = Math.max(w, Math.min(cap, measure(`14px ${family}`, c.kind === 'link' ? shownLink(v) : v)));
    }
    const head = c.name.length * 7.6 + 20;
    return Math.ceil(Math.max(head, w + (c.kind === 'name' && table.logoCol >= 0 ? 28 : 0)) + 34);
  });
  const texts = table.columns.flatMap((c, i) => (c.kind === 'text' ? [i] : []));
  const wide = texts.reduce((best, i) => (best < 0 || longest[i].length > longest[best].length ? i : best), -1);
  const last = table.columns.length - 1;
  return content.map((w, i) => (i === wide ? `minmax(${Math.min(w, 180)}px, ${w}fr)`
    : wide < 0 && i === last ? `minmax(${w}px, 1fr)` : `${w}px`)).join(' ');
}
const sortWords = (c: Column, dir: 'asc' | 'desc') => {
  const [up, down] = c.kind === 'number' ? ['1 to 9', '9 to 1'] : c.kind === 'date' ? ['Oldest first', 'Newest first'] : ['A to Z', 'Z to A'];
  return dir === 'asc' ? up : down;
};
const rowsWord = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'}`;
const typingIn = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

function Menu({ label, icon, on, children }: { label: string; icon: ReactNode; on: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    // An open menu takes Escape before the full screen view or the thread does.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <span className="when-wrap" ref={wrap}>
    <button type="button" className={`tbl-btn${on || open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{icon}{label}</button>
    {open && <div className="when-menu tbl-menu" role="menu" data-own-escape="">{children(() => setOpen(false))}</div>}
  </span>;
}

function FilterMenu({ table, cols, picked, onToggle, onClear }: {
  table: Table; cols: number[]; picked: Record<number, string[]>; onToggle: (col: number, v: string) => void; onClear: () => void;
}) {
  const [find, setFind] = useState('');
  const many = cols.reduce((n, c) => n + table.columns[c].values.length, 0) > 12;
  const q = find.trim().toLowerCase();
  const filtering = Object.values(picked).some((v) => v.length);
  return <>
    {many && <div className="when-type-row"><input className="when-type" autoFocus placeholder="Find a tag" value={find} onChange={(e) => setFind(e.target.value)} /></div>}
    {filtering && <button type="button" className="when-row tbl-clear" onClick={onClear}>Show every row</button>}
    {cols.map((col) => {
      const values = table.columns[col].values.filter((v) => !q || v.toLowerCase().includes(q));
      if (!values.length) return null;
      return <div key={col}>
        <div className="when-head">{table.columns[col].name}</div>
        {values.map((v) => {
          const on = (picked[col] ?? []).includes(v);
          return <button key={v} type="button" role="menuitemcheckbox" aria-checked={on} className={`when-row${on ? ' on' : ''}`} onClick={() => onToggle(col, v)}>
            <span className={`tbl-tick${on ? ' on' : ''}`} aria-hidden="true" />
            <span className={`tbl-tag tone-${table.columns[col].tones[v.toLowerCase()]}`}>{v}</span>
          </button>;
        })}
      </div>;
    })}
  </>;
}

const glyph = (d: string) => <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
const SEARCH = <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>;

export function TableView({ text, path, mode, onShowAll }: { text: string; path: string; mode: TableMode; onShowAll?: () => void }) {
  const table = useMemo(() => readTable(text, path), [text, path]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [sort, setSort] = useState<Sort>(null);
  useEffect(() => { setQuery(''); setPicked({}); setSort(null); }, [path]);

  // The box shows each letter at once; the rows catch up when the typing pauses.
  const searched = useDeferredValue(query);
  const rows = useMemo(() => sortRows(table, filterRows(table, searched, picked), sort), [table, searched, picked, sort]);
  const template = useMemo(() => widths(table, mode === 'full' ? 300 : 220), [table, mode]);
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 900 });
  const preview = mode === 'preview';

  // A new order or a new search starts from the top.
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [searched, picked, sort]);

  // Where the box is scrolled to and how tall it is decide which rows are drawn.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let frame = 0;
    const look = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }));
      });
    };
    look();
    el.addEventListener('scroll', look, { passive: true });
    const seen = new ResizeObserver(look);
    seen.observe(el);
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', look); seen.disconnect(); };
  }, [table]);

  // With words in the search box, Escape clears them before it closes the view
  // the table is in, but not while you are typing somewhere else.
  useEffect(() => {
    if (!query) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.tbl-menu')) return;
      const at = document.activeElement;
      if (typingIn(at) && !root.current?.contains(at)) return;
      e.stopImmediatePropagation(); e.preventDefault(); setQuery('');
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [query]);

  if (!table.columns.length) return <div className="tbl-empty">This table has no rows yet.</div>;

  const start = preview ? 0 : Math.max(0, Math.floor(view.top / ROW_H) - SPARE);
  const end = preview ? Math.min(rows.length, PREVIEW_ROWS) : Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_H) + SPARE);
  const drawn = rows.slice(start, end);
  const tagCols = table.columns.flatMap((c, i) => (c.kind === 'tag' ? [i] : []));
  const filtering = Object.values(picked).some((v) => v.length);
  const total = table.rows.length;
  const count = rows.length === total ? rowsWord(total) : `${rows.length.toLocaleString()} of ${rowsWord(total)}`;
  const toggle = (col: number, value: string) => setPicked((p) => {
    const now = new Set(p[col] ?? []);
    if (now.has(value)) now.delete(value); else now.add(value);
    return { ...p, [col]: [...now] };
  });
  const sortBy = (col: number) => setSort((s) => (!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));
  // Enter presses a button here even where the view around the table keeps Enter for itself.
  const enter = (e: React.KeyboardEvent) => {
    const at = e.target as HTMLElement;
    if (e.key !== 'Enter' || at.tagName !== 'BUTTON') return;
    e.preventDefault(); e.stopPropagation(); at.click();
  };

  return (
    <div className={`tbl tbl-${mode}`} ref={root} onKeyDown={enter}>
      {!preview && (
        <div className="tbl-bar">
          <label className="tbl-search">{SEARCH}
            <input type="search" value={query} placeholder={`Search ${rowsWord(total)}`} onChange={(e) => setQuery(e.target.value)}
              data-own-escape={query ? '' : undefined} />
          </label>
          {tagCols.length > 0 && (
            <Menu label="Filter" on={filtering} icon={glyph('M2.5 4h11M4.5 8h7M6.5 12h3')}>
              {() => <FilterMenu table={table} cols={tagCols} picked={picked} onToggle={toggle} onClear={() => setPicked({})} />}
            </Menu>
          )}
          <Menu label="Sort" on={!!sort} icon={glyph('M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5')}>
            {(close) => <>
              <button type="button" className={`when-row${!sort ? ' on' : ''}`} onClick={() => { setSort(null); close(); }}><span className="when-row-label">As the file has it</span></button>
              {table.columns.map((c, i) => <button key={i} type="button" className={`when-row${sort?.col === i ? ' on' : ''}`} onClick={() => sortBy(i)}>
                <span className="when-row-label">{c.name}</span>
                {sort?.col === i && <span className="when-row-hint">{sortWords(c, sort.dir)}</span>}
              </button>)}
            </>}
          </Menu>
          <span className="tbl-count">{count}{mode === 'full' ? ` · ${table.columns.length} ${table.columns.length === 1 ? 'column' : 'columns'}` : ''}</span>
        </div>
      )}
      <div className="tbl-frame">
      <div className="tbl-scroll" ref={box}>
        <div className="tbl-grid" role="table" style={{ gridTemplateColumns: `44px ${template}` }}>
          <div className="tbl-tr" role="row">
            <div className="tbl-th tbl-rn" />
            {table.columns.map((c, i) => (
              <button key={i} type="button" role="columnheader" className={`tbl-th${c.kind === 'number' ? ' tbl-num' : ''}${sort?.col === i ? ' sorted' : ''}`}
                aria-sort={sort?.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                disabled={preview} onClick={() => sortBy(i)}>
                <span className="tbl-ell">{c.name}</span>{sort?.col === i && <span className="tbl-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
          {start > 0 && <div className="tbl-gap" style={{ height: start * ROW_H }} />}
          {drawn.map((r, n) => <Row key={start + n} table={table} row={r} n={start + n + 1} />)}
          {!preview && end < rows.length && <div className="tbl-gap" style={{ height: (rows.length - end) * ROW_H }} />}
        </div>
        {!rows.length && <div className="tbl-none">{total ? 'No rows match.' : 'This table has no rows yet.'}</div>}
      </div>
      </div>
      {preview && total > PREVIEW_ROWS && onShowAll && (
        <button type="button" className="tbl-showall" onClick={onShowAll}>Show all {total.toLocaleString()} rows</button>
      )}
    </div>
  );
}
