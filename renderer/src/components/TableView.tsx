// A CSV drawn as a table: in the message as a preview, beside it, and full
// screen. The reading is ../table-file.ts, the editing ../table-edit.ts; the
// look is ./table-view.css, as approved in
// designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
//
// Beside the message and full screen it works like a spreadsheet: a click picks
// a cell, a drag or Shift picks a block, the row number picks rows, a header
// picks its column. Typing, Enter or a double click edits; a tag cell opens its
// tags. Space opens the whole row. Every change is written back to the file.
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  cellLink, dateWords, dayTyped, filterRows, logoFor, readTable, shownLink, shownText, sortRows, tableFromGrid,
  type CellLink, type Column, type ColumnKind, type Sort, type Table, type Tone,
} from '../table-file';
import {
  addColumn, addRows, boxOf, filterChoices, likeItsColumn, cellsIn, dropColumn, dropRows, fromClipboard, inBox, moved, orderAfterAdd, orderAfterDrop,
  pasteInto, renameColumn, shapeOf, toClipboard, writeCells, writeTable, type At, type Box, type Pick,
  dropTag, lookKind, lookRenameColumn, lookRenameTag, lookTone, lookWrap, moveColumns, moveRows, newTone, NO_LOOKS, pinTones, renameTag, withLooks, type Looks,
} from '../table-edit';
import { api } from '../api';
import { MAC } from '../this-keyboard';
import { gridOf, isSeeded, putGrid, seedGrid } from '../live/table-doc';
import type { LiveSession } from '../live/live-session';
import { LiveFaces } from '../live/presence';
import { useCellMarks, useRoomKept } from '../live/table-presence';
import './table-view.css';

export type TableMode = 'preview' | 'pane' | 'full';
export type TableSave = (text: string, force?: boolean) => Promise<{ ok: boolean; error?: string; stale?: boolean }>;

export const PREVIEW_ROWS = 6;
// Rows drawn above and below the ones in view, so a fast scroll does not show a gap.
const SPARE = 12;
// .tbl-td's height in table-view.css; the spacers above and below are counted in it.
// With a column wrapped every row is three lines tall, so rows stay one height and
// the rows in view can still be found by arithmetic on a table of 150,000.
const ROW_H = 46;
const ROW_WRAPPED = 86;
const wordy = (kind: ColumnKind) => kind === 'text' || kind === 'name' || kind === 'link' || kind === 'email';
// Set to wrap and still a column of words: a column turned into tags or dates keeps the setting but draws one line.
const wraps = (c: Column) => !!c.wrap && wordy(c.kind);
// .tbl-rn's width; the first column sticks just right of it.
const RN_W = 44;
const RN_W_WIDE = 58;
const MIN_W = 64;
const SAVE_MS = 400;
const UNDO_DEPTH = 200;

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

const TagChip = ({ column, value }: { column: Column; value: string }) => {
  // "won", "Won" and "WON" are one tag, written the way it was first written.
  const key = value.trim().toLowerCase();
  return <span className={`tbl-tag tone-${column.tones[key] ?? 'grey'}`}>{column.values.find((x) => x.toLowerCase() === key) ?? value.trim()}</span>;
};

