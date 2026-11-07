// Types for shared/thread-waits.mjs.

export function personWait(id: string): string;
export function cardWait(person: string, thread: string): string;
export function nameWait(words: string): string | null;
export function waitParts(id: string): { kind: 'person'; person: string } | { kind: 'name'; name: string } | { kind: 'card'; person: string; thread: string } | { kind: 'thread'; thread: string };
export function setByPerson(item: unknown): boolean;
export const WAIT_GIVES_UP_MS: number;
export function endedWaits(rows: readonly unknown[], ctx: unknown): { item: { id: string }; said: string }[];
export function waitWords(item: unknown, ctx: { items?: readonly unknown[]; cards?: readonly unknown[]; nameOf: (id: string) => string }): { word: string; title: string } | null;
export function waitChoices(args: {
  item: unknown; me: string | null; people: readonly { id: string; name?: string | null }[];
  items: readonly unknown[]; cards: readonly unknown[]; nameOf: (id: string) => string;
}): { id: string; label: string }[];
