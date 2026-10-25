// THE MODEL WORD AT THE FOOT OF THE REPLY BOX, and the card's own menu under
// it (../threads/ModelMenu.tsx), so the question is asked the same way in both
// boxes. The word, the dotted underline and the keys are ./Model.tsx's, which
// this replaces here and which the old new-task card still uses.
//
// THE PICK IS ABOUT THE NEXT RUN. Every turn is a fresh spawn, so there is no
// session to switch mid-flight; choosing here says which agent and model pick
// the task up, and nothing about a run already going.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMenu } from '../keep-in-window';
import { modelDrawerKey } from '../model-drawer-keys';
import { ModelMenu } from '../threads/ModelMenu';
import type { ModelPick } from '../threads/composer-rules';
import type { EffortChoice } from '../effort';

export function ReplyModel({
  label, pick, onPick, recent, every, more, labelOf, engineLabel, engineTags = false,
  effortRows, effortLit, onEffort, title, openAtStart = false, onOpenChange,
}: {
  /** The word on the line, the model's own name. */
  label: string;
  pick: ModelPick;
  onPick: (p: ModelPick) => void;
  recent: readonly ModelPick[];
  every: { claude: readonly ModelPick[]; codex: readonly ModelPick[] };
  more: number;
  labelOf: (p: ModelPick) => string;
  engineLabel: (id: string) => string;
  engineTags?: boolean;
  effortRows: readonly EffortChoice[];
  effortLit: string | null;
  onEffort: (id: string) => void;
  title?: string;
  /** Drawn already open, for a box opened by pressing the model word itself. */
  openAtStart?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(openAtStart);
  const [page, setPage] = useState<'recent' | 'all'>('recent');
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => { onOpenChange?.(open); }, [open]);
  useEffect(() => { if (!open) setPage('recent'); }, [open]);

  // Pointerdown, not click, the same as every menu in this app: a press aimed
  // at the message should close this AND land the caret.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Kept inside the window, and the keyboard lands on the row she is on, the
  // way the card does it (threads/ThreadComposer.tsx).
  useLayoutEffect(() => {
    if (!open) return;
    const menu = wrap.current?.querySelector<HTMLElement>(':scope > .tc-menu');
    if (!menu) return;
    fitMenu(menu);
    const target = menu.querySelector<HTMLElement>('[data-item].on') ?? menu.querySelector<HTMLElement>('[data-item]');
    target?.focus({ preventScroll: true });
  }, [open, page]);

  // ESCAPE FROM ANYWHERE IN THE MENU, by the one rule both boxes ask
  // (../model-drawer-keys.ts). The arrows are this menu's own: its rows are
  // focusable buttons, the way the new thread card's are, so moving between
  // them is moving focus rather than a cursor.
  const menuKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (modelDrawerKey(e, { open, from: 'inside' }) === 'close') {
      e.preventDefault(); e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>('[data-trigger]')?.focus();
      return;
    }
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]:not([disabled])')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[(at + 1) % rows.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); rows[at <= 0 ? rows.length - 1 : at - 1]?.focus(); }
  };
  const hover = (e: React.PointerEvent<HTMLElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
  };

  return (
    <span className="compose-word-wrap model-pick" ref={wrap}>
      {open && (
        <ModelMenu
          className="tc-menu tc-drop tc-drop-up tc-model-menu"
          page={page}
          onPage={setPage}
          recent={recent}
          every={every}
          more={more}
          pick={pick}
          onPick={(p) => { onPick(p); setOpen(false); }}
          labelOf={labelOf}
          engineLabel={engineLabel}
          engineTags={engineTags}
          effortRows={effortRows}
          effortLit={effortLit}
          onEffort={onEffort}
          onKeyDown={menuKeys}
          onHover={hover}
        />
      )}
      <button
        type="button"
        data-trigger
        className={`compose-word set ${open ? 'open' : ''}`}
        title={title ?? 'Which model this conversation runs on'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          const move = modelDrawerKey(e, { open, from: 'word' });
          if (!move) return;
          e.preventDefault();
          if (move === 'open') setOpen(true);
          if (move === 'close') { e.stopPropagation(); setOpen(false); }
          // Arrows and Enter on the word open the menu and land on a row; the
          // menu's own handler takes them from there.
          if (move === 'down' || move === 'up' || move === 'pick') {
            wrap.current?.querySelector<HTMLElement>('[data-item].on, [data-item]')?.focus();
          }
        }}
      >{label}</button>
    </span>
  );
}
