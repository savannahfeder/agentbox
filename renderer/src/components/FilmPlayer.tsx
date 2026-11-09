// A film that plays, with our own bar everywhere. Says so when the file cannot be
// played, rather than sitting on a still. Paused on a frame, a click on the
// picture places a pin there, when whoever holds it takes pins.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { filmClickDoes, filmPinsAt, pinLean, type FilmMark, type FilmPin } from '../artifact-pins';
import { useFilmPoster } from '../film-poster';
import { keepFilmTime, keptFilmTime } from '../kept-scroll';
import { OPEN_WITHIN_MS, didNotOpen } from '../opening-wait';
import './file-views.css';

const clock = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// A pin's tag carries its time as well as its number.
const FILM_TAG_REACH = 84;

export function FilmCannotPlay({ name, onOutside }: { name: string; onOutside?: () => void }) {
  return <div className="doc-missing film-cannot">
    <span>{name} cannot be played here.</span>
    {onOutside && <button type="button" className="av-btn" onClick={onOutside}>Open outside</button>}
  </div>;
}

/** What a film element is doing, read from the element, which may outlive this component. */
export function useFilm(el: HTMLVideoElement | null, onTime?: (seconds: number) => void) {
  const [, redraw] = useState(0);
  const started = useRef(false);
  const told = useRef(onTime);
  told.current = onTime;
  useEffect(() => {
    if (!el) return undefined;
    started.current = !el.paused || el.currentTime > 0.05;
    const draw = () => redraw((n) => n + 1);
    const moved = () => { told.current?.(el.currentTime); draw(); };
    const begun = () => { started.current = true; draw(); };
    // A film asking for its first frame (firstFrameSrc) seeks too, and that is not a person.
    const sought = () => { if (el.currentTime > 0.05) begun(); };
    const events: [string, () => void][] = [['play', begun], ['seeking', sought], ['pause', draw], ['ended', draw], ['timeupdate', moved], ['seeked', moved], ['durationchange', draw], ['loadedmetadata', draw], ['volumechange', draw]];
    for (const [name, fn] of events) el.addEventListener(name, fn);
    draw();
    return () => { for (const [name, fn] of events) el.removeEventListener(name, fn); };
  }, [el]);
  const toggle = useCallback(() => {
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    // Chromium refuses sound until the page has been pressed, which left a still
    // frame and a dead button. Muted it always plays; the bar brings the sound back.
    void el.play().catch(() => { el.muted = true; return el.play(); }).catch(() => el.dispatchEvent(new Event('error')));
  }, [el]);
  const seek = useCallback((s: number) => {
    if (el) el.currentTime = s;
  }, [el]);
  return {
    el, toggle, seek,
    playing: !!el && !el.paused,
    ended: !!el?.ended,
    started: started.current,
    now: el?.currentTime ?? 0,
    length: el && Number.isFinite(el.duration) ? el.duration : 0,
    muted: !!el?.muted,
  };
}

const Glyph = ({ children }: { children: React.ReactNode }) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

