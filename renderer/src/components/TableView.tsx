// A CSV drawn as a table: in the message as a preview, beside it, and full
// screen. The reading is ../table-file.ts; the look is ./table-view.css, as
// approved in designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { filterRows, hrefOf, logoFor, readTable, shownLink, sortRows, type Column, type Sort, type Table } from '../table-file';
import './table-view.css';

export type TableMode = 'preview' | 'pane' | 'full';

export const PREVIEW_ROWS = 6;
// Past this many rows the page grows by a press, so a long export never stalls the window.
const PAGE = 200;

function Logo({ host, name }: { host: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [host]);
  if (host && !failed) {
    // Google's favicon service rather than the site itself, so the company
    // never sees a request from someone reading a list they are on.
    // A site the service does not know comes back as its 16px grey globe, which
    // reads worse than the letter.
    return <img className="tbl-logo" alt="" referrerPolicy="no-referrer" loading="lazy"
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

// A row's cells only change with its own values, so a sort or the next page
// draws the rows already on screen again for nothing.
const Row = memo(function Row({ table, row, n }: { table: Table; row: string[]; n: number }) {
  return <div className="tbl-tr" role="row">
    <div className="tbl-td tbl-rn">{n}</div>
    {row.map((v, i) => <Cell key={i} table={table} col={i} row={row} value={v} />)}
  </div>;
});

// Long text is capped (table-view.css, .tbl-ell) so the short columns after it
// stay in view. Only the longest text column takes the spare width; equal
// shares would make a city column as wide as a notes column.
function widths(table: Table): string {
  const longest = (i: number) => table.rows.reduce((m, r) => Math.max(m, r[i]?.length ?? 0), 0);
  const texts = table.columns.flatMap((c, i) => (c.kind === 'text' ? [i] : []));
  const wide = texts.reduce((best, i) => (best < 0 || longest(i) > longest(best) ? i : best), -1);
  const last = table.columns.length - 1;
  return table.columns.map((c, i) => (i === wide ? 'minmax(140px, 1fr)'
    : wide < 0 && i === last ? 'minmax(max-content, 1fr)'
    : c.kind === 'name' ? 'minmax(140px, max-content)' : 'max-content')).join(' ');
}
const sortWords = (c: Column, dir: 'asc' | 'desc') => {
  const [up, down] = c.kind === 'number' ? ['1 to 9', '9 to 1'] : c.kind === 'date' ? ['Oldest first', 'Newest first'] : ['A to Z', 'Z to A'];
  return dir === 'asc' ? up : down;
};
const rowsWord = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'}`;

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

const glyph = (d: string) => <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
const SEARCH = <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>;

export function TableView({ text, path, mode, onShowAll }: { text: string; path: string; mode: TableMode; onShowAll?: () => void }) {
  const table = useMemo(() => readTable(text, path), [text, path]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [sort, setSort] = useState<Sort>(null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setQuery(''); setPicked({}); setSort(null); setShown(PAGE); }, [path]);

  // The box shows each letter at once; the rows catch up when the typing pauses.
  const searched = useDeferredValue(query);
  const rows = useMemo(() => sortRows(table, filterRows(table, searched, picked), sort), [table, searched, picked, sort]);
  const template = useMemo(() => widths(table), [table]);
  const box = useRef<HTMLDivElement>(null);
  // A new order or a new search starts from the top, one page long.
  useEffect(() => { box.current?.scrollTo({ top: 0 }); setShown(PAGE); }, [searched, picked, sort]);
  const foot = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const preview = mode === 'preview';

  // Whether columns run past the right edge, which the fade there says.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const look = () => setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    look();
    el.addEventListener('scroll', look, { passive: true });
    const seen = new ResizeObserver(look);
    seen.observe(el);
    return () => { el.removeEventListener('scroll', look); seen.disconnect(); };
  }, [table, rows, shown]);

  // The next page comes as the foot of the table scrolls into view.
  useEffect(() => {
    if (preview || !foot.current || rows.length <= shown) return undefined;
    const seen = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setShown((s) => s + PAGE); }, { root: box.current, rootMargin: '400px' });
    seen.observe(foot.current);
    return () => seen.disconnect();
  }, [preview, rows.length, shown]);

  // With words in the search box, Escape clears them before it closes the view the table is in.
  useEffect(() => {
    if (!query) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.tbl-menu')) return;
      e.stopImmediatePropagation(); e.preventDefault(); setQuery('');
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [query]);

  if (!table.columns.length) return <div className="tbl-empty">This table has no rows yet.</div>;

  const drawn = preview ? rows.slice(0, PREVIEW_ROWS) : rows.slice(0, shown);
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

  return (
    <div className={`tbl tbl-${mode}`}>
      {!preview && (
        <div className="tbl-bar">
          <label className="tbl-search">{SEARCH}
            <input ref={searchBox} type="search" value={query} placeholder={`Search ${rowsWord(total)}`} onChange={(e) => setQuery(e.target.value)}
              data-own-escape={query ? '' : undefined} />
          </label>
          {tagCols.length > 0 && (
            <Menu label="Filter" on={filtering} icon={glyph('M2.5 4h11M4.5 8h7M6.5 12h3')}>
              {() => <>
                {filtering && <button type="button" className="when-row tbl-clear" onClick={() => setPicked({})}>Show every row</button>}
                {tagCols.map((col) => <div key={col}>
                  <div className="when-head">{table.columns[col].name}</div>
                  {table.columns[col].values.map((v) => {
                    const on = (picked[col] ?? []).includes(v);
                    return <button key={v} type="button" role="menuitemcheckbox" aria-checked={on} className={`when-row${on ? ' on' : ''}`} onClick={() => toggle(col, v)}>
                      <span className={`tbl-tick${on ? ' on' : ''}`} aria-hidden="true" />
                      <span className={`tbl-tag tone-${table.columns[col].tones[v.toLowerCase()]}`}>{v}</span>
                    </button>;
                  })}
                </div>)}
              </>}
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
      <div className={`tbl-frame${moreRight ? ' more-right' : ''}`}>
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
          {drawn.map((r, n) => <Row key={n} table={table} row={r} n={n + 1} />)}
        </div>
        {!rows.length && <div className="tbl-none">{total ? 'No rows match.' : 'This table has no rows yet.'}</div>}
        {!preview && rows.length > shown && <div ref={foot}><button type="button" className="tbl-more" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, rows.length - shown).toLocaleString()} more rows</button></div>}
      </div>
      </div>
      {preview && total > PREVIEW_ROWS && onShowAll && (
        <button type="button" className="tbl-showall" onClick={onShowAll}>Show all {total.toLocaleString()} rows</button>
      )}
    </div>
  );
}
