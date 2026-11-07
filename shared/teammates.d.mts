export const YOU: 'you';
export function isSetupTitle(title: string | null | undefined): boolean;
export const TEAMMATE_LABEL_PREFIX: 'teammate:';
export function teammateIdOf(item: { labels?: string[] } | null | undefined): string | null;
export function passedFromOf(item: { labels?: string[] } | null | undefined): string | null;
export function mentionsIn(text: string, teammates: { id: string; name: string }[]): string[];
export interface Starter {
  starter: string; name: string; role: string; ask: string; outcome: string; sends: string; job: string; goal: string;
  counted: string; asksFirst: string; works: { every: 'day' | 'weekday' | 'week'; at: string; on?: number } | null;
  primary?: boolean;
}
export const STARTERS: Starter[];
export const OFFER_LABEL: 'teammate-offer';
export const OFFER_MAKE: string;
export const OFFER_NOT_NOW: string;
export const MAX_HOPS: number;
export function yesFirst(asksFirst: string | null | undefined): string | null;
export const TEAMMATE_EFFORT: 'high';
export const GREETING: string;
export const VOICES: { id: string; label: string; says: string; sample: string }[];
export const VOICE_WORDS_MOST: number;
export function voiceOf(t: { id?: string; voice?: string | null; voiceText?: string | null } | null | undefined): { id: string; label: string; says: string; sample?: string };
export function howYouWrite(t: { id?: string; voice?: string | null; voiceText?: string | null } | null | undefined): string;
export function howYourRunEnds(): string;
export function starterAsks(team?: Array<{ starter?: string | null; name: string }>): Array<{ starter: string; ask: string; name: string; role: string }>;
export function teammatesOn(config: { alphaTeammates?: unknown } | null | undefined): boolean;
export const FROM_LABEL_PREFIX: 'from:';
export const HOP_LABEL_PREFIX: 'hop:';
export const WORK_LABEL_PREFIX: 'work:';
export const DUTY_LABEL_PREFIX: 'duty:';
export const CHAT_LABEL: 'from-chat';
export const STOPPED_NOTE: string;
export const WEEK_MS: number;
export const DEFAULT_LIMIT: number;
export const CHAT_TAIL: number;
export const UNREAD_HOLD: number;
export const METHOD_CAP: number;

interface Written { source?: string; ts?: number }
export interface RunItem {
  id: string;
  product?: string;
  status?: string;
  labels?: string[];
  title?: string;
  label?: string;
  answer?: string;
  result?: string;
  note?: string;
  start?: string;
  createdAt?: number;
  updatedAt?: number;
  wrote?: Partial<Record<'note' | 'result' | 'answer' | 'status' | 'start' | 'labels', Written>>;
}
export interface DutyLike { id: string; what: string; tell?: string | null; after?: string; most?: number; every?: string; at?: string[]; on?: number }
export interface TeammateLike {
  id: string;
  name?: string;
  letter?: string | null;
  product?: string | null;
  limit?: number;
  status?: string;
  paused?: boolean;
  pausedUntil?: string | null;
  primary?: boolean;
  endedAt?: number | null;
  handoffsNeedYes?: boolean;
  works?: unknown;
  served?: string;
  duties?: DutyLike[];
  dutyServed?: Record<string, string>;
}
export interface ChatLine {
  id: string;
  kind: string;
  from: string;
  to?: string | string[];
  text?: string;
  ts: number;
  title?: string;
  details?: string;
  product?: string;
  setup?: boolean;
  start?: boolean;
  fresh?: boolean;
  yours?: boolean;
  hop?: number;
  via?: string;
  viaProduct?: string | null;
  work?: string;
  run?: string;
}
export interface ChatLike {
  messages: ChatLine[];
  seen: Set<string>;
  into?: Map<string, { ref: string; for: string; ts: number }[]>;
}
export interface ItemRef { id: string; product?: string; title?: string }
export interface TeammateStatus {
  waiting: ItemRef[];
  now: string | null;
  running: { id: string; product: string } | null;
  queued: number;
  next: ItemRef[];
  done: ItemRef[];
  runsThisWeek: number;
}
export interface Offer {
  key: string;
  product: string;
  count: number;
  titles: string[];
  asked: { title: string; n: number }[];
  threads: { product?: string; id: string; title: string }[];
  title: string;
  said: string;
}
interface TriggerBase {
  from?: string;
  msg?: string;
  hop?: number;
  product?: string;
  via?: string;
  viaProduct?: string | null;
  work?: string;
  hold?: boolean;
  key?: string;
}
export type WakeTrigger =
  | (TriggerBase & { kind: 'schedule'; key: string; label: string })
  | (TriggerBase & { kind: 'duty'; duty: string; what: string; tell?: string; key: string })
  | (TriggerBase & { kind: 'pass'; fromName?: string; title?: string; details?: string })
  | (TriggerBase & { kind: 'message'; text?: string; opening?: 'start' | 'setup' });
