// THE CORNER TAG'S PAGES (w-dafae58a23). One page, drawn twice: `?part=tag` is
// the tag itself and `?part=card` is the list that opens beside it, each in its
// own window (main/corner-tag.mjs), each window exactly the size of what it
// shows, drawing its own glass. shared/corner-tag.mjs owns the
// words and the rules; this is the drawing and the pointer.
//
// THE POINTER, settled with Codex and then with real mouse events:
// - The tag is movable as it is, with nothing drawn to say so: press and move.
// - Resting the pointer on the tag opens the list; a click (press and let go
//   without moving) opens the app.
// - The page only reports the button going down and coming up. The drag in
//   between is read off the real cursor by the main process, because a real
//   drag must not depend on this page being sent every move.
// - Off both the tag and the list for a moment, and the list shuts.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Grip, HIDE_CHOICES, cardLines, cardScale, inPoints, tagSays } from '../../../shared/corner-tag.mjs';
import { NAME } from '../../../shared/product-name.mjs';
import { Lattice, Move, markMoves } from './lattice';
import { MoveButton, PlacePicker } from './place';
import './corner-tag.css';

type Ready = { id: string; title: string; says: string; since?: number; open?: string | null };
// ready: what is new since you last left the app; before: how many were
// already waiting then; glass: the Mac draws the glass, so this page draws none.
// corner: the one the tray rests in.
type State = { ready: Ready[]; before?: number; working: number; now: number; open?: boolean; scale?: number; glass?: boolean; corner?: Grip };
type Part = 'tag' | 'card';
type Tone = 'light' | 'dark';

type Bridge = {
  onState: (fn: (s: State) => void) => () => void;
  onOpen: (fn: (open: boolean) => void) => () => void;
  onReset: (fn: () => void) => () => void;
  onDragging: (fn: (dragging: boolean) => void) => () => void;
  onTone?: (fn: (tone: Tone) => void) => () => void;
  onMeasure?: (fn: () => void) => () => void;
  zoom?: () => number;
  ready: (part: Part) => Promise<unknown>;
  size: (part: Part, w: number, h: number, glass?: { x: number; y: number; width: number; height: number }, radius?: number) => Promise<unknown>;
  clickable: (on: boolean) => Promise<unknown>;
  hover: (part: Part, inside: boolean) => Promise<unknown>;
  toggle: () => Promise<unknown>;
  press: (x: number, y: number) => Promise<unknown>;
  release: (cancelled?: boolean) => Promise<unknown>;
  go: (id: string | null) => Promise<unknown>;
  dismiss: (id: string) => Promise<unknown>;
  hide: (choice: string) => Promise<unknown>;
  resize: (by: number) => Promise<unknown>;
  place: (corner: Grip) => Promise<unknown>;
  settings: () => Promise<unknown>;
  menu: () => Promise<unknown>;
};

const bridge = (window as unknown as { cornerTag?: Bridge }).cornerTag ?? null;
const params = new URLSearchParams(location.search);
const part: Part = params.get('part') === 'card' ? 'card' : 'tag';

// For pictures and for working on the page without the app: ?demo=ready or
// ?demo=working, with -open to show the list; ?s= draws it at a screen's scale;
// &place=1 opens the list on its four corners.
function demoState(): { state: State; open: boolean; placing: boolean } | null {
  const demo = params.get('demo');
  if (!demo) return null;
  const now = Date.now();
  const n = Number(params.get('n') ?? 2);
  const titles = ['Pricing page', 'Login redirect', 'Onboarding emails', 'A much longer thread title that will not fit on one line', 'Settings page', 'Competitor research', 'Release notes'];
  const ready = demo.startsWith('ready') ? Array.from({ length: n }, (_, i) => ({
    id: `demo-${i}`, title: titles[i % titles.length], says: i === 1 ? 'needs a yes' : 'is ready for you', since: now - [2, 9, 25, 40, 70, 95, 130][i % 7] * 60_000,
  })) : [];
  const scale = Number(params.get('s') ?? 1.1);
  const before = Number(params.get('before') ?? 0);
  return {
    state: { ready, before, working: demo.startsWith('ready') ? 20 - n : 20, now, scale, corner: 'br' },
    open: demo.endsWith('-open'), placing: params.get('place') === '1',
  };
}
const demo = demoState();
document.documentElement.classList.toggle('ct-demo', !!demo);

