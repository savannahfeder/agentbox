// A VOICE NOTE IN A CHAT: a square play button, the note's shape as bars that
// fill as it plays, its length counting down while it plays, and a speed switch
// that shows when you point at it. Pressing a bar jumps there.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { VOICE_BARS, peaksOf, voiceClock } from './voice-note';
import './voice-note.css';

const SPEEDS = [1, 1.5, 2];
// The speed you last picked is the speed every note starts at, on this Mac.
const SPEED_KEY = 'voice.speed';
const speedWas = () => {
  try { const s = Number(localStorage.getItem(SPEED_KEY)); return SPEEDS.includes(s) ? s : 1; } catch { return 1; }
};

// Each note is fetched and measured once per window, however often the
// message it is in is drawn again.
type Held = { url: string; peaks: number[] | null; ms: number | null };
const held = new Map<string, Promise<Held | null>>();
const HELD_MAX = 60;

async function measure(blob: Blob): Promise<{ peaks: number[] | null; ms: number | null }> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      return { peaks: peaksOf(audio.getChannelData(0), VOICE_BARS), ms: audio.duration * 1000 };
    } finally { void ctx.close().catch(() => {}); }
  } catch {
    return { peaks: null, ms: null };
  }
}

function hold(key: string, load: () => Promise<Blob | null>): Promise<Held | null> {
  const had = held.get(key);
  if (had) return had;
  const p = load().then(async (blob) => {
    if (!blob) return null;
    const { peaks, ms } = await measure(blob);
    return { url: URL.createObjectURL(blob), peaks, ms };
  }).catch(() => null);
  held.set(key, p);
  p.then((got) => { if (!got) held.delete(key); });
  if (held.size > HELD_MAX) {
    const oldest = held.keys().next().value as string;
    held.get(oldest)?.then((g) => { if (g) URL.revokeObjectURL(g.url); });
    held.delete(oldest);
  }
  return p;
}

// One note plays at a time, as in every chat app.
let playing: HTMLAudioElement | null = null;

const RETRY_MS = [2000, 4000, 8000, 15000, 30000, 60000];
/** How long to wait before asking again for a note that was not there, after `tries` asks. */
export const retryAfter = (tries: number) => RETRY_MS[Math.min(Math.max(0, tries), RETRY_MS.length - 1)];

const QUIET = Array.from({ length: VOICE_BARS }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 1.7)));

export function VoiceNote({ id, ms: named, load, mine = false }: {
  /** The same for the same note everywhere it is drawn. */
  id: string;
  /** Its length from its name, drawn before it has loaded. */
  ms: number;
  load: () => Promise<Blob | null>;
  mine?: boolean;
}) {
  const [got, setGot] = useState<Held | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState(speedWas);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let live = true;
    void hold(id, load).then((g) => { if (live && (g || !got)) setGot(g); });
    return () => { live = false; };
  }, [id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  // A NOTE NOT HERE YET is a teammate's that has not finished arriving, or a
  // connection that dropped: it is asked for again, soon and then less often,
  // for as long as it is on screen, and pressing play asks at once.
  useEffect(() => {
    if (got !== null) return undefined;
    const t = setTimeout(() => setTries((n) => n + 1), retryAfter(tries));
    return () => clearTimeout(t);
  }, [got, tries]);

  // The player is made as soon as the note has loaded, so it has found its own
  // length before anyone presses play.
  useEffect(() => {
    if (!got) return undefined;
    const a = new Audio();
    a.preload = 'auto';
    a.preservesPitch = true;
    let probing = false;
    // A recording straight from the microphone does not say how long it is, and
    // the player will not jump within it until it knows. Asking for a moment
    // far past the end makes it find out.
    a.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(a.duration)) return;
      probing = true;
      const back = () => { a.removeEventListener('durationchange', back); a.currentTime = 0; probing = false; };
      a.addEventListener('durationchange', back);
      a.currentTime = 1e101;
    }, { once: true });
    a.ontimeupdate = () => { if (!probing) setAt(a.currentTime * 1000); };
    a.onpause = () => setOn(false);
    a.onplay = () => setOn(true);
    a.onended = () => { setOn(false); setAt(0); };
    a.src = got.url;
    audio.current = a;
    return () => { a.pause(); if (playing === a) playing = null; audio.current = null; };
  }, [got]);

  const length = got?.ms ?? named;
  const player = () => audio.current;
  const toggle = () => {
    const a = player();
    if (!a) return;
    if (!a.paused) { a.pause(); return; }
    if (playing && playing !== a) playing.pause();
    playing = a;
    a.playbackRate = speed;
    void a.play().catch(() => setOn(false));
  };
  const seek = (fraction: number) => {
    const a = player();
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(1, fraction)) * (length / 1000);
    setAt(a.currentTime * 1000);
  };
  const nextSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    try { localStorage.setItem(SPEED_KEY, String(next)); } catch { /* not kept */ }
    if (audio.current) audio.current.playbackRate = next;
  };

  const bars = got?.peaks ?? QUIET;
  const done = length > 0 ? Math.min(1, at / length) : 0;
  const shown = on || at > 0 ? voiceClock(Math.max(0, length - at)) : voiceClock(length);
  const missing = got === null;
  const onBar = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 5000 / Math.max(length, 1);
    if (e.key === 'ArrowRight') { e.preventDefault(); seek(done + step); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(done - step); }
  };

  return (
    <div className={`voice-note${on ? ' on' : ''}${mine ? ' mine' : ''}${missing ? ' missing' : ''}`} data-voice-note={id}>
      <button type="button" className="voice-play" onClick={missing ? () => setTries((n) => n + 1) : toggle} disabled={got === undefined}
        aria-label={missing ? 'This voice note has not arrived yet. Press to try again' : on ? 'Pause voice note' : 'Play voice note'}
        title={missing ? 'Not here yet. It is asked for again by itself, or press to try now.' : undefined}>
        {on
          ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" fill="currentColor" /></svg>
          : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.8v10.4L13.2 8z" fill="currentColor" /></svg>}
      </button>
      <div className="voice-bars" role="slider" tabIndex={got ? 0 : -1} aria-label="Voice note position"
        aria-valuemin={0} aria-valuemax={Math.round(length / 1000)} aria-valuenow={Math.round(at / 1000)}
        onPointerDown={got ? onBar : undefined} onKeyDown={onKey}>
        {bars.map((h, i) => (
          <span key={i} className={(i + 0.5) / bars.length <= done ? 'played' : ''} style={{ height: `${Math.round(Math.max(0.1, h) * 100)}%` }} />
        ))}
      </div>
      <span className="voice-time">{missing ? 'Arriving' : shown}</span>
      {!missing && (
        <button type="button" className={`voice-speed${speed !== 1 ? ' set' : ''}`} onClick={nextSpeed} aria-label={`Playback speed ${speed}×`} title="Playback speed">
          {speed}×
        </button>
      )}
    </div>
  );
}
