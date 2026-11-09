// A picture in a thread, opened full screen over it. The side pane is still one
// press away ("Open beside"), and so is Preview.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clickZoom, isDoubleTap, lowestZoom, panLimits, panToKeep, pictureFit, picturesBeside, pinchTo, readyAround, stepTo, swipeStep, zoomBy, PICTURE_WAIT_MS, type Picture } from '../picture-view';
import { doubleTapScale, onPhone } from '../phone-screen';
import { CrossIcon } from './CrossIcon';
import { focusTheReplyBox } from '../focus-at-end';
import { opening, seenAt } from '../picture';

export type { Picture };

/** How long the pointer has to rest before the controls fade and leave only the picture. */
const IDLE_MS = 2400;
/** How long a single tap waits to be sure it is not the first of a double tap. */
const TAP_MS = 260;

// A finger never rests the way a mouse does, so on a touch screen the controls
// do not fade on a timer: faded, they took no taps, and the tap that brought
// them back was swallowed by iOS, so Close never answered.
const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

type Touching =
  | { kind: 'one'; x: number; y: number; t: number; pan: { x: number; y: number }; zoom: number; moved: boolean }
  | { kind: 'two'; distance: number; mid: { x: number; y: number }; pan: { x: number; y: number }; zoom: number };

/** The pictures a click on `href` steps through: those in the pressed picture's part of the thread. */
export function picturesFor(root: ParentNode | null, href: string, from?: Element | null): { pictures: Picture[]; start: number } {
  const doors = root ? [...root.querySelectorAll<HTMLElement>('[data-picture]')].filter((d) => d.querySelector('img')) : [];
  const pressed = from?.closest<HTMLElement>('[data-picture]');
  let at = pressed ? doors.indexOf(pressed) : -1;
  // A link in words names the picture its own turn draws, before one drawn anywhere else.
  const turn = from?.closest('[data-exchange]');
  const named = doors.flatMap((d, i) => (d.dataset.picture === href ? [i] : []));
  if (at < 0) at = named.filter((i) => turn?.contains(doors[i])).at(-1) ?? named.at(-1) ?? -1;
  if (at < 0) return { pictures: [{ path: href, url: null }], start: 0 };
  return picturesBeside(doors.map((d) => {
    const img = d.querySelector('img')!;
    // A thread draws a picture from a shrunk copy (FittedImg); the viewer opens the whole one.
    return { path: d.dataset.picture!, url: img.dataset.full || img.currentSrc || img.src || null, section: d.closest<HTMLElement>('[data-exchange]')?.dataset.exchange ?? null };
  }), at);
}

type Ready = { url: string; w: number; h: number; img: HTMLImageElement };

// Holding the decoded element keeps it in this window, so an <img> with the
// same url draws at once instead of reading the file again: the app serves
// pictures no-store.
function decoded(url: string): Promise<Ready> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  let timer: number | undefined;
  const late = new Promise<never>((_, no) => { timer = window.setTimeout(() => no(new Error('slow')), PICTURE_WAIT_MS); });
  return Promise.race([img.decode(), late])
    .finally(() => window.clearTimeout(timer))
    .then(() => ({ url, w: img.naturalWidth, h: img.naturalHeight, img }));
}

// The cross's recipe: a 24 grid, a 1.1 hairline, round caps, no fill.
function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const CHEVRON_LEFT = 'M14.5 5.5 8 12l6.5 6.5';
const CHEVRON_RIGHT = 'M9.5 5.5 16 12l-6.5 6.5';
const BESIDE = 'M4.5 5.5h15v13h-15zM14 5.5v13';
const OUTSIDE = 'M13.5 4.5h6v6M19.5 4.5l-8 8M17.5 13.5v6h-13v-13h6';