interface ActionBase { teammate: string; msg?: string; trigger?: WakeTrigger }
export type WakeAction =
  | (ActionBase & { type: 'run'; id: string; trigger: WakeTrigger; title: string; start: 'now' | 'later' })
  | (ActionBase & { type: 'seen'; msg: string; run?: string })
  | (ActionBase & { type: 'served'; key: string })
  | (ActionBase & { type: 'dutyServed'; duty: string; key: string })
  | (ActionBase & { type: 'answer'; item: string; product: string; text: string; msg: string })
  | (ActionBase & { type: 'tell'; item: string; product: string | null; text: string; from: { teammate: string; name: string }; hop: number; hold: boolean; msg: string })
  | (ActionBase & { type: 'release'; item: string; product: string })
  | (ActionBase & { type: 'limit' })
  | (ActionBase & { type: 'unread'; duty: string; what: string })
  | (ActionBase & { type: 'hops'; msg: string; from: string });
export interface RunLine {
  teammate: string;
  item: string;
  product?: string;
  title?: string;
  id: string;
  kind: 'run';
  verb: 'queued' | 'passed' | 'picked' | 'answered' | 'sent' | 'stopped' | 'finished';
  ts: number;
  by?: string;
  byName?: string;
  text?: string;
  said?: string;
  waiting?: boolean;
  answered?: boolean;
}
export interface TurnLike { source?: string; field?: string; text?: string }

export function hopOf(item: { labels?: string[] } | null | undefined): number;
export function teammateLabel(id: string): string;
export function workOf(item: { id: string; labels?: string[] }): string;
export function workOf(item: { id?: string; labels?: string[] } | null | undefined): string | null;
export function primaryOf<T extends { primary?: boolean; endedAt?: number | null; paused?: boolean; status?: string }>(team?: T[] | null): T | null;
export function pausedNow(t: { pausedUntil?: string | null } | null | undefined, now?: number): boolean;
export function isWorks(works: unknown): works is { every: 'day' | 'weekday' | 'week'; at: string; on?: number };
export function dutyWhen(d: DutyLike | null | undefined): string;
export function cleanDuty(d: unknown): DutyLike | null;
export function dutyStart(d: DutyLike, now?: number): string;
export function dutyOf(item: { labels?: string[] } | null | undefined): string | null;
export function letterFor(name: string | null | undefined, teammates?: { letter?: string | null }[]): string;
export function isQueued(item: RunItem | null | undefined): boolean;
export function isActiveRun(item: RunItem | null | undefined): boolean;
export function planWakes(input?: { teammates?: TeammateLike[]; chat?: ChatLike; items?: RunItem[]; now?: number; shipped?: Record<string, number> }): WakeAction[];
export function runLines(items: RunItem[] | null | undefined, teammates?: { id: string; name?: string }[]): RunLine[];
export function statusOf(teammate: { id: string; paused?: boolean }, items: RunItem[] | null | undefined, now?: number): TeammateStatus;
export function offerFrom(input?: { items?: RunItem[]; offered?: ReadonlySet<unknown>; now?: number }): Offer | null;
export function sourceText(thread: { title?: string; product?: string; id: string }, turns: TurnLike[] | null | undefined, opts?: { cap?: number }): string;
export function recordOf(runs: RunItem[] | null | undefined, read: (product: string | undefined, id: string) => TurnLike[] | null | undefined, opts?: { now?: number; cap?: number; days?: number }): string;
export function offerAnswer(answer: unknown): { kind: 'make' | 'dismiss'; words?: string } | null;
