export interface MovableThread {
  status?: string;
  epoch?: number;
  result?: string;
  note?: string;
  agent?: unknown;
  [field: string]: unknown;
}

export declare const MOVE_KEYWORDS: string;
export declare const SAME_PROJECT: string;
export declare const RAN_ALREADY: string;
export declare const CARRIED: string[];
export declare const CARRIED_AFTERWARDS: string[];

export declare function whyItCannotMove(
  item: MovableThread | null | undefined,
  opts?: { live?: boolean },
): string | null;
export declare function canMove(item: MovableThread | null | undefined, opts?: { live?: boolean }): boolean;
export declare function movedAway(name: string): string;
export declare function movedHere(name: string): string;
export declare function whatMoves(item: MovableThread): Record<string, unknown>;
export declare function splitForCompose(carried: Record<string, unknown>): { compose: Record<string, unknown>; after: Record<string, unknown> };
