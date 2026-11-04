export interface MergeHomeResult {
  ok: boolean;
  why?: string;
  said?: string;
  commits?: number;
  into?: string;
}

export function isPlainMerge(what: unknown): boolean;
export function mergeHome(cwd: string): Promise<MergeHomeResult>;
export function mergedSentence(merge: { commits?: number; into?: string }): string;
