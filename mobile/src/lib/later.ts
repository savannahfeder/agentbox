// LATER ON THE PHONE APP, as the phone site's (renderer/src/components/Snooze.tsx):
// the presets, "Now (back to inbox)" first on a thread already put off, and a
// time typed in words.
import { dayAndTime, parseWhen } from '../../../renderer/src/format';
import { laterPresets } from '../../../renderer/src/later-times';
import { previewLine } from '../../../renderer/src/components/SchedulePicker';

export interface LaterRow { label: string; ts: number; hint: string; now?: true }

const hintOf = (ts: number, now: number) => dayAndTime(ts, now).toUpperCase();

export function laterRows(now: number, { back }: { back: boolean }): LaterRow[] {
  const rows = laterPresets(now).map((p) => ({ label: p.label, ts: p.ts, hint: hintOf(p.ts, now) }));
  return back ? [{ label: 'Now (back to inbox)', ts: 0, hint: '', now: true }, ...rows] : rows;
}

export function typedLater(text: string, now: number): { ts: number; hint: string } | null {
  const when = parseWhen(text, now);
  return when ? { ts: when.ts, hint: hintOf(when.ts, now) } : null;
}

/** The line beside the box: when, or that it is not a time, and once she presses, what would be. */
export const typedLine = (text: string, parsed: { hint: string } | null, refused: boolean) =>
  previewLine(text, parsed && { value: parsed }, refused, (p) => p.hint, 'try 3h, 8am, tomorrow');
