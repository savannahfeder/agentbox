// Types for shared/team-rules.mjs, read by the renderer.
type Row = { createdBy?: string | null; assignee?: string; runner?: string; people?: string[]; status?: string };
type ProductLike = { team?: { projectId?: string; sharedBy?: string | null } | null } | null | undefined;

export function isShared(product: ProductLike): boolean;
export function runnerOf(item: Row, product: ProductLike): string | null;
export function heldByAPerson(item: Row): boolean;
export function mayRunHere(item: Row, product: ProductLike, me: string | null): boolean;
export function inMyInbox(item: Row, product: ProductLike, me: string | null): boolean;
export function lastSpeaker(item: Row): string | null;
export function handedOnByReply(item: Row, product: ProductLike, me: string | null): string | null;
