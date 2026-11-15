// Repeating tasks: the pure rules, shared by the main process and the renderer
// the way shared/rank.mts is, so the tick and the list cannot come to disagree
// about when something is due.
//
// A repeating task is a RULE, not a work item. The spec
// (docs/superpowers/specs/2026-08-12-repeating-tasks-design.md) carries the six
// reasons; the short one is that a work-item ledger is read from a bounded
// trailing window and a template has to outlive that.

// A period is a local CALENDAR date, never `now - 86_400_000`, which is wrong by
// an hour twice a year. One date is one period, which is what makes DST, travel
// and clock correction boring here instead of a source of double runs.
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A schedule, apart from any rule that carries it. `on` is 0..6 when `every` is 'week'; `at` is 24h local, "09:00". */
export interface RepeatShape { every: 'day' | 'weekday' | 'week'; on?: number; at: string }

export interface RepeatRule extends RepeatShape {
  id: string;
  title: string;
  body?: string;
  priority?: number;
  engine?: string;
  model?: string;
  createdAt: number;
  updatedAt?: number;
  endedAt?: number;
  served: string;
  misses: number;
  alerted: number;
  lastOccurrence?: string;
}

export interface RepeatLine { id: string; ts: number; patch: Record<string, unknown> }

type Unread = { every?: unknown; at?: unknown; on?: unknown };
// A schedule not yet checked: each reader below runs it through isRepeatRule first.
type Unchecked = { every?: string; at?: string; on?: number; endedAt?: number; served?: string } | null | undefined;
type FoldingRule = Partial<RepeatRule> & {
  id: string; createdAt: number; updatedAt: number; served: string; misses: number; alerted: number;
  _ts?: Record<string, number>;
};

export const CLEAN_LABEL = 'clean';
export const REPEAT_LABEL_PREFIX = 'repeat:';

// A run's body is the app's rules for the agent (main/repeats.mts), then the
// person's instruction after INSTRUCTION_MARK. Screens show the instruction.
export const PROTOCOL_OPENS = 'THIS IS ONE RUN OF A REPEATING TASK.';
export const INSTRUCTION_MARK = 'HER INSTRUCTION FOLLOWS.';
export function instructionOf(body: string | null | undefined): string {
  const text = String(body ?? '');
  const at = text.indexOf(`\n${INSTRUCTION_MARK}\n`);
  return text.startsWith(PROTOCOL_OPENS) && at >= 0 ? text.slice(at + INSTRUCTION_MARK.length + 2).trim() : text;
}

export function repeatLabel(ruleId: string): string {
  return `${REPEAT_LABEL_PREFIX}${ruleId}`;
}

export function ruleIdOf(item: { labels?: readonly string[] } | null | undefined): string | null {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(REPEAT_LABEL_PREFIX));
  return found ? found.slice(REPEAT_LABEL_PREFIX.length) : null;
}

// THE STANDING INSTRUCTION: the words every run after this one is briefed with.
// `serve` copies this into each occurrence's body under the protocol, and the
// store tool an agent changes it through reads and writes the same thing, so
// what the tool shows a run is what the next run gets.
export function standingInstruction(rule: { body?: string; title?: string } | null | undefined): string | undefined {
  return rule?.body ?? rule?.title;
}

// A clean run is one the worker EXPLICITLY marked clean. Everything else is news
// and reaches her, including a run that died without saying anything: this
// predicate exists to hide, never to show, so it fails open by construction.
export function isCleanRun(item: { labels?: readonly string[]; routed?: unknown } | null | undefined): boolean {
  // A thread she sent to a teammate is her ask, never its quiet run.
  if (item?.routed) return false;
  const labels = item?.labels ?? [];
  const aRun = !!ruleIdOf(item) || labels.some((l) => typeof l === 'string' && (l.startsWith('teammate:') || l === 'teammate-offer' || l === 'teammate-asks-to-write'));
  return aRun && labels.includes(CLEAN_LABEL);
}

// THE THREAD AN OPENED REPEATING TASK LANDS ON: its latest run, an ordinary
// work item, so the Reply box under it messages that run's agent like any
// other thread (w-5e3f2e047f). The run it last served first; when that one has
// left the store's window, the newest of its runs still on file. Null before
// the first run, and never a run of another rule or another project.
export function runToOpen<T extends { id: string; product: string; labels?: readonly string[]; createdAt: number }>(
  rule: { id: string; product: string; lastOccurrence?: string },
  items: readonly T[] | null | undefined,
): T | null {
  const mine = (items ?? []).filter((i) => i.product === rule.product && ruleIdOf(i) === rule.id);
  return mine.find((i) => i.id === rule.lastOccurrence)
    ?? mine.reduce<T | null>((newest, i) => (!newest || i.createdAt > newest.createdAt ? i : newest), null);
}

