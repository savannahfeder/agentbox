// Types for shared/usage.mjs, which the renderer imports and which is plain
// JavaScript because main imports it too. Hand-written and short: it is one
// rule about which coding agent the corner is about, the zone primitives the
// Claude reader is built on, and the words the panel prints.

export interface UsageLimit {
  span: 'session' | 'week';
  qualifier: string | null;
  /** What the panel calls it, in plain words, stamped on by whichever reader
   *  produced it. See renderer/src/types.ts for why it is not derived here. */
  name: string;
  percent: number;
  resetsText: string | null;
  resetsOn: string | null;
  resetsAt: number | null;
  zone: string | null;
}

/** One live session as `Supervisor#status` reports it. Only the engine is read;
 *  it is already one of exactly two words by the time it arrives. */
export interface RunningSession {
  engine?: string | null;
}

export declare function usageEngine(facts?: {
  workspace?: string;
  running?: RunningSession[] | null;
}): string;

export declare function localZone(): string | null;
export declare function wallIn(ms: number, zone: string | null): {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
} | null;
export declare function instantIn(
  year: number, monthIndex: number, day: number, hour: number, minute: number, zone: string | null,
): number;

export declare function sessionLimit(limits: UsageLimit[] | null | undefined): UsageLimit | null;
export declare function headlineLimit(limits: UsageLimit[] | null | undefined): UsageLimit | null;
export declare const ANY_MOMENT: string;
export declare function spanLeft(ms: number): string;
export declare function untilReset(ms: number): string;

export declare function limitRows(
  limits: UsageLimit[] | null | undefined,
  now?: number,
): { key: string; name: string; used: number; when: string | null }[];

export declare function usageSentence(
  limits: UsageLimit[] | null | undefined,
  now?: number,
  engineWord?: string | null,
): string | null;
