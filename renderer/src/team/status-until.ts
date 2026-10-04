// WHEN A STATUS ENDS, AS THE LAST WORDS OF A SENTENCE (w-a09476712f).
//
// "I'm in meetings until the end of today." The end is either one of four
// presets, said in plain words, or a moment you typed ("friday 5pm", "in 3
// days"), because "Eod tomorrow night and Eow are only a small portion of
// what you might need" (2026-10-04). Typed words go through the same reader
// as the composer's When menu, so a phrase that works there works here, and
// one it cannot read is refused rather than guessed at.
import { parseWhen } from '../format';
import { holdEnds, holdsUntil } from '../../../shared/team-status.mjs';

/** Either a named hold or a moment you chose. */
export type StatusEnd = { hold: string; until?: undefined } | { until: number; hold?: undefined };

/** The presets, in the order the menu draws them, in the sentence's words. */
export const UNTIL_PRESETS: Array<{ hold: string; words: string }> = [
  { hold: 'today', words: 'the end of today' },
  { hold: 'tomorrow', words: 'tomorrow night' },
  { hold: 'week', words: 'the end of the week' },
  { hold: 'open', words: 'I clear it' },
];

/** A time typed in words, as a moment still ahead, or null. */
export function readUntil(phrase: string, now = Date.now()): { until: number; label: string } | null {
  const read = parseWhen((phrase ?? '').trim(), now);
  if (!read || !(read.ts > now)) return null;
  return { until: read.ts, label: read.label };
}

/** The last words of the sentence. A chosen moment reads the way every status
 *  reads its end elsewhere ("Friday", "6pm today", "Oct 27"). */
export function untilWords(end: StatusEnd, now = Date.now()): string {
  if (end.until !== undefined) return holdsUntil(end.until, now).replace(/^until /, '') || 'I clear it';
  return UNTIL_PRESETS.find((p) => p.hold === end.hold)?.words ?? 'the end of today';
}

/** Where the sentence starts when it opens: on the end already chosen, so
 *  reopening a status never quietly changes when it runs out. A new one
 *  starts on the end of today. */
export function endOf(said: { until: number | null } | null, now = Date.now()): StatusEnd {
  if (!said) return { hold: 'today' };
  if (said.until === null) return { hold: 'open' };
  const preset = UNTIL_PRESETS.find((p) => p.hold !== 'open' && holdEnds(p.hold, now) === said.until);
  return preset ? { hold: preset.hold } : { until: said.until };
}
