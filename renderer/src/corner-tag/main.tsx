// THE CORNER TAG'S PAGES (w-dafae58a23). One page, drawn twice: `?part=tag` is
// the tag itself and `?part=card` is the list that opens beside it, each in its
// own window (main/corner-tag.mjs) so the tag never moves when the list opens.
// shared/corner-tag.mjs owns the words and the rules; this is the drawing and
// the pointer.
//
// THE POINTER, settled with Codex after a real-Electron run:
// - Pointing at the tag only shows that it moves: a grip takes the place of
//   its mark and the cursor becomes a hand. Nothing opens on a pass, because a
//   pointer crossing the corner on its way somewhere is not a request.
// - A click opens the list, and a second click shuts it.
// - Press and move, and it drags instead; it never opens on a drag.
// - Off both the tag and the list for a moment, and the list shuts.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HIDE_CHOICES, cardLines, tagSays } from '../../../shared/corner-tag.mjs';
import './corner-tag.css';

type Ready = { id: string; title: string; says: string; since?: number; open?: string | null };
type State = { ready: Ready[]; working: number; now: number; open?: boolean };
type Part = 'tag' | 'card';

type Bridge = {
  onState: (fn: (s: State) => void) => () => void;
  onOpen: (fn: (open: boolean) => void) => () => void;
  onReset: (fn: () => void) => () => void;
  ready: (part: Part) => Promise<unknown>;
  size: (part: Part, w: number, h: number) => Promise<unknown>;
  solid: (part: Part, solid: boolean) => Promise<unknown>;
  hover: (part: Part, inside: boolean) => Promise<unknown>;
  toggle: () => Promise<unknown>;
  dragStart: () => Promise<unknown>;
  drag: (dx: number, dy: number) => Promise<unknown>;
  dragEnd: () => Promise<unknown>;
  go: (id: string | null) => Promise<unknown>;
  hide: (choice: string) => Promise<unknown>;
  settings: () => Promise<unknown>;
  menu: () => Promise<unknown>;
};

const PAD = 16;
// Far enough that a click with a shaky hand is still a click.
const DRAG_FROM_PX = 6;

const bridge = (window as unknown as { cornerTag?: Bridge }).cornerTag ?? null;
const params = new URLSearchParams(location.search);
const part: Part = params.get('part') === 'card' ? 'card' : 'tag';

// For pictures and for working on the page without the app: ?demo=ready,
// ?demo=working, with -open to show the list or -hover to show the grip.
function demoState(): { state: State; open: boolean; hover: boolean } | null {
  const demo = params.get('demo');
  if (!demo) return null;
  const now = Date.now();
  const n = Number(params.get('n') ?? 2);
  const titles = ['Pricing page', 'Login redirect', 'Onboarding emails', 'A much longer thread title that will not fit on one line', 'Settings page', 'Competitor research', 'Release notes'];
  const ready = demo.startsWith('ready') ? Array.from({ length: n }, (_, i) => ({
    id: `demo-${i}`, title: titles[i % titles.length], says: i === 1 ? 'needs a yes' : 'is ready for you', since: now - [12, 3, 25, 40, 7, 61, 90][i % 7] * 60_000,
  })) : [];
  return { state: { ready, working: demo.startsWith('ready') ? 20 - n : 20, now }, open: demo.endsWith('-open'), hover: demo.endsWith('-hover') };
}
const demo = demoState();

function useTagState() {
  const [state, setState] = useState<State>(demo?.state ?? { ready: [], working: 0, now: Date.now() });
  useEffect(() => bridge?.onState((s) => setState(s)), []);
  return state;
}

function Half({ size = 11 }: { size?: number }) {
  return (
    <svg className="ct-half" width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="rgba(29,29,31,.52)" strokeWidth="1.3" />
      <path d="M6 2.4a3.6 3.6 0 0 1 0 7.2z" fill="rgba(29,29,31,.52)" />
    </svg>
  );
}

