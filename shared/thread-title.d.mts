export const TITLE_WORDS: number;
export function shortTitle(text: string | null | undefined): string;
export function withoutFiles(text: string | null | undefined): string;
export function shownTitle(i: {
  title?: string;
  label?: string;
  wrote?: { title?: { ts: number; source?: string }; label?: { ts: number } };
} | null | undefined): string;
