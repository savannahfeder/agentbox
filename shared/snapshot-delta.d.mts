// Types for shared/snapshot-delta.mjs, for the window side.

export interface SnapshotReader {
  /** What to send with the next read: the last answer held, or nothing. */
  ask(): { since: string } | undefined;
  /** The whole snapshot to draw, or null when the answer builds on a list this
   *  window has dropped and the read should be asked again with nothing. */
  take<T>(answer: T): T | null;
}

export declare function snapshotReader(options?: { keep?: number }): SnapshotReader;

export interface SnapshotSender {
  answer<T extends { items?: unknown[] }>(whole: T, since?: string): T & { snapshotToken?: string };
}

export declare function snapshotSender(options?: { keep?: number }): SnapshotSender;

export interface LightRunningRow {
  itemId?: string | null;
  product?: string | null;
  tail?: unknown[];
  activity?: unknown[];
  saying?: string;
  sayingAt?: number;
}

export declare function lightRunning<T extends LightRunningRow>(
  running: readonly T[] | null | undefined,
  open: { id?: string | null; product?: string | null } | null | undefined,
): T[];