function useTagState() {
  const [state, setState] = useState<State>(demo?.state ?? { ready: [], working: 0, now: Date.now() });
  useEffect(() => bridge?.onState((s) => setState(s)), []);
  // ONE NUMBER IS THE WHOLE SIZE. The main process reads the width of the
  // screen the tag rests on (shared/corner-tag.mjs, tagScale) and sends it
  // here; everything in the tag and its list is written against it, so they
  // grow together on a 32" and stay small on a laptop.
  // The nine dots are the exception: they are whole pixels off that height,
  // never a fraction of it, or their rows and columns round unevenly.
  useEffect(() => {
    if (!state.scale) return;
    const root = document.documentElement;
    root.style.setProperty('--ct-s', String(state.scale));
    // The list follows the tag only part of the way: it is read a line at a
    // time and should sit near the size of everything else on the screen.
    root.style.setProperty('--ct-cs', String(cardScale(state.scale)));
  }, [state.scale]);
  // WHERE THE MAC DRAWS THE GLASS, THE PAGE DRAWS NONE, and its ink follows
  // the glass: dark over a light glass, light over a dark one. The Mac's own
  // light or dark setting is never asked.
  useEffect(() => { document.documentElement.classList.toggle('ct-native', !!state.glass); }, [state.glass]);
  useEffect(() => bridge?.onTone?.((tone) => {
    const root = document.documentElement;
    root.classList.toggle('ct-tone-dark', tone === 'dark');
    root.classList.toggle('ct-tone-light', tone === 'light');
  }), []);
  return state;
}

// The mark, and the one place that decides when it moves: whenever the words
// change, markMoves says whether this is news worth a turn, a count worth a
// pop, or nothing at all.
function Mark({ says, scale }: { says: { kind: string; count: number }; scale: number }) {
  const before = useRef<{ kind: string; count: number } | null>(null);
  const [beat, setBeat] = useState<{ move: Move; n: number }>({ move: 'none', n: 0 });
  useEffect(() => {
    const move = markMoves(before.current, says);
    before.current = says;
    if (move !== 'none') setBeat((b) => ({ move, n: b.n + 1 }));
  }, [says.kind, says.count]);
  return <Lattice box={10 * scale} lit={says.kind === 'ready'} move={beat.move} beat={beat.n} />;
}

// The window is sized to what it shows; tell it whenever that changes.
function useReportSize(ref: React.RefObject<HTMLElement>, which: Part, key: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !bridge) return;
    // The tag's window is the glass plus the clear band around it, so the
    // GLASS'S OWN RECTANGLE goes with the measurement: everything that places
    // the window works from that, not from the window's own edge. It used to
    // send one number, the band on the left, and the rest was worked out from
    // it — which is only true while the window is exactly the size the page
    // asked for. A drag widens the window first and lets the page catch up, so
    // the last guess of a drag can outlive it, and then the list lined up with
    // a window edge that was no longer the glass: "it is a little too far to
    // the right... it's just the right sides" (2026-10-13).
    const report = () => {
      const r = el.getBoundingClientRect();
      const glassEl = (el.querySelector('.ct-tag') ?? el) as HTMLElement;
      const g = glassEl.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(glassEl).borderTopLeftRadius);
      const m = inPoints({
        width: r.width, height: r.height,
        glass: { x: g.x - r.x, y: g.y - r.y, width: g.width, height: g.height },
        radius: Number.isFinite(radius) ? radius : undefined,
      }, bridge.zoom?.());
      bridge.size(which, m.width, m.height, m.glass, m.radius);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    // A page that redrew while its window was hidden may not have said so,
    // and the Mac's glass is placed from what it says (w-93b3a1a796).
    const onVisible = () => { if (document.visibilityState === 'visible') report(); };
    document.addEventListener('visibilitychange', onVisible);
    const offMeasure = bridge.onMeasure?.(report);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      offMeasure?.();
    };
  }, [key]);
}

