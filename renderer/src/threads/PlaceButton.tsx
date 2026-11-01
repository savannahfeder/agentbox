// WHERE A THREAD RUNS, as a labeled button beside Done (w-f43613624f, the
// approved drawings designs/w-f43613624f/r6-*). Closed it names where the
// thread runs; a press opens a panel saying why and offering the other place,
// since a hover card was turned down as the way to explain it. Drawn with the
// cloud menu's own parts (`.th-pop.th-cloud-pop`, pages.css).
//
// THE PICKER SHOWS THE THREAD'S SETTING, NOT WHERE THE REPLY UNDER WAY IS
// (w-bac3eb6bd2). A reply already running here often cannot move, so a picker
// that showed its place could not take a pick of Cloud. The note says where
// that reply finishes.
import { useEffect, useRef, useState } from 'react';
import { CloudMark, MacMark, type PlaceAct, type ThreadPlace } from './ThreadMenu';
import { whyWords } from '../where-why';
import type { WhyNotCloud } from '../types';

export interface PlaceFacts {
  place: ThreadPlace;
  /** An agent is working on it on this Mac now. */
  running?: boolean;
  /** Why a run here is not in the cloud (the supervisor's `whyNotCloud`), given only while the cloud takes Everything. */
  why?: WhyNotCloud | null;
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

// No reply of the thread can go to the cloud while one of these holds, so Cloud cannot be picked.
const STAYS = new Set(['folder', 'project', 'teammate', 'codex-reply', 'no-account', 'version']);
// The cloud is out for now, so the next reply may run here as well.
const FOR_NOW = new Set(['cloud-failing', 'cloud-account-limited']);
const MOVING = 'Working on this Mac now. It moves to the cloud as soon as the cloud has room.';

// A reply under way here while the thread may use the cloud. A keep just
// undone is no reason any more, and with no reason at all the cloud is on
// "when this Mac is full", where the next reply may stay here too.
function finishesHere(why: WhyNotCloud | null): string {
  if (!why) return 'This reply finishes on this Mac.';
  if (why.why === 'kept') return 'This reply finishes on this Mac, and the next one starts in the cloud.';
  const detail = String(why.detail ?? '');
  if (why.why === 'handed-back' && detail && !/^merging into main\b/i.test(detail)) return `This reply needs ${detail}, so it finishes on this Mac. The next one starts in the cloud.`;
  const body = whyWords(why).body;
  return FOR_NOW.has(why.why) ? `${body} This reply finishes on this Mac.` : `${body} This reply finishes on this Mac, and the next one starts in the cloud.`;
}

export function placeView({ place, running = false, why = null, needs = null }: PlaceFacts): PlaceView {
  const mac = { word: 'This Mac' as const, on: 'mac' as const, dot: false, needs: null, pickMac: null };
  const cloud = { word: 'Cloud' as const, on: 'cloud' as const, dot: false, needs: null, pickCloud: null, pickMac: true };
  const moving = why?.why === 'moving';
  switch (place) {
    case 'cloud':
      return { ...cloud, note: 'Running in the cloud now. Pick This Mac and its work comes back here and carries on.' };
    case 'move':
      return moving ? { ...cloud, note: MOVING } : { ...mac, pickCloud: 'move', note: 'Working on this Mac now. Pick Cloud and it carries on there from where it is.' };
    case 'kept':
      return { ...mac, pickCloud: false, note: 'You kept it here. Its replies run on this Mac until you pick Cloud.' };
    case 'needs':
      return { ...mac, dot: true, pickCloud: false, needs: needs ? capital(needs) : 'Something only this Mac has', note: 'Its replies run here until you pick Cloud.' };
    default:
      if (!running) return { ...cloud, note: 'Its next reply starts in the cloud, so it keeps going with your Mac shut.' };
      if (moving) return { ...cloud, note: MOVING };
      if (why && STAYS.has(why.why)) return { ...mac, pickCloud: null, note: whyWords(why).body };
      return { ...cloud, note: finishesHere(why) };
  }
}

/** The facts a pick leads to, drawn until the app's own arrive. */
export function afterPick(facts: PlaceFacts, act: PlaceAct): PlaceFacts {
  if (act === 'move') return { ...facts, place: 'move', why: { at: 'mac', why: 'moving' } };
  return { ...facts, place: act ? 'kept' : 'here', needs: null };
}

// Long enough for the app's next snapshot, which follows a write by about half a second.
const PICK_SHOWS_MS = 4000;

export function PlaceButton({ onPlace, startOpen = false, ...facts }: PlaceFacts & { onPlace?: (act: PlaceAct) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [picked, setPicked] = useState<PlaceAct | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  // A pick is drawn until the app says anything new about this thread, or it
  // gives up waiting: a pick the app refused then shows as refused.
  const said = `${facts.place}|${facts.running}|${facts.why?.at}:${facts.why?.why}|${facts.needs}`;
  useEffect(() => setPicked(null), [said]);
  useEffect(() => {
    if (picked === null) return undefined;
    const t = setTimeout(() => setPicked(null), PICK_SHOWS_MS);
    return () => clearTimeout(t);
  }, [picked]);
  const v = placeView(picked === null ? facts : afterPick(facts, picked));

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

  // The panel stays open, so the pick and what it does show where it was pressed.
  const pick = (act: PlaceAct | null) => {
    if (act === null) return;
    setPicked(act);
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