export function FilmBar({ film, marks = [], onMark, wide }: {
  film: ReturnType<typeof useFilm>;
  marks?: Pick<FilmMark, 'id' | 's' | 'on' | 'pin'>[];
  onMark?: (id: string) => void;
  /** The element that goes full screen; none on the big view, which already fills the window. */
  wide?: () => HTMLElement | null;
}) {
  const track = useRef<HTMLSpanElement | null>(null);
  const { playing, now, length, muted, el } = film;
  const scrub = (e: ReactPointerEvent) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !length) return;
    film.seek(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * length);
  };
  // Spans: in a thread this sits inside a sentence's paragraph.
  return <span className="film-bar">
    <button type="button" className="film-play" onClick={film.toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (space)' : 'Play (space)'}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        {playing ? <><rect x="4" y="3" width="2.6" height="10" rx=".6" /><rect x="9.4" y="3" width="2.6" height="10" rx=".6" /></> : <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />}
      </svg>
    </button>
    <span className="pdf-count film-clock">{clock(now)}<i> / {clock(length)}</i></span>
    <span ref={track} className="film-track" role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(now)} tabIndex={-1}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
      onPointerMove={(e) => { if (e.buttons) scrub(e); }}>
      <span className="film-rail" />
      <span className="film-gone" style={{ width: `${length ? (now / length) * 100 : 0}%` }} />
      {length > 0 && marks.map((m) => (
        <button key={m.id} type="button" className={`film-mark${m.on ? ' is-on' : ''}${m.pin ? ' is-pin' : ''}`} style={{ left: `${Math.min(100, (m.s / length) * 100)}%` }}
          aria-label={`${m.pin ? 'Pin' : 'Comment'} at ${clock(m.s)}`} title={clock(m.s)}
          onPointerDown={(e) => e.stopPropagation()} onClick={() => onMark?.(m.id)} />
      ))}
    </span>
    <button type="button" className="film-tool" onClick={() => { if (el) el.muted = !el.muted; }} aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'} title={muted ? 'Turn the sound on' : 'Turn the sound off'}>
      <Glyph><path d="M3 6.2v3.6h2.2L8.4 12.5v-9L5.2 6.2z" />{muted ? <path d="M11 6.2l3 3.6M14 6.2l-3 3.6" /> : <path d="M11 5.8a3.2 3.2 0 0 1 0 4.4M12.8 4a5.6 5.6 0 0 1 0 8" />}</Glyph>
    </button>
    {wide && <button type="button" className="film-tool" onClick={() => { void wide()?.requestFullscreen?.(); }} aria-label="Full screen" title="Full screen">
      <Glyph><path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" /></Glyph>
    </button>}
  </span>;
}

