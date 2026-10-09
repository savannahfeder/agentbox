// THE CORNER TAG'S PAGES (w-dafae58a23). One page, drawn twice: `?part=tag` is
// the tag itself and `?part=card` is the list that opens beside it, each in its
// own window (main/corner-tag.mjs), each window exactly the size of what it
// shows, on the system's own frosted material. shared/corner-tag.mjs owns the
// words and the rules; this is the drawing and the pointer.
//
// THE POINTER, settled with Codex and then with real mouse events:
// - The tag is movable as it is, with nothing drawn to say so: press and move.
// - A click (press and let go without moving) opens the list; a second shuts it.
// - The page only reports the button going down and coming up. The drag in
//   between is read off the real cursor by the main process, because a real
//   drag must not depend on this page being sent every move.
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
  onDragging: (fn: (dragging: boolean) => void) => () => void;
  ready: (part: Part) => Promise<unknown>;
  size: (part: Part, w: number, h: number) => Promise<unknown>;
  hover: (part: Part, inside: boolean) => Promise<unknown>;
  toggle: () => Promise<unknown>;
  press: (x: number, y: number) => Promise<unknown>;
  release: (cancelled?: boolean) => Promise<unknown>;
  go: (id: string | null) => Promise<unknown>;
  hide: (choice: string) => Promise<unknown>;
  settings: () => Promise<unknown>;
  menu: () => Promise<unknown>;
};

const bridge = (window as unknown as { cornerTag?: Bridge }).cornerTag ?? null;
const params = new URLSearchParams(location.search);
const part: Part = params.get('part') === 'card' ? 'card' : 'tag';

// For pictures and for working on the page without the app: ?demo=ready or
// ?demo=working, with -open to show the list; ?theme=dark|light; ?copy= to try
// other words for the tag. Without the system material, a demo draws its own
// stand-in blur.
function demoState(): { state: State; open: boolean } | null {
  const demo = params.get('demo');
  if (!demo) return null;
  const now = Date.now();
  const n = Number(params.get('n') ?? 2);
  const titles = ['Pricing page', 'Login redirect', 'Onboarding emails', 'A much longer thread title that will not fit on one line', 'Settings page', 'Competitor research', 'Release notes'];
  const ready = demo.startsWith('ready') ? Array.from({ length: n }, (_, i) => ({
    id: `demo-${i}`, title: titles[i % titles.length], says: i === 1 ? 'needs a yes' : 'is ready for you', since: now - [2, 9, 25, 40, 70, 95, 130][i % 7] * 60_000,
  })) : [];
  return { state: { ready, working: demo.startsWith('ready') ? 20 - n : 20, now }, open: demo.endsWith('-open') };
}
const demo = demoState();
const theme = params.get('theme');
document.documentElement.classList.toggle('ct-demo', !!demo);
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
if (demo && params.get('corners')) document.documentElement.dataset.corners = params.get('corners')!;
if (demo && params.get('dot')) document.documentElement.dataset.dot = params.get('dot')!;

// Other words for the tag, for the pictures that compare them.
const COPY: Record<string, (n: number) => string> = {
  ready: (n) => `${n} ready`,
  waiting: (n) => `${n} waiting`,
  foryou: (n) => `${n} for you`,
  needyou: (n) => `${n} need you`,
  done: (n) => `${n} done`,
};

function useTagState() {
  const [state, setState] = useState<State>(demo?.state ?? { ready: [], working: 0, now: Date.now() });
  useEffect(() => bridge?.onState((s) => setState(s)), []);
  return state;
}

function Half({ size = 11 }: { size?: number }) {
  return (
    <svg className="ct-half" width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.4a3.6 3.6 0 0 1 0 7.2z" fill="currentColor" />
    </svg>
  );
}

// The window is sized to what it shows; tell it whenever that changes.
function useReportSize(ref: React.RefObject<HTMLElement>, which: Part, key: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !bridge) return;
    const report = () => { const r = el.getBoundingClientRect(); bridge.size(which, r.width, r.height); };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
}

/* --------------------------------- the tag --------------------------------- */
function Tag({ state, forceOpen = false }: { state: State; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const counts = { ready: state.ready.length, working: state.working };
  const says = tagSays(counts);
  const copy = params.get('copy');
  const text = says && says.kind === 'ready' && copy && COPY[copy] ? COPY[copy](counts.ready) : says?.text;

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

  return (
    <div
      ref={ref}
      role="button"
      aria-label={`${text}. Click to open, drag to move.`}
      aria-expanded={open}
      className={`ct-glass ct-tag ${says.kind}${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      style={demo ? { position: 'relative' } : undefined}
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
      {says.kind === 'ready' ? <span className="ct-dot" /> : <Half />}
      <span className="ct-words">{text}</span>
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
  useReportSize(ref, 'card', null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') bridge?.toggle(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div
      ref={ref}
      className="ct-glass ct-card"
      style={demo ? { position: 'relative' } : undefined}
      onPointerEnter={() => bridge?.hover('card', true)}
      onPointerLeave={() => bridge?.hover('card', false)}
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
      <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {demo.open && <Card state={state} />}
        <Tag state={state} forceOpen={demo.open} />
      </div>
    );
  }
  return part === 'card' ? <Card state={state} /> : <Tag state={state} />;
}

createRoot(document.getElementById('root')!).render(<Page />);
