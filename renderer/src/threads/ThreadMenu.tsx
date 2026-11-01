// THE THREAD'S MENU: the square three-dot button at the right of the top bar,
// beside the Summary button, and the small menu it opens.
//
// The bar it replaced (2026-10-01) was cluttered, so viewing the code,
// opening the terminal and marking done moved into a small three-dot menu.
// Measured before, at 1440: the terminal mark at 1091..1125,
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
// DONE CAME BACK OUT OF THE MENU (w-bca8a6466f, 2026-10-26). Her words: "We
// need a button in the top right to be able to easily mark threads as done;
// currently it's very non-discoverable for such a key feature." Of six corners
// drawn she first picked Done joined to the dots, then asked the same night for
// "the one that was separate instead": Done in a box of its own, with the
// double tick and the word, just left of the dots. So `done` stays in
// threadMenuRows as the one place its words and key are said, and the button
// draws it rather than a row. A conversation with a person gets Done alone; a
// finished thread gets the dots alone.
//
// THE APP'S OWN POPOVER, not a new one: `.th-menu` and `.row-i` from pages.css,
// the dark card with square corners whose rows light on hover. summary.css
// only places it under the dots.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { chord } from '../this-keyboard';
import { DONE } from '../done-word';
import { PlaceButton, type PlaceFacts } from './PlaceButton';
import { nameWait } from '../../../shared/thread-waits.mjs';

export type ThreadMenuRowId = 'run' | 'code' | 'terminal' | 'later' | 'pin' | 'rename' | 'give' | 'wait' | 'shipped' | 'close-task' | 'done';

/**
 * WHERE THIS THREAD RUNS: in the cloud now (`cloud`), free to go there
 * (`here`), kept on this Mac by her (`kept`) or by the cloud handing it back
 * (`needs`), or running here where the cloud could take it now (`move`). The
 * top bar's PlaceButton draws it; ⌘K offers PLACE_ROW's words.
 */
export type ThreadPlace = 'cloud' | 'here' | 'kept' | 'move' | 'needs';
export const PLACE_ROW: Record<ThreadPlace, { label: string; detail: string }> = {
  cloud: { label: 'Run on this Mac', detail: 'In the cloud now' },
  here: { label: 'Keep on this Mac', detail: 'Cloud allowed' },
  kept: { label: 'Run on the cloud', detail: 'This Mac only' },
  move: { label: 'Move to the cloud', detail: 'On this Mac now' },
  needs: { label: 'Run on the cloud', detail: 'Needs this Mac' },
};
/** What picking does: keep it on this Mac (true), let the cloud have it (false), or move its run now. */
export type PlaceAct = boolean | 'move';
export const placeAct = (place: ThreadPlace): PlaceAct => (place === 'move' ? 'move' : place !== 'kept' && place !== 'needs');
export interface ThreadMenuRow { id: ThreadMenuRowId; label: string; key: string | null; detail?: string }

/**
 * Which rows a thread's menu offers, in the order they are drawn. `terminal`
 * is null where the thread has none, else whether it is open now, so the row
 * says what pressing it will do: a row called Open terminal that closed an open
 * one would be lying (TaskTerminal.tsx says the same of ⌘K's row).
 *
 * RUN NOW comes first and only on a task that is waiting its turn and has not
 * been pushed already (w-87ff499077). Raising a task's tag could not start it:
 * a project's place in the order outweighs any tag, and only Urgent could take
 * a running slot. This row is the one-time "this task, now" that was missing;
 * supervisor.runNow says what it does.
 *
 * PIN THREAD keeps it at the top of the list (w-20323283e6), just above Mark
 * done. `pin` is null where a thread cannot be pinned, else whether it is now,
 * so the row says what pressing it does.
 *
 * LATER IS A ROW ONLY WHERE THERE IS NO L (QA batch 005, F-117). On the laptop
 * L puts a thread off from anywhere on the page, so a row would be a second
 * door to one verb; on a phone there was no door at all and the Later tab
 * could not be filled. It names no key for the same reason.
 */
