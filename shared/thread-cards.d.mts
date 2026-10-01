// Types for shared/thread-cards.mjs, for the window side.
import type { ThreadStateWord, WorkItem } from '../renderer/src/types';

export const THREAD_STATES: ThreadStateWord[];
export function threadState(item: Partial<WorkItem> & { claimExpired?: boolean }, now?: number): ThreadStateWord;
export function firstSentence(text: string | undefined | null, max?: number): string;
export function summaryOf(item: Partial<WorkItem>): { problem: string; progress: string; solution: string; written: boolean };
export function cardsFor(p: { products: unknown[]; readItems: (product: any) => any[]; now?: number }): any[];
