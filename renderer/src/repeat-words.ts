// What a repeating task's row says, for the desktop's lists (components/List.tsx)
// and the phone app's Later tab alike.
import type { RepeatRule, WorkItem } from './types';
import { ago, dayLabel, previewText, stamp } from './format';
import { clockLabel, isCleanRun, nextRunAt } from '../../shared/repeats.mjs';

// The two things she opened this tab for: when it runs next, and how the last
// one went. Pure, so the wording is pinned by a test rather than read off a
// screenshot.
export function repeatRow(rule: RepeatRule, last: WorkItem | null, now = Date.now()): { when: string; last: string } {
  const next = nextRunAt(rule, now);
  const when = next
    ? `${new Date(next).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${dayLabel(next, now).toLowerCase()}`
    : 'not scheduled';
  if (!last) return { when, last: 'not run yet' };
  if (last.status === 'open' || last.status === 'claimed') return { when, last: `running, started ${ago(last.createdAt, now)}` };
  if (isCleanRun(last)) return { when, last: `last run ${stamp(last.updatedAt, now)}, clean` };
  // Anything that is not explicitly clean is something she should look at, and
  // the row says so in the same words the inbox would.
  return { when, last: `last run ${stamp(last.updatedAt, now)}, ${previewText(last.result) || 'needs a look'}` };
}

// THE SCHEDULE, IN FAINT WORDS AFTER A REPEATING TASK'S TITLE (w-4189a5c1a0).
// It carries the hour, because the desktop's time column is 96px and
// "Tomorrow 10:00 AM" ran past the page's right edge. Lower case, because it
// trails the title as a phrase, not a label.
export function repeatTag(rule: RepeatRule): string {
  const days = rule.every === 'weekday' ? 'weekdays'
    : rule.every === 'week' ? `every ${new Date(2026, 0, 4 + (rule.on ?? 0)).toLocaleDateString(undefined, { weekday: 'long' })}`
      : 'every day';
  return `${days} at ${clockLabel(rule.at).replace(':00', '')}`;
}

// Which day it next runs, in a time column's own short words: Today, Tomorrow,
// a weekday inside the week, a date past it.
export function nextRunWords(rule: RepeatRule, now = Date.now()): string {
  const next = nextRunAt(rule, now);
  if (!next) return 'Not scheduled';
  const midnight = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(next) - midnight(now)) / 86_400_000);
  const d = new Date(next);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
    : days < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
