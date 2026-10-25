// Schedule: Superhuman's snooze picker without the NLP. Presets you arrow
// through, or a time typed in words ("one week", "fri 3pm", "tomorrow at
// noon", read by ../when-words.ts) with a live preview of exactly when the
// item comes due.
//
// An inbox reminder: the existing thread returns without running an agent.
//
// AND A RHYTHM IS ONE OF THE THINGS PEOPLE TYPE HERE (w-c9da359466). "every
// monday 9am" was "not a time", and the honest answer was to come back and
// type "monday 9am" again every Monday for ever (power-test-1, issue 14). The
// app has kept repeating tasks the whole time and the grammar is the same one
// the new thread card and the reply box read; this box simply never asked it.
// Taking it here rather than refusing with directions, because the directions
// would be "go and make a second thread", and the thread is already open.

import { useMemo } from 'react';
import type { WorkItem } from '../types';
import { dayAndTime, parseWhen, readRule } from '../format';
import { ruleLabel, type RepeatShape } from '../../../shared/repeats.mjs';
import { scheduleSubtitle } from '../list-rules';
import { SchedulePicker } from './SchedulePicker';
import { laterPresets, type LaterPreset } from '../later-times';

/** What one of two answers the typed words are, or neither. A MOMENT IS READ
 *  FIRST: "monday 9am" is a day this week, and only "every monday 9am" is a
 *  rhythm. Exported so a test can type into it without a window. */
export type LaterMeans = { ts: number; label: string; rule?: undefined } | { rule: RepeatShape; label: string; ts?: undefined };

export function laterMeans(text: string, now = Date.now()): LaterMeans | null {
  const moment = parseWhen(text, now);
  if (moment) return moment;
  const rhythm = readRule(text);
  // `unreadable` is a rhythm this cannot keep ("every 3 minutes"). Refusing is
  // the point of the third answer: see RepeatParse in ../format.
  return rhythm && 'rule' in rhythm ? { rule: rhythm.rule, label: ruleLabel(rhythm.rule) } : null;
}

const presets = laterPresets;

const fmt = (ts: number) => dayAndTime(ts).toUpperCase();

export function Snooze({ item, count = 1, note, onPick, onRepeat, onNow, onClose }: {
  item: WorkItem;
  count?: number;
  /** The stopped-agent lesson, when this thread is one (../stopped-agent.ts).
   *  It is drawn here rather than swallowing the key, because L opens a text
   *  field and a swallowed L leaves every letter after it running as a
   *  shortcut: typing "tomorrow 9am" into the page archived the thread. */
  note?: string;
  onPick: (ts: number, label: string) => void;
  /** Make this thread a repeating task. Absent on a batch, where one rhythm
   *  over a dozen threads is a dozen repeating tasks nobody asked for. */
  onRepeat?: (rule: RepeatShape) => void;
  // Present when the target is already snoozed: "Now" wakes it instead of
  // re-timing it, and sits first so S then Enter is the way back to the inbox.
  onNow?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const base: Array<LaterPreset & { now?: boolean }> = presets();
    // "Now" only exists when the target is already scheduled: waking it is not
    // re-timing it, and it sits first so S then Enter is the way back.
    return onNow ? [{ label: 'Now (back to inbox)', ts: 0, now: true }, ...base] : base;
  }, [onNow]);

  return (
    <SchedulePicker<LaterMeans>
      title="Later"
      subtitle={scheduleSubtitle(item, count)}
      note={note}
      placeholder={onRepeat ? 'Try: 3h, tomorrow, next week, every monday 9am' : 'Try: 30m, 3h, 8am, tomorrow, next week'}
      hintWhenRefused={onRepeat ? 'try 3h, tomorrow, every monday 9am' : 'try 3h, 8am, tomorrow'}
      options={options.map((option) => ({
        label: option.label,
        value: { ts: option.ts, label: option.label },
        hint: option.now ? '' : fmt(option.ts),
      }))}
      parse={(text) => {
        const read = onRepeat ? laterMeans(text) : parseWhen(text);
        return read ? { value: read, label: read.label } : null;
      }}
      previewOf={(v) => (v.rule ? ruleLabel(v.rule).toUpperCase() : fmt(v.ts))}
      onChoose={(v, label) => {
        if (v.rule) { onRepeat?.(v.rule); return; }
        // 0 is the "Now (back to inbox)" row: waking is not re-timing.
        if (v.ts === 0 && onNow) onNow();
        else onPick(v.ts, label);
      }}
      onClose={onClose}
    />
  );
}