export function threadMenuRows({ change, terminal, finish, runNow = false, later = false, pin = null, rename = false, give = false, wait = false, shipped = null, closeTask = false }: {
  /** An open task between people: E only clears it from your Needs you, so closing it is its own row. */
  closeTask?: boolean;
  /** Whether a person has said it shipped, or null where the team would not see that. */
  shipped?: 'marked' | 'unmarked' | null;
  wait?: boolean | 'blocked';
  rename?: boolean;
  change: boolean;
  terminal: 'open' | 'closed' | null;
  finish: boolean;
  runNow?: boolean;
  later?: boolean;
  pin?: 'pinned' | 'unpinned' | null;
  give?: boolean;
}): ThreadMenuRow[] {
  const rows: ThreadMenuRow[] = [];
  if (runNow) rows.push({ id: 'run', label: 'Run now', key: null });
  if (change) rows.push({ id: 'code', label: 'View code changes', key: null });
  if (terminal) rows.push({ id: 'terminal', label: terminal === 'open' ? 'Hide terminal' : 'Open terminal', key: '⌘J' });
  if (later) rows.push({ id: 'later', label: 'Later', key: null });
  if (rename) rows.push({ id: 'rename', label: 'Rename', key: null });
  if (pin) rows.push({ id: 'pin', label: pin === 'pinned' ? 'Unpin thread' : 'Pin thread', key: null });
  if (give) rows.push({ id: 'give', label: 'Give it to someone else…', key: null });
  if (wait) rows.push({ id: 'wait', label: wait === 'blocked' ? 'Blocked by…' : 'Waits on…', key: null });
  if (shipped) rows.push({ id: 'shipped', label: shipped === 'marked' ? 'Not shipped after all' : 'Mark as shipped', key: null });
  if (closeTask) rows.push({ id: 'close-task', label: 'Close task', key: null, detail: 'For both of you' });
  if (finish) rows.push({ id: 'done', label: 'Mark done', key: 'E' });
  return rows;
}

