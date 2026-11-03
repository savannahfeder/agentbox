// A CSV drawn as a table: in the message as a preview, beside it, and full
// screen. The reading is ../table-file.ts; the look is ./table-view.css, as
// approved in designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { filterRows, hrefOf, logoFor, readTable, shownLink, sortRows, type Column, type Sort, type Table } from '../table-file';
import './table-view.css';

export type TableMode = 'preview' | 'pane' | 'full';

export const PREVIEW_ROWS = 6;
// Past this many rows the page grows by a press, so a long export never stalls the window.
const PAGE = 500;

function Logo({ host, name }: { host: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [host]);
  if (host && !failed) {
    // Google's favicon service rather than the site itself, so the company
    // never sees a request from someone reading a list they are on.
    return <img className="tbl-logo" alt="" referrerPolicy="no-referrer" loading="lazy"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} onError={() => setFailed(true)} />;
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
  if (column.kind === 'tag') return <div className="tbl-td"><span className={`tbl-tag tone-${column.tones[v] ?? 'grey'}`}>{v}</span></div>;
  if (column.kind === 'number') return <div className="tbl-td tbl-num">{v}</div>;
  if (column.kind === 'link') return <div className="tbl-td tbl-link" title={v}><a className="tbl-ell" href={hrefOf(v)} target="_blank" rel="noreferrer">{shownLink(v)}</a></div>;
  if (column.kind === 'email') return <div className="tbl-td tbl-link" title={v}><a className="tbl-ell" href={`mailto:${v}`}>{v}</a></div>;
  return <div className="tbl-td" title={v.length > 40 ? v : undefined}><span className="tbl-ell">{v}</span></div>;
}

const widthOf = (c: Column) => (c.kind === 'text' ? 'minmax(160px, 1fr)' : c.kind === 'name' ? 'minmax(140px, max-content)' : 'max-content');

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

  const rows = useMemo(() => sortRows(table, filterRows(table, query, picked), sort), [table, query, picked, sort]);
  if (!table.columns.length) return <div className="tbl-empty">This table has no rows yet.</div>;

  const preview = mode === 'preview';
  const drawn = preview ? rows.slice(0, PREVIEW_ROWS) : rows.slice(0, shown);
  const tagCols = table.columns.flatMap((c, i) => (c.kind === 'tag' ? [i] : []));
  const filtering = Object.values(picked).some((v) => v.length);
  const total = table.rows.length;
  const count = rows.length === total ? `${total} ${total === 1 ? 'row' : 'rows'}` : `${rows.length} of ${total} rows`;
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
            <input type="search" value={query} placeholder={`Search ${total} ${total === 1 ? 'row' : 'rows'}`} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {tagCols.length > 0 && (
            <Menu label="Filter" on={filtering} icon={glyph('M2.5 4h11M4.5 8h7M6.5 12h3')}>
              {() => <>
                {tagCols.map((col) => <div key={col}>
                  <div className="when-head">{table.columns[col].name}</div>
                  {Object.keys(table.columns[col].tones).map((v) => {
                    const on = (picked[col] ?? []).includes(v);
                    return <button key={v} type="button" role="menuitemcheckbox" aria-checked={on} className={`when-row${on ? ' on' : ''}`} onClick={() => toggle(col, v)}>
                      <span className={`tbl-tick${on ? ' on' : ''}`} aria-hidden="true" />
                      <span className={`tbl-tag tone-${table.columns[col].tones[v]}`}>{v}</span>
                    </button>;
                  })}
                </div>)}
                {filtering && <button type="button" className="when-row tbl-clear" onClick={() => setPicked({})}>Show every row</button>}
              </>}
            </Menu>
          )}
          <Menu label="Sort" on={!!sort} icon={glyph('M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5')}>
            {(close) => <>
              <button type="button" className={`when-row${!sort ? ' on' : ''}`} onClick={() => { setSort(null); close(); }}><span className="when-row-label">As the file has it</span></button>
              {table.columns.map((c, i) => <button key={i} type="button" className={`when-row${sort?.col === i ? ' on' : ''}`} onClick={() => sortBy(i)}>
                <span className="when-row-label">{c.name}</span>
                {sort?.col === i && <span className="when-row-hint">{sort.dir === 'asc' ? (c.kind === 'number' ? '1 to 9' : 'A to Z') : (c.kind === 'number' ? '9 to 1' : 'Z to A')}</span>}
              </button>)}
            </>}
          </Menu>
          <span className="tbl-count">{count}{mode === 'full' ? ` · ${table.columns.length} columns` : ''}</span>
        </div>
      )}
      <div className="tbl-scroll">
        <div className="tbl-grid" role="table" style={{ gridTemplateColumns: `44px ${table.columns.map(widthOf).join(' ')}` }}>
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
          {drawn.map((r, n) => (
            <div key={n} className="tbl-tr" role="row">
              <div className="tbl-td tbl-rn">{n + 1}</div>
              {r.map((v, i) => <Cell key={i} table={table} col={i} row={r} value={v} />)}
            </div>
          ))}
        </div>
        {!rows.length && <div className="tbl-none">No rows match.</div>}
        {!preview && rows.length > shown && <button type="button" className="tbl-more" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more rows</button>}
      </div>
      {preview && total > PREVIEW_ROWS && onShowAll && (
        <button type="button" className="tbl-showall" onClick={onShowAll}>Show all {total} rows</button>
      )}
    </div>
  );
}
