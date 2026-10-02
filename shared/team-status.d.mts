export interface PersonStatus { text: string; until: number | null }
export type HoldId = 'today' | 'tomorrow' | 'week' | 'open';

export const STATUS_MAX: number;
export const HOLDS: { id: HoldId; label: string }[];

export function cleanStatus(text: unknown): string | null;
export function liveStatus(status: PersonStatus | null | undefined, now?: number): PersonStatus | null;
export function hasLapsed(status: PersonStatus | null | undefined, now?: number): boolean;
export function holdsUntil(until: number | null | undefined, now?: number): string;
export function holdEnds(id: HoldId | string, now?: number): number | null;
