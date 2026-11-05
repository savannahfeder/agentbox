export type WordQuery = { terms: string[]; phrase: string; quoted: boolean };
export function fold(text: unknown): string;
export function withHumps(text: unknown): string;
export function isWordChar(c: string): boolean;
export function wordStart(hay: string, needle: string, from?: number, whole?: boolean): number;
export function queryOf(query: string): WordQuery;
export function holds(foldedText: string, q: WordQuery): boolean;
export function firstHit(foldedText: string, q: WordQuery): number;
export function windowAround(text: string, hit: number, budget: number): string;