function CellBody({ table, col, row, value, link }: { table: Table; col: number; row: string[]; value: string; link: CellLink | null }) {
  const column = table.columns[col];
  const v = value.trim();
  if (!v) return null;
  const words = link ? <a className="tbl-ell" href={link.href} target={link.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">{link.text}</a>
    : <span className="tbl-ell">{v}</span>;
  if (column.kind === 'name') return <>{table.logoCol >= 0 && <Logo host={logoFor(table, row)} name={link?.text ?? v} />}{words}</>;
  if (column.kind === 'tag' && !link) return <TagChip column={column} value={v} />;
  return words;
}

const cellClass = (kind: ColumnKind, link: boolean) =>
  kind === 'name' ? ' tbl-name' : kind === 'number' ? ' tbl-num' : kind === 'date' ? ' tbl-date' : kind === 'link' || kind === 'email' || link ? ' tbl-link' : kind === 'tag' ? ' tbl-tagcell' : '';

const hoverText = (kind: ColumnKind, v: string, link: CellLink | null) => {
  if (link) return kind === 'link' || kind === 'email' || link.text === shownLink(link.href) ? link.href.replace(/^mailto:/, '') : `${link.text}\n${shownLink(link.href)}`;
  return kind === 'name' || (kind === 'text' && v.length > 40) ? v.trim() || undefined : undefined;
};

// One row, told only what of the pick touches it, so a move redraws two rows and not fifty.
// A ranked file's own rank stands where the row number goes, so a list is not numbered twice.
const Row = memo(function Row({ table, row, r, n, c0, c1, at, whole, hands }: {
  table: Table; row: string[]; r: number; n: number | null; c0: number; c1: number; at: number; whole: boolean; hands: boolean;
}) {
  return <div className="tbl-tr" role="row">
    {(n !== null || table.ranked) && (
      <div className={`tbl-td tbl-rn${whole ? ' sel' : ''}`} data-rn={hands ? r : undefined}>
        {table.ranked ? row[0] : n}
      </div>
    )}
    {row.map((v, i) => {
      if (table.ranked && i === 0) return null;
      const kind = table.columns[i].kind;
      const sel = i >= c0 && i <= c1;
      const link = cellLink(table, row, i);
      return <div key={i} className={`tbl-td${cellClass(kind, !!link)}${hands && wraps(table.columns[i]) ? ' wrap' : ''}${sel ? ' sel' : ''}${i === at ? ' at' : ''}`} role="cell"
        data-r={hands ? r : undefined} data-c={hands ? i : undefined} title={hoverText(kind, v, link)}>
        <CellBody table={table} col={i} row={row} value={v} link={link} />
        {hands && i === (table.ranked ? 1 : 0) && <button type="button" className="tbl-open" tabIndex={-1} aria-label="Open this row" title="Open this row (Space)">{OPEN}</button>}
      </div>;
    })}
  </div>;
});

// WIDTHS ARE MEASURED ONCE, FROM THE WHOLE FILE. Only the rows in view are
// drawn, so a width the browser worked out from them would jump as you scroll.
// Long text is capped at `cap` so the short columns after it stay in view, and
// only the longest text column takes spare width.
function measure(table: Table, cap: number, only?: number): { px: Map<string, number>; wide: string | null } {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const family = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily;
  const step = Math.max(1, Math.floor(table.rows.length / 3000));
  const text = (font: string, s: string) => {
    if (!canvas) return s.length * 7.5;
    canvas.font = font;
    return canvas.measureText(s).width;
  };
  const longest = table.columns.map((_, i) => {
    let best = '';
    if (only !== undefined && i !== only) return best;
    for (let r = 0; r < table.rows.length; r += step) { const v = table.rows[r][i] ?? ''; if (v.length > best.length) best = v; }
    return best;
  });
  const px = new Map<string, number>();
  table.columns.forEach((c, i) => {
    if (only !== undefined && i !== only) return;
    let w = 0;
    if (c.kind === 'tag') for (const v of c.values) w = Math.max(w, text(`13px ${family}`, v) + 32);
    else for (let r = 0; r < table.rows.length; r += step) {
      const v = table.rows[r][i] ?? '';
      // Only strings near the longest can be the widest; measuring each would be slow.
      if (v.length >= longest[i].length * 0.7) w = Math.max(w, Math.min(cap, text(`14px ${family}`, c.kind === 'link' ? cellLink(table, table.rows[r], i)?.text ?? v : shownText(v))));
    }
    const head = c.name.length * 7.6 + 20 + 24;
    px.set(c.name, Math.ceil(Math.max(head, w + (c.kind === 'name' && table.logoCol >= 0 ? 28 : 0)) + 34));
  });
  const texts = table.columns.flatMap((c, i) => (c.kind === 'text' ? [i] : []));
  const wide = texts.reduce((best, i) => (best < 0 || longest[i].length > longest[best].length ? i : best), -1);
  return { px, wide: wide >= 0 ? table.columns[wide].name : null };
}

// In a message, no column may be wider than 60% of the message (`cqi`, the
// `.tbl-inline` container), so beside an open file the next column still shows.
function tracks(table: Table, natural: ReturnType<typeof measure>, sized: Record<string, number>, inline = false): string {
  const shown = table.columns.filter((_, i) => !(table.ranked && i === 0));
  const fills = natural.wide && !sized[natural.wide] && shown.some((c) => c.name === natural.wide) ? natural.wide : null;
  const px = (w: number) => (inline ? `min(${w}px, 60cqi)` : `${w}px`);
  return shown.map((c, i) => {
    if (sized[c.name]) return `${sized[c.name]}px`;
    const w = natural.px.get(c.name) ?? 160;
    if (c.name === fills) return `minmax(${px(Math.min(w, 180))}, ${w}fr)`;
    if (!fills && i === shown.length - 1) return `minmax(${px(w)}, 1fr)`;
    return px(w);
  }).join(' ');
}

// Kept by column name, so a column added or taken away does not move a filter onto another.
const viewKey = (path: string) => `agentbox.table-view:${path}`;
function readView(path: string, table: Table): { picked: Record<number, string[]>; sort: Sort } {
  const none = { picked: {}, sort: null };
  if (path.startsWith('inline:')) return none;
  try {
    const kept = JSON.parse(localStorage.getItem(viewKey(path)) ?? 'null') as { sort?: { name: string; dir: 'asc' | 'desc' } | null; picked?: Record<string, string[]> } | null;
    if (!kept) return none;
    const at = (name: string) => table.columns.findIndex((c) => c.name === name);
    const picked: Record<number, string[]> = {};
    for (const [name, values] of Object.entries(kept.picked ?? {})) if (at(name) >= 0 && values.length) picked[at(name)] = values;
    const sort: Sort = kept.sort && at(kept.sort.name) >= 0 ? { col: at(kept.sort.name), dir: kept.sort.dir } : null;
    return { picked, sort };
  } catch { return none; }
}
function keepView(path: string, table: Table, picked: Record<number, string[]>, sort: Sort) {
  if (path.startsWith('inline:')) return;
  const named = Object.fromEntries(Object.entries(picked).filter(([, v]) => v.length).map(([c, v]) => [table.columns[Number(c)]?.name, v]).filter(([n]) => n));
  const kept = { sort: sort && table.columns[sort.col] ? { name: table.columns[sort.col].name, dir: sort.dir } : null, picked: named };
  try {
    if (!kept.sort && !Object.keys(named).length) localStorage.removeItem(viewKey(path));
    else localStorage.setItem(viewKey(path), JSON.stringify(kept));
  } catch { /* the view is only a nicety */ }
}

const widthsKey = (path: string) => `agentbox.table-widths:${path}`;
function readWidths(path: string): Record<string, number> {
  if (path.startsWith('inline:')) return {};
  try { return JSON.parse(localStorage.getItem(widthsKey(path)) ?? '{}') ?? {}; } catch { return {}; }
}
function keepWidths(path: string, sized: Record<string, number>) {
  if (path.startsWith('inline:')) return;
  try { localStorage.setItem(widthsKey(path), JSON.stringify(sized)); } catch { /* the widths are only a nicety */ }
}

const looksKey = (path: string) => `agentbox.table-looks:${path}`;
function readLooks(path: string): Looks {
  if (path.startsWith('inline:')) return NO_LOOKS;
  try {
    const kept = JSON.parse(localStorage.getItem(looksKey(path)) ?? 'null') as Partial<Looks> | null;
    return kept && typeof kept === 'object' ? { kinds: kept.kinds ?? {}, tones: kept.tones ?? {}, wrap: kept.wrap ?? {} } : NO_LOOKS;
  } catch { return NO_LOOKS; }
}
function keepLooks(path: string, looks: Looks) {
  if (path.startsWith('inline:')) return;
  try { localStorage.setItem(looksKey(path), JSON.stringify(looks)); } catch { /* falls back to the guess */ }
}

const TYPES: Array<[ColumnKind, string]> = [['text', 'Text'], ['tag', 'Tags'], ['number', 'Number'], ['date', 'Date'], ['link', 'Link'], ['email', 'Email']];
const typeName = (kind: ColumnKind) => TYPES.find(([k]) => k === kind)?.[1] ?? 'Text';
const TONES: Tone[] = ['grey', 'blue', 'purple', 'teal', 'green', 'amber', 'rose'];
/** A date typed in words, written the way the column writes its dates; anything else as typed. */
const asDate = (value: string, was: string, cells: string[]) => {
  const day = value.trim() === was.trim() ? NaN : dayTyped(value);
  return Number.isFinite(day) ? dateWords(day, cells) : value;
};
const popOf = (kind: ColumnKind | undefined) => (kind === 'tag' ? 'tag' : kind === 'date' ? 'date' : null);

const sortWords = (c: Column, dir: 'asc' | 'desc') => {
  const [up, down] = c.kind === 'number' ? ['1 to 9', '9 to 1'] : c.kind === 'date' ? ['Oldest first', 'Newest first'] : ['A to Z', 'Z to A'];
  return dir === 'asc' ? up : down;
};
const rowsWord = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'}`;
const typingIn = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
const CMD = MAC ? '⌘' : 'Ctrl+';
const ALT = MAC ? '⌥' : 'Alt+';

function Menu({ label, icon, on, children, onEscape }: { label: string; icon: ReactNode; on: boolean; children: (close: () => void) => ReactNode; onEscape?: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    // An open menu takes Escape before the full screen view or the thread does.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); setOpen(false); onEscape?.(); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <span className="when-wrap" ref={wrap}>
    <button type="button" className={`tbl-btn${on || open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{icon}{label}</button>
    {open && <div className="when-menu tbl-menu" role="menu" data-own-escape="">{children(() => setOpen(false))}</div>}
  </span>;
}

/** A menu at a point: a right click, or a header's arrow. Escape and a press anywhere else close it. */
function FloatMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const box = el.current?.getBoundingClientRect();
    if (!box) return;
    setAt({ x: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!el.current?.contains(e.target as Node)) onClose(); };
    // The menu takes the arrows and Enter while it is open, so the table behind it stays still.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); return; }
      const rows = [...(el.current?.querySelectorAll<HTMLButtonElement>('button.when-row:not(:disabled)') ?? [])];
      if (!rows.length) return;
      const now = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.stopImmediatePropagation(); e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        rows[now < 0 ? (step > 0 ? 0 : rows.length - 1) : (now + step + rows.length) % rows.length].focus();
      } else if (e.key === 'Enter' && now >= 0) {
        e.stopImmediatePropagation(); e.preventDefault();
        rows[now].click();
      }
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return <div ref={el} className="when-menu tbl-menu tbl-float" role="menu" data-own-escape="" style={{ left: at.x, top: at.y }}
    onContextMenu={(e) => e.preventDefault()}>{children}</div>;
}

const MenuRow = ({ label, hint, onClick, off }: { label: string; hint?: string; onClick: () => void; off?: boolean }) => (
  <button type="button" role="menuitem" className={`when-row${off ? ' off' : ''}`} disabled={off} onClick={onClick}>
    <span className="when-row-label">{label}</span>{hint && <span className="when-row-hint">{hint}</span>}
  </button>
);

function FilterMenu({ table, choices, picked, onToggle, onClear }: {
  table: Table; choices: Array<{ col: number; values: string[] }>; picked: Record<number, string[]>; onToggle: (col: number, v: string) => void; onClear: () => void;
}) {
  const [find, setFind] = useState('');
  const many = choices.reduce((n, c) => n + c.values.length, 0) > 12;
  const q = find.trim().toLowerCase();
  const filtering = Object.values(picked).some((v) => v.length);
  const counts = useMemo(() => new Map(choices.map(({ col }) => {
    const n = new Map<string, number>();
    for (const r of table.rows) { const k = (r[col] ?? '').trim().toLowerCase(); n.set(k, (n.get(k) ?? 0) + 1); }
    return [col, n] as const;
  })), [table, choices]);
  return <>
    {many && <div className="when-type-row"><input className="when-type" autoFocus placeholder="Find a value" value={find} onChange={(e) => setFind(e.target.value)} /></div>}
    {filtering && <button type="button" className="when-row tbl-clear" onClick={onClear}>Show every row</button>}
    {choices.map(({ col, values: all }) => {
      const column = table.columns[col];
      const values = all.filter((v) => !q || v.toLowerCase().includes(q));
      if (!values.length) return null;
      return <div key={col}>
        <div className="when-head">{column.name}</div>
        {values.map((v) => {
          const on = (picked[col] ?? []).includes(v);
          return <button key={v} type="button" role="menuitemcheckbox" aria-checked={on} className={`when-row${on ? ' on' : ''}`} onClick={() => onToggle(col, v)}>
            <span className={`tbl-tick${on ? ' on' : ''}`} aria-hidden="true" />
            {!v ? <span className="when-row-label tbl-clear">Empty</span>
              : column.kind === 'tag'
                ? <span className={`tbl-tag tone-${column.tones[v.toLowerCase()]}`}>{v}</span>
                : <span className="when-row-label">{v}</span>}
            <span className="when-row-hint tbl-filter-n">{(counts.get(col)?.get(v.toLowerCase()) ?? 0).toLocaleString()}</span>
          </button>;
        })}
      </div>;
    })}
  </>;
}

export type TagHands = { rename: (from: string, to: string) => void; tone: (tag: string, tone: Tone) => void; drop: (tag: string) => void; count: (tag: string) => number };

/** One tag's name, colour and a way to delete it, in place of the list. */
function TagEditor({ column, tag, hands, onBack }: { column: Column; tag: string; hands: TagHands; onBack: (renamed?: string) => void }) {
  const [name, setName] = useState(tag);
  const tone = column.tones[tag.trim().toLowerCase()] ?? 'grey';
  const done = useRef(false);
  const rename = () => {
    const to = name.trim();
    if (!done.current && to && to !== tag) { done.current = true; hands.rename(tag, to); }
    return to || tag;
  };
  return <div className="tbl-tagedit" onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onBack(rename()); }
  }}>
    <div className="tbl-tagedit-head">
      <button type="button" className="tbl-btn tbl-icon tbl-tagedit-back" tabIndex={-1} aria-label="Back to the tags" title="Back (esc)"
        onPointerDown={(e) => e.preventDefault()} onClick={() => onBack(rename())}>{glyph('M10 4L6 8l4 4')}</button>
      <input className="when-type" autoFocus value={name} aria-label="Tag name" onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)} onBlur={() => rename()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onBack(rename()); } }} />
    </div>
    <div className="when-head">Colour</div>
    <div className="tbl-tagedit-tones" role="radiogroup" aria-label="Colour">
      {TONES.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={t === tone} aria-label={t} title={t[0].toUpperCase() + t.slice(1)} tabIndex={-1}
          className={`tbl-swatch tone-${t}${t === tone ? ' on' : ''}`} onPointerDown={(e) => e.preventDefault()} onClick={() => hands.tone(tag, t)} />
      ))}
    </div>
    <span className="when-sep" />
    <button type="button" className="when-row tbl-danger" tabIndex={-1} onPointerDown={(e) => e.preventDefault()} onClick={() => { hands.drop(tag); onBack(); }}>
      <span className="when-row-label">Delete tag</span><span className="when-row-hint">{rowsWord(hands.count(tag))}</span>
    </button>
  </div>;
}

/** A tag cell's choices: every tag the column has, a box to find one or add a new one, and a way to clear it. */
function TagPicker({ column, value, typed, onPick, onClose, hands }: {
  column: Column; value: string; typed?: string; onPick: (v: string, move?: 'down' | 'right' | 'left') => void; onClose: () => void; hands?: TagHands;
}) {
  const [q, setQ] = useState(typed ?? '');
  const [hi, setHi] = useState(0);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const findBox = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const find = q.trim().toLowerCase();
  const tags = column.values.filter((v) => !find || v.toLowerCase().includes(find));
  const exact = column.values.some((v) => v.toLowerCase() === find);
  const items: Array<{ kind: 'tag' | 'add' | 'clear'; v: string }> = [
    ...tags.map((v) => ({ kind: 'tag' as const, v })),
    ...(find && !exact ? [{ kind: 'add' as const, v: q.trim() }] : []),
    ...(value.trim() && !find ? [{ kind: 'clear' as const, v: '' }] : []),
  ];
  // -1 stands for the cell's own tag, found again once a rename has redrawn the list.
  const own = items.findIndex((it) => it.kind === 'tag' && it.v.toLowerCase() === value.trim().toLowerCase());
  const now = hi < 0 ? Math.max(0, own) : Math.min(hi, Math.max(0, items.length - 1));
  useEffect(() => { setHi(Math.max(0, tags.findIndex((v) => v.toLowerCase() === value.trim().toLowerCase()) * (find ? 0 : 1))); }, [find]);
  useEffect(() => { list.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [now]);
  const take = (n: number, move?: 'down' | 'right' | 'left') => { const it = items[n]; if (it) onPick(it.v, move); else onClose(); };
  const key = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(items.length - 1, now + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, now - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); take(now); }
    else if (e.key === 'Tab') { e.preventDefault(); if (find) take(now, e.shiftKey ? 'left' : 'right'); else onPick(value, e.shiftKey ? 'left' : 'right'); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const nextTone = newTone(column, q.trim());
  const shown = editingTag !== null ? column.values.find((v) => v.toLowerCase() === editingTag.toLowerCase()) : undefined;
  return <div className="tbl-pick" data-own-escape="" onKeyDown={shown === undefined ? key : undefined}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(); }}>
    {shown !== undefined && hands
      ? <TagEditor key={shown} column={column} tag={shown} hands={hands}
        onBack={() => { setEditingTag(null); setHi(-1); requestAnimationFrame(() => findBox.current?.focus()); }} />
      : <>
        <div className="when-type-row"><input ref={findBox} className="when-type" autoFocus placeholder="Find or add a tag" value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); }} /></div>
        <div className="tbl-pick-list" ref={list} role="listbox">
          {items.map((it, n) => (
            // Moved, not entered: a list redrawn under a still pointer must not take the highlight from the keys.
            <div key={`${it.kind}:${it.v}`} className={`tbl-pick-row${n === now ? ' hi' : ''}`} onMouseMove={() => { if (n !== now) setHi(n); }}>
              <button type="button" role="option" aria-selected={n === now} tabIndex={-1}
                className={`when-row${n === now ? ' hi' : ''}${it.kind === 'tag' && it.v.toLowerCase() === value.trim().toLowerCase() ? ' on' : ''}`}
                onPointerDown={(e) => e.preventDefault()} onClick={() => take(n)}>
                {it.kind === 'tag' && <TagChip column={column} value={it.v} />}
                {it.kind === 'add' && <><span className="when-row-hint tbl-pick-add">Add</span><span className={`tbl-tag tone-${nextTone}`}>{it.v}</span></>}
                {it.kind === 'clear' && <span className="when-row-label tbl-clear">Clear</span>}
              </button>
              {it.kind === 'tag' && hands && (
                <button type="button" className="tbl-pick-more" tabIndex={-1} aria-label={`Edit ${it.v}`} title="Rename, colour or delete"
                  onPointerDown={(e) => e.preventDefault()} onClick={() => setEditingTag(it.v)}>{MORE}</button>
              )}
            </div>
          ))}
          {!items.length && <div className="when-note">No tags yet. Type one to add it.</div>}
        </div>
      </>}
  </div>;
}

/** A date cell's calendar, with a box to type a date in words or clear it. */
function DatePicker({ value, column, onPick, onClose, onDraft }: {
  value: string; column: string[]; onPick: (v: string, move?: 'down' | 'right' | 'left') => void; onClose: () => void; onDraft?: (v: string) => void;
}) {
  const [q, setQ] = useState(value);
  useEffect(() => { onDraft?.(q); }, [q]);
  const typedDay = dayTyped(q);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [month, setMonth] = useState(() => { const d = new Date(Number.isFinite(typedDay) ? typedDay : today); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); });
  useEffect(() => {
    if (!Number.isFinite(typedDay)) return;
    const d = new Date(typedDay);
    setMonth(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }, [typedDay]);
  const m = new Date(month);
  const lead = m.getUTCDay();
  const inMonth = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((lead + inMonth) / 7) * 7 }, (_, i) => Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), i - lead + 1));
  const step = (n: number) => setMonth(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1));
  const pickDay = (day: number, move?: 'down' | 'right' | 'left') => onPick(dateWords(day, column), move);
  const typed = (move?: 'down' | 'right' | 'left') => onPick(q.trim(), move);
  const key = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); typed('down'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const from = Number.isFinite(typedDay) ? typedDay : today;
      setQ(dateWords(from + (e.key === 'ArrowDown' ? 1 : -1) * 86_400_000, column));
    } else if (e.key === 'Tab') { e.preventDefault(); typed(e.shiftKey ? 'left' : 'right'); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const noPress = (e: React.PointerEvent) => e.preventDefault();
  return <div className="tbl-pick tbl-cal" data-own-escape="" onKeyDown={key}
    onBlur={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; if (q.trim() !== value.trim()) typed(); else onClose(); }}>
    <div className="when-type-row"><input className="when-type" autoFocus placeholder="Type a date" value={q} aria-label="Date"
      onFocus={(e) => e.target.select()} onChange={(e) => setQ(e.target.value)} /></div>
    <div className="tbl-cal-head">
      <span className="tbl-cal-month">{m.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
      <button type="button" className="tbl-btn tbl-icon" tabIndex={-1} aria-label="Month before" onPointerDown={noPress} onClick={() => step(-1)}>{glyph('M10 4L6 8l4 4')}</button>
      <button type="button" className="tbl-btn tbl-icon" tabIndex={-1} aria-label="Month after" onPointerDown={noPress} onClick={() => step(1)}>{glyph('M6 4l4 4-4 4')}</button>
    </div>
    <div className="tbl-cal-grid" role="grid">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="tbl-cal-wd" aria-hidden="true">{d}</span>)}
      {days.map((day) => {
        const d = new Date(day);
        const out = d.getUTCMonth() !== m.getUTCMonth();
        return <button key={day} type="button" tabIndex={-1} role="gridcell" aria-selected={day === typedDay}
          aria-label={d.toLocaleDateString(undefined, { dateStyle: 'full', timeZone: 'UTC' })}
          className={`tbl-cal-day${out ? ' out' : ''}${day === today ? ' today' : ''}${day === typedDay ? ' on' : ''}`}
          onPointerDown={noPress} onClick={() => pickDay(day)}>{d.getUTCDate()}</button>;
      })}
    </div>
    <div className="tbl-cal-foot">
      <button type="button" className="when-row" tabIndex={-1} onPointerDown={noPress} onClick={() => pickDay(today)}><span className="when-row-label">Today</span></button>
      {value.trim() && <button type="button" className="when-row" tabIndex={-1} onPointerDown={noPress} onClick={() => onPick('')}><span className="when-row-label tbl-clear">Clear</span></button>}
    </div>
  </div>;
}

/** A box that grows with what is typed into it, up to a cap, and scrolls past that. */
function GrowingText({ value, onChange, onKeyDown, onBlur, onPaste, readOnly, autoFocus, className, caretAtEnd, label }: {
  value: string; onChange?: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onBlur?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean; autoFocus?: boolean; className?: string; caretAtEnd?: boolean; label?: string;
}) {
  const el = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    t.style.height = '0px';
    t.style.height = `${t.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const t = el.current;
    if (!t || !autoFocus) return;
    t.focus({ preventScroll: true });
    if (caretAtEnd) t.setSelectionRange(t.value.length, t.value.length);
  }, [autoFocus, caretAtEnd]);
  return <textarea ref={el} className={className} value={value} readOnly={readOnly} rows={1} spellCheck={false} aria-label={label}
    onChange={(e) => onChange?.(e.target.value)} onKeyDown={onKeyDown} onBlur={onBlur} onPaste={onPaste} />;
}

/** One field in the opened row: its own draft, written when the box is left. */
function Field({ column, value, editable, onWrite, hands, cells }: {
  column: Column; value: string; editable: boolean; onWrite: (v: string) => void; hands?: TagHands; cells: () => string[];
}) {
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);
  const here = useRef<HTMLDivElement>(null);
  const dropped = useRef(false);
  useEffect(() => setDraft(value), [value]);
  // A list closing takes its focus with it; the keys go back to the sheet, so Escape and undo still work.
  const done = () => {
    setPicking(false);
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      here.current?.closest<HTMLElement>('.tbl-sheet')?.focus({ preventScroll: true });
    });
  };
  if (column.kind === 'date' && editable) {
    return <div className="tbl-field-tag" ref={here}>
      <button type="button" className="tbl-field-tagbtn tbl-field-text tbl-field-datebtn" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
        {value.trim() || <span className="tbl-field-none">Pick a date</span>}
      </button>
      {picking && <div className="tbl-field-pick">
        <DatePicker value={value} column={cells()} onPick={(v) => { done(); onWrite(asDate(v, value, cells())); }} onClose={done} />
      </div>}
    </div>;
  }
  if (column.kind === 'tag') {
    return <div className="tbl-field-tag" ref={here}>
      <button type="button" className="tbl-field-tagbtn" disabled={!editable} onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
        {value.trim() ? <TagChip column={column} value={value} /> : <span className="tbl-field-none">{editable ? 'Pick a tag' : ''}</span>}
      </button>
      {picking && <div className="tbl-field-pick"><TagPicker column={column} value={value} hands={hands} onPick={(v) => { done(); onWrite(v); }} onClose={done} /></div>}
    </div>;
  }
  if (!editable) return <div className="tbl-field-text">{value || <span className="tbl-field-none">Empty</span>}</div>;
  // Escape drops the typing, as it does in the grid; the blur after it must not write the draft its closure still holds.
  const toSheet = (el: HTMLElement) => el.closest<HTMLElement>('.tbl-sheet')?.focus({ preventScroll: true });
  return <GrowingText className="tbl-field-box" value={draft} label={column.name} onChange={setDraft}
    onBlur={() => { if (!dropped.current && draft !== value) onWrite(draft); dropped.current = false; }}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); dropped.current = true; setDraft(value); toSheet(e.target as HTMLElement); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toSheet(e.target as HTMLElement); }
    }} />;
}

