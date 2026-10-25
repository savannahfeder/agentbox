// VOICE NOTES IN A CHAT. A voice note is an ordinary attached file whose name
// carries its length, `voice-note-12400ms.webm`, so a message links it the way
// it links a picture, the team sync carries it the same way, and every reader
// knows how long it is before a byte of it has arrived.

/** The longest note; recording stops itself here. */
export const VOICE_MAX_MS = 5 * 60_000;
/** Bars drawn for one note, in the composer and in the chat. */
export const VOICE_BARS = 44;

const NAME = /(?:^|[/\-_])voice-note-(\d{1,7})ms\.(webm|ogg|m4a|mp4|wav)$/i;

export function voiceNoteName(ms: number, ext = 'webm'): string {
  return `voice-note-${Math.min(VOICE_MAX_MS, Math.max(1, Math.round(ms)))}ms.${ext}`;
}

/** The note a link or file name points at, with its length, or null for any other file. */
export function voiceNoteOf(href: string | null | undefined): { ms: number } | null {
  const path = String(href ?? '').split(/[?#]/)[0];
  const m = NAME.exec(path);
  return m ? { ms: Number(m[1]) } : null;
}

/** 0:07, 1:23, 12:00. */
export function voiceClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The quietest bar still shows, so a pause reads as a pause rather than a gap.
const FLOOR = 0.08;

/** One height per bar, 0..1, from the loudest sample in its stretch, scaled to the loudest bar. */
export function peaksOf(samples: ArrayLike<number>, bars = VOICE_BARS): number[] {
  const n = samples.length;
  if (!n || bars < 1) return Array(Math.max(0, bars)).fill(FLOOR);
  const out: number[] = [];
  for (let b = 0; b < bars; b += 1) {
    const from = Math.floor((b * n) / bars);
    const to = Math.max(from + 1, Math.floor(((b + 1) * n) / bars));
    let peak = 0;
    for (let i = from; i < to && i < n; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
    out.push(peak);
  }
  const top = Math.max(...out);
  return out.map((p) => (top > 0 ? Math.max(FLOOR, p / top) : FLOOR));
}

// A link the app wrote for a voice note, on a line of its own.
const LINK = /^\[[^\]\n]*\]\(([^)\s]+)\)$/;

/** A message's words with each voice note said as "Voice note 0:12", for one-line previews. */
export function voiceSaid(text: string): string {
  return text.split('\n').map((line) => {
    const href = LINK.exec(line.trim())?.[1];
    const note = href ? voiceNoteOf(href) : null;
    return note ? `Voice note ${voiceClock(note.ms)}` : line;
  }).join('\n');
}
