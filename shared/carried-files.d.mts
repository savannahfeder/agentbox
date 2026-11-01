export type CarryState = {
  state: 'sent' | 'coming' | 'offline' | 'failed';
  mine?: boolean;
  why?: string;
  done?: number;
  total?: number;
  by?: string;
};
export type CarryLine = { state: CarryState['state']; label: string; percent: number | null; retry: boolean };

export const MAX_CARRIED_MB: number;
export const MAX_CARRIED_BYTES: number;
export const PART_BYTES: number;
export const MAX_SENT_MB: number;
export const MAX_SENT_BYTES: number;

export function isCarriedKind(file: unknown): boolean;
export function isDrawnInADocument(file: unknown): boolean;
export function plainRef(raw: unknown): string;
export function namedFiles(text: unknown): Array<{ ref: string; meant: boolean }>;
export function filesNamedInWords(text: unknown): string[];
export function wordsOfLine(line: unknown): string[];
export function filesADocumentDraws(text: unknown): string[];
export function sizeWords(bytes: number): string;
export function tooBigToSend(bytes: number): boolean;
export function overTheLimit(bytes: number): string;
export function whyWords(why: string | undefined, mine?: boolean): string;
export function carryLine(carry: CarryState | null | undefined): CarryLine | null;
export const carriedWords: {
  coming: (ref: string) => string;
  tooBig: (ref: string, bytes: number) => string;
  cannot: (ref: string, why?: string, mine?: boolean) => string;
};
