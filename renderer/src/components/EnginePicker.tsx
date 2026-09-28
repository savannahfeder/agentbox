// Which coding agent picks this task up, as a word in the composer's sentence:
// "With Claude Code."
//
// Both halves are here — the workspace default is a row in Settings, and this
// is the per-task override she asked for first.
//
// IT IS THE MODEL DRAWER'S TWIN, deliberately and down to the class names. Same
// trigger (a `.compose-word`, `font: inherit`, no padding, no border, so its
// baseline IS the line's baseline), same drawer, same keys, and it borrows
// `.prio-menu` rather than growing a third popover that would then drift from
// the other two.
//
// AND IT DRAWS NOTHING WHEN THERE IS NOTHING TO CHOOSE. On a Mac with no Codex
// on it, and on every Mac before she opens the gate, `choices` is one entry long
// and this returns null: the sentence is exactly the sentence it was before this
// file existed. A control that offers one option is not a control; it is a word
// she has to read past every time she writes a task.
//
// THE COUNT IS NOT WORKED OUT HERE, AND THAT IS THE PART THAT IS NEW. `choices`
// comes off the snapshot, from `Supervisor#engineChoices`, which asks the
// capability gate before it asks the machine. A picker that asked
// `availableEngines` itself would offer Codex on a Mac where the supervisor is
// about to refuse it — shared/engines.mjs names that outcome as "its own kind of
// lie" — so the renderer is handed the answer and never derives one.
//
// THE PICK IS ABOUT THE NEXT RUN. Every turn is a fresh headless spawn, so there
// is no session to switch mid-flight; choosing here says which engine picks the
// task up, and nothing about a run already going.

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ENGINE, engineLabel, type Engine } from '../../../shared/engines.mjs';
import { useKeepInWindow } from '../keep-in-window';

export function EnginePicker({ value, choices, onChange, title, onOpenChange }: {
  value: string | null;
  choices: Engine[];
  onChange: (id: string | null) => void;
  title?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  // A span, not a div: this sits inside a line of prose and a div there is not
  // phrasing content.
  const wrap = useRef<HTMLSpanElement>(null);
  const rows = choices;
  const enough = rows.length > 1;

  useEffect(() => { onOpenChange?.(open); }, [open]);
  useKeepInWindow(wrap, open);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, rows.findIndex((e) => e.id === (value ?? DEFAULT_ENGINE))));
    // Pointerdown, not click, and the same reason as the other two drawers: a
    // click aimed at the textarea should close this AND land the caret.
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, value]);

  // ONE ENGINE IS NOT A CHOICE, so the clause does not exist. Below the hooks
  // rather than above them, because a component that returns before its own
  // effects changes hook order between renders the moment a second engine
  // appears — which is exactly the transition this line exists for.
  if (!enough) return null;

  const pick = (id: string) => { onChange(id === DEFAULT_ENGINE ? null : id); setOpen(false); };

  return (
    <span className="compose-word-wrap" ref={wrap}>
      {open && (
        <span className="prio-menu model-menu" role="listbox" aria-label="Coding agent">
          {rows.map((e, i) => (
            <button
              key={e.id}
              role="option"
              aria-selected={e.id === (value ?? DEFAULT_ENGINE)}
              className={`prio-menu-row ${i === cursor ? 'cursor' : ''} ${e.id === (value ?? DEFAULT_ENGINE) ? 'on' : ''}`}
              onPointerEnter={() => setCursor(i)}
              onClick={() => pick(e.id)}
            >
              <span className="prio-menu-label">{e.label}</span>
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className={`compose-word ${value ? 'set' : ''} ${open ? 'open' : ''}`}
        title={title ?? 'Which coding agent picks this up'}
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
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % rows.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + rows.length) % rows.length); }
          if (e.key === 'Enter') { e.preventDefault(); if (rows[cursor]) pick(rows[cursor].id); }
        }}
      >{engineLabel(value)}</button>
    </span>
  );
}
