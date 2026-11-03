// Types for shared/thread-continued.mjs, read by the renderer.
export const CONTINUED_NOTE: string;
export function isContinuedNote(text: unknown): boolean;
export function continuedFromLabel(personId: string, threadId: string): string;
export function continuedFrom(labels: readonly unknown[] | null | undefined): { personId: string; threadId: string } | null;
