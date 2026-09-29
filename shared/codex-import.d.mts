// Types for shared/codex-import.mjs, so the renderer can import it under
// strict TypeScript the way it does the other shared modules.
export const CODEX_IMPORT_LABEL: string;
export const CODEX_MIRROR_LABEL: string;
export const NOT_IMPORTED_LABEL: string;
export const IMPORT_KIND: string;
export function codexLabel(id: string | null | undefined): string;
export function codexIdOf(item: { labels?: string[] } | null | undefined): string | null;
export function isCodexImportRow(item: { labels?: string[]; status?: string } | null | undefined): boolean;
export function isNotImportedRow(item: { labels?: string[]; status?: string } | null | undefined): boolean;
export function isCodexMirrorRow(item: { labels?: string[] } | null | undefined): boolean;
export function whenPhrase(when: number | null | undefined, now?: number): string;
export function plainQuote(text: string | null | undefined): string;
export function threadFactsLine(thread: CodexThreadLike, now?: number): string;
export const FIRST_LINE_BUDGET: number;
export function importFirstLine(thread: CodexThreadLike, opts?: { projectName?: string | null; now?: number }): string;
export function productsForThread<P extends { repoPath?: string | null }>(thread: CodexThreadLike, products?: P[]): P[];
export interface CodexThreadLike {
  id?: string;
  title?: string;
  folder?: string;
  when?: number;
  prompt?: string;
  last?: string;
  short?: string;
  startedAt?: number;
  lastActive?: number;
  turns?: number;
  images?: number;
  live?: boolean;
}
export function codexImportRow(thread: CodexThreadLike, opts?: { projectName?: string | null; now?: number }): {
  title: string; body: string; kind: string; priority: number; labels: string[];
};
export function codexMirrorPatch(thread: CodexThreadLike): { body: string; result: string; kind: string; labels: string[] };
export function importChoice(answer: string | null | undefined): 'yes' | 'no' | null;
export function whereThreadLands<P extends { repoPath?: string | null }>(thread: CodexThreadLike, products?: P[]): P | null;
export function threadsNeedingRows<T extends CodexThreadLike>(threads: T[], existingItems?: Array<{ labels?: string[] }>): T[];
