// "When", as one control, on the card, while she is writing.
//
// Two things the card has to set are the same question. One is WHEN it
// begins, the other is HOW OFTEN it begins. The app already answered both with the same
// component (SchedulePicker, opened from S on a row and from the ↻ tag on the
// card), so the card asks with one control rather than two.
//
// The default reads "Starts now", which is a TRUE statement about this task.
// The word "Once" still exists, inside this menu, where it is how repeating
// gets turned back off.
//
// Choosing from one half clears the other, because the pill says one thing and
// a task cannot both start in four hours and run every morning: a rule already
// carries its own first moment.
//
// ONE QUESTION AT A TIME. Both halves at once made a
// 402px menu that asked "when?" and "how often?" in the same breath. The menu
// now shows the start rows only, and "Repeats…" is a quiet door at the bottom
// with the rules behind it. One extra click for a repeat is the accepted
// trade.
//
// Snooze has said it since 2026-08-06 (SchedulePicker's preview) and this box
// did not, so the answer exists before Enter.
//
// WHAT IT READS BACK IS A ROW, NOT A CLOCK. The user's words come back as a row
// in the same words, in the same shape as the presets above it, with the clock where the
// presets already keep it: on the right. "In 30 minutes" narrows to the preset
// she already had; "in 25 minutes" makes the row that was missing. A phrase
// neither grammar reads leaves one dim row saying "not a time", so nothing is
// ever set by a fall-through (the 2026-08-10 bug).

import { useEffect, useRef, useState } from 'react';
import { parseRepeat, parseWhen } from '../format';
import { useKeepInWindow } from '../keep-in-window';
import { ruleLabel, type RepeatShape as RepeatRuleValue } from '../../../shared/repeats.mjs';

export interface WhenValue {
  // A moment to start at, or 0 for now. Never both this and a rule.
  runAt: number;
  repeat: RepeatRuleValue | null;
}

export const WHEN_NOW: WhenValue = { runAt: 0, repeat: null };

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * What the word in the sentence says. A sentence clause, so it is capitalised.
 *
 * `empty` is what an unset control says, and the two composers answer different
 * questions with it. The new-task card says "Starts now", because a new task
 * has a beginning to talk about. The reply box says "Runs once", because the
 * thread has already begun and the only thing left to set is how often it comes
 * back.
 */
export function whenLabel(value: WhenValue, empty = 'Starts now'): string {
  if (value.repeat) return upper(ruleLabel(value.repeat));
  if (value.runAt) return upper(startLabel(value.runAt));
  return empty;
}

/** "Starts in 30 minutes" out of a moment, in the words the presets use. */
function startLabel(ts: number, now = Date.now()): string {
  const mins = Math.round((ts - now) / 60_000);
  if (mins <= 0) return 'Starts now';
  if (mins < 90) return `Starts in ${mins} minutes`;
  const d = new Date(ts);
  const clock = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase().replace(/\s/g, '');
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return `Starts at ${clock}`;
  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
  return `Starts ${day} at ${clock}`;
}

const fmt = (ts: number) => new Date(ts).toLocaleTimeString(undefined, {
  hour: 'numeric', minute: '2-digit',
}).toUpperCase();

const fmtDay = (ts: number) => new Date(ts).toLocaleString(undefined, {
  weekday: 'short', hour: 'numeric', minute: '2-digit',
}).toUpperCase();

// The top half. Snooze's presets, which is the point: "In 30 minutes" is
// already the first thing S offers on an inbox row, and this is the same
// mechanism reached from the card instead.
function startPresets(now = Date.now()) {
  const rows: Array<{ label: string; ts: number; hint: string }> = [
    { label: 'Now', ts: 0, hint: '' },
    { label: 'In 30 minutes', ts: now + 30 * 60_000, hint: fmt(now + 30 * 60_000) },
    { label: 'In 4 hours', ts: now + 4 * 3_600_000, hint: fmt(now + 4 * 3_600_000) },
  ];
  const evening = new Date(now); evening.setHours(18, 0, 0, 0);
  if (evening.getTime() > now) rows.push({ label: 'This evening', ts: evening.getTime(), hint: fmt(evening.getTime()) });
  const tomorrow = new Date(now + 86_400_000); tomorrow.setHours(8, 0, 0, 0);
  rows.push({ label: 'Tomorrow', ts: tomorrow.getTime(), hint: fmtDay(tomorrow.getTime()) });
  return rows;
}