export function PictureView({ pictures, start, resolve, onClose, onBeside, onPreview }: {
  pictures: Picture[];
  start: number;
  resolve: (path: string) => Promise<string | null>;
  onClose: () => void;
  onBeside: (path: string) => void;
  onPreview: (path: string) => void;
}) {
  const [index, setIndex] = useState(start);
  const shown = pictures[index];
  // What is on the stage. It stays there until the next picture can be drawn.
  const [drawn, setDrawn] = useState<(Ready & { path: string }) | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [idle, setIdle] = useState(false);
  // Controls put away by a tap, on a touch screen.
  const [bare, setBare] = useState(false);
  const touchScreen = useRef(touchOnly()).current;
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const touching = useRef<Touching | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const touchedAt = useRef(0);
  const stage = useRef<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const placed = useRef(false);
  const dialog = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const ready = useRef(new Map<string, Promise<Ready>>());
  const [at] = useState(opening);

  // The url the thread drew it from first; if that fails, the file is looked
  // for by its path, the way a click on it outside this view would.
  const read = (p: Picture): Promise<Ready> => {
    const had = ready.current.get(p.path);
    if (had) return had;
    const found = () => resolve(p.path).then((u) => (u ? decoded(seenAt(u, at)) : Promise.reject(new Error('missing'))));
    const got = p.url ? decoded(seenAt(p.url, at)).catch(found) : found();
    ready.current.set(p.path, got);
    got.catch(() => ready.current.delete(p.path));
    return got;
  };

  useEffect(() => {
    setZoom(1); setPan({ x: 0, y: 0 });
    if (!shown) return;
    let live = true;
    read(shown).then(
      (r) => { if (live) { setDrawn({ ...r, path: shown.path }); setFailed(null); } },
      () => { if (live) setFailed(shown.path); },
    );
    for (const i of readyAround(index, pictures.length)) read(pictures[i]).catch(() => {});
    return () => { live = false; };
  }, [index]);

  // The open one is kept in the middle of the row, so it is never scrolled out of sight.
  useEffect(() => {
    const row = strip.current;
    const on = row?.children[index] as HTMLElement | undefined;
    if (!row || !on) return;
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: placed.current ? 'smooth' : 'auto' });
    placed.current = true;
  }, [index]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The controls stay while the pointer rests on one of them.
  const wake = (e?: { target: EventTarget | null }) => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    if (touchScreen || (e?.target as HTMLElement | null)?.closest?.('.pv-chrome')) return;
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => { wake(); return () => { window.clearTimeout(idleTimer.current); window.clearTimeout(tapTimer.current); }; }, []);

  // Taken at the window before the app's own keys, so J, K and Esc act on the
  // picture and not on the thread behind it.
  useEffect(() => {
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.stopImmediatePropagation();
      wake();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); requestAnimationFrame(() => focusTheReplyBox()); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => stepTo(i, pictures.length, e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        const by = e.key.startsWith('Page') ? boxNow.current.h * 0.9 : 80;
        scrollBy(0, e.key.endsWith('Up') ? by : -by);
      }
      else if (e.key === '=' || e.key === '+') setZoom((z) => zoomBy(z, 1.5, floorNow.current));
      else if (e.key === '-') { setZoom((z) => { const next = zoomBy(z, 1 / 1.5, floorNow.current); setPan((p) => clampNow.current(p, next)); return next; }); }
      else if (e.key === '0') { setZoom(1); setPan(clampNow.current({ x: 0, y: Infinity }, 1)); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [pictures.length]);

  const natural = drawn ? { w: drawn.w, h: drawn.h } : { w: 0, h: 0 };
  // One rule with the file view: a long picture fits its width and scrolls, a phone screen fits whole.
  const fitted = pictureFit(natural, box);
  const fit = fitted.scale;
  const floor = lowestZoom(fitted);
  const size = { w: natural.w * fit, h: natural.h * fit };
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const lim = panLimits(size, z, box);
    return { x: Math.max(-lim.x, Math.min(lim.x, p.x)), y: Math.max(-lim.y, Math.min(lim.y, p.y)) };
  };
  const boxNow = useRef(box);
  boxNow.current = box;
  const floorNow = useRef(floor);
  floorNow.current = floor;
  const clampNow = useRef(clampPan);
  clampNow.current = clampPan;
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  const scrollBy = (dx: number, dy: number) => setPan((p) => clampNow.current({ x: p.x + dx, y: p.y + dy }, zoomNow.current));
  // Taller than the window, it opens at its top.
  const opensAt = `${drawn?.url}:${fitted.tall}:${Math.round(box.h)}`;
  useEffect(() => { if (fitted.tall) setPan(clampPan({ x: 0, y: Infinity }, 1)); }, [opensAt]);
  const overflows = size.w * zoom > box.w + 1 || size.h * zoom > box.h + 1;

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    drag.current = { px: e.clientX, py: e.clientY, x: pan.x, y: pan.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (overflows && d.moved) setPan(clampPan({ x: d.x + dx, y: d.y + dy }, zoom));
  };
  const fromMiddle = (e: { clientX: number; clientY: number }) => {
    const r = stage.current?.getBoundingClientRect();
    return r ? { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const next = clickZoom(zoom, fit);
    setZoom(next);
    setPan(clampPan(panToKeep(fromMiddle(e), pan, zoom, next), next));
  };

  // FINGERS: one pans an enlarged picture or swipes to the next, two pinch,
  // a tap shows or hides the controls and a double tap zooms.
  const touchIn = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('.pv-chrome')) return false;
    touchedAt.current = Date.now();
    return true;
  };
  const two = () => {
    const [a, b] = [...fingers.current.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), mid: fromMiddle({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
  };
  const fingerDown = (e: ReactPointerEvent) => {
    if (!touchIn(e)) { if (e.pointerType !== 'touch') wake(e); return; }
    // The first finger of a new touch: any finger whose lift went unheard is gone.
    if (e.isPrimary) fingers.current.clear();
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 2) touching.current = { kind: 'two', ...two(), pan, zoom };
    else if (fingers.current.size === 1) touching.current = { kind: 'one', x: e.clientX, y: e.clientY, t: Date.now(), pan, zoom, moved: false };
  };
  const fingerMove = (e: ReactPointerEvent) => {
    if (!fingers.current.has(e.pointerId)) { if (e.pointerType !== 'touch') wake(e); return; }
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = touching.current;
    if (g?.kind === 'two' && fingers.current.size >= 2) {
      const now = two();
      const next = pinchTo(g, now.distance, now.mid, floor);
      setZoom(next.zoom);
      setPan(clampPan(next.pan, next.zoom));
    } else if (g?.kind === 'one') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      if (g.moved && (g.zoom > 1 || overflows)) setPan(clampPan({ x: g.pan.x + dx, y: g.pan.y + dy }, g.zoom));
    }
  };
  const fingerUp = (e: ReactPointerEvent) => {
    if (!fingers.current.delete(e.pointerId)) return;
    touchedAt.current = Date.now();
    const g = touching.current;
    if (g?.kind === 'two') {
      // The finger still down carries on as a pan, never as a tap.
      const [rest] = [...fingers.current.values()];
      touching.current = rest ? { kind: 'one', x: rest.x, y: rest.y, t: 0, pan, zoom, moved: true } : null;
      if (zoom < 1.01 && floor >= 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
      return;
    }
    touching.current = null;
    if (!g || e.type === 'pointercancel') return;
    if (g.moved) {
      if (g.zoom <= 1.01 && !overflows) {
        const by = swipeStep(e.clientX - g.x, e.clientY - g.y);
        if (by) setIndex((i) => stepTo(i, pictures.length, by));
      }
      return;
    }
    const tap = { t: Date.now(), x: e.clientX, y: e.clientY };
    window.clearTimeout(tapTimer.current);
    if (isDoubleTap(lastTap.current, tap)) {
      lastTap.current = null;
      const next = doubleTapScale(zoom);
      setZoom(next);
      setPan(clampPan(panToKeep(fromMiddle(e), pan, zoom, next), next));
      return;
    }
    lastTap.current = tap;
    tapTimer.current = window.setTimeout(() => setBare((b) => !b), TAP_MS);
  };
  // The click a tap leaves behind is not a click on the dark around the picture.
  const closeFromBackdrop = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (e.target === e.currentTarget && Date.now() - touchedAt.current > 800) onClose();
  };

  const wheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey) {
      const next = zoomBy(zoom, Math.exp(-e.deltaY * 0.01), floor);
      const at = fromMiddle(e);
      setZoom(next);
      setPan((p) => clampPan(panToKeep(at, p, zoom, next), next));
    } else if (overflows) {
      setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, zoom));
    }
  };

  if (!shown) return null;
  const name = shown.path.split('/').pop() ?? shown.path;
  const many = pictures.length > 1;
  const go = (by: number) => setIndex(stepTo(index, pictures.length, by));
  const missing = failed === shown.path;
  const waiting = !!drawn && drawn.path !== shown.path;

  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-label={name}
      className={`picture-view${(idle && zoom === 1) || bare ? ' pv-idle' : ''}`}
      onPointerMove={fingerMove}
      onPointerDown={fingerDown}
      onPointerUp={fingerUp}
      onPointerCancel={fingerUp}
      onClick={closeFromBackdrop}
    >
      {drawn && !missing && <img className="pv-glow" src={drawn.url} crossOrigin="anonymous" alt="" aria-hidden="true" />}
      <div ref={stage} className="pv-stage" onWheel={wheel} onClick={closeFromBackdrop}>
        {missing
          ? <p className="pv-missing">This picture could not be opened.</p>
          : drawn && (
            <img
              src={drawn.url}
              alt={name}
              crossOrigin="anonymous"
              draggable={false}
              className={`pv-img${zoom > 1 ? ' pv-zoomed' : ''}${waiting ? ' pv-waiting' : ''}`}
              style={{
                width: size.w || undefined, height: size.h || undefined,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            />
          )}
      </div>

      <header className="pv-top pv-chrome">
        <span className="pv-title">
          <span className="pv-name">{name}</span>
          {many && <span className="pv-count">{index + 1} / {pictures.length}</span>}
        </span>
        <span className="pv-tools">
          <button type="button" className="pv-icon" onClick={() => onBeside(shown.path)} title="Open beside the thread" aria-label="Open beside the thread"><Glyph d={BESIDE} /></button>
          {/* Preview is on the computer, so on a phone the press showed nothing. */}
          {!onPhone() && <button type="button" className="pv-icon" onClick={() => onPreview(shown.path)} title="Open in Preview" aria-label="Open in Preview"><Glyph d={OUTSIDE} /></button>}
          <span className="pv-rule" aria-hidden="true" />
          <button type="button" className="pv-icon pv-close" onClick={onClose} title="Close (esc)" aria-label="Close"><CrossIcon /></button>
        </span>
      </header>

      {many && (
        <>
          <button type="button" className="pv-step pv-prev pv-chrome" disabled={index === 0} onClick={() => go(-1)} aria-label="Previous picture"><Glyph d={CHEVRON_LEFT} /></button>
          <button type="button" className="pv-step pv-next pv-chrome" disabled={index === pictures.length - 1} onClick={() => go(1)} aria-label="Next picture"><Glyph d={CHEVRON_RIGHT} /></button>
        </>
      )}

      {many && (
        <div ref={strip} className="pv-strip pv-chrome">
          {pictures.map((p, i) => (
            <button key={p.path} type="button" className={`pv-thumb${i === index ? ' is-on' : ''}`} aria-current={i === index || undefined} onClick={() => setIndex(i)} title={p.path.split('/').pop()}>
              {p.url && <img src={seenAt(p.url, at)} alt="" crossOrigin="anonymous" decoding="async" />}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
