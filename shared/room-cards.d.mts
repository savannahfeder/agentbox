export const PRESENCE_STALE_MS: number;
export const WORKING_ON_MAX: number;
export function displayNameOf(name: unknown, opts?: { full?: boolean }): string;
export function wallCards(opts: Record<string, unknown>): unknown[];
export function myPresence(opts: Record<string, unknown>): Record<string, unknown>;
export function withoutHidden<T>(row: T, profile: unknown): T;