/** The whole of one row, every field at full length, as Airtable opens a record. */
function RowSheet({ table, row, place, count, editable, from, onWrite, onStep, onClose, tagHands, onUndo }: {
  table: Table; row: string[]; place: number; count: number; editable: boolean; from?: number; tagHands?: (c: number) => TagHands;
  onWrite: (c: number, v: string) => void; onStep: (d: number) => void; onClose: () => void; onUndo?: (redo: boolean) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { sheet.current?.focus({ preventScroll: true }); }, []);
  // Opened from a cell, the row shows that cell's field, which may be far down a long row.
  useEffect(() => { if (from) sheet.current?.querySelector(`[data-field="${from}"]`)?.scrollIntoView({ block: 'center' }); }, [from, place]);
  const nameAt = table.ranked ? 1 : 0;
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (typingIn(e.target as Element)) return;
    if ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); onUndo?.(e.shiftKey || /^y$/i.test(e.key)); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onStep(e.key === 'ArrowDown' ? 1 : -1); }
  };
  const name = shownText(row[nameAt] ?? '');
  const link = cellLink(table, row, nameAt);
  return <div className="tbl-sheet" ref={sheet} tabIndex={-1} role="dialog" aria-label={name || 'Row'} data-own-escape="" onKeyDown={key}>
    <div className="tbl-sheet-head">
      <div className="tbl-sheet-name">{link ? <a href={link.href} target="_blank" rel="noreferrer" title={shownLink(link.href)}>{link.text}</a> : name || 'Untitled'}</div>
      <span className="tbl-sheet-at">{place + 1} of {count}</span>
      <button type="button" className="tbl-btn tbl-icon" disabled={place <= 0} onClick={() => onStep(-1)} aria-label="Row above" title="Row above (↑)">{glyph('M4 10l4-4 4 4')}</button>
      <button type="button" className="tbl-btn tbl-icon" disabled={place >= count - 1} onClick={() => onStep(1)} aria-label="Row below" title="Row below (↓)">{glyph('M4 6l4 4 4-4')}</button>
      <button type="button" className="tbl-btn tbl-icon" onClick={onClose} aria-label="Close" title="Close (esc)">{glyph('M4 4l8 8M12 4l-8 8')}</button>
    </div>
    <div className="tbl-sheet-body">
      {table.columns.map((c, i) => (
        <div key={`${place}:${i}`} className={`tbl-field${i === from ? ' from' : ''}`} data-field={i}>
          <span className="tbl-field-name"><KindIcon kind={c.kind} />{c.name}</span>
          <Field column={c} value={row[i] ?? ''} editable={editable && !(table.ranked && i === 0)} onWrite={(v) => onWrite(i, v)} hands={editable ? tagHands?.(i) : undefined}
            cells={() => table.rows.map((r) => r[i] ?? '')} />
        </div>
      ))}
    </div>
  </div>;
}

const glyph = (d: string) => <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
// What each column holds, drawn small before its name, as Notion marks a property.
const KIND_PATH: Record<ColumnKind, string> = {
  name: 'M3 4.5h10M3 8h10M3 11.5h6',
  text: 'M3 4.5h10M3 8h10M3 11.5h6',
  tag: 'M8.5 2.5h5v5l-6 6-5-5zM11 5h.01',
  number: 'M6.5 2.5l-1.5 11M11 2.5l-1.5 11M3 6h10.5M2.5 10h10.5',
  date: 'M3 3.5h10v10H3zM3 6.5h10M5.5 2v3M10.5 2v3',
  link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.75.75M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.75-.75',
  email: 'M2.5 4h11v8h-11zM2.5 4.5L8 8.5l5.5-4',
};
const KindIcon = ({ kind }: { kind: ColumnKind }) => <span className="tbl-kind" aria-hidden="true">{glyph(KIND_PATH[kind])}</span>;
const SEARCH = <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>;
const OPEN = glyph('M9.5 3H13v3.5M13 3L8.5 7.5M6.5 13H3V9.5M3 13l4.5-4.5');
const CARET = glyph('M5 6.5l3 3 3-3');
const MORE = <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1" /><circle cx="8" cy="8" r="1.1" /><circle cx="12.5" cy="8" r="1.1" /></svg>;

type Hast = { type: string; tagName?: string; value?: string; children?: Hast[]; properties?: { href?: unknown } };
const textOf = (n: Hast): string => (n.type === 'text' ? n.value ?? '' : (n.children ?? []).map(textOf).join(''));
// A cell that is one link and nothing else goes back to `[text](url)`, so the table can draw it.
const cellOf = (td: Hast): string => {
  const parts = (td.children ?? []).filter((c) => !(c.type === 'text' && !(c.value ?? '').trim()));
  const a = parts.length === 1 && parts[0].tagName === 'a' ? parts[0] : null;
  const href = typeof a?.properties?.href === 'string' ? a.properties.href : '';
  const words = a ? textOf(a).trim() : '';
  return a && href && words !== href ? `[${words}](${href})` : textOf(td).trim();
};
const rowsOf = (n: Hast): Hast[] => (n.tagName === 'tr' ? [n] : (n.children ?? []).flatMap(rowsOf));

/** The header row and rows of a markdown table, as react-markdown hands its node over. */
export function gridFromHast(node: Hast | undefined): string[][] {
  if (!node) return [];
  return rowsOf(node).map((tr) => (tr.children ?? []).filter((c) => c.tagName === 'th' || c.tagName === 'td').map(cellOf));
}

/** A markdown table in a message: every row, in the message, no toolbar; a header still sorts. */
export function InlineTable({ grid }: { grid: string[][] }) {
  const key = useMemo(() => JSON.stringify(grid), [grid]);
  return <TableView text="" path={`inline:${key}`} mode="inline" grid={grid} />;
}

/** Saving a table onto its file, refused when the file moved on since it was read unless `force`. */
export function useTableSave({ product, src, mtime, thread }: { product: string; src: string; mtime: number; thread?: string }): TableSave {
  const at = useRef(mtime);
  useEffect(() => { at.current = mtime; }, [mtime]);
  return useCallback(async (text: string, force = false) => {
    const r = await api.writeDoc({ product, src, text, mtime: force ? 0 : at.current, thread });
    if (r.ok) at.current = r.mtime ?? 0;
    return r;
  }, [product, src, thread]);
}

/** A table as the grid a live room keeps: the file's headers, then its rows. */
const gridOfTable = (t: Table) => [t.columns.map((c) => c.head), ...t.rows.map((r) => [...r])];

const ids = (n: number) => Array.from({ length: n }, (_, i) => i);
function viewOrder(table: Table, query: string, picked: Record<number, string[]>, sort: Sort): number[] {
  const rows = sortRows(table, filterRows(table, query, picked), sort);
  if (rows === table.rows) return ids(rows.length);
  const place = new Map(table.rows.map((r, i) => [r, i] as const));
  return rows.map((r) => place.get(r) ?? -1).filter((i) => i >= 0);
}

/** `filter`: a change to the filter this step made (a tag it renamed or deleted was filtered on), so undo and redo take it too. */
type Doc = { from: Table; table: Table; order: number[]; looks: Looks; filter?: { before: Record<number, string[]>; after: Record<number, string[]> } };
type Editing = { r: number; c: number; draft: string; typed: boolean; pop: 'tag' | 'date' | null };
type Float = { x: number; y: number; col?: number; page?: 'type' };
type Drop = { kind: 'row' | 'col'; place: number; at: number };
// Only a change to the cells or the headers is a change to the file; a colour or a type is not.
const fileChanged = (a: Table, b: Table) => a.rows !== b.rows || a.columns.length !== b.columns.length || a.columns.some((c, i) => c.head !== b.columns[i].head);