// The bottom half. Repeat's presets, unchanged, with "Once" first as the way
// back off rather than as a thing to notice on the card.
function repeatPresets(now = Date.now()): Array<{ label: string; rule: RepeatRuleValue | null }> {
  const weekday = new Date(now).getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday];
  return [
    { label: 'Once', rule: null },
    { label: 'Every morning at 8:00am', rule: { every: 'day', at: '08:00' } as RepeatRuleValue },
    { label: 'Every weekday at 9:00am', rule: { every: 'weekday', at: '09:00' } as RepeatRuleValue },
    { label: `Every ${dayName} at 9:00am`, rule: { every: 'week', on: weekday, at: '09:00' } as RepeatRuleValue },
  ];
}

/**
 * What a typed phrase means, or null if neither grammar reads it.
 *
 * WHAT THE USER TYPED DECIDES, OR NOTHING DOES. The recurrence grammar gets first
 * look, because "every friday at 5pm" also contains a time and parseWhen would
 * happily take the "5pm" out of it and set a one-off. Order is the whole of the
 * rule, which is why it is a function with a test rather than a line inside an
 * event handler.
 */
export function readWhen(raw: string, now = Date.now()): WhenValue | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const asRule = parseRepeat(trimmed);
  if (asRule && 'rule' in asRule) return { runAt: 0, repeat: asRule.rule };
  const asMoment = parseWhen(trimmed, now);
  if (asMoment) return { runAt: asMoment.ts, repeat: null };
  return null;
}

/**
 * The clock a row keeps on its right: what the typed moment comes out as.
 *
 * The same words the preset rows use, so her row and theirs are comparable at a
 * glance: a clock for today, a day and a clock for later, and the rule itself
 * for a recurrence. This is the hint column, NOT the answer; the answer is the
 * row's label, in the user's words.
 */
export function whenPreview(value: WhenValue, now = Date.now()): string {
  if (value.repeat) return ruleLabel(value.repeat);
  if (!value.runAt) return 'now';
  const sameDay = new Date(now).toDateString() === new Date(value.runAt).toDateString();
  return sameDay ? fmt(value.runAt) : fmtDay(value.runAt);
}

/**
 * Does a preset row survive what she has typed so far?
 *
 * A filter, in the plainest sense: the row stays while the typed words are still the
 * start of it. Word starts count too, so "30" keeps "In 30 minutes" — she is
 * narrowing a list, not spelling a label from its first letter.
 */