export function FilmPlayer({ url, name, onTime, marks, pins = [], draft, seek, hold, onMark, onSpot, onFound, onOutside, onAgain, wide }: {
  onAgain?: () => void;
  url: string;
  name: string;
  onTime?: (seconds: number) => void;
  /** Comments on the timeline. */
  marks?: FilmMark[];
  /** Every pin on this film; each shows on its own frame. */
  pins?: FilmPin[];
  /** The pin being written. */
  draft?: { x: number; y: number; label: string } | null;
  /** Go to this moment; `at` makes pressing the same comment twice go twice. */
  seek?: { s: number; at: number } | null;
  /** Bump to pause, so typing a comment stays on the frame it is about. */
  hold?: number;
  onMark?: (id: string) => void;
  /** A click on a paused frame. Absent, a click only plays and pauses. */
  onSpot?: (spot: { s: number; x: number; y: number }) => void;
  /** Open once a frame can be shown, unplayable the moment the browser says it cannot. */
  onFound?: (found: 'open' | 'unplayable') => void;
  onOutside?: () => void;
  /** Offer full screen: where the window is not already all film. */
  wide?: boolean;
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const film = useFilm(el, onTime);
  const [failed, setFailed] = useState(false);
  const [shape, setShape] = useState<{ w: number; h: number } | null>(null);
  const [drawn, setDrawn] = useState({ w: 0, h: 0 });
  const [late, setLate] = useState(false);
  const [sought, setSought] = useState<number | null>(null);
  const poster = useFilmPoster(url);
  useEffect(() => { setFailed(false); setShape(null); setLate(false); setSought(null); }, [url]);
  useEffect(() => {
    if (film.length) return undefined;
    const timer = setTimeout(() => setLate(true), OPEN_WITHIN_MS);
    return () => clearTimeout(timer);
  }, [url, film.length]);
  // A removed film keeps its connection until it is collected, and a tab has six.
  const kept = useRef<HTMLVideoElement | null>(null);
  kept.current = el ?? kept.current;
  useEffect(() => () => {
    const v = kept.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  }, []);
  useEffect(() => {
    if (!el || !seek) return;
    el.pause();
    el.currentTime = seek.s;
    setSought(seek.s);
    onTime?.(seek.s);
  }, [seek?.at, !!el]);
  useEffect(() => { if (hold) el?.pause(); }, [hold]);
  // Where it was left, for the next time this film opens.
  useEffect(() => {
    if (!el) return undefined;
    const note = () => { if (el.getAttribute('src')) keepFilmTime(url, el.currentTime, el.ended); };
    const events = ['timeupdate', 'seeked', 'pause', 'ended'] as const;
    for (const name of events) el.addEventListener(name, note);
    return () => { for (const name of events) el.removeEventListener(name, note); };
  }, [el, url]);
  useLayoutEffect(() => {
    const box = frame.current;
    if (!box) return undefined;
    const measure = () => setDrawn({ w: box.clientWidth, h: box.clientHeight });
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(box);
    return () => seen.disconnect();
  }, [!!shape]);
  if (failed) return <FilmCannotPlay name={name} onOutside={onOutside} />;
  if (late && !film.length) {
    return <div className="doc-missing" role="alert"><span>{didNotOpen(name)}</span>{onAgain && <> <button type="button" className="av-btn" onClick={onAgain}>Try again</button></>}</div>;
  }
  const canPin = !!onSpot;
  const does = filmClickDoes({ paused: !film.playing, started: film.started, ended: film.ended, canPin });
  // The clock lags a seek by a frame; the pin should not.
  const at = sought !== null && film.now === 0 ? sought : film.now;
  const shown = filmPinsAt(pins, at);
  const lean = (x: number, y: number) => pinLean({ x, y }, drawn, FILM_TAG_REACH);
  return <div className="film-view" tabIndex={0} onKeyDown={(e) => { if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); film.toggle(); } }}>
    <div className="film-stage">
      <div ref={frame} className={`film-frame${does === 'pin' ? ' can-pin' : ''}`}        // Sized to the film's own shape, so the frame is the picture and not a black box around it.
        style={shape ? { aspectRatio: `${shape.w} / ${shape.h}`, width: `min(100cqw, calc(100cqh * ${shape.w / shape.h}))`, height: 'auto' } : undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.av-pin')) return;
          if (does !== 'pin') { film.toggle(); return; }
          const r = e.currentTarget.getBoundingClientRect();
          const part = (v: number) => Math.max(0, Math.min(1, Math.round(v * 10000) / 10000));
          onSpot?.({ s: at, x: part((e.clientX - r.left) / r.width), y: part((e.clientY - r.top) / r.height) });
        }}>
        <video
          ref={setEl} className="film-picture" src={url} playsInline preload="metadata" aria-label={name}
          onLoadedMetadata={(e) => {
            const { videoWidth: w, videoHeight: h } = e.currentTarget;
            if (w && h) setShape({ w, h });
            const left = keptFilmTime(url);
            if (left && !seek) e.currentTarget.currentTime = left;
            onFound?.('open');
          }}
          onError={() => { setFailed(true); onFound?.('unplayable'); }}
        />
        {!film.started && poster?.image && <img className="film-poster" src={poster.image} alt="" draggable={false} />}
        {shown.map((p) => (
          <span key={p.id} className={`av-pin lean-${lean(p.x, p.y)}${p.on ? ' is-on' : ''}${p.settled ? ' is-settled' : ''}${p.carried ? ' is-carried' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
            <span className="av-pin-spot" aria-hidden="true" />
            <button type="button" className="av-pin-tag" aria-label={`Pin ${p.label} at ${clock(p.s)}`} onClick={() => onMark?.(p.id)}>{p.label}<i>{clock(p.s)}</i></button>
          </span>
        ))}
        {draft && (
          <span className={`av-pin lean-${lean(draft.x, draft.y)} is-draft`} style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>
            <span className="av-pin-spot" aria-hidden="true" />
            <span className="av-pin-tag">{draft.label}<i>{clock(at)}</i></span>
          </span>
        )}
      </div>
    </div>
    <FilmBar film={film} marks={marks} onMark={onMark} wide={wide ? () => frame.current?.closest<HTMLElement>('.film-view') ?? null : undefined} />
  </div>;
}