// Six dots: the sign, everywhere, for "this can be picked up and moved".
function Grip() {
  return (
    <svg className="ct-grip" width="11" height="11" viewBox="0 0 11 11" aria-hidden>
      {[2.5, 5.5, 8.5].map((y) => [3.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.05" fill="rgba(29,29,31,.55)" />))}
    </svg>
  );
}

/* --------------------------------- the tag --------------------------------- */
function Tag({ state, forceOpen = false, forceHover = false }: { state: State; forceOpen?: boolean; forceHover?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; id: number; dragging: boolean } | null>(null);
  const says = tagSays({ ready: state.ready.length, working: state.working });

  useEffect(() => bridge?.onOpen((o) => setOpen(!!o)), []);
  useEffect(() => bridge?.onReset(() => { press.current = null; setDragging(false); setOpen(false); }), []);

  // The window is sized to the tag; tell it whenever the words change length.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !bridge) return;
    const report = () => { const r = el.getBoundingClientRect(); bridge.size('tag', r.width, r.height); };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [says?.text]);

  if (!says) return null;

  // However a press ends (let go, cancelled, or the pointer taken away before
  // it became a drag), it is over, and the tag re-reads where the pointer is.
  const endPress = () => {
    const p = press.current;
    press.current = null;
    setDragging(false);
    if (p?.dragging) bridge?.dragEnd();
    const over = !!ref.current?.matches(':hover');
    bridge?.solid('tag', over);
    bridge?.hover('tag', over);
  };

  return (
    <div
      ref={ref}
      role="button"
      aria-label={`${says.text}. Click to open, drag to move.`}
      aria-expanded={open}
      className={`ct-glass ct-tag ${says.kind}${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${forceHover ? ' is-hover' : ''}`}
      style={demo ? { position: 'relative' } : { left: PAD, top: PAD }}
      // The one line of instruction, and only for someone who rests on it.
      title={dragging || open ? '' : 'Click to open, drag to move'}
      onPointerEnter={() => { bridge?.solid('tag', true); bridge?.hover('tag', true); }}
      onPointerLeave={() => { if (press.current) return; bridge?.solid('tag', false); bridge?.hover('tag', false); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { x: e.screenX, y: e.screenY, id: e.pointerId, dragging: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || !bridge) return;
        const dx = e.screenX - p.x;
        const dy = e.screenY - p.y;
        if (!p.dragging) {
          if (Math.hypot(dx, dy) < DRAG_FROM_PX) return;
          p.dragging = true;
          setDragging(true);
          bridge.dragStart();
        }
        bridge.drag(dx, dy);
      }}
      onPointerUp={(e) => {
        const p = press.current;
        if (!p) return;
        const wasDrag = p.dragging;
        if (e.currentTarget.hasPointerCapture(p.id)) e.currentTarget.releasePointerCapture(p.id);
        endPress();
        if (!wasDrag) bridge?.toggle();
      }}
      onPointerCancel={endPress}
      onLostPointerCapture={() => { if (press.current) endPress(); }}
      onContextMenu={(e) => { e.preventDefault(); bridge?.menu(); }}
    >
      <span className="ct-mark">
        <span className="ct-state">{says.kind === 'ready' ? <span className="ct-dot" /> : <Half />}</span>
        <Grip />
      </span>
      <span className="ct-words">{says.text}</span>
    </div>
  );
}

/* --------------------------------- the list -------------------------------- */
function CardBody({ state }: { state: State }) {
  const { lines, more } = cardLines(state.ready, state.now);
  return (
    <>
      {lines.map((l) => (
        <button key={l.id} className="ct-line" onClick={() => bridge?.go(l.open === undefined ? l.id : l.open)}>
          <span className="ct-dot" />
          <span className="ct-name">{l.title}</span>
          <span className="ct-says">{l.says}</span>
          <span className="ct-when">{l.waited}</span>
        </button>
      ))}
      {more > 0 && <button className="ct-line ct-quiet" onClick={() => bridge?.go(null)}><span className="ct-mark-sp" />and {more} more</button>}
      {!lines.length && <div className="ct-quiet ct-static">Nothing is ready for you yet</div>}
      {state.working > 0 && (
        <button className="ct-line ct-quiet" onClick={() => bridge?.go(null)}>
          <Half size={10} />{lines.length ? `${state.working} others working` : `${state.working} working`}
        </button>
      )}
      <div className="ct-foot">
        <span>Hide for</span>
        {HIDE_CHOICES.map((c: { key: string; label: string }) => (
          <button key={c.key} onClick={() => bridge?.hide(c.key)}>{c.label}</button>
        ))}
        <span className="ct-sep" />
        <button className="ct-off" onClick={() => bridge?.settings()}>Turn off…</button>
      </div>
    </>
  );
}

function Card({ state }: { state: State }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !bridge) return;
    const report = () => { const r = el.getBoundingClientRect(); bridge.size('card', r.width, r.height); };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="ct-glass ct-card"
      style={demo ? { position: 'relative' } : { left: PAD, top: PAD }}
      onPointerEnter={() => { bridge?.solid('card', true); bridge?.hover('card', true); }}
      onPointerLeave={() => { bridge?.solid('card', false); bridge?.hover('card', false); }}
    >
      <CardBody state={state} />
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
      <div style={{ position: 'absolute', right: PAD, bottom: PAD, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {demo.open && <Card state={state} />}
        <Tag state={state} forceOpen={demo.open} forceHover={demo.hover} />
      </div>
    );
  }
  return part === 'card' ? <Card state={state} /> : <Tag state={state} />;
}

createRoot(document.getElementById('root')!).render(<Page />);
