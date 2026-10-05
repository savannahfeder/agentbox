// Types for shared/thread-cards.mjs, for the window side.
import type { ThreadStateWord, WorkItem } from '../renderer/src/types';

export const THREAD_STATES: ThreadStateWord[];
export function threadState(item: Partial<WorkItem> & { claimExpired?: boolean }, now?: number): ThreadStateWord;
export function firstSentence(text: string | undefined | null, max?: number): string;
export const SUMMARY_WORDS: number;
export function wordsIn(text: string | undefined | null): number;
export function summaryOf(item: Partial<WorkItem>): { problem: string; progress: string; solution: string; written: boolean };
export function cardsFor(p: { products: unknown[]; readItems: (product: any) => any[]; now?: number; since?: number | null }): any[];
export function shownToTeam(item: Partial<WorkItem>, since?: number | null): boolean;
export function shownToPeople(item: Partial<WorkItem>): string[];
