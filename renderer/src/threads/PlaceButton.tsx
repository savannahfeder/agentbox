// WHERE A THREAD RUNS, as a labeled button beside Done (w-f43613624f, the
// approved drawings designs/w-f43613624f/r6-*). Closed it names where the
// thread runs; a press opens a panel saying why and offering the other place,
// since a hover card was turned down as the way to explain it. Drawn with the
// cloud menu's own parts (`.th-pop.th-cloud-pop`, pages.css).
import { useEffect, useRef, useState } from 'react';
import { CloudMark, MacMark, type PlaceAct, type ThreadPlace } from './ThreadMenu';

export interface PlaceFacts {
  place: ThreadPlace;
  /** An agent is working on it on this Mac now. */
  running?: boolean;
  /** Everything is moving it to the cloud by itself (`whyNotCloud` 'moving'). */
  moving?: boolean;
  /** Why a run here cannot go to the cloud, in where-why.ts's words. */
  why?: string | null;
  /** What the cloud handed it back for ("your Stripe key"). */
  needs?: string | null;
}

export interface PlaceView {
  word: 'Cloud' | 'This Mac';
  on: 'cloud' | 'mac';
  dot: boolean;
  note: string;
  needs: string | null;
  /** What picking each place does, or null where it is the current one or cannot be picked. */
  pickCloud: PlaceAct | null;
  pickMac: PlaceAct | null;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function placeView({ place, running = false, moving = false, why = null, needs = null }: PlaceFacts): PlaceView {
  const mac = { word: 'This Mac' as const, on: 'mac' as const, dot: false, needs: null, pickMac: null };
  switch (place) {
    case 'cloud':
      return { word: 'Cloud', on: 'cloud', dot: false, needs: null, pickCloud: null, pickMac: true, note: 'Running in the cloud now. Pick This Mac and its work comes back here and carries on.' };
    case 'move':
      return { ...mac, pickCloud: 'move', note: moving ? 'Working on this Mac now. It moves to the cloud as soon as the cloud has room.' : 'Working on this Mac now. Pick Cloud and it carries on there from where it is.' };
    case 'kept':
      return { ...mac, pickCloud: false, note: 'You kept it here. Its replies run on this Mac until you pick Cloud.' };
    case 'needs':
      return { ...mac, dot: true, pickCloud: false, needs: needs ? capital(needs) : 'Something only this Mac has', note: 'Its replies run here until you pick Cloud.' };
    default:
      if (running) return { ...mac, pickCloud: null, note: why || 'Working on this Mac now.' };
      return { word: 'Cloud', on: 'cloud', dot: false, needs: null, pickCloud: null, pickMac: true, note: 'Its next reply starts in the cloud, so it keeps going with your Mac shut.' };
  }
}

export function PlaceButton({ onPlace, startOpen = false, ...facts }: PlaceFacts & { onPlace?: (act: PlaceAct) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const wrap = useRef<HTMLSpanElement>(null);
  const v = placeView(facts);

  // Closed by Escape and by a press outside it, caught first so the window's
  // own Escape ("go back") does not also leave the thread.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', keys, true); };
  }, [open]);

  const pick = (act: PlaceAct | null) => {
    if (act === null) return;
    setOpen(false);
    onPlace?.(act);
  };
  const choice = (where: 'cloud' | 'mac', act: PlaceAct | null) => {
    const on = v.on === where;
    return (
      <button type="button" className={on ? 'on picked' : ''} aria-pressed={on} disabled={!on && act === null} onClick={() => pick(act)}>
        {where === 'cloud' ? <CloudMark /> : <MacMark />}{where === 'cloud' ? 'Cloud' : 'This Mac'}
      </button>
    );
  };

  return (
    <span className="ts-place-wrap" ref={wrap}>
      <button type="button" className={`ts-done ts-place${open ? ' open' : ''}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Runs on: ${v.word}`} onClick={() => setOpen((o) => !o)}>
        {v.on === 'cloud' ? <CloudMark /> : <MacMark />}
        <span>{v.word}</span>
        {v.dot && <i className="ts-place-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="th-pop th-cloud-pop ts-place-pop" role="dialog" aria-label="Where this thread runs">
          <div className="line"><span className="lab">Runs on</span><span className="opts">{choice('cloud', v.pickCloud)}{choice('mac', v.pickMac)}</span></div>
          <div className="line th-cloud-note"><span className="lab" /><span>{v.note}</span></div>
          {v.needs && <>
            <div className="rule" />
            <div className="line"><span className="lab">Needs</span><span>{v.needs}</span></div>
            <div className="line th-cloud-note"><span className="lab" /><span>The cloud doesn’t have it, so its cloud runs stopped to ask for it and it moved here.</span></div>
          </>}
        </div>
      )}
    </span>
  );
}