export function rowMatches(label: string, text: string): boolean {
  const q = (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return true;
  const l = label.toLowerCase();
  return l.startsWith(q) || l.split(' ').some((w, i) => i > 0 && w.startsWith(q));
}

/**
 * Her own phrase, as a row.
 *
 * THE TYPED WORDS ARE THE LABEL. "in 25 minutes" comes back as "In 25 minutes",
 * not as 5:04 PM, because a clock is the thing the user should not have to read
 * to check the answer. The moment it resolves to rides on the right, in the column
 * where "In 30 minutes" has always kept its 5:09 PM. `null` when the grammar
 * cannot read it, and the caller draws "not a time" instead of a choice.
 */
export function typedRow(text: string, now = Date.now()):
  { label: string; hint: string; value: WhenValue } | null {
  const phrase = (text ?? '').trim().replace(/\s+/g, ' ');
  if (!phrase) return null;
  const read = readWhen(phrase, now);
  if (!read) return null;
  return { label: upper(phrase), hint: whenPreview(read, now), value: read };
}

/**
 * Is her phrase already on screen as a preset?
 *
 * so her row is dropped when a surviving preset says the same thing: the same
 * label, or the same minute. The minute is what catches "in 4 hours" typed at
 * the row that already offers it, where the words differ only in case.
 */
function duplicates(row: { label: string; value: WhenValue }, presets: WhenRow[]): boolean {
  return presets.some((p) => p.label.toLowerCase() === row.label.toLowerCase()
    || (!!p.ts && !!row.value.runAt && Math.round(p.ts / 60_000) === Math.round(row.value.runAt / 60_000))
    || (!!p.value.repeat && !!row.value.repeat && ruleLabel(p.value.repeat) === ruleLabel(row.value.repeat)));
}

/** Is this row the answer the task already carries? Only rules and "Once" ask. */
function sameAnswer(row: WhenValue, current: WhenValue): boolean {
  if (row.repeat || current.repeat) {
    return !!row.repeat && !!current.repeat && ruleLabel(row.repeat) === ruleLabel(current.repeat);
  }
  return true;
}

/** One line of the menu, whether it came from the presets or from her hands. */
export interface WhenRow {
  label: string;
  /** The clock or the rule, on the right. Empty on a repeat preset, which uses its ✓ instead. */
  hint: string;
  /** The preset's moment, so the current answer can be marked. null on her row. */
  ts: number | null;
  value: WhenValue;
  typed?: boolean;
}

/**
 * THE START PAGE, AS SHE HAS FILTERED IT.
 *
 * Empty box: the five presets, as before. Typing narrows them and puts her own
 * phrase on top, so "in 25 minutes" is a row that says "In 25 minutes". Typing
 * something a preset already says leaves the preset alone. An empty list is the
 * honest answer to a phrase nothing reads, and the menu draws "not a time".
 */
export function startList(text: string, now = Date.now()): WhenRow[] {
  const kept: WhenRow[] = startPresets(now)
    .filter((r) => rowMatches(r.label, text))
    .map((r) => ({ label: r.label, hint: r.hint, ts: r.ts, value: { runAt: r.ts, repeat: null } }));
  const mine = typedRow(text, now);
  if (!mine || duplicates(mine, kept)) return kept;
  return [{ label: mine.label, hint: mine.hint, ts: null, value: mine.value, typed: true }, ...kept];
}

/**
 * The repeats page, filtered the same way, so one habit works on both pages.
 *
 * `rulesOnly` is for the reply box, where this page is the WHOLE control. There,
 * a typed phrase that resolves to a moment rather than a rule ("9am") must not
 * become a row: taking it would write a runAt under the founder's own name,
 * which is her snooze and HIDES the row she is replying on. On the card the same
 * phrase is fine, because the page before it is the one that asks for a moment.
 */
export function repeatList(text: string, now = Date.now(), rulesOnly = false): WhenRow[] {
  const kept: WhenRow[] = repeatPresets(now)
    .filter((r) => rowMatches(r.label, text))
    .map((r) => ({ label: r.label, hint: '', ts: null, value: { runAt: 0, repeat: r.rule } }));
  const mine = typedRow(text, now);
  if (!mine || duplicates(mine, kept)) return kept;
  if (rulesOnly && !mine.value.repeat) return kept;
  return [{ label: mine.label, hint: mine.hint, ts: null, value: mine.value, typed: true }, ...kept];
}

/**
 * The word, and the menu it opens.
 *
 * `note` is the personal-workspace refusal: a personal workspace cannot hold a
 * repeating task, so the repeats page says so instead of quietly failing later.
 *
 * `only="repeat"` is the REPLY BOX. A thread has already started, so "when does
 * it begin" is not a question it can ask, and the one page it does ask is the
 * repeats page: same rows, same filter, same Enter. The door and the way back
 * are not drawn, because there is nowhere else to go. Same component on both
 * surfaces on purpose: two lists of the same four schedules is exactly how the
 * card's clock and the dock's ↻ tag drifted apart in the first place.
 */
export function WhenPicker({ value, onChange, note, only, empty, onOpenChange }: {
  value: WhenValue;
  onChange: (v: WhenValue) => void;
  note?: string;
  only?: 'repeat';
  empty?: string;
  /*
   * See PriorityPicker: the composer's footer needs to know so a quiet line
     does not close under an open menu. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); }, [open]);
  const repeatsPageOnly = only === 'repeat';
  // Which question the menu is asking. It opens on the one the task has an
  // answer to, so a repeating task reopens where its rule is rather than making
  // her find the door again.
  const [page, setPage] = useState<'start' | 'repeat'>(repeatsPageOnly ? 'repeat' : 'start');
  const [text, setText] = useState('');
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useKeepInWindow(wrap, open, [page, text]);

  useEffect(() => {
    if (!open) return;
    setText('');
    setPage(repeatsPageOnly || value.repeat ? 'repeat' : 'start');
    // Pointerdown, not click, for the same reason the priority drawer uses it:
    // a click aimed at the textarea should close this AND land the caret.
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // The caret follows the page, because each page draws its own box: focusing
  // in the effect above would land on the box that is being unmounted.
  useEffect(() => { if (open) input.current?.focus(); }, [open, page]);

  const commit = (v: WhenValue) => { onChange(v); setOpen(false); };

  const repeatsOff = !!note;
  // A rule cannot be set in a personal workspace, so such a row is drawn and
  // refused rather than accepted and quietly dropped later.
  const barred = (v: WhenValue) => !!v.repeat && repeatsOff;

  // Read on every keystroke, which is the whole point: the answer exists before
  // Enter, so it may as well be a ROW before Enter.
  const list = page === 'start' ? startList(text) : repeatList(text, Date.now(), repeatsPageOnly);
  const nothing = !!text.trim() && !list.length;

  // Enter takes the row at the top, the way every filter behaves. If
  // there is no row there, nothing is set: the fall-through is what scheduled an
  // item for thirty minutes when "tomorrow" was typed (2026-08-10), and the dim
  // "not a time" row is what says so now.
  const enter = () => {
    if (!text.trim()) return;
    const first = list.find((r) => !barred(r.value));
    if (first) commit(first.value);
  };

  // The dim row that says a phrase was not understood, in the words of the
  // question being asked. On the reply box the question is how often, so "9am"
  // is not a wrong time, it is not a repeat at all.
  const notATime = nothing && (
    <span className="when-row empty">
      <span className="when-row-label">{repeatsPageOnly ? 'not a repeat' : 'not a time'}</span>
    </span>
  );

  const menuRow = (r: WhenRow) => (
    <button
      key={r.typed ? 'typed' : r.label}
      type="button"
      className={`when-row ${r.typed ? 'typed' : ''} ${
        !r.typed && (r.ts === null ? sameAnswer(r.value, value) : !value.repeat && value.runAt === r.ts) ? 'on' : ''
      } ${barred(r.value) ? 'off' : ''}`}
      disabled={barred(r.value)}
      onClick={() => commit(r.value)}
    >
      <span className="when-row-label">{r.label}</span>
      <span className="when-row-hint">
        {r.hint || (sameAnswer(r.value, value) && r.value.repeat ? '✓' : '')}
      </span>
    </button>
  );

  const typeBox = (placeholder: string) => (
    <span className="when-type-row">
      <input
        ref={input}
        className="when-type"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          if (e.key === 'Enter') { e.preventDefault(); enter(); }
        }}
      />
    </span>
  );

  return (
    <span className="when-wrap" ref={wrap}>
      {open && (
        <span className="when-menu" role="dialog" aria-label={repeatsPageOnly ? 'How often this comes back' : 'When this runs'}>
          {page === 'start' ? (
            <>
              {list.map(menuRow)}
              {notATime}
              {typeBox('or type: in three hours, 9am, tomorrow')}
              <span className="when-sep" />
              {/* The door, not a second list. It is quiet on purpose: repeating
                  is the rarer answer, and the loud version of this menu, with
                  both lists at once, was taken down. */}
              <button
                type="button"
                className="when-door"
                onClick={() => { setPage('repeat'); setText(''); }}
              >
                <span className="when-door-label">Repeats…</span>
                <span className="when-door-arrow">›</span>
              </button>
            </>
          ) : (
            <>
              {/* No way back where there was never a first page. */}
              {!repeatsPageOnly && (
                <>
                  <button
                    type="button"
                    className="when-door back"
                    onClick={() => { setPage('start'); setText(''); }}
                  >
                    <span className="when-door-arrow">‹</span>
                    <span className="when-door-label">Starts</span>
                  </button>
                  <span className="when-sep" />
                </>
              )}
              {note && <span className="when-note">{note}</span>}
              {list.map(menuRow)}
              {notATime}
              {typeBox('or type: every friday at 5pm')}
            </>
          )}
        </span>
      )}
      <button
        type="button"
        className={`compose-word ${value.runAt || value.repeat ? 'set' : ''} ${open ? 'open' : ''}`}
        title={repeatsPageOnly ? 'How often this comes back' : 'When this runs'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >{whenLabel(value, empty)}</button>
    </span>
  );
}
