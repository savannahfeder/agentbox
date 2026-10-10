// Types for shared/corner-tag.mjs, the corner tag's rules, which main (Node)
// and the tag's page (Vite) share one copy of. Only what the page calls is
// declared; the window placement is main's half.

export type HideChoice = { key: '5m' | '30m' | 'today'; label: string };
export const HIDE_CHOICES: HideChoice[];

export function tagSays(counts: { ready?: number; working?: number }): { kind: 'ready' | 'working'; text: string } | null;

export type ReadyLine = { id: string; title: string; says: string; since?: number; open?: string | null };
export function cardLines<T extends ReadyLine>(ready: T[], now: number, max?: number): {
  lines: (T & { waited: string })[];
  more: number;
};
