// Types for shared/repeats.mjs, which is plain ESM so that main (Node) and the
// renderer (Vite) can share one copy of the scheduling rule.

// The SCHEDULE, apart from the rule that carries it: the composer and the reply
// box hand this around before any rule exists.
export interface RepeatShape {
  every: 'day' | 'weekday' | 'week';
  on?: number;              // 0..6 when every is 'week'
  at: string;               // 24h local, "09:00"
}

export interface RepeatRule extends RepeatShape {
  id: string;
  title: string;
  body?: string;
  priority?: number;
  createdAt: number;
  updatedAt?: number;
  endedAt?: number;
  served: string;
  misses: number;
  alerted: number;
  lastOccurrence?: string;
}

export const CLEAN_LABEL: string;
export const REPEAT_LABEL_PREFIX: string;
export function repeatLabel(ruleId: string): string;
export function ruleIdOf(item: { labels?: string[] } | null | undefined): string | null;
export function isCleanRun(item: { labels?: string[] } | null | undefined): boolean;
export const DAY_NAMES: string[];
export function isRepeatRule(rule: unknown): boolean;
export function ruleLabel(rule: unknown): string;
export function clockLabel(at: string): string;
export function dateKey(now?: number): string;
export function periodKey(rule: Partial<RepeatRule>, now?: number): string | null;
export function nextRunAt(rule: Partial<RepeatRule>, now?: number): number | null;
export function sameRule(a: unknown, b: unknown): boolean;
export function servedOf(rule: Partial<RepeatRule>): string;
export function isOwed(rule: Partial<RepeatRule>, now?: number): boolean;
export function occurrenceId(ruleId: string, key: string): string;
export function foldRepeats(
  lines: Array<{ id: string; ts: number; patch: Record<string, unknown> } | null>,
  now?: number,
): Map<string, RepeatRule>;
