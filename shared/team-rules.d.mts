// Types for shared/team-rules.mjs, read by the renderer.
type Row = { createdBy?: string | null; assignee?: string; runner?: string; people?: string[]; status?: string };
type ProductLike = { team?: { projectId?: string; sharedBy?: string | null; direct?: unknown } | null } | null | undefined;

export function isShared(product: ProductLike): boolean;
export function nameIsAPersons(item: { label?: string; wrote?: Record<string, { source?: string } | undefined> } | null | undefined): boolean;
export function teamPeopleShown<P extends { id: string; name?: string | null; email?: string | null }>(people: readonly P[] | null | undefined): P[];
export function runnerOf(item: Row, product: ProductLike): string | null;
export function heldByAPerson(item: Row): boolean;
export const GIVEN_TASK: string;
export function isTaskRow(item: { labels?: string[] } | null | undefined): boolean;
export function isGivenTask(item: { labels?: string[] } | null | undefined, product: ProductLike): boolean;
export const WORK_THREAD: string;
export function isWorkThread(item: { labels?: string[] } | null | undefined): boolean;
export function taskGiver(item: Row): string | null;
export function taskNewsAt(item: { talk?: unknown; createdAt?: number }, me: string | null): number;
export function mayRunHere(item: Row, product: ProductLike, me: string | null): boolean;
export function inMyInbox(item: Row, product: ProductLike, me: string | null, now?: number): boolean;
export function lastSpeaker(item: Row): string | null;
export function closedOverWords(item: Row & { talk?: unknown }, product: ProductLike, me: string | null, seen?: number): boolean;
export function closedByTheOther(item: Row & { labels?: string[] }, product: ProductLike, me: string | null, seen?: number, now?: number): boolean;
export function iSpokeLast(item: Row, product: ProductLike, me: string | null): boolean;
export function handedOnByReply(item: Row, product: ProductLike, me: string | null): string | null;
/** One thread you are in where somebody spoke after you (w-920461cbe6). */
export interface ThreadWaiting { uid: string; mine: boolean; fresh: number; people: string[]; text: string; last: string; lastBy: string }
/** What in a conversation waits on you; null on a row from before threads. */
export interface Waits { chat: number; threads: ThreadWaiting[] }
export function whatWaits(item: Row & { talk?: unknown }, me: string | null): Waits | null;
/** A line with the fields only the Mac that wrote it may carry taken out. */
export type PulledLine = Record<string, unknown>;
export function asPulled(body: Record<string, unknown>, from: { by: string; at: number; me: string | null }): PulledLine;
export function whatATeammateMaySet(line: unknown, opts?: { direct?: boolean }): { id: unknown; ts: unknown; source: unknown; by: unknown; uid: unknown; patch: Record<string, unknown> } | null;
export function whatYourOtherCopyMaySet(line: unknown, opts?: { direct?: boolean }): PulledLine | null;
