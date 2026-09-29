// The priority control, shared by the composer and the reply dock.
//
// It used to be a button that CYCLED to the next level, in two places, with two
// different vocabularies. Cycling makes the founder press a control up to three
// times to reach a level she can already name, and it never shows her what the
// other levels are. This opens instead, the way Linear's does: every level
// visible, one press to any of them, and the one she is on marked.
//
// There is one copy of the vocabulary now, and it lives in ../priority, apart
// from this component, so the ⌘K entries and the drawer read the same list and
// it can be tested without rendering anything. Two lists of the same four words
// is how they drifted apart in the first place.
//
// THE DRAWER ADVERTISES NO KEYS. It used to draw ⌘1..4 down its right edge. The
// chord went with the hint.

import { useEffect, useRef, useState } from 'react';
import { PRIORITIES, priorityIdOf, priorityLabelOf, priorityValueOf, type PriorityId } from '../priority';
import { useKeepInWindow } from '../keep-in-window';

export { PRIORITIES, priorityIdOf, priorityLabelOf, priorityValueOf };
export type { PriorityId };

// URGENT IS A FOURTH BAR, NOT AN EXCLAMATION MARK (w-bba20a03f5, 2026-09-23).
// Exclamation marks did not work anywhere, and the inbox row was chosen to carry
// no mark at all. The row obeys that literally and draws nothing, because the
// Urgent heading above it says the word.
//
// THE DRAWER CANNOT DRAW NOTHING, and that is not the same decision. Here the
// icon is a LEGEND beside the word Urgent in a menu of four levels, not a mark
// she has to spot in a list; a blank where the other three have a picture reads
// as a bug. So urgent becomes the top of the scale the drawer is already
// showing: low is one bar, medium two, high three, urgent four, and the fourth
// is taller than anything else in the family. Nowhere in the app is there an
// exclamation mark in a box any more.
export function PriorityIcon({ id }: { id: PriorityId }) {
  if (id === 'urgent') return <span className="prio-bars p4"><i /><i /><i /><i /></span>;
  const filled = id === 'low' ? 1 : id === 'medium' ? 2 : 3;
  return <span className={`prio-bars p${filled}`}><i /><i /><i /></span>;
}

/**
 * The tag, and the drawer it opens.
 *
 * `set` says the founder has deliberately picked, as opposed to the tag merely
 * displaying what the item already is. Only the composer's caller cares, but it
 * has to be shown, because a reply box reading "Medium" on an urgent thread
 * looked like the reply was demoting it.
 *
 * `variant` is the SHAPE ONLY, never a second control: the new-task card draws
 * priority as a word inside a sentence and the reply dock draws it as a tag,
 * and they must stay one component, because two lists of the same four words is
 * exactly how the composer and the dock drifted apart the first time. Same
 * value, same drawer, same keys; only the trigger differs.
 */
export function PriorityPicker({ value, set = false, onChange, title, variant = 'tag', onOpenChange }: {
  value: PriorityId;
  set?: boolean;
  onChange: (id: PriorityId) => void;
  title?: string;
  variant?: 'tag' | 'word';
  /*
   * The composer's footer hides its clauses at rest and must not collapse the
     line out from under an open drawer. Nobody else passes this. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); }, [open]);
  const [cursor, setCursor] = useState(0);
  // A span, not a div, because the word variant sits inside a line of prose and
  // a div there is not phrasing content. CSS gives both variants their display.
  const wrap = useRef<HTMLSpanElement>(null);
  useKeepInWindow(wrap, open);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, PRIORITIES.findIndex((p) => p.id === value)));
    // Pointerdown, not click: a click that lands on the textarea should close
    // the drawer AND put the caret where it was aimed, not be eaten closing it.
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, value]);

  const pick = (id: PriorityId) => { onChange(id); setOpen(false); };

  const asWord = variant === 'word';

  return (
    <span className={asWord ? 'compose-word-wrap' : 'prio-wrap'} ref={wrap}>
      {open && (
        <span className="prio-menu" role="listbox" aria-label="Priority">
          {PRIORITIES.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              className={`prio-menu-row ${i === cursor ? 'cursor' : ''} ${p.id === value ? 'on' : ''}`}
              onPointerEnter={() => setCursor(i)}
              onClick={() => pick(p.id)}
            >
              <PriorityIcon id={p.id} />
              <span className="prio-menu-label">{p.label}</span>
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className={[
          asWord ? 'compose-word' : 'prio-tag',
          value === 'urgent' ? 'urgent' : '',
          set ? 'set' : '',
          open ? 'open' : '',
        ].filter(Boolean).join(' ')}
        title={title ?? 'Priority'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % PRIORITIES.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + PRIORITIES.length) % PRIORITIES.length); }
          if (e.key === 'Enter') { e.preventDefault(); pick(PRIORITIES[cursor].id); }
        }}
      >
        {/* The word carries no icon. Bars inside a line of prose are the
            "different levels and font sizes" the founder objected to; the
            sentence's whole job is that every glyph in it sits on one
            baseline at one size. */}
        {!asWord && <PriorityIcon id={value} />}
        {priorityLabelOf(value)}
      </button>
    </span>
  );
}