/* --------------------------------- the tag --------------------------------- */
function Tag({ state, forceOpen = false }: { state: State; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const counts = { ready: state.ready.length };
  const says = tagSays(counts);
  const text = says?.text;

  useEffect(() => bridge?.onOpen((o) => setOpen(!!o)), []);
  useEffect(() => bridge?.onDragging((d) => setDragging(!!d)), []);
  useEffect(() => bridge?.onReset(() => { pressed.current = false; setDragging(false); setOpen(false); }), []);
  // Escape shuts the list, once a click has made the tag the active window.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) bridge?.toggle(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  useReportSize(ref, 'tag', text);

  if (!says) return null;

  const letGo = (cancelled: boolean) => {
    if (!pressed.current) return;
    pressed.current = false;
    bridge?.release(cancelled);
  };

  // WHAT IS UNDER THE POINTER RIGHT NOW. The window is the glass plus a clear
  // band, so a click in that band belongs to whatever is underneath; the main
  // process is told which it is, and lets the click through when it is not
  // ours. Moves keep arriving either way, because the window forwards them.
  const overUs = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return !!el?.closest('.ct-tag');
  };

  return (
    <div
      ref={ref}
      className={`ct-frame${demo ? ' is-demo' : ''}`}
      onPointerMove={(e) => bridge?.clickable(overUs(e))}
      onPointerLeave={() => bridge?.clickable(false)}
    >
    <div
      role="button"
      aria-label={`${says.label}. Click to open ${NAME}, drag to move.`}
      aria-expanded={open}
      className={`ct-glass ct-tag ${says.kind}${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      onPointerEnter={() => bridge?.hover('tag', true)}
      onPointerLeave={() => { if (!pressed.current) bridge?.hover('tag', false); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pressed.current = true;
        // Where the button went down, so a drag starts from there and not from
        // wherever the cursor has got to by the time this arrives.
        bridge?.press(e.screenX, e.screenY);
      }}
      onPointerUp={(e) => {
        letGo(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => letGo(true)}
      onLostPointerCapture={() => letGo(true)}
      onContextMenu={(e) => { e.preventDefault(); bridge?.menu(); }}
    >
      <Mark scale={state.scale ?? 1} says={{ kind: says.kind, count: counts.ready }} />
      <span className="ct-count">{text}</span>
    </div>
    </div>
  );
}

/* --------------------------------- the list -------------------------------- */
function CardBody({ state, placing, setPlacing }: { state: State; placing: boolean; setPlacing: (on: boolean) => void }) {
  const { lines, more } = cardLines(state.ready, state.now);
  if (placing) {
    const says = tagSays({ ready: state.ready.length });
    const tray = (
      <span className="ct-tag ct-chip">
        <Lattice box={10 * cardScale(state.scale ?? 1)} lit={says?.kind === 'ready'} move="none" beat={0} />
        {says && <span className="ct-count">{says.text}</span>}
      </span>
    );
    return <PlacePicker here={state.corner} tray={tray} onPick={(c) => bridge?.place(c)} onBack={() => setPlacing(false)} />;
  }
  return (
    <>
      {/* Her pick of five (w-93b3a1a796): the tray counts only these, so the
          list says so. */}
      {lines.length > 0 && <div className="ct-quiet ct-static ct-head">New since you left</div>}
      {lines.map((l) => (
        <div key={l.id} className="ct-row">
          <button className="ct-line" onClick={() => bridge?.go(l.open === undefined ? l.id : l.open)}>
            <span className="ct-pip" />
            <span className="ct-name">{l.title}</span>
            <span className="ct-says">{l.says}</span>
            <span className="ct-when">{l.waited}</span>
          </button>
          {/* "Be able to X out one of the agents" (w-93b3a1a796). Off the
              tray only; the thread stays in Needs you. */}
          <button className="ct-x" aria-label={`Clear ${l.title} from the tray`} title="Clear from the tray" onClick={() => bridge?.dismiss(l.id)}>
            <svg viewBox="0 0 10 10" aria-hidden><path d="M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8" /></svg>
          </button>
        </div>
      ))}
      {more > 0 && <button className="ct-line ct-quiet" onClick={() => bridge?.go(null)}><span className="ct-mark-sp" />and {more} more</button>}
      {(state.before ?? 0) > 0 && <button className="ct-line ct-quiet" onClick={() => bridge?.go(null)}><span className="ct-mark-sp" />and {state.before} from before</button>}
      {!lines.length && <div className="ct-quiet ct-static">Nothing is ready for you yet</div>}
      {state.working > 0 && (
        <button className="ct-line ct-quiet" onClick={() => bridge?.go(null)}>
          <Lattice box={10 * cardScale(state.scale ?? 1)} lit={false} move="none" beat={0} />
          {lines.length ? `${state.working} others working` : `${state.working} working`}
        </button>
      )}
      <div className="ct-foot">
        <span>Hide for</span>
        {HIDE_CHOICES.map((c: { key: string; label: string }) => (
          <button key={c.key} onClick={() => bridge?.hide(c.key)}>{c.label}</button>
        ))}
        {/* SIZING THE TRAY FROM THE LIST (2026-10-13, her pick). It lives here
            because the list only opens when she asks for it, so nothing is
            drawn on the tag itself, and because the tag stays in plain sight
            beside it while she decides: "you still need to see the component
            to be able to make those decisions". Two halves of one small pill
            rather than a pair of loose characters. */}
        <span className="ct-size">
          <span className="ct-size-name">Size</span>
          <span className="ct-steps">
            <button aria-label="Smaller" title="Smaller" onClick={() => bridge?.resize(-1)}>
              <svg viewBox="0 0 10 10" aria-hidden><path d="M2.4 5h5.2" /></svg>
            </button>
            <button aria-label="Bigger" title="Bigger" onClick={() => bridge?.resize(1)}>
              <svg viewBox="0 0 10 10" aria-hidden><path d="M2.4 5h5.2M5 2.4v5.2" /></svg>
            </button>
          </span>
        </span>
        <MoveButton here={state.corner} onOpen={() => setPlacing(true)} />
        <span className="ct-sep" />
        <button className="ct-off" onClick={() => bridge?.settings()}>Turn off…</button>
      </div>
    </>
  );
}

function Card({ state }: { state: State }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState(!!demo?.placing);
  useReportSize(ref, 'card', null);
  useEffect(() => bridge?.onOpen((o) => { if (!o) setPlacing(false); }), []);
  // Escape steps back from the corners to the list, and shuts the list.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (placing) setPlacing(false); else bridge?.toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [placing]);
  return (
    <div
      ref={ref}
      className="ct-glass ct-card"
      style={demo ? { position: 'relative' } : undefined}
      onPointerEnter={() => bridge?.hover('card', true)}
      onPointerLeave={() => bridge?.hover('card', false)}
    >
      <CardBody state={state} placing={placing} setPlacing={setPlacing} />
    </div>
  );
}

function Page() {
  const state = useTagState();
  useEffect(() => { bridge?.ready(part); }, []);
  // The demo has no windows, so it lays the list out above the tag in the
  // bottom-right of the page, the way the corner rests by default.
  if (demo) {
    return (
      <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {demo.open && <Card state={state} />}
        <Tag state={state} forceOpen={demo.open} />
      </div>
    );
  }
  return part === 'card' ? <Card state={state} /> : <Tag state={state} />;
}

createRoot(document.getElementById('root')!).render(<Page />);
