// Types for shared/team-tasks.mjs.

export interface Deadline { at: number; clock: boolean }
interface BlockCtx { items?: readonly unknown[]; cards?: readonly unknown[]; me: string | null; nameOf: (id: string) => string }

export function deadlineIn(text: string, sentAt: number): Deadline | null;
export function dayDeadline(due: string | null | undefined): Deadline | null;
export function deadlineOf(item: unknown, me: string | null): Deadline | null;
export function isLate(deadline: Deadline | null, now: number): boolean;
export function lateForMe(item: unknown, me: string | null, now: number): boolean;
export function clockWords(at: number): string;
export function dueSaid(deadline: Deadline | null, now: number, opts?: { ahead?: boolean }): { word: string; late: boolean } | null;
export function taskBlocks(item: unknown): string[];
export function blockedOnMe(item: unknown, me: string | null): boolean;
export function dueFromWords(text: string, now: number): string | null;
export function taskTitle(title: string, names?: readonly string[], words?: string): string;
export function blockerOf(id: string, ctx: Omit<BlockCtx, 'nameOf' | 'me'> & { me?: string | null }): { kind: 'person' | 'thread' | 'name'; person: string | null; title: string | null; done: boolean };
export function blockedWords(item: unknown, ctx: BlockCtx): { word: string; title: string; on: string } | null;
export function endedTaskBlocks(rows: readonly unknown[], ctx: BlockCtx & { lastWordFrom?: (person: string) => number }): { item: { id: string }; said: string }[];
export function blockChoices<T>(args: {
  task?: { id: string } | null; holder: string | null; me: string | null;
  people: readonly { id: string; name?: string | null }[];
  items: readonly T[]; cards: readonly unknown[]; nameOf: (id: string) => string;
  published: (item: T) => boolean;
}): { id: string; label: string }[];
