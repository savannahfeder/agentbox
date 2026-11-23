// The open mark over a file, and the menu it opens: the apps the Mac offers
// for that file, default first, and Show in Finder (w-b374aa5dfe, option 1).
// The row picked says Opening until the app is up, because a big app's first
// start takes seconds and the mark used to say nothing at all.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { AppsThatOpen } from '../types';

export const DEFAULT_APP = 'default';
export const IN_FOLDER = 'folder';

const glyph = { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const Folder = () => <svg {...glyph}><path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>;
const AnApp = () => <svg {...glyph}><rect x="4" y="4" width="12" height="12" rx="3" /></svg>;

/** The rows. With no list from the Mac it still offers the default app. */
export function OpenWithMenu({ list, opening, onPick }: { list: AppsThatOpen; opening: string | null; onPick: (choice: string) => void }) {
  const apps = list.apps.length ? list.apps : [{ path: DEFAULT_APP, name: 'Default app', isDefault: false, icon: null }];
  const row = (choice: string) => `row-i ts-more-row${opening === choice ? ' on' : ''}`;
  return (
    <div className="th-menu ts-more-menu open-with-menu" role="menu" aria-label="Open with" aria-busy={opening ? true : undefined}>
      {apps.map((a) => (
        <button key={a.path} type="button" role="menuitem" tabIndex={-1} className={row(a.path)} onClick={() => onPick(a.path)}>
          <span className="ico">{a.icon ? <img className="open-with-icon" src={a.icon} alt="" /> : <AnApp />}</span>
          <span className="ts-more-label">{a.name}</span>
          {opening === a.path
            ? <span className="ts-more-detail open-with-busy"><span className="open-with-spin" aria-hidden="true" />Opening</span>
            : a.isDefault && <span className="ts-more-detail">Default</span>}
        </button>
      ))}
      {list.reveal && <>
        <div className="sep" />
        <button type="button" role="menuitem" tabIndex={-1} className={row(IN_FOLDER)} onClick={() => onPick(IN_FOLDER)}>
          <span className="ico"><Folder /></span>
          <span className="ts-more-label">{list.finder ? 'Show in Finder' : 'Show in folder'}</span>
        </button>
      </>}
    </div>
  );
}

export function OpenWithMark({ product, src, thread, title, onFailed, children }: {
  product: string;
  src: string;
  thread?: string;
  title: string;
  onFailed?: (error: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<{ key: string; list: AppsThatOpen } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const asked = useRef<string | null>(null);
  const key = `${product}\n${thread ?? ''}\n${src}`;
  const list = answer?.key === key ? answer.list : null;

  // Asked as the pointer reaches the mark, so the menu opens with its apps in it.
  const ask = () => {
    if (asked.current === key) return;
    asked.current = key;
    void api.appsThatOpen({ product, src, thread }).then((l) => { if (asked.current === key) setAnswer({ key, list: l }); });
  };

  // Escape and the arrows are the menu's while it is open, taken on the
  // window's capture as the thread's own menu takes them, so one Escape does
  // not also close the file.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); return; }
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
      if (e.key === 'Tab') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys, true);
    };
  }, [open]);

  const pick = async (choice: string) => {
    if (opening) return;
    setOpening(choice);
    const how = choice === IN_FOLDER ? { reveal: true } : choice === DEFAULT_APP ? {} : { app: choice };
    const r = await api.openArtifactExternally({ product, src, thread, ...how });
    setOpening(null);
    setOpen(false);
    if (!r.ok) onFailed?.(r.error ?? 'That file could not be opened.');
  };

  return (
    <span className="open-with" ref={wrap}>
      <button type="button" className="doc-mark" title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
        onPointerEnter={ask} onFocus={ask}
        onClick={() => { if (open) { setOpen(false); return; } ask(); setOpen(true); }}>
        {children}
      </button>
      {open && list && <OpenWithMenu list={list} opening={opening} onPick={(c) => void pick(c)} />}
    </span>
  );
}
