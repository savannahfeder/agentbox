// Types for shared/team-departures.mjs, read by the renderer.
export function handedFromLabel(personId: string): string;
export function handedFrom(labels: readonly unknown[] | null | undefined): string | null;
export const MAX_MATES: number;
export function cleanMates(list: unknown): { id: string; name: string; job: string | null; to: string | null }[];
