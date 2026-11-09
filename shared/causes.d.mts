// Types for shared/causes.mjs.

interface Row { id: string; product?: string; status?: string; kind?: string; title?: string; labels?: readonly string[]; blockedBy?: readonly string[]; createdAt?: number; updatedAt?: number; wrote?: { kind?: { source?: string } } }

export const CAUSE_LABEL: string;
export const CAUSE_KIND: string;
export const CAUSE_WAIT_WORD: string;
export const CAUSE_BACK_WORDS: string;
export function isCause(item: unknown): boolean;
export function waitingOn<T extends Row>(cause: Row, items: readonly T[]): T[];
export function causeOf<T extends Row>(item: Row, items: readonly T[]): T | null;
export function keeperOf<T extends Row>(title: string, open: readonly T[]): T | null;
export const JOINED_TOO: string;
export function joinedWords(thread: { label?: string; title?: string } | null): string;
export function causeWord(n: number): string;
export function causeWhere(cause: Row, waiting: readonly Row[], ownName: string): string;
export function openCauses<T extends Row>(items: readonly T[]): T[];
export function cameBack(title: string, items: readonly Row[], now?: number): boolean;
export function leadBrief(args: { cause: string; ask?: string; from: string; again?: boolean }): string;
export function withoutBrief<T>(lines: readonly T[]): T[];