export const DAY_NAMES = ['Sunday','Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Three shapes, because they are the three a founder actually asks for:
//   { every: 'day',     at }        every morning
//   { every: 'weekday', at }        Monday to Friday, which is most work
//   { every: 'week', on: 0..6, at } Thursdays
// The `every` field was an object from the start so these would be additions
// rather than a migration, and this is that.
export function isRepeatRule<T>(rule: T): rule is T & RepeatShape {
  if (!rule) return false;
  if (typeof (rule as Unread).at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test((rule as Unread).at as string)) return false;
  if ((rule as Unread).every === 'day' || (rule as Unread).every === 'weekday') return true;
  if ((rule as Unread).every === 'week') return Number.isInteger((rule as Unread).on) && ((rule as Unread).on as number) >= 0 && ((rule as Unread).on as number) <= 6;
  return false;
}

// the tag, the row and the picker's preview all print this, so they cannot
// drift.
export function ruleLabel(rule: unknown): string {
  if (!isRepeatRule(rule)) return 'Once';
  const time = clockLabel(rule.at);
  if (rule.every === 'day') return `daily at ${time}`;
  if (rule.every === 'weekday') return `weekdays at ${time}`;
  return `${DAY_NAMES[rule.on!]}s at ${time}`;
}

export function clockLabel(at: string): string {
  const [h, m] = at.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase().replace(/\s/g, '');
}

// Does this calendar date belong to the rule at all? A weekday rule skips the
// weekend and a weekly rule wants one day, which is the only thing that changes
// about the period: it is still a date, still one per rule, still never
// arithmetic.
function servesDay(rule: RepeatShape, d: Date): boolean {
  if (rule.every === 'day') return true;
  if (rule.every === 'weekday') return d.getDay() >= 1 && d.getDay() <= 5;
  return d.getDay() === rule.on;
}

export function dateKey(now = Date.now()): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// The period `now` falls in: today's date once the hour has passed, yesterday's
// before it. Built with calendar operations so a clock change cannot shift it. A
// time that does not exist on a spring-forward date (02:30) normalizes to the
// first minute that does, which is exactly when that period should be served.
export function periodKey(rule: Unchecked, now = Date.now()): string | null {
  if (!isRepeatRule(rule)) return null;
  const [h, m] = rule.at.split(':').map(Number);
  const d = new Date(now);
  const boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (boundary.getTime() > now) boundary.setDate(boundary.getDate() - 1);
  // Walk back to the most recent day this rule actually serves. A week is the
  // furthest that can ever be, so the loop is bounded and a rule whose day has
  // not come round yet correctly reports the LAST one it served.
  for (let back = 0; back < 8; back++) {
    if (servesDay(rule, boundary)) return dateKey(boundary.getTime());
    boundary.setDate(boundary.getDate() - 1);
  }
  return null;
}

// The moment this rule next runs, for the Scheduled row.
export function nextRunAt(rule: Unchecked, now = Date.now()): number | null {
  if (!isRepeatRule(rule) || rule.endedAt) return null;
  const [h, m] = rule.at.split(':').map(Number);
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  for (let ahead = 0; ahead < 8; ahead++) {
    if (servesDay(rule, next)) return next.getTime();
    next.setDate(next.getDate() + 1);
  }
  return null;
}

// Two rules, same schedule? Used where typing drives the control: adopting a
// rule the words already say would otherwise fight her own pick every keystroke.
export function sameRule(a: Partial<RepeatShape> | null | undefined, b: Partial<RepeatShape> | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.every === b.every && a.at === b.at && (a.on ?? null) === (b.on ?? null);
}

export function servedOf(rule: { served?: string } | null | undefined): string {
  return KEY_RE.test(rule?.served ?? '') ? rule!.served! : '';
}

export function isOwed(rule: Unchecked, now = Date.now()): boolean {
  if (rule?.endedAt) return false;
  const key = periodKey(rule, now);
  return !!key && key > servedOf(rule);
}

// Deterministic, so two writers racing describe the SAME item rather than two
// rows nothing can merge. Create-if-absent under the lock is what makes serving
// idempotent; this is what makes that check possible at all.
export function occurrenceId(ruleId: string, key: string): string {
  return `${ruleId}-${key.replace(/-/g, '')}`;
}

// `engine` and `model` are the LAST two and they are the reason this list is
// worth reading twice: a field written by `setRule` and missing from here is
// folded away, so it reads correctly once and is gone at the next app start.
// That is exactly how `on` disappeared off every weekly rule.
const FIELDS = [
  'title', 'body', 'priority', 'every', 'at', 'on', 'engine', 'model',
  'createdAt', 'endedAt', 'served', 'misses', 'alerted', 'lastOccurrence',
];

// Newest-wins per field, EXCEPT served, which folds by maximum period and
// refuses a date later than today. Same append-only shape as dashboard.jsonl,
// and the same reason: several writers, no read-modify-write, nothing lost.
//
// The two exceptions are one guard each against a watermark that lies. A
// delayed or clock-skewed writer landing an older date last would re-run a
// period already served, so the maximum wins rather than the latest line. And a
// date in the FUTURE cannot be legitimate (a period key is never later than
// today), so it is rejected outright: accepted, it would silence the task until
// the real calendar caught up, which could be years, and no later correct write
// could undo it because the maximum would keep it forever.
export function foldRepeats(lines: ReadonlyArray<RepeatLine | null | undefined>, now = Date.now()): Map<string, RepeatRule> {
  const today = dateKey(now);
  const rules = new Map<string, FoldingRule>();
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const { id, ts, patch } = line;
    if (typeof id !== 'string' || !id || !patch || typeof patch !== 'object') continue;
    if (!Number.isFinite(ts)) continue;
    let rule = rules.get(id);
    if (!rule) {
      rule = { id, createdAt: ts, updatedAt: ts, served: '', misses: 0, alerted: 0, _ts: {} };
      rules.set(id, rule);
    }
    for (const field of FIELDS) {
      if (!(field in patch)) continue;
      const value = patch[field];
      if (field === 'served') {
        if (KEY_RE.test((value ?? '') as string) && (value as string) <= today && (value as string) > rule.served) rule.served = value as string;
        continue;
      }
      const held = rule._ts![field];
      if (held !== undefined && ts < held) continue;
      (rule as Record<string, unknown>)[field] = value;
      rule._ts![field] = ts;
    }
    rule.createdAt = Math.min(rule.createdAt, ts);
    rule.updatedAt = Math.max(rule.updatedAt, ts);
  }
  for (const rule of rules.values()) delete rule._ts;
  // Fields are as the lines carried them; readers check the schedule with isRepeatRule.
  return rules as Map<string, RepeatRule>;
}
