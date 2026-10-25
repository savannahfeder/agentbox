// Types for shared/not-shipped.mjs.

export interface NotedItem {
  status?: string;
  note?: string;
  wrote?: Record<string, { ts: number; source?: string } | undefined>;
}

export interface NotShipped { why: string; branch: string | null; reopened: boolean }

export const SHIP_FAILED: string;
export const KEPT_ASIDE: string;
export const CLOSED_UNSHIPPED: string;
export const CLOSED_ANYWAY: string;
export function notShipped(item: NotedItem | null | undefined): NotShipped | null;
export function shippedAs(item: NotedItem | null | undefined): { sha: string | null } | null;
export function closedUnshipped(item: NotedItem | null | undefined): boolean;
export function notShippedLine(item: NotedItem | null | undefined): string | null;
export function shipItAsk(item: NotedItem | null | undefined): string | null;
export function closedAnywayNote(item: NotedItem | null | undefined): string | null;
export function closeRefusal(item: NotedItem | null | undefined, opts?: { closeUnshipped?: boolean }): { ok: false; error: string } | null;
export function closedBeforeItShipped(item: NotedItem | null | undefined): boolean;
