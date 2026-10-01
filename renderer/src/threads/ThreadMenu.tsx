// THE THREAD'S MENU: the square three-dot button at the right of the top bar,
// beside the Summary button, and the small menu it opens.
//
// Her words on the bar it replaced (w-e731ca9376, 2026-10-01): "This area is a
// bit cluttered. I wonder if things like viewing the code, opening the
// terminal, and marking done would be better placed in maybe a little
// three-dot menu." Measured before, at 1440: the terminal mark at 1091..1125,
// the state word, the Summary button at 1219..1340, the Done mark at
// 1364..1398, and the change figures hanging under them. Now the bar's right
// side is the Summary button and these dots, and the three verbs are rows.
//
// EVERY KEY STILL WORKS AND EVERY ROW SAYS ITS KEY. E finishes a thread and ⌘J
// shows its terminal, from anywhere on the page, exactly as before (App.tsx);
// the rows print them so the menu teaches the keys rather than hiding them.
// The code row has no key, so it prints what the run changed instead.
//
// ONLY WHAT APPLIES. A run that changed no code has no code row, rather than a
// row that opens nothing. A conversation with a person has no code and no
// terminal, so its menu is Mark done alone, and with nothing left to offer
// (a finished conversation) no dots are drawn at all.
//
// THE APP'S OWN POPOVER, not a new one: `.th-menu` and `.row-i` from pages.css,
// the dark card with square corners whose rows light on hover. summary.css
// only places it under the dots.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

export type ThreadMenuRowId = 'code' | 'terminal' | 'done';
export interface ThreadMenuRow { id: ThreadMenuRowId; label: string; key: string | null }

/**
 * Which rows a thread's menu offers, in the order they are drawn. `terminal`
 * is null where the thread has none, else whether it is open now, so the row
 * says what pressing it will do: a row called Open terminal that closed an open
 * one would be lying (TaskTerminal.tsx says the same of ⌘K's row).
 */
export function threadMenuRows({ change, terminal, finish }: {
  change: boolean;
  terminal: 'open' | 'closed' | null;
  finish: boolean;
}): ThreadMenuRow[] {
  const rows: ThreadMenuRow[] = [];
  if (change) rows.push({ id: 'code', label: 'View code changes', key: null });
  if (terminal) rows.push({ id: 'terminal', label: terminal === 'open' ? 'Hide terminal' : 'Open terminal', key: '⌘J' });
  if (finish) rows.push({ id: 'done', label: 'Mark done', key: 'E' });
  return rows;
}

/* ------------------------------------------------------------------ marks */

const mark = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

function CodeMark() {
  return <svg {...mark}><path d="m8.5 7-5 5 5 5" /><path d="m15.5 7 5 5-5 5" /></svg>;
}
function TerminalMark() {
  return <svg {...mark}><rect x="3" y="4" width="18" height="16" /><path d="m7 9 3 3-3 3m6 0h4" /></svg>;
}
/** The two ticks the Done mark was drawn with, now its row's mark. */
function DoneMark() {
  return <svg {...mark}><path d="m3 13 3.6 3.6L13.4 9" /><path d="m10.6 13 3.6 3.6L21 9" /></svg>;
}
const MARKS: Record<ThreadMenuRowId, typeof CodeMark> = { code: CodeMark, terminal: TerminalMark, done: DoneMark };

/** Three square dots, because every shape in this skin is square. */
function Dots() {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2.5" y="7" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="11.5" y="7" width="2" height="2" /></svg>;
}

/* ------------------------------------------------------------------- list */

/** The open menu: one row per verb, its mark, its words, and its key or detail. */
export function ThreadMenuList({ rows, change, onPick }: {
  rows: ThreadMenuRow[];
  /** What the run changed, drawn by Focus ("+873 −41 in 7 files"). */
  change?: ReactNode;
  onPick: (id: ThreadMenuRowId) => void;
}) {
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Thread actions">
      {rows.map((row) => {
        const Mark = MARKS[row.id];
        return (
          <button key={row.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => onPick(row.id)}>
            <span className="ico"><Mark /></span>
            <span className="ts-more-label">{row.label}</span>
            {row.id === 'code' ? change : row.key && <kbd>{row.key}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- button */

export function ThreadMenu({ change = null, onViewChange, terminal = null, onToggleTerminal, onFinish = null }: {
  /** The change figures, or null when this run changed no code. */
  change?: ReactNode | null;
  onViewChange?: () => void;
  terminal?: 'open' | 'closed' | null;
  onToggleTerminal?: () => void;
  /** Null on a thread that is already done. */
  onFinish?: (() => void) | null;
}) {
  const rows = threadMenuRows({ change: !!change, terminal, finish: !!onFinish });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  // CLOSED BY ESCAPE AND BY A PRESS ANYWHERE OUTSIDE IT. Both listen first, on
  // the window's capture, and Escape stops there: the window's own Escape
  // (App.tsx) means "go back", and one press closing the menu AND the thread
  // would take her somewhere she did not ask to go. The arrows are the menu's
  // while it is open, for the same reason: in a thread they otherwise walk an
  // agent's options. Enter on a row is left to the row and kept from the
  // window, which reads Enter as "send the picked option".
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
      const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0
          : e.key === 'End' ? items.length - 1
            : e.key === 'ArrowDown' ? (at + 1) % items.length
              : (at <= 0 ? items.length - 1 : at - 1);
        items[next].focus();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && wrap.current?.contains(document.activeElement)) { e.stopImmediatePropagation(); return; }
      if (e.key === 'Tab') close(false);
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys, true);
    };
  }, [open, close]);

  // The first row takes the focus as the menu opens, so the arrows work at once.
  useEffect(() => {
    if (open) wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Enter, Space or the down arrow on the dots opens the menu. Handled here and
  // stopped, because the window reads Enter on a thread as "send the picked
  // option" and would cancel the button's own press.
  const openFromKeys = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const pick = (id: ThreadMenuRowId) => {
    close(id === 'terminal');
    if (id === 'code') onViewChange?.();
    else if (id === 'terminal') onToggleTerminal?.();
    else onFinish?.();
  };

  if (!rows.length) return null;
  return (
    <span className="ts-more-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="ts-more"
        aria-label="More actions"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={openFromKeys}
      >
        <Dots />
      </button>
      {open && <ThreadMenuList rows={rows} change={change} onPick={pick} />}
    </span>
  );
}
