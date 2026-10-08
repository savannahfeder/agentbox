// THE CORNER TAG'S PAGE (w-dafae58a23). It draws the tag and, while you point
// at it, the short list of what is ready. main/corner-tag.mjs owns the window;
// shared/corner-tag.mjs owns the words and the rules. This file is the drawing
// and the pointer: hover opens, a drag moves, a click opens the app, a
// right-click offers the hides.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HIDE_CHOICES, cardLines, tagSays } from '../../../shared/corner-tag.mjs';
import './corner-tag.css';

type Ready = { id: string; title: string; says: string; since?: number; open?: string | null };
type State = { ready: Ready[]; working: number; now: number };
type Spot = { x: number; y: number };
type Opened = { tag: Spot; card: Spot; above: boolean; alignRight: boolean };

type Bridge = {
  onState: (fn: (s: State) => void) => () => void;
  size: (w: number, h: number) => Promise<unknown>;
  open: (w: number, h: number) => Promise<Opened | null>;
  close: () => Promise<unknown>;
  dragStart: () => Promise<unknown>;
  drag: (dx: number, dy: number) => Promise<unknown>;
  dragEnd: () => Promise<unknown>;
  go: (id: string | null) => Promise<unknown>;
  hide: (choice: string) => Promise<unknown>;
  settings: () => Promise<unknown>;
  menu: () => Promise<unknown>;
};

const PAD = 16;
const DRAG_FROM_PX = 3;
const CLOSE_AFTER_MS = 260;

// For pictures and for working on the page without the app: ?demo=ready,
// ?demo=working, and either with -open to show the list.
function demoState(): { state: State; open: boolean } | null {
  const demo = new URLSearchParams(location.search).get('demo');
  if (!demo) return null;
  const now = Date.now();
  const ready = demo.startsWith('ready') ? [
    { id: 'demo-1', title: 'Pricing page', says: 'is ready for you', since: now - 12 * 60_000 },
    { id: 'demo-2', title: 'Login redirect', says: 'needs a yes', since: now - 3 * 60_000 },
  ] : [];
  return { state: { ready, working: demo.startsWith('ready') ? 18 : 20, now }, open: demo.endsWith('-open') };
}

function Half({ size = 11 }: { size?: number }) {
  return (
    <svg className="ct-half" width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="rgba(29,29,31,.52)" strokeWidth="1.3" />
      <path d="M6 2.4a3.6 3.6 0 0 1 0 7.2z" fill="rgba(29,29,31,.52)" />
    </svg>
  );
}

function Card({ state, bridge }: { state: State; bridge: Bridge | null }) {
  const { lines, more } = cardLines(state.ready, state.now);
  const others = state.working;
  return (
    <>
      {lines.map((l, i) => (
        <React.Fragment key={l.id}>
          {i > 0 && <div className="ct-gap" />}
          <div className="ct-line" onClick={() => bridge?.go(l.open === undefined ? l.id : l.open)}>
            <span className="ct-dot" />
            <span className="ct-name">{l.title}</span>
            <span className="ct-says">{l.says}</span>
            <span className="ct-when">{l.waited}</span>
          </div>
        </React.Fragment>
      ))}
      {more > 0 && <div className="ct-quiet" style={{ paddingLeft: 16 }}>and {more} more</div>}
      {!lines.length && <div className="ct-quiet">Nothing is ready for you yet</div>}
      {others > 0 && (
        <div className="ct-quiet" style={{ marginTop: lines.length ? 6 : 0 }}>
          <Half size={10} />{lines.length ? `${others} others working` : `${others} working`}
        </div>
      )}
      <div className="ct-foot">
        <span>Hide for</span>
        {HIDE_CHOICES.map((c: { key: string; label: string }) => (
          <button key={c.key} onClick={() => bridge?.hide(c.key)}>{c.label}</button>
        ))}
        <button className="ct-off" onClick={() => bridge?.settings()}>Turn off…</button>
      </div>
    </>
  );
}

function CornerTag() {
  const bridge = (window as unknown as { cornerTag?: Bridge }).cornerTag ?? null;
  const demo = useRef(demoState()).current;
  const [state, setState] = useState<State>(demo?.state ?? { ready: [], working: 0, now: Date.now() });
  const [opened, setOpened] = useState<Opened | null>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => bridge?.onState((s) => setState(s)), [bridge]);

  const says = tagSays({ ready: state.ready.length, working: state.working });

  // The window is sized to the tag; tell it whenever the words change length.
  useLayoutEffect(() => {
    const el = tagRef.current;
    if (!el || !bridge) return;
    const report = () => { const r = el.getBoundingClientRect(); bridge.size(r.width, r.height); };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bridge, says?.text]);

  const openCard = useCallback(async () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (!bridge || opened || press.current?.dragging) return;
    const r = measureRef.current?.getBoundingClientRect();
    if (!r) return;
    const at = await bridge.open(r.width, r.height);
    if (at) setOpened(at);
  }, [bridge, opened]);

  const closeSoon = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpened(null);
      bridge?.close();
    }, CLOSE_AFTER_MS);
  }, [bridge]);

  // Pressing and moving drags the window; pressing and letting go opens the app.
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    press.current = { x: e.screenX, y: e.screenY, dragging: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || !bridge) return;
    const dx = e.screenX - p.x;
    const dy = e.screenY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < DRAG_FROM_PX) return;
      p.dragging = true;
      setOpened(null);
      bridge.dragStart();
    }
    bridge.drag(dx, dy);
  };
  const onUp = () => {
    const p = press.current;
    press.current = null;
    if (!p || !bridge) return;
    if (p.dragging) { bridge.dragEnd(); return; }
    const first = cardLines(state.ready, state.now).lines[0];
    bridge.go(first ? (first.open === undefined ? first.id : first.open ?? null) : null);
  };

  if (!says) return null;

  const tag = (
    <div
      ref={tagRef}
      className={`ct-glass ct-tag ${says.kind}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onContextMenu={(e) => { e.preventDefault(); bridge?.menu(); }}
    >
      {says.kind === 'ready' ? <span className="ct-dot" /> : <Half />}
      <span className="ct-words">{says.text}</span>
    </div>
  );

  // The demo has no window to resize, so it lays the list out above the tag,
  // in the bottom-right of the page, the way the corner rests by default.
  if (demo) {
    return (
      <div style={{ position: 'absolute', right: PAD, bottom: PAD, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {demo.open && <div className="ct-glass ct-card" style={{ position: 'relative' }}><Card state={state} bridge={null} /></div>}
        {React.cloneElement(tag, { style: { position: 'relative' } })}
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }} onMouseEnter={openCard} onMouseLeave={closeSoon}>
      {React.cloneElement(tag, { style: opened ? { left: opened.tag.x, top: opened.tag.y } : { left: PAD, top: PAD } })}
      {opened && (
        <div className="ct-glass ct-card" style={{ left: opened.card.x, top: opened.card.y }}>
          <Card state={state} bridge={bridge} />
        </div>
      )}
      <div ref={measureRef} className="ct-glass ct-card ct-measure"><Card state={state} bridge={null} /></div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<CornerTag />);
