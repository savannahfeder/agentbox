// SEND LATER ON A REPLY (w-54cdf7c768): the new thread card's times, on a caret
// beside Send. Picking one only sets it, and the time is said on the caret;
// Send sends the reply, which waits in the thread until then.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMenu } from '../keep-in-window';
import { laterHint, momentFromWords, mondayIsTomorrow, mondayMorning, tomorrowMorning } from '../threads/composer-rules';

export function ReplyLater({ at, onPick, onClosed }: {
  /** The moment the reply is set for, or 0 for now. */
  at: number;
  onPick: (at: number) => void;
  /** The menu shut, so the box can take the keyboard back. */
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const wrap = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    setTyped('');
    if (wasOpen.current) onClosed?.();
  }, [open]);

  // Pointerdown, the same as every menu in this app.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = wrap.current?.querySelector<HTMLElement>(':scope > .tc-menu');
    if (!menu) return;
    fitMenu(menu);
    (menu.querySelector<HTMLElement>('[data-item].on') ?? menu.querySelector<HTMLElement>('[data-item]'))?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    const menu = wrap.current?.querySelector<HTMLElement>(':scope > .tc-menu');
    if (menu) fitMenu(menu);
  }, [typed]);

  const now = Date.now();
  const tomorrow = tomorrowMorning(now);
  const monday = mondayMorning(now);
  const typedAt = momentFromWords(typed, now);
  const pick = (ts: number) => { onPick(ts); setOpen(false); };

  const menuKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>('[data-trigger]')?.focus();
      return;
    }
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]:not([disabled])')];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[(i + 1) % rows.length]?.focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); rows[i <= 0 ? rows.length - 1 : i - 1]?.focus(); return; }
    // Typing on a row types the time.
    const box = e.currentTarget.querySelector<HTMLInputElement>('.tc-when');
    if (box && e.target !== box && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) box.focus();
  };
  const hover = (e: React.PointerEvent<HTMLElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
  };

  const said = at > 0 ? laterHint(at) : null;
  const trigger = (
    <button type="button" data-trigger className={`dock-send-later${at ? ' set' : ''}`}
      aria-haspopup="menu" aria-expanded={open}
      aria-label={said ? `Sends ${said}. Change when` : 'Send later'} title={said ? 'Change when it sends' : 'Send later'}
      onClick={() => setOpen((o) => !o)}>
      {said && <span className="dock-send-when">{said}</span>}
      <CaretIcon />
    </button>
  );

  return (
    <span className="reply-later" ref={wrap}>
      {open && (
        <div className="tc-menu tc-rise tc-wide tc-right" role="menu" aria-label="Send later" onKeyDown={menuKeys}>
          <span className="tc-menu-head">Send later</span>
          {at > 0 && (
            <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => pick(0)}>
              <ClearIcon /><span className="tc-row-label">Remove the time</span>
            </button>
          )}
          <button type="button" data-item className={`tc-row ${at === tomorrow ? 'on' : ''}`} onPointerEnter={hover} onClick={() => pick(tomorrow)}>
            <ClockIcon /><span className="tc-row-label">Tomorrow morning</span><small>{laterHint(tomorrow)}</small>
          </button>
          {!mondayIsTomorrow(now) && (
            <button type="button" data-item className={`tc-row ${at === monday ? 'on' : ''}`} onPointerEnter={hover} onClick={() => pick(monday)}>
              <ClockIcon /><span className="tc-row-label">Monday morning</span><small>{laterHint(monday)}</small>
            </button>
          )}
          <span className="tc-pick">
            <ClockIcon />
            <input
              data-item
              className="tc-when"
              placeholder="Or type: 3h, fri 6pm, tomorrow 9am"
              aria-label="Send at a time you type"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && typedAt) { e.preventDefault(); e.stopPropagation(); pick(typedAt.ts); } }}
            />
            {typed.trim() && (typedAt
              ? <button type="button" data-item className="tc-schedule" onClick={() => pick(typedAt.ts)}>{typedAt.hint}</button>
              : <small className="tc-when-no">Not a time yet</small>)}
          </span>
        </div>
      )}
      {trigger}
    </span>
  );
}

const CaretIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
const ClearIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></svg>
);