/** Done, which the corner draws as its own half, and the rows left for the menu. */
export function splitDone(rows: ThreadMenuRow[]): { done: ThreadMenuRow | null; menu: ThreadMenuRow[] } {
  return { done: rows.find((r) => r.id === 'done') ?? null, menu: rows.filter((r) => r.id !== 'done') };
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
/** A play mark with a bar in front of it: start this one, ahead of the line. */
function RunMark() {
  return <svg {...mark}><path d="M5 5v14" /><path d="m9 5 10 7-10 7z" /></svg>;
}
/** This Mac: a square screen on its stand. */
export function MacMark({ size = 16 }: { size?: number } = {}) {
  return <svg {...mark} width={size} height={size}><rect x="3" y="5" width="18" height="12" /><path d="M8 21h8M12 17v4" /></svg>;
}
export function CloudMark({ size = 16 }: { size?: number } = {}) {
  return <svg {...mark} width={size} height={size}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>;
}
/** A square-headed pin, because every shape in this skin is square. */
export function PinMark({ size = 16, className }: { size?: number; className?: string }) {
  return <svg {...mark} width={size} height={size} className={className}><path d="M8 3h8l-1.5 6 3.5 3.5H6L9.5 9z" /><path d="M12 12.5V21" /></svg>;
}
/** A clock, the mark Later wears everywhere else in the app. */
function LaterMark() {
  return <svg {...mark}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
}
/** A person and the way out to them. */
function GiveMark() {
  return <svg {...mark}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5 1.4 0 2.7.4 3.7 1" /><path d="M15 17h6m-2.5-2.5L21 17l-2.5 2.5" /></svg>;
}
/** A square box with an arrow going out of it. */
function ShippedMark() {
  return <svg {...mark}><path d="M4 9h16v11H4z" /><path d="M12 15V3m-3.5 3.5L12 3l3.5 3.5" /></svg>;
}
/** An hourglass, squared off. */
function WaitMark() {
  return <svg {...mark}><path d="M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4" /></svg>;
}
function RenameMark() {
  return <svg {...mark}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
}
const MARKS: Record<ThreadMenuRowId, typeof CodeMark> = { run: RunMark, code: CodeMark, terminal: TerminalMark, later: LaterMark, pin: () => <PinMark />, rename: RenameMark, give: GiveMark, wait: WaitMark, shipped: ShippedMark, 'close-task': DoneMark, done: DoneMark };

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
            {row.id === 'code' ? change : row.key ? <kbd>{chord(row.key)}</kbd> : row.detail && <kbd>{row.detail}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

function BlockWords({ onPick }: { onPick: (id: string) => void }) {
  const [words, setWords] = useState('');
  const id = nameWait(words);
  return <label className="row-i ts-more-row ts-wait-words">
    <span className="ico"><WaitMark /></span>
    <input role="menuitem" tabIndex={-1} placeholder="Or type what it waits on" aria-label="Blocked by someone or something you type" value={words}
      onChange={(e) => setWords(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && id) { e.preventDefault(); onPick(id); } }} />
  </label>;
}

/* ----------------------------------------------------------------- button */

export function ThreadMenu({ change = null, onViewChange, terminal = null, onToggleTerminal, onFinish = null, onCloseTask = null, onReopen = null, onRunNow = null, onLater = null, pinned = null, onPin, place = null, placeFacts = {}, onPlace, giveTo = [], onGive, onRename = null, shipped = null, onShipped, waitChoices = [], waitsNow = false, onWait, blocks = false }: {
  /** Whether a person has said it shipped, or null where the team would not see that. */
  shipped?: boolean | null;
  onShipped?: (on: boolean) => void;
  /** What it could wait on, people first; the row is only there when something is. */
  waitChoices?: readonly { id: string; label: string }[];
  waitsNow?: boolean;
  /** A task: its waits are blocks, said as such. */
  blocks?: boolean;
  /** Null stops waiting. */
  onWait?: (id: string | null) => void;
  /** Who it can be handed on to; the row is only there when somebody is. */
  giveTo?: readonly { id: string; name: string }[];
  onGive?: (to: { id: string; name: string }) => void;
  /** Opens the name box, on a conversation, whose bar has no name to press. */
  onRename?: (() => void) | null;
  /** The change figures, or null when this run changed no code. */
  change?: ReactNode | null;
  onViewChange?: () => void;
  terminal?: 'open' | 'closed' | null;
  onToggleTerminal?: () => void;
  /** Null on a thread that is already done. */
  onFinish?: (() => void) | null;
  /** Non-null on an open task between people: closes it for both. */
  onCloseTask?: (() => void) | null;
  /** On a done thread: opens it again, where Done sits on an open one. */
  onReopen?: (() => void) | null;
  /** Non-null only on a task that is waiting its turn and not yet pushed. */
  onRunNow?: (() => void) | null;
  /** Opens the Later picker. Non-null only where there is no keyboard to press L on. */
  onLater?: (() => void) | null;
  /** Whether the thread is pinned now, or null where it cannot be. */
  pinned?: boolean | null;
  onPin?: (pin: boolean) => void;
  /** Where it runs, or null where the cloud could never run it; drawn as PlaceButton. */
  place?: ThreadPlace | null;
  placeFacts?: Omit<PlaceFacts, 'place'>;
  /** True keeps it on this Mac (moving it here if it is in the cloud). */
  onPlace?: (keep: PlaceAct) => void;
}) {
  const { done, menu: rows } = splitDone(threadMenuRows({ change: !!change, terminal, finish: !!onFinish, runNow: !!onRunNow, later: !!onLater, rename: !!onRename, pin: pinned === null || !onPin ? null : pinned ? 'pinned' : 'unpinned', give: giveTo.length > 0 && !!onGive && !!onFinish, wait: waitChoices.length > 0 && !!onWait && !!onFinish ? (blocks ? 'blocked' : true) : false, shipped: shipped === null || !onShipped ? null : shipped ? 'marked' : 'unmarked', closeTask: !!onCloseTask }));
  const [open, setOpen] = useState(false);
  const [giving, setGiving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setGiving(false);
    setWaiting(false);
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
      // Typing in the menu's own box is typing.
      if (document.activeElement?.tagName === 'INPUT' && wrap.current?.contains(document.activeElement)) return;
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
  }, [open, giving, waiting]);

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
    if (id === 'give') { setGiving(true); return; }
    if (id === 'wait') { setWaiting(true); return; }
    close(id === 'terminal');
    if (id === 'run') onRunNow?.();
    else if (id === 'code') onViewChange?.();
    else if (id === 'terminal') onToggleTerminal?.();
    else if (id === 'later') onLater?.();
    else if (id === 'rename') onRename?.();
    else if (id === 'pin') onPin?.(!pinned);
    else if (id === 'shipped') onShipped?.(!shipped);
    else if (id === 'close-task') onCloseTask?.();
    else onFinish?.();
  };

  if (!rows.length && !done && !place && !onReopen) return null;
  return (
    <span className="ts-more-wrap" ref={wrap}>
      {place && <PlaceButton place={place} {...placeFacts} onPlace={onPlace} />}
      {onReopen && !done && <button type="button" className="ts-done ts-reopen" onClick={onReopen}><span>Reopen</span></button>}
      {onCloseTask && <button type="button" className="ts-done ts-close-task" onClick={onCloseTask}><span>Close task</span></button>}
      {done && (
        <button
          type="button"
          className="ts-done"
          data-hint="done"
          data-hint-align="right"
          aria-label={`${done.label} (${done.key})`}
          onClick={() => onFinish?.()}
        >
          <DoneMark />
          <span>{DONE.short}</span>
        </button>
      )}
      {rows.length > 0 && <button
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
      </button>}
      {open && waiting && (
        <div className="th-menu ts-more-menu ts-wait-menu" role="menu" aria-label={blocks ? 'Blocked by' : 'Waits on'}>
          {waitsNow && <button type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onWait?.(null); }}>
            <span className="ico"><WaitMark /></span><span className="ts-more-label">{blocks ? 'Not blocked' : 'Stop waiting'}</span>
          </button>}
          {waitChoices.map((c) => <button key={c.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onWait?.(c.id); }}>
            <span className="ico"><WaitMark /></span><span className="ts-more-label">{c.label}</span>
          </button>)}
          {/* A task can wait on someone off the team, or on something, in plain words. */}
          {blocks && <BlockWords onPick={(id) => { close(false); onWait?.(id); }} />}
        </div>
      )}
      {open && !waiting && (giving
        ? <div className="th-menu ts-more-menu" role="menu" aria-label="Give it to">
          {giveTo.map((p) => <button key={p.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onGive?.(p); }}>
            <span className="ico"><GiveMark /></span>
            <span className="ts-more-label">{p.name}</span>
          </button>)}
        </div>
        : <ThreadMenuList rows={rows} change={change} onPick={pick} />)}
    </span>
  );
}