export function TableView({ text, path, mode, onShowAll, grid, onSave, onReload, onComment, onNotice, storeKey, live: inRoom = null }: {
  text: string; path: string; mode: TableMode | 'inline'; onShowAll?: () => void; grid?: string[][];
  /** The table's live room: everyone's cells merge, and only a copy that can write the file saves. */
  live?: LiveSession | null;
  /** Given, the table can be edited, and every change is written through it. */
  onSave?: TableSave;
  /** Reads the file again, for when it changed on disk under an edit. */
  onReload?: () => void;
  /** Comments on a cell's words, where the view takes comments. */
  onComment?: (quote: string) => void;
  /** Says a save failed after the table was closed, when there is no table left to say it. */
  onNotice?: (text: string) => void;
  /** What the widths, sort and filter are kept under: two projects can each have a lists/leads.csv. */
  storeKey?: string;
}) {
  const store = storeKey ?? path;
  const base = useMemo(() => (grid ? tableFromGrid(grid) : readTable(text, path)), [text, path, grid]);
  const shape = useMemo(() => shapeOf(text, path), [text, path]);
  const inline = mode === 'inline';
  const preview = mode === 'preview' || inline;
  const hands = !preview;
  const room = inRoom?.synced ? inRoom : null;
  const roomKept = useRoomKept(room);
  // A teammate's copy edits while a copy that can write the file is there to keep it.
  const editable = hands && (!!onSave || (!!room && roomKept));

  const [query, setQuery] = useState('');
  // The sort and the filter stay with the file, through another thread and a reload.
  const [picked, setPicked] = useState<Record<number, string[]>>(() => (hands ? readView(store, base).picked : {}));
  const [sort, setSort] = useState<Sort>(() => (hands ? readView(store, base).sort : null));
  const viewFor = useRef(path);
  useEffect(() => {
    if (viewFor.current === path) return;
    viewFor.current = path;
    const v = hands ? readView(store, base) : { picked: {}, sort: null };
    setQuery(''); setPicked(v.picked); setSort(v.sort);
  }, [path]);
  useEffect(() => { if (hands && viewFor.current === path) keepView(store, docRef.current.table, picked, sort); }, [picked, sort]);
  const searched = useDeferredValue(query);

  // The table as edited, and the view's order of its rows. The order is worked
  // out when the search, a filter or the sort changes, not when a cell does, so
  // a row typed into does not jump out from under the caret.
  const seed = useMemo(() => { const looks = readLooks(store); return { looks, table: withLooks(base, looks) }; }, [base, store]);
  const [doc, setDoc] = useState<Doc>(() => ({ from: base, table: seed.table, order: ids(base.rows.length), looks: seed.looks }));
  // A new table is drawn at once and kept just after the paint. Kept during the
  // draw instead, it never settled when the message around it redrew in the same paint.
  const fresh = useMemo<Doc | null>(() => (doc.from === base ? null : { from: base, table: seed.table, looks: seed.looks, order: viewOrder(seed.table, searched, picked, sort) }), [base, doc.from, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = fresh ?? doc;
  useLayoutEffect(() => { if (fresh) setDoc(fresh); }, [fresh]);
  const { table, order } = live;
  const rowH = hands && table.columns.some(wraps) ? ROW_WRAPPED : ROW_H;
  const docRef = useRef(live);
  docRef.current = live;
  const past = useRef<Doc[]>([]);
  const ahead = useRef<Doc[]>([]);
  useEffect(() => { past.current = []; ahead.current = []; }, [base]);

  const [pick, setPick] = useState<Pick | null>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheet, setSheet] = useState<number | null>(null);
  const [float, setFloat] = useState<Float | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [problem, setProblem] = useState<{ error: string; stale?: boolean } | null>(null);
  const [sized, setSized] = useState<Record<string, number>>(() => readWidths(store));
  useEffect(() => { setSized(readWidths(store)); }, [store]);

  // Set when a column move only renumbers the sort and filters: the view stays where it is.
  const quiet = useRef(false);
  useEffect(() => {
    if (quiet.current) return;
    // A new order starts at the top with nothing picked, and the keys go back to
    // the app, so a letter typed next cannot land in a cell out of sight.
    const d = docRef.current;
    setDoc({ ...d, order: viewOrder(d.table, searched, picked, sort) });
    if (pickRef.current && root.current?.contains(document.activeElement)) root.current.focus({ preventScroll: true });
    setPick(null); setEditing(null); setSheet(null);
  }, [searched, picked, sort]);
  useEffect(() => { setPick(null); setEditing(null); setSheet(null); setFloat(null); setRenaming(null); setProblem(null); }, [base]);

  const natural = useMemo(() => measure(seed.table, mode === 'full' || inline ? 300 : 220), [seed, mode, inline]);
  const template = useMemo(() => tracks(table, natural, sized, inline), [table, natural, sized, inline]);
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const keys = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState({ top: 0, height: 900 });

  // ---- Saving. A change is written a moment after the last one; a failure says so and keeps the edit.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const unsaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async (force = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const out = unsaved.current;
    const save = saveRef.current;
    if (out === null || !save) return;
    unsaved.current = null;
    const r = await save(out, force).catch((e: Error) => ({ ok: false, error: String(e?.message ?? e), stale: false }));
    if (r.ok) { setProblem(null); return; }
    unsaved.current ??= out;
    if (!alive.current) { noticeRef.current?.(`Your last edit to ${path.split('/').pop()} was not saved. ${r.error ?? ''}`.trim()); return; }
    setProblem({ error: r.stale ? 'This file changed on disk since it opened, so your edit is not saved yet.' : (r.error ?? 'That could not be saved.'), stale: r.stale });
  }, []);
  useEffect(() => () => { void flush(); }, [flush, base]);

  // ---- The live room: filled once from the file, then the cells everyone sees.
  const viewNow = useRef({ searched, picked, sort });
  viewNow.current = { searched, picked, sort };
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const roomRef = useRef(room);
  roomRef.current = room;
  const shown = useRef<ReturnType<typeof gridOf> | null>(null);
  const intoRoom = (next: Table) => {
    const r = roomRef.current;
    if (!r || !shown.current) return;
    putGrid(r.doc, shown.current, gridOfTable(next));
    shown.current = gridOf(r.doc);
  };
  useEffect(() => {
    if (!room) { shown.current = null; return undefined; }
    if (room.seed && !isSeeded(room.doc)) seedGrid(room.doc, gridOfTable(base));
    let frame = 0;
    const take = () => {
      frame = 0;
      if (!isSeeded(room.doc)) return;
      const now = gridOf(room.doc);
      shown.current = now;
      const d = docRef.current;
      const read = tableFromGrid(now.grid);
      // A column keeps what it is (tags stay tags) when someone types a value it has not had.
      const table = { ...read, columns: read.columns.map((c, i) => (d.table.columns[i]?.head === c.head ? d.table.columns[i] : c)) };
      if (writeTable(table, shape) === writeTable(d.table, shape)) return;
      // A sort or filter stays true as others change cells, except under the cell being typed in.
      const v = viewNow.current;
      const order = table.rows.length === d.table.rows.length && (editingNow.current || (!v.sort && !Object.keys(v.picked).length && !v.searched))
        ? d.order : viewOrder(table, v.searched, v.picked, v.sort);
      const next: Doc = { ...d, table, order, filter: undefined };
      docRef.current = next;
      setDoc(next);
      if (saveRef.current && room.keeper) {
        unsaved.current = writeTable(table, shape);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void flush(); }, SAVE_MS);
      }
    };
    const soon = () => { frame ||= requestAnimationFrame(take); };
    take();
    room.doc.on('update', soon);
    return () => { room.doc.off('update', soon); if (frame) cancelAnimationFrame(frame); };
  }, [room?.doc, room?.seed, room?.keeper]);
  // Where this copy is, by row and column id, for everyone else's view.
  useEffect(() => {
    if (!room || !shown.current) return;
    const at = pick ? { r: shown.current.rowIds[order[pick.b.r]], c: shown.current.colIds[pick.b.c] } : null;
    room.live.awareness.setLocalStateField('at', at && at.r && at.c ? { cell: `${at.r}|${at.c}` } : null);
    room.live.awareness.setLocalStateField('keeps', room.keeper && !!onSave);
  }, [room?.live, room?.keeper, pick?.b.r, pick?.b.c, order]);

  useCellMarks(box, room, shown, order, table);

  const commit = useCallback((given: Doc) => {
    const was = docRef.current;
    if (given.table === was.table && given.order === was.order) return;
    // A tag added now keeps the colour it was drawn in; read again, the guess would deal it another.
    let next = fileChanged(given.table, was.table) ? { ...given, looks: pinTones(given.table, given.looks) } : given;
    // A step that spread the last one over did not change the filter itself.
    if (next.filter && next.filter === was.filter) next = { ...next, filter: undefined };
    past.current.push(was);
    if (past.current.length > UNDO_DEPTH) past.current.shift();
    ahead.current = [];
    docRef.current = next;
    setDoc(next);
    if (fileChanged(next.table, was.table)) intoRoom(next.table);
    if (next.looks !== was.looks) keepLooks(store, next.looks);
    if (fileChanged(next.table, was.table) && saveRef.current && (!roomRef.current || roomRef.current.keeper)) {
      unsaved.current = writeTable(next.table, shape);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void flush(); }, SAVE_MS);
    }
  }, [shape, flush, store]);
  const travel = (from: React.MutableRefObject<Doc[]>, to: React.MutableRefObject<Doc[]>, back: boolean) => {
    const next = from.current.pop();
    if (!next) return;
    const was = docRef.current;
    to.current.push(was);
    docRef.current = next;
    setDoc(next);
    setPick((p) => (p ? clampPick(p, next) : p));
    // The step undone, or the one redone, changed the filter: the view is worked out again from the filter it had.
    const filter = back ? was.filter?.before : next.filter?.after;
    if (filter) { setPicked(filter); return finishTravel(next, was); }
    // Undoing a column move takes the sort and the filters back with their columns, found by name.
    const at = (i: number) => { const n = next.table.columns.findIndex((c) => c.name === was.table.columns[i]?.name); return n < 0 ? i : n; };
    const sortMoves = !!sort && at(sort.col) !== sort.col;
    const pickedMoves = Object.keys(picked).some((k) => at(Number(k)) !== Number(k));
    if (sortMoves || pickedMoves) {
      quiet.current = true;
      if (sortMoves) setSort((s) => (s ? { ...s, col: at(s.col) } : s));
      if (pickedMoves) setPicked((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [at(Number(k)), v])));
    }
    finishTravel(next, was);
  };
  const finishTravel = (next: Doc, was: Doc) => {
    if (fileChanged(next.table, was.table)) intoRoom(next.table);
    if (next.looks !== was.looks) keepLooks(store, next.looks);
    if (fileChanged(next.table, was.table) && saveRef.current && (!roomRef.current || roomRef.current.keeper)) {
      unsaved.current = writeTable(next.table, shape);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void flush(); }, SAVE_MS);
    }
  };
  const undo = () => travel(past, ahead, true);
  const redo = () => travel(ahead, past, false);

  const first = table.ranked ? 1 : 0;
  const last = table.columns.length - 1;
  // Room for a four-digit row number.
  const rnW = table.rows.length >= 1000 ? RN_W_WIDE : RN_W;
  const edges = { rows: order.length, first, last };
  const clampPick = (p: Pick, d: Doc): Pick | null => {
    if (!d.order.length) return null;
    const fit = (a: At) => ({ r: Math.min(a.r, d.order.length - 1), c: Math.min(a.c, d.table.columns.length - 1) });
    return { ...p, a: fit(p.a), b: fit(p.b) };
  };
  const sel: Box | null = pick ? boxOf(pick) : null;
  const wholeRows = !!sel && sel.c0 <= first && sel.c1 >= last;
  const wholeCols = !!sel && sel.r0 === 0 && sel.r1 === order.length - 1 && order.length > 0;

  // ---- Where the box is scrolled to and how tall it is decide which rows are drawn.
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
  }, [base]);

  // A new order or a new search starts from the top.
  useEffect(() => {
    if (quiet.current) { quiet.current = false; return; }
    box.current?.scrollTo({ top: 0 });
  }, [searched, picked, sort]);

  // With words in the search box, Escape clears them before it closes the view
  // the table is in, but not while you are typing somewhere else, and not while
  // a pick, an edit or a menu is the nearer thing to close.
  const owns = !!(pick || editing || sheet !== null || float || renaming !== null);
  useEffect(() => {
    if (!query) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.tbl-menu') || owns) return;
      const at = document.activeElement;
      if (typingIn(at) && !root.current?.contains(at)) return;
      e.stopImmediatePropagation(); e.preventDefault(); setQuery('');
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [query, owns]);

  // ---- Keeping the moving end of the pick in view.
  const follow = useRef(false);
  /** How much of the left edge the row number and the first column cover, past the first column. */
  const stuckWidth = (c: number) => (c === first ? rnW : rnW + ((box.current?.querySelector(`[data-hc="${first}"]`) as HTMLElement | null)?.offsetWidth ?? 0));
  const headH = () => (box.current?.querySelector('.tbl-th') as HTMLElement | null)?.offsetHeight ?? 38;
  useEffect(() => {
    if (!pick || !follow.current) return;
    follow.current = false;
    const el = box.current;
    if (!el) return;
    const top = headH() + pick.b.r * rowH;
    if (top < el.scrollTop + headH()) el.scrollTop = top - headH();
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
    requestAnimationFrame(() => {
      const cell = el.querySelector(`[data-r="${pick.b.r}"][data-c="${pick.b.c}"]`) as HTMLElement | null;
      if (!cell) return;
      const stuck = stuckWidth(pick.b.c);
      const left = cell.offsetLeft;
      const room = el.clientWidth - stuck;
      // A cell wider than the view shows its start, where its words begin, not its far end.
      if (left < el.scrollLeft + stuck || (cell.offsetWidth > room && left > el.scrollLeft + stuck)) el.scrollLeft = Math.max(0, left - stuck);
      else if (left + cell.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left + cell.offsetWidth - el.clientWidth;
    });
  }, [pick, first]);

  const focusKeys = () => {
    const k = keys.current;
    if (!k) return;
    if (document.activeElement !== k) k.focus({ preventScroll: true });
    k.value = ' ';
    k.select();
  };
  const goTo = (p: Pick | null) => { follow.current = true; setPick(p); };
  /** The keys to the table itself, which is no text box, so the app's own Escape and letters work again. */
  const rest = () => root.current?.focus({ preventScroll: true });
  // The app's own Escape steps aside for a text box, and the keys were in one: hand this Escape on from the table itself.
  // The keys sit in a hidden text box, and the app's own letters step aside for a
  // text box: the keys move to the table itself, and the letter goes on from there.
  const passKey = (e: React.KeyboardEvent) => {
    rest();
    root.current?.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.nativeEvent.code, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
  };
  const passEscape = () => { rest(); root.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); };

  // ---- Changing cells.
  const writeAt = (cells: Array<{ r: number; c: number; v: string }>) => {
    const d = docRef.current;
    let t = d.table;
    let o = d.order;
    const beyond = Math.max(-1, ...cells.map((w) => w.r)) - (o.length - 1);
    if (beyond > 0) {
      t = addRows(t, t.rows.length, beyond);
      o = [...o, ...ids(beyond).map((k) => d.table.rows.length + k)];
    }
    const writes = cells.filter((w) => w.c >= first && w.c <= last && o[w.r] !== undefined).map((w) => ({ i: o[w.r], c: w.c, v: w.v }))
      .filter((w) => (t.rows[w.i][w.c] ?? '') !== w.v);
    if (!writes.length && beyond <= 0) return;
    commit({ ...d, table: writeCells(t, writes), order: o });
  };
  const clearPicked = () => {
    if (!sel || !editable) return;
    const cells: Array<{ r: number; c: number; v: string }> = [];
    for (let r = sel.r0; r <= sel.r1; r++) for (let c = Math.max(sel.c0, first); c <= sel.c1; c++) cells.push({ r, c, v: '' });
    writeAt(cells);
  };
  const pickedGrid = (): string[][] => {
    if (!sel) return [];
    const out: string[][] = [];
    for (let r = sel.r0; r <= sel.r1; r++) {
      const row = table.rows[order[r]];
      if (!row) continue;
      const line: string[] = [];
      for (let c = Math.max(sel.c0, first); c <= sel.c1; c++) line.push(row[c] ?? '');
      out.push(line);
    }
    return out;
  };
  const paste = (text: string) => {
    if (!sel || !editable) return;
    const values = fromClipboard(text);
    const cells = pasteInto(values, { ...sel, c0: Math.max(sel.c0, first) }, last);
    if (!cells.length) return;
    writeAt(cells);
    const r1 = Math.max(...cells.map((w) => w.r)), c1 = Math.max(...cells.map((w) => w.c));
    setPick({ a: { r: sel.r0, c: Math.max(sel.c0, first) }, b: { r: r1, c: c1 } });
  };
  const addRowAt = (place: number, edit = false) => {
    const d = docRef.current;
    // In the file, a row added at the foot goes last; one put in among rows goes
    // just after the row above it in the view, so a sorted view does not scatter them.
    const at = place >= d.order.length ? d.table.rows.length : place === 0 ? d.order[0] : d.order[place - 1] + 1;
    commit({ ...d, table: addRows(d.table, at), order: orderAfterAdd(d.order, at, 1, place) });
    goTo({ a: { r: place, c: first }, b: { r: place, c: first } });
    if (edit) beginEdit({ r: place, c: first, draft: '', typed: false, pop: popOf(d.table.columns[first]?.kind) });
  };
  const dropPicked = () => {
    if (!sel || !editable) return;
    const d = docRef.current;
    const gone = new Set(d.order.slice(sel.r0, sel.r1 + 1));
    const next = { ...d, table: dropRows(d.table, gone), order: orderAfterDrop(d.order, gone), looks: pinTones(d.table, d.looks) };
    commit(next);
    const r = Math.min(sel.r0, next.order.length - 1);
    setPick(r >= 0 ? { a: { r, c: pick?.a.c ?? first }, b: { r, c: pick?.a.c ?? first } } : null);
  };
  /** A change to the columns; `at` is the column to stand on after it, at the top, so typing never lands elsewhere. */
  const changeColumns = (t: Table, at?: number, looks?: Looks) => {
    const d = docRef.current;
    if (t !== d.table || (looks && looks !== d.looks)) commit({ ...d, table: t, looks: looks ?? d.looks });
    const c = at === undefined ? -1 : Math.max(t.ranked ? 1 : 0, Math.min(at, t.columns.length - 1));
    setPick(c >= 0 && d.order.length ? { a: { r: 0, c }, b: { r: 0, c } } : null);
  };
  const setKind = (col: number, kind: ColumnKind) => {
    const d = docRef.current;
    const c = d.table.columns[col];
    if (!c || (c.kind === 'name' && kind === 'text')) return;
    const looks = lookKind(d.looks, c.name, kind);
    changeColumns(withLooks(d.table, looks), col, looks);
  };
  /** A filter on a tag that was renamed follows the new name; one on a tag deleted is let go. */
  const refiltered = (col: number, from: string, to: string | null): Doc['filter'] => {
    const on = picked[col] ?? [];
    if (!on.some((v) => v.toLowerCase() === from.trim().toLowerCase())) return undefined;
    const kept = on.filter((v) => v.toLowerCase() !== from.trim().toLowerCase());
    const next = to === null || kept.some((v) => v.toLowerCase() === to.toLowerCase()) ? kept : [...kept, to];
    return { before: picked, after: { ...picked, [col]: next } };
  };
  const tagHands = (col: number): TagHands => ({
    rename: (from, to) => {
      const d = docRef.current;
      const c = d.table.columns[col];
      const t = renameTag(d.table, col, from, to);
      if (!c || t === d.table) return;
      const merges = c.values.some((v) => v.toLowerCase() === to.trim().toLowerCase() && v.toLowerCase() !== from.trim().toLowerCase());
      const written = t.columns[col].values.find((v) => v.toLowerCase() === to.trim().toLowerCase()) ?? to.trim();
      const filter = refiltered(col, from, written);
      commit({ ...d, table: t, looks: merges ? d.looks : lookRenameTag(d.looks, c.name, from, to), filter });
      // The same rows stay in view, so the tag list stays open.
      if (filter) { quiet.current = true; setPicked(filter.after); }
    },
    tone: (tag, tone) => {
      const d = docRef.current;
      const c = d.table.columns[col];
      if (!c || c.tones[tag.trim().toLowerCase()] === tone) return;
      const looks = lookTone(d.looks, c.name, tag, tone);
      commit({ ...d, table: withLooks(d.table, looks), looks });
    },
    drop: (tag) => {
      const d = docRef.current;
      const filter = refiltered(col, tag, null);
      commit({ ...d, table: dropTag(d.table, col, tag), filter });
      if (filter) setPicked(filter.after);
    },
    count: (tag) => docRef.current.table.rows.filter((r) => (r[col] ?? '').trim().toLowerCase() === tag.trim().toLowerCase()).length,
  });

  // ---- Moving rows and columns. Rows move only in the file's own order: under a sort, the sort decides.
  const moveRowsTo = (place: number) => {
    const d = docRef.current;
    const s = pickRef.current ? boxOf(pickRef.current) : null;
    if (!s || sort || place < 0 || place > d.order.length || (place >= s.r0 && place <= s.r1 + 1)) return;
    const before = place >= d.order.length ? d.table.rows.length : d.order[place];
    const { table: t, to } = moveRows(d.table, d.order.slice(s.r0, s.r1 + 1), before);
    if (t === d.table) return;
    const order = d.order.map((i) => to[i]).sort((a, b) => a - b);
    commit({ ...d, table: t, order, looks: pinTones(d.table, d.looks) });
    const r0 = order.indexOf(to[d.order[s.r0]]);
    // Not goTo: following the pick's far end would scroll the table sideways to its last column.
    setPick({ a: { r: r0, c: first }, b: { r: r0 + s.r1 - s.r0, c: last }, rows: true });
    const el = box.current;
    if (el) {
      const top = headH() + r0 * rowH;
      if (top < el.scrollTop + headH()) el.scrollTop = top - headH();
      else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
    }
  };
  const moveColsTo = (c0: number, c1: number, place: number) => {
    const d = docRef.current;
    const { table: t, to } = moveColumns(d.table, c0, c1 - c0 + 1, place);
    if (t === d.table) return;
    commit({ ...d, table: t });
    // The sort and the filters are held by column place; they follow their columns.
    const sortMoves = !!sort && to[sort.col] !== sort.col;
    const pickedMoves = Object.keys(picked).some((k) => to[Number(k)] !== Number(k));
    if (sortMoves || pickedMoves) {
      quiet.current = true;
      if (sortMoves) setSort((s) => (s ? { ...s, col: to[s.col] } : s));
      if (pickedMoves) setPicked((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [to[Number(k)], v])));
    }
    if (d.order.length) setPick({ a: { r: 0, c: to[c0] }, b: { r: d.order.length - 1, c: to[c1] } });
    focusKeys();
    // Sideways only: a column moved to the left must not land under the frozen first column.
    requestAnimationFrame(() => {
      const el = box.current;
      const th = el?.querySelector(`[data-hc="${to[c0]}"]`) as HTMLElement | null;
      if (!el || !th) return;
      const stuck = stuckWidth(to[c0]);
      if (th.offsetLeft < el.scrollLeft + stuck) el.scrollLeft = Math.max(0, th.offsetLeft - stuck);
      else if (th.offsetLeft + th.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = th.offsetLeft + th.offsetWidth - el.clientWidth;
    });
  };

  // ---- Editing a cell. The ref says whether an edit is still open, so the
  // blur that follows Escape or Enter does not end it a second time.
  const open = useRef<Editing | null>(null);
  const beginEdit = (e: Editing) => { open.current = e; setEditing(e); };
  const startEdit = (at: At, typed?: string) => {
    const column = table.columns[at.c];
    const row = table.rows[order[at.r]];
    if (!column || !row || (table.ranked && at.c === 0)) return;
    if (!editable && column.kind === 'tag') return;
    setFloat(null);
    goTo({ a: at, b: at });
    beginEdit({ r: at.r, c: at.c, draft: typed ?? row[at.c] ?? '', typed: typed !== undefined, pop: editable ? popOf(column.kind) : null });
  };
  const startEditRef = useRef(startEdit);
  startEditRef.current = startEdit;
  const endEdit = (value: string | null, move?: 'down' | 'right' | 'left') => {
    const e = open.current;
    if (!e) return;
    open.current = null;
    setEditing(null);
    if (e && value !== null && editable) {
      const t = docRef.current.table;
      const column = t.columns[e.c];
      const cells = t.rows.map((row) => row[e.c] ?? '');
      const was = t.rows[docRef.current.order[e.r]]?.[e.c] ?? '';
      const v = column?.kind === 'number' ? likeItsColumn(value, cells) : column?.kind === 'date' ? asDate(value, was, cells) : value;
      writeAt([{ r: e.r, c: e.c, v }]);
    }
    if (e && move) {
      const key = move === 'down' ? 'ArrowDown' : move === 'right' ? 'ArrowRight' : 'ArrowLeft';
      const to = moved({ r: e.r, c: e.c }, key, edges);
      goTo({ a: to, b: to });
    }
    // Not when a double click has already opened the next edit: the keys would take its focus and close it.
    requestAnimationFrame(() => { if (!open.current) focusKeys(); });
  };

  // ---- The keys, while the table holds them.
  const onKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape' && (drag.current === 'moverows' || drag.current === 'movecols')) {
      stop(); drag.current = null; pressedPick.current = null; setDrop(null); return;
    }
    // Alt and an arrow moves whole rows or columns picked, as the menus' Move does; on one cell it does nothing.
    if (e.altKey && !meta && editable && sel && /^Arrow(Up|Down|Left|Right)$/.test(k)) {
      stop();
      if (wholeRows && k === 'ArrowUp') moveRowsTo(sel.r0 - 1);
      else if (wholeRows && k === 'ArrowDown') moveRowsTo(sel.r1 + 2);
      else if (wholeCols && sel.c0 >= first && (k === 'ArrowLeft' || k === 'ArrowRight')) moveColsTo(sel.c0, sel.c1, k === 'ArrowLeft' ? sel.c0 - 1 : sel.c1 + 2);
      return;
    }
    if (meta && (k === 'z' || k === 'Z')) { stop(); if (e.shiftKey) redo(); else undo(); return; }
    if (meta && (k === 'y' || k === 'Y')) { stop(); redo(); return; }
    if (meta && (k === 'a' || k === 'A')) { stop(); if (order.length) setPick({ a: { r: 0, c: first }, b: { r: order.length - 1, c: last } }); return; }
    if (meta && /^[cxv]$/i.test(k)) { e.stopPropagation(); return; }
    // Fill down: the top row of the block, copied into every row picked below it.
    if (meta && /^d$/i.test(k) && sel && editable) {
      stop();
      const top = table.rows[order[sel.r0]];
      const cells: Array<{ r: number; c: number; v: string }> = [];
      if (top) for (let r = sel.r0 + 1; r <= sel.r1; r++) for (let c = Math.max(sel.c0, first); c <= sel.c1; c++) cells.push({ r, c, v: top[c] ?? '' });
      writeAt(cells);
      return;
    }
    if (!pick) {
      if (/^(Arrow|Tab$|Enter$|Home$|End$|Page)/.test(k) && order.length) { stop(); goTo({ a: { r: 0, c: first }, b: { r: 0, c: first } }); }
      if (k === 'Escape') { stop(); passEscape(); }
      return;
    }
    if (k === 'Escape') {
      stop();
      // With nothing picked the table itself keeps the keys, not a text box, so
      // undo still works and the next Escape goes on to close the view.
      if (sel && cellsIn(sel) > 1) setPick({ a: pick.a, b: pick.a });
      else if (peek) setShut(`${pick.a.r}:${pick.a.c}`);
      else { setPick(null); rest(); }
      return;
    }
    if (/^(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(k)) {
      stop();
      const page = Math.max(1, Math.floor((box.current?.clientHeight ?? 400) / rowH) - 1);
      if (e.shiftKey) goTo({ a: pick.a, b: moved(pick.b, k, edges, { jump: meta, page }) });
      else { const to = moved(pick.a, k, edges, { jump: meta, page }); goTo({ a: to, b: to }); }
      return;
    }
    if (k === 'Tab') {
      stop();
      const to = moved(pick.a, e.shiftKey ? 'ArrowLeft' : 'ArrowRight', edges);
      goTo({ a: to, b: to });
      return;
    }
    if (k === 'Enter') {
      stop();
      if (e.shiftKey && editable) addRowAt(pick.a.r + 1, true);
      else startEdit(pick.a);
      return;
    }
    if (k === 'F2') { stop(); startEdit(pick.a); return; }
    if (k === ' ' && !meta) { stop(); setSheet(pick.a.r); return; }
    if (k === 'Backspace' || k === 'Delete') { stop(); clearPicked(); return; }
    // A letter is the app's (R replies, E closes), not the cell's: Enter, F2 or a double click edits.
    if (k.length === 1 && !meta && !e.altKey) { stop(); passKey(e); }
  };
  const onCopy = (e: React.ClipboardEvent, cut = false) => {
    if (!sel) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', toClipboard(pickedGrid()));
    if (cut) clearPicked();
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (!sel) return;
    e.preventDefault();
    paste(e.clipboardData.getData('text/plain'));
  };

  // ---- The mouse. One listener on the grid reads which cell, row number or header was pressed.
  const drag = useRef<null | 'cells' | 'rows' | 'cols' | 'moverows' | 'movecols'>(null);
  const linkOpens = useRef(false);
  const pressed = useRef(false);
  const atOf = (target: EventTarget | null): { kind: 'cell' | 'row' | 'col'; at: At } | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-c],[data-rn],[data-hc]') as HTMLElement | null;
    if (!el || !box.current?.contains(el)) return null;
    if (el.dataset.rn !== undefined) return { kind: 'row', at: { r: Number(el.dataset.rn), c: first } };
    if (el.dataset.hc !== undefined) return { kind: 'col', at: { r: 0, c: Number(el.dataset.hc) } };
    return { kind: 'cell', at: { r: Number(el.dataset.r), c: Number(el.dataset.c) } };
  };
  const pickFor = (kind: 'cell' | 'row' | 'col', at: At, extend: boolean): Pick => {
    const from = extend && pick ? pick.a : at;
    if (kind === 'row') return { a: { r: from.r, c: first }, b: { r: at.r, c: last }, rows: true };
    if (kind === 'col') return { a: { r: 0, c: from.c }, b: { r: Math.max(0, order.length - 1), c: at.c } };
    return { a: from, b: at };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!hands || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.tbl-edit, .tbl-pick, .tbl-peek, .tbl-resize, .tbl-th-menu, .tbl-th input, .tbl-add')) return;
    const hit = atOf(t);
    if (!hit) return;
    pressed.current = true;
    const wasOpen = !!editing && editing.r === hit.at.r && editing.c === hit.at.c;
    if (editing) endEdit(editing.pop === 'tag' ? null : open.current?.draft ?? editing.draft);
    if (t.closest('.tbl-open')) { e.preventDefault(); goTo(pickFor('row', hit.at, false)); setSheet(hit.at.r); return; }
    if (hit.kind === 'col' && !order.length) return;
    e.preventDefault();
    // A press on rows or columns already picked picks them up to move them, as Sheets does.
    const plain = !e.shiftKey && !e.metaKey && !e.ctrlKey;
    if (editable && plain && sel && hit.kind === 'row' && wholeRows && !sort && hit.at.r >= sel.r0 && hit.at.r <= sel.r1) {
      drag.current = 'moverows'; pressedPick.current = pickFor('row', hit.at, false); focusKeys(); return;
    }
    if (editable && plain && sel && hit.kind === 'col' && wholeCols && sel.c0 >= first && hit.at.c >= sel.c0 && hit.at.c <= sel.c1) {
      drag.current = 'movecols'; pressedPick.current = pickFor('col', hit.at, false); focusKeys(); return;
    }
    // A press picks, as everywhere in a spreadsheet; a link opens with ⌘ or Ctrl
    // held, or from the right-click menu, so a double click to edit never leaves the table.
    linkOpens.current = !e.shiftKey && (e.metaKey || e.ctrlKey);
    setPick(pickFor(hit.kind, hit.at, e.shiftKey));
    drag.current = hit.kind === 'cell' ? 'cells' : hit.kind === 'row' ? 'rows' : 'cols';
    // A tag or a date is a choice, so one press opens its list, once the press ends where it began.
    const kind = table.columns[hit.at.c]?.kind;
    opensOnClick.current = editable && plain && hit.kind === 'cell' && !wasOpen && (kind === 'tag' || kind === 'date') ? hit.at : null;
    focusKeys();
  };
  const opensOnClick = useRef<At | null>(null);
  const pressedPick = useRef<Pick | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef(drop);
  dropRef.current = drop;
  const movers = useRef({ moveRowsTo, moveColsTo, sel });
  movers.current = { moveRowsTo, moveColsTo, sel };
  /** Where a row or column picked up would land, from the pointer: a gap between two, and where to draw it. */
  const dropAt = (x: number, y: number, kind: 'row' | 'col'): Drop | null => {
    const el = box.current;
    const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.(kind === 'row' ? '[data-r],[data-rn]' : '[data-c],[data-hc]') as HTMLElement | null;
    if (!el) return null;
    if (!hit || !el.contains(hit)) {
      const rows = docRef.current.order.length;
      if (kind === 'row' && y > el.getBoundingClientRect().top + headH()) return { kind, place: rows, at: headH() + rows * rowH };
      const end = el.querySelector(`[data-hc="${last}"]`) as HTMLElement | null;
      if (kind === 'col' && end && x > end.getBoundingClientRect().right) return { kind, place: last + 1, at: end.offsetLeft + end.offsetWidth };
      return null;
    }
    const r = hit.getBoundingClientRect();
    if (kind === 'row') {
      const n = Number(hit.dataset.r ?? hit.dataset.rn);
      const place = y > r.top + r.height / 2 ? n + 1 : n;
      return { kind, place, at: headH() + place * rowH };
    }
    const n = Number(hit.dataset.c ?? hit.dataset.hc);
    const after = x > r.left + r.width / 2;
    const place = Math.max(first, after ? n + 1 : n);
    const th = el.querySelector(`[data-hc="${Math.min(place, last)}"]`) as HTMLElement | null;
    return { kind, place, at: th ? th.offsetLeft + (place > last ? th.offsetWidth : 0) : 0 };
  };
  useEffect(() => {
    if (!hands) return undefined;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      opensOnClick.current = null;
      const el = box.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (e.clientY > r.bottom - 24) el.scrollTop += 18;
        else if (e.clientY < r.top + headH() + 8) el.scrollTop -= 18;
        if (drag.current === 'movecols') {
          if (e.clientX > r.right - 24) el.scrollLeft += 18;
          else if (e.clientX < r.left + 24) el.scrollLeft -= 18;
        }
      }
      if (drag.current === 'moverows' || drag.current === 'movecols') {
        const next = dropAt(e.clientX, e.clientY, drag.current === 'moverows' ? 'row' : 'col');
        setDrop((d) => (d && next && d.place === next.place && d.at === next.at && d.kind === next.kind ? d : next));
        return;
      }
      const hit = atOf(document.elementFromPoint(e.clientX, e.clientY));
      if (!hit) return;
      const kind = drag.current === 'cells' ? 'cell' : drag.current === 'rows' ? 'row' : 'col';
      setPick((p) => {
        if (!p) return p;
        const b = kind === 'row' ? { r: hit.at.r, c: last } : kind === 'col' ? { r: p.b.r, c: hit.at.c } : hit.kind === 'cell' ? hit.at : { r: hit.at.r, c: p.b.c };
        return b.r === p.b.r && b.c === p.b.c ? p : { ...p, b };
      });
    };
    const up = () => {
      const was = drag.current;
      drag.current = null;
      const d = dropRef.current;
      const pressedOn = pressedPick.current;
      pressedPick.current = null;
      if (d) {
        setDrop(null);
        const { moveRowsTo: rows, moveColsTo: cols, sel: s } = movers.current;
        if (was === 'moverows' && d.kind === 'row') rows(d.place);
        if (was === 'movecols' && d.kind === 'col' && s) cols(s.c0, s.c1, d.place);
      } else if (pressedOn) setPick(pressedOn);
      const at = opensOnClick.current;
      opensOnClick.current = null;
      const p = pickRef.current;
      if (at && p && p.a.r === at.r && p.a.c === at.c && p.b.r === at.r && p.b.c === at.c) startEditRef.current(at);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  }, [hands, last, first]);
  const onDouble = (e: React.MouseEvent) => {
    if (!hands) return;
    const hit = atOf(e.target);
    if (!hit) return;
    if (hit.kind === 'cell') { e.preventDefault(); startEdit(hit.at); }
    if (hit.kind === 'row') { e.preventDefault(); setSheet(hit.at.r); }
  };
  const onContext = (e: React.MouseEvent) => {
    if (!hands) return;
    const hit = atOf(e.target);
    if (!hit) return;
    e.preventDefault();
    if (editing) endEdit(editing.pop === 'tag' ? null : open.current?.draft ?? editing.draft);
    if (hit.kind === 'col') { setFloat({ x: e.clientX, y: e.clientY, col: hit.at.c }); return; }
    if (!sel || !inBox(sel, hit.at.r, hit.at.c === first && hit.kind === 'row' ? first : hit.at.c)) setPick(pickFor(hit.kind, hit.at, false));
    focusKeys();
    setFloat({ x: e.clientX, y: e.clientY });
  };

  // ---- Widening a column by its header's edge; a double click fits it to what it holds.
  const onGrip = (e: React.PointerEvent, col: number) => {
    e.preventDefault(); e.stopPropagation();
    const th = (e.target as HTMLElement).closest('.tbl-th') as HTMLElement | null;
    const name = table.columns[col].name;
    const start = e.clientX;
    const from = th?.getBoundingClientRect().width ?? 160;
    let now = sized;
    const move = (m: PointerEvent) => { now = { ...sized, [name]: Math.max(MIN_W, Math.round(from + m.clientX - start)) }; setSized(now); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); keepWidths(store, now); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  const fitColumn = (col: number) => {
    const name = table.columns[col].name;
    // Slack for a font the canvas measures a hair narrower than the cell draws it.
    const w = (measure(table, 640, col).px.get(name) ?? 160) + 12;
    const next = { ...sized, [name]: w };
    setSized(next); keepWidths(store, next);
  };

  // Where the editor or the tag list sits: over the cell, inside the scrolling
  // box so it scrolls with it. Read after the rows are drawn, so a row added a
  // moment ago is there to sit on.
  const [place, setPlace] = useState<{ left: number; top: number; w: number; up: boolean } | null>(null);
  const roomy = !!editing && (editing.draft.length > 32 || editing.draft.includes('\n'));
  useLayoutEffect(() => {
    if (!editing) { setPlace(null); return undefined; }
    const el = box.current;
    if (!el) return undefined;
    // Read again on every scroll: the cell may still be scrolling into view as the edit opens.
    const read = () => {
      const cell = el.querySelector(`[data-r="${editing.r}"][data-c="${editing.c}"]`) as HTMLElement | null;
      if (!cell) return;
      // Never over the row number and the first column, which say whose row this is.
      // The first column sticks, so its cell sits just right of the row number wherever the table is scrolled.
      const from = el.scrollLeft + stuckWidth(editing.c);
      const cellLeft = editing.c === first ? from : cell.offsetLeft;
      const want = editing.pop ? 260 : Math.max(cell.offsetWidth, roomy ? 380 : 0);
      const w = Math.max(Math.min(cell.offsetWidth, 200), Math.min(want, el.scrollLeft + el.clientWidth - from - 8));
      const left = Math.max(from, Math.min(cellLeft, el.scrollLeft + el.clientWidth - w));
      const top = cell.offsetTop;
      const below = el.scrollTop + el.clientHeight - (top + rowH);
      const tall = editing.pop === 'date' ? 340 : 300;
      const next = { left, top, w, up: !!editing.pop && below < tall && top - el.scrollTop > below };
      setPlace((p) => (p && p.left === next.left && p.top === next.top && p.w === next.w && p.up === next.up ? p : next));
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [editing?.r, editing?.c, editing?.pop, roomy, live, view, template]);

  // ---- A cell picked whose words are cut off shows them whole, over the cell, without editing.
  type Peek = { left: number; top: number; w: number; text: string; up: boolean; most: number };
  const [peek, setPeek] = useState<Peek | null>(null);
  const one = pick && pick.a.r === pick.b.r && pick.a.c === pick.b.c ? pick.a : null;
  // Escape puts the box away and leaves the cell picked; the next cell picked shows its own again.
  const [shut, setShut] = useState<string | null>(null);
  const oneKey = one ? `${one.r}:${one.c}` : null;
  useEffect(() => { if (shut && shut !== oneKey) setShut(null); }, [oneKey]);
  useLayoutEffect(() => {
    const el = box.current;
    const kind = one ? table.columns[one.c]?.kind : undefined;
    if (!el || !one || !hands || editing || sheet !== null || float || drop || kind === 'tag' || shut === oneKey) { setPeek(null); return undefined; }
    const read = () => {
      const cell = el.querySelector(`[data-r="${one.r}"][data-c="${one.c}"]`) as HTMLElement | null;
      const words = cell?.querySelector('.tbl-ell') as HTMLElement | null;
      if (!cell || !words || (words.scrollWidth <= words.clientWidth + 1 && words.scrollHeight <= words.clientHeight + 1)) { setPeek(null); return; }
      const from = el.scrollLeft + stuckWidth(one.c);
      const cellLeft = one.c === first ? from : cell.offsetLeft;
      // The editor's width, so pressing Enter does not move the words.
      const w = Math.max(Math.min(cell.offsetWidth, 200), Math.min(Math.max(cell.offsetWidth, 380), el.scrollLeft + el.clientWidth - from - 8));
      const left = Math.max(from, Math.min(cellLeft, el.scrollLeft + el.clientWidth - w));
      const top = cell.offsetTop;
      // Near the foot of the view it rises from the cell's bottom edge, as the tag list does.
      const below = el.scrollTop + el.clientHeight - top - 8;
      const above = top + rowH - el.scrollTop - headH() - 8;
      const up = below < 200 && above > below;
      const most = Math.max(rowH, Math.min(320, up ? above : below));
      const text = shownText(table.rows[order[one.r]]?.[one.c] ?? '');
      const next = { left, top, w, text, up, most };
      setPeek((p) => (p && p.left === left && p.top === top && p.w === w && p.text === text && p.up === up && p.most === most ? p : next));
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [one?.r, one?.c, editing, sheet, float, drop, live, view, template, rowH, shut]);

  // After a menu's choice the keys come back to the table, unless the choice opened a box of its own (Rename).
  const closeFloat = () => {
    setFloat(null);
    requestAnimationFrame(() => {
      const at = document.activeElement;
      if (at && at !== keys.current && root.current?.contains(at) && typingIn(at)) return;
      if (pickRef.current) focusKeys(); else rest();
    });
  };

  /** Wrap text, for a column of words: on, each row shows three lines of it; a second press turns it off. */
  const wrapRow = (col: number) => {
    const c = table.columns[col];
    if (!c || !wordy(c.kind)) return null;
    return <MenuRow label="Wrap text" hint={c.wrap ? '✓' : undefined} onClick={() => {
      const d = docRef.current;
      const looks = lookWrap(d.looks, c.name, !c.wrap);
      commit({ ...d, table: withLooks(d.table, looks), looks });
      closeFloat();
    }} />;
  };

  const keysBack = () => requestAnimationFrame(() => (pickRef.current ? focusKeys() : rest()));

  // A table the focus left lets its pick go quiet, but keeps it.
  const [holding, setHolding] = useState(false);

  if (!table.columns.length) return <div className="tbl-empty">This table has no rows yet.</div>;

  const start = preview ? 0 : Math.max(0, Math.floor(view.top / rowH) - SPARE);
  const end = inline ? order.length : preview ? Math.min(order.length, PREVIEW_ROWS) : Math.min(order.length, Math.ceil((view.top + view.height) / rowH) + SPARE);
  const choices = filterChoices(table);
  // Where the row number and the first column end, so a wide column's name stays in view beside them.
  const firstName = table.columns[first]?.name ?? '';
  const stuckAt = rnW + (sized[firstName] ?? natural.px.get(firstName) ?? 160);
  const filtering = Object.values(picked).some((v) => v.length);
  const filteredBy = Object.entries(picked).filter(([, v]) => v.length).map(([c]) => table.columns[Number(c)]?.name).filter(Boolean);
  const filterLabel = !filteredBy.length ? 'Filter' : `Filtered by ${filteredBy.slice(0, 2).join(' and ')}${filteredBy.length > 2 ? ` and ${filteredBy.length - 2} more` : ''}`;
  const total = table.rows.length;
  const count = order.length === total ? rowsWord(total) : `${order.length.toLocaleString()} of ${rowsWord(total)}`;
  const toggle = (col: number, value: string) => setPicked((p) => {
    const now = new Set(p[col] ?? []);
    if (now.has(value)) now.delete(value); else now.add(value);
    return { ...p, [col]: [...now] };
  });
  const sortBy = (col: number) => setSort((s) => (!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));
  const onRoot = (e: React.KeyboardEvent) => {
    const at = e.target as HTMLElement;
    // Enter presses a button here even where the view around the table keeps Enter for itself.
    if (e.key === 'Enter' && at.tagName === 'BUTTON') { e.preventDefault(); e.stopPropagation(); at.click(); return; }
    // The table itself holds the keys after Escape: undo still works, and an arrow picks a cell again.
    if (at !== root.current || !hands) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && /^z$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); focusKeys(); }
    else if (meta && /^y$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); redo(); focusKeys(); }
    else if (/^(Arrow|Tab$|Home$|End$|Page|Enter$|F2$|Delete$|Backspace$)/.test(e.key) && pick) { focusKeys(); onKeys(e as React.KeyboardEvent<HTMLTextAreaElement>); }
    else if (/^(Arrow|Tab$|Home$|End$|Page)/.test(e.key) && order.length) {
      e.preventDefault(); e.stopPropagation();
      goTo({ a: { r: 0, c: first }, b: { r: 0, c: first } }); focusKeys();
    }
  };

  const editingRow = editing ? table.rows[order[editing.r]] : null;
  const sheetRow = sheet !== null ? table.rows[order[sheet]] : null;
  const n = sel ? sel.r1 - sel.r0 + 1 : 0;
  const atValue = pick ? table.rows[order[pick.a.r]]?.[pick.a.c] ?? '' : '';
  const atRow = pick ? table.rows[order[pick.a.r]] : undefined;
  const atLink = pick && atRow ? cellLink(table, atRow, pick.a.c) : null;
  const floatCol = float?.col !== undefined ? table.columns[float.col] : null;

  return (
    <div className={`tbl tbl-${mode}${holding ? ' holding' : ''}${editable && !sort ? ' rows-move' : ''}${editable ? ' cols-move' : ''}${drop ? ' moving' : ''}`} ref={root} onKeyDown={onRoot} data-own-escape={owns ? '' : undefined} tabIndex={hands ? -1 : undefined}
      onFocus={() => setHolding(false)}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setHolding(true); }}>
      {!preview && (
        <div className="tbl-bar">
          <label className="tbl-search">{SEARCH}
            <input type="search" value={query} placeholder={`Search ${rowsWord(total)}`} onChange={(e) => setQuery(e.target.value)}
              data-own-escape={query ? '' : undefined}
              onKeyDown={(e) => { if (e.key === 'Escape' && !query) { e.preventDefault(); e.stopPropagation(); passEscape(); } }} />
          </label>
          {choices.length > 0 && (
            <Menu label={filterLabel} on={filtering} onEscape={keysBack} icon={glyph('M2.5 4h11M4.5 8h7M6.5 12h3')}>
              {() => <FilterMenu table={table} choices={choices} picked={picked} onToggle={toggle} onClear={() => setPicked({})} />}
            </Menu>
          )}
          <Menu label={sort && table.columns[sort.col] ? `Sorted by ${table.columns[sort.col].name}, ${sortWords(table.columns[sort.col], sort.dir).toLowerCase().replace(/^a to z$/, 'A to Z').replace(/^z to a$/, 'Z to A')}` : 'Sort'} on={!!sort} onEscape={keysBack} icon={glyph('M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5')}>
            {(close) => <>
              <button type="button" className={`when-row${!sort ? ' on' : ''}`} onClick={() => { setSort(null); close(); }}><span className="when-row-label">As the file has it</span></button>
              {table.columns.map((c, i) => <button key={i} type="button" className={`when-row${sort?.col === i ? ' on' : ''}`} onClick={() => { sortBy(i); if (sort?.col !== i) close(); }}>
                <span className="when-row-label">{c.name}</span>
                {sort?.col === i && <span className="when-row-hint">{sortWords(c, sort.dir)}</span>}
              </button>)}
            </>}
          </Menu>
          {problem
            ? <span className="tbl-problem" role="alert">
              <span className="tbl-problem-dot" aria-hidden="true" />{problem.error}
              {problem.stale && <button type="button" className="tbl-btn" onClick={() => void flush(true)}>Save mine</button>}
              {problem.stale && onReload && <button type="button" className="tbl-btn" onClick={() => { unsaved.current = null; onReload(); }}>Load the new one</button>}
              {!problem.stale && <button type="button" className="tbl-btn" onClick={() => void flush()}>Try again</button>}
            </span>
            : <span className="tbl-count">{sel && cellsIn(sel) > 1 ? `${wholeRows ? rowsWord(n) : `${cellsIn(sel).toLocaleString()} cells`} picked · ` : ''}{count}{mode === 'full' ? ` · ${table.columns.length} ${table.columns.length === 1 ? 'column' : 'columns'}` : ''}</span>}
          {room && <LiveFaces session={room} />}
        </div>
      )}
      <div className="tbl-frame">
      {hands && <textarea ref={keys} className="tbl-keys" aria-label="Table" inputMode="none" tabIndex={0} defaultValue=" " data-keys-only=""
        onKeyDown={onKeys} onCopy={(e) => onCopy(e)} onCut={(e) => (editable ? onCopy(e, true) : onCopy(e))} onPaste={onPaste}
        onChange={(e) => { e.target.value = ' '; }} />}
      <div className="tbl-scroll" ref={box} style={{ ['--tbl-stuck' as string]: `${stuckAt}px`, ['--tbl-rn-w' as string]: `${rnW}px`, ['--tbl-row-h' as string]: `${rowH}px` }} onPointerDown={onDown} onDoubleClick={onDouble} onContextMenu={onContext}
        onClickCapture={(e) => {
          if (hands && (e.target as HTMLElement).closest('.tbl-grid a') && !linkOpens.current) e.preventDefault();
          linkOpens.current = false;
          // A click that came with no press first (a screen reader, a script) still picks its cell.
          if (hands && !pressed.current) { const hit = atOf(e.target); if (hit && hit.kind === 'cell') { setPick(pickFor('cell', hit.at, e.shiftKey)); focusKeys(); } }
          pressed.current = false;
        }}>
        <div className="tbl-grid" role="table" style={{ gridTemplateColumns: inline && !table.ranked ? template : `${rnW}px ${template}` }}>
          <div className="tbl-tr" role="row">
            {table.ranked
              ? <button type="button" role="columnheader" className={`tbl-th tbl-rn${sort?.col === 0 ? ' sorted' : ''}`} disabled={preview && !inline} onClick={() => sortBy(0)} title={table.columns[0].name}>#</button>
              : !inline && <div className={`tbl-th tbl-rn${hands && wholeRows && wholeCols ? ' sel' : ''}`} onClick={hands && order.length ? () => { setPick({ a: { r: 0, c: first }, b: { r: order.length - 1, c: last } }); focusKeys(); } : undefined} />}
            {table.columns.map((c, i) => {
              if (table.ranked && i === 0) return null;
              const arrow = sort?.col === i && <span className="tbl-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
              if (!hands) {
                return <button key={i} type="button" role="columnheader" className={`tbl-th${c.kind === 'number' ? ' tbl-num' : ''}${sort?.col === i ? ' sorted' : ''}`}
                  aria-sort={sort?.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  disabled={preview && !inline} onClick={() => sortBy(i)}>
                  <span className="tbl-ell">{c.name}</span>{arrow}
                </button>;
              }
              const on = !!sel && wholeCols && i >= sel.c0 && i <= sel.c1;
              return <div key={i} role="columnheader" data-hc={i} className={`tbl-th${c.kind === 'number' ? ' tbl-num' : ''}${sort?.col === i ? ' sorted' : ''}${on ? ' sel' : ''}`}
                aria-sort={sort?.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {renaming === i
                  ? <input className="tbl-rename" autoFocus defaultValue={c.name} aria-label="Column name" data-own-escape=""
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                      if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).value = c.name; (e.target as HTMLInputElement).blur(); }
                    }}
                    onBlur={(e) => {
                      setRenaming(null);
                      const d = docRef.current;
                      const t = renameColumn(d.table, i, e.target.value);
                      changeColumns(t, i, lookRenameColumn(d.looks, d.table.columns[i].name, t.columns[i].name));
                      requestAnimationFrame(focusKeys);
                    }} />
                  : <><span className="tbl-ell" title={typeName(c.kind)}><KindIcon kind={c.kind} />{c.name}</span>{arrow}</>}
                <button type="button" className="tbl-th-menu" tabIndex={-1} aria-label={`${c.name} column`} onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    if (open.current) endEdit(open.current.pop === 'tag' ? null : open.current.draft);
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setFloat({ x: r.left, y: r.bottom + 4, col: i });
                  }}>{CARET}</button>
                <span className="tbl-resize" aria-hidden="true" onPointerDown={(e) => onGrip(e, i)} onDoubleClick={(e) => { e.stopPropagation(); fitColumn(i); }} />
              </div>;
            })}
          </div>
          {start > 0 && <div className="tbl-gap" style={{ height: start * rowH }} />}
          {order.slice(start, end).map((i, k) => {
            const r = start + k;
            const row = table.rows[i];
            if (!row) return null;
            const on = !!sel && r >= sel.r0 && r <= sel.r1;
            return <Row key={i} table={table} row={row} r={r} n={inline ? null : r + 1} hands={hands}
              c0={on ? sel!.c0 : -1} c1={on ? sel!.c1 : -2} at={pick && pick.a.r === r ? pick.a.c : -1} whole={on && wholeRows} />;
          })}
          {!preview && end < order.length && <div className="tbl-gap" style={{ height: (order.length - end) * rowH }} />}
          {editable && end >= order.length && (
            <button type="button" className="tbl-add" onClick={() => addRowAt(order.length, true)} title={`New row (Shift+Enter)`}>
              <span className="tbl-add-in"><span className="tbl-add-plus" aria-hidden="true">+</span>New row</span>
            </button>
          )}
        </div>
        {!order.length && <div className="tbl-none">{total ? 'No rows match.' : 'This table has no rows yet.'}</div>}
        {drop && <div className={`tbl-drop ${drop.kind}`} aria-hidden="true"
          style={drop.kind === 'row'
            ? { top: drop.at - 1, width: (box.current?.querySelector('.tbl-grid') as HTMLElement | null)?.offsetWidth }
            : { left: drop.at - 1, height: (box.current?.querySelector('.tbl-grid') as HTMLElement | null)?.offsetHeight }} />}
        {peek && one && (
          <div className="tbl-peek" title={editable ? 'Double-click or press Enter to edit' : undefined}
            style={{ left: peek.left, width: peek.w, minHeight: rowH, maxHeight: peek.most, ...(peek.up ? { top: peek.top + rowH, transform: 'translateY(-100%)' } : { top: peek.top }) }}
            // A click that selected no words goes to the cell under it, so the box never stands in the way of the next row.
            onClick={(e) => {
              if (window.getSelection()?.toString()) return;
              const at = e.currentTarget;
              at.style.pointerEvents = 'none';
              const hit = atOf(document.elementFromPoint(e.clientX, e.clientY));
              at.style.pointerEvents = '';
              if (hit?.kind === 'cell' && (hit.at.r !== one.r || hit.at.c !== one.c)) { goTo({ a: hit.at, b: hit.at }); focusKeys(); }
            }}
            onDoubleClick={(e) => { e.stopPropagation(); startEdit(one); }}>{peek.text}</div>
        )}
        {editing && place && editingRow && (
          editing.pop
            ? <div className={`tbl-pop${place.up ? ' up' : ''}`} style={{ left: place.left, top: place.up ? undefined : place.top + rowH - 1, bottom: place.up ? `calc(100% - ${place.top + 1}px)` : undefined, width: place.w }}>
              {editing.pop === 'tag'
                ? <TagPicker column={table.columns[editing.c]} value={editingRow[editing.c] ?? ''} typed={editing.typed ? editing.draft : undefined}
                  hands={tagHands(editing.c)} onPick={(v, move) => endEdit(v, move)} onClose={() => endEdit(null)} />
                : <DatePicker value={editingRow[editing.c] ?? ''} column={table.rows.map((row) => row[editing.c] ?? '')}
                  onDraft={(v) => { if (open.current) open.current = { ...open.current, draft: v }; }}
                  onPick={(v, move) => endEdit(v, move)} onClose={() => endEdit(null)} />}
            </div>
            : <div className="tbl-edit" style={{ left: place.left, top: place.top, width: place.w }}>
              <GrowingText className="tbl-edit-box" value={editing.draft} autoFocus caretAtEnd readOnly={!editable} label={table.columns[editing.c].name}
                onChange={(v) => setEditing((x) => (x ? { ...x, draft: v } : x))}
                // Rows copied from a spreadsheet into an empty cell go across the table, not into the one cell.
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text/plain');
                  if (!editable || editing.draft !== '' || !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
                  e.preventDefault();
                  endEdit(null);
                  paste(text);
                }}
                onBlur={() => endEdit(editable ? editing.draft : null)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') { e.preventDefault(); endEdit(null); }
                  else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); endEdit(editable ? editing.draft : null, e.metaKey || e.ctrlKey ? undefined : 'down'); }
                  else if (e.key === 'Tab') { e.preventDefault(); endEdit(editable ? editing.draft : null, e.shiftKey ? 'left' : 'right'); }
                }} />
            </div>
        )}
      </div>
      {sheet !== null && sheetRow && (
        <RowSheet table={table} row={sheetRow} place={sheet} count={order.length} editable={editable} from={pick?.a.c} tagHands={tagHands} onUndo={(again) => (again ? redo() : undo())}
          onWrite={(c, v) => writeAt([{ r: sheet, c, v }])}
          onStep={(d) => { const r = Math.max(0, Math.min(order.length - 1, sheet + d)); setSheet(r); goTo({ a: { r, c: pick?.a.c ?? first }, b: { r, c: pick?.a.c ?? first } }); }}
          onClose={() => { setSheet(null); requestAnimationFrame(focusKeys); }} />
      )}
      </div>
      {float && (floatCol && float.page === 'type'
        ? <FloatMenu x={float.x} y={float.y} onClose={() => setFloat(null)}>
          <button type="button" className="when-head tbl-menu-back" onClick={() => setFloat({ ...float, page: undefined })}>{glyph('M10 4L6 8l4 4')}{floatCol.name}</button>
          {TYPES.map(([kind, label]) => {
            const on = (floatCol.kind === 'name' ? 'text' : floatCol.kind) === kind;
            return <button key={kind} type="button" role="menuitemradio" aria-checked={on} className={`when-row${on ? ' on' : ''}`}
              onClick={() => { setKind(float.col!, kind); closeFloat(); }}>
              <KindIcon kind={kind} /><span className="when-row-label">{label}</span>{on && <span className="when-row-hint">✓</span>}
            </button>;
          })}
        </FloatMenu>
        : floatCol
        ? <FloatMenu x={float.x} y={float.y} onClose={() => setFloat(null)}>
          {(['asc', 'desc'] as const).map((dir) => <MenuRow key={dir} label={`Sort ${sortWords(floatCol, dir)}`} onClick={() => { setSort({ col: float.col!, dir }); closeFloat(); }} />)}
          {sort?.col === float.col && <MenuRow label="Stop sorting" onClick={() => { setSort(null); closeFloat(); }} />}
          {editable && <>
            <span className="when-sep" />
            <MenuRow label="Rename" onClick={() => { setRenaming(float.col!); closeFloat(); }} />
            {!(table.ranked && float.col === 0) && <MenuRow label="Type" hint={`${typeName(floatCol.kind)} ›`} onClick={() => setFloat({ ...float, page: 'type' })} />}
            <MenuRow label="Insert column left" onClick={() => { const at = Math.max(first, float.col!); changeColumns(addColumn(docRef.current.table, at), at); setRenaming(at); closeFloat(); }} />
            <MenuRow label="Insert column right" onClick={() => { const at = float.col! + 1; changeColumns(addColumn(docRef.current.table, at), at); setRenaming(at); closeFloat(); }} />
            <MenuRow label={'Move left'} hint={`${ALT}←`} off={float.col! <= first} onClick={() => { const c = float.col!; closeFloat(); moveColsTo(c, c, c - 1); }} />
            <MenuRow label={'Move right'} hint={`${ALT}→`} off={float.col! >= last} onClick={() => { const c = float.col!; closeFloat(); moveColsTo(c, c, c + 2); }} />
            <MenuRow label="Fit to its contents" onClick={() => { fitColumn(float.col!); closeFloat(); }} />
            {wrapRow(float.col!)}
            <span className="when-sep" />
            <MenuRow label="Delete column" off={table.columns.length - first <= 1} onClick={() => { changeColumns(dropColumn(docRef.current.table, float.col!)); closeFloat(); }} />
          </>}
          {!editable && <MenuRow label="Fit to its contents" onClick={() => { fitColumn(float.col!); closeFloat(); }} />}
          {!editable && wrapRow(float.col!)}
        </FloatMenu>
        : <FloatMenu x={float.x} y={float.y} onClose={() => setFloat(null)}>
          <MenuRow label="Open row" hint="Space" onClick={() => { if (pick) setSheet(pick.a.r); closeFloat(); }} />
          {pick && <MenuRow label={editable ? 'Edit cell' : 'Read cell'} hint="↵" onClick={() => { closeFloat(); startEdit(pick.a); }} />}
          <MenuRow label="Copy" hint={`${CMD}C`} onClick={() => { focusKeys(); document.execCommand('copy'); closeFloat(); }} />
          {editable && <MenuRow label="Paste" hint={`${CMD}V`} onClick={() => {
            closeFloat();
            void navigator.clipboard?.readText?.().then((t) => paste(t)).catch(() => setProblem({ error: `Press ${CMD}V to paste here.` }));
          }} />}
          {atLink && (
            <MenuRow label={atLink.href.startsWith('mailto:') ? 'Write an email' : 'Open link'} hint={`${CMD}click`} onClick={() => {
              closeFloat();
              window.open(atLink.href, '_blank', 'noreferrer');
            }} />
          )}
          {onComment && atValue.trim() && <MenuRow label="Comment" onClick={() => { onComment(atValue.trim()); closeFloat(); }} />}
          {editable && sel && <>
            <span className="when-sep" />
            <MenuRow label="Insert row above" onClick={() => { closeFloat(); addRowAt(sel.r0); }} />
            <MenuRow label="Insert row below" hint="⇧↵" onClick={() => { closeFloat(); addRowAt(sel.r1 + 1); }} />
            <MenuRow label={'Move up'} hint={sort ? 'Sorted' : `${ALT}↑`} off={!!sort || sel.r0 <= 0} onClick={() => { closeFloat(); moveRowsTo(sel.r0 - 1); }} />
            <MenuRow label={'Move down'} hint={sort ? 'Sorted' : `${ALT}↓`} off={!!sort || sel.r1 >= order.length - 1} onClick={() => { closeFloat(); moveRowsTo(sel.r1 + 2); }} />
            <MenuRow label="Clear" hint="⌫" onClick={() => { closeFloat(); clearPicked(); focusKeys(); }} />
            <span className="when-sep" />
            <MenuRow label={n > 1 ? `Delete ${n} rows` : 'Delete row'} onClick={() => { closeFloat(); dropPicked(); focusKeys(); }} />
          </>}
        </FloatMenu>
      )}
      {preview && total > PREVIEW_ROWS && onShowAll && (
        <button type="button" className="tbl-showall" onClick={onShowAll}>Show all {total.toLocaleString()} rows</button>
      )}
    </div>
  );
}
