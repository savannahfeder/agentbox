// Types for shared/rank.mjs, which is plain ESM so that main (Node) and the
// renderer (Vite) can share one copy of the ranking rule.

export const RANK_STEP: number;
export function normalizeOrder(slugs: unknown): string[];
export function productRankScore(order: string[], slug: string): number;

export const DEFAULT_PRIORITY: number;

export function itemPriority(item: { priority?: number; wrote?: Record<string, { source?: string } | undefined> } | null | undefined): number;
export const URGENT_PRIORITY: number;
export function isUrgent(item: { priority?: number; wrote?: Record<string, { source?: string } | undefined> } | null | undefined): boolean;

export function orderFromTiers(tiers: Record<string, number> | null | undefined): string[];
export function landingIndex(
  rects: Array<{ top: number; bottom: number; left: number; width: number }>,
  x: number, y: number,
): number;
export function moveProduct(order: string[], slug: string, toIndex: number): string[];
