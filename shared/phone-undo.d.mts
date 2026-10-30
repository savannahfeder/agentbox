export const PHONE_UNDO_MS: number;
export const PHONE_UNDO_HOLD_MS: number;
export function heldForUndo(cmd: { kind?: string; createdAt?: string; created_at?: string } | null | undefined, now: number, holdMs?: number): boolean;
