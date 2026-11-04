export interface MergeHomeResult {
  ok: boolean;
  why?: string;
  said?: string;
  commits?: number;
  into?: string;
  /** The remote main was pushed to, when it is published. */
  pushedTo?: string;
  /** Merged here, with only the push left undone. */
  merged?: boolean;
}

export interface MergeHomeOptions {
  /** A turn at the memory check before the push; answers with what gives it back. */
  beforePush?: () => Promise<() => void>;
}

export function isPlainMerge(what: unknown): boolean;
export function mergeHome(cwd: string, options?: MergeHomeOptions): Promise<MergeHomeResult>;
export function mergedSentence(merge: { commits?: number; into?: string; pushedTo?: string | null }): string;
