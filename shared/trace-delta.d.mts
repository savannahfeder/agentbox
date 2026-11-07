// Types for shared/trace-delta.mjs, for the window side.

export interface TraceReader {
  /** The stamps of the logs held for `product/id`, or nothing. */
  have(key: string): Record<string, string> | undefined;
  /** The answer with every log's text, or null when a log marked the same is
   *  no longer held and the read should be asked again with no stamps. */
  take<T>(key: string, answer: T): T | null;
}

export declare function traceReader(options?: { keep?: number }): TraceReader;

export interface TraceFs {
  statSync(file: string): { size: number; mtimeMs: number };
  openSync(file: string, flags: string): number;
  readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
}

export type TraceAnswer =
  | { startedAt: number; text: string; stamp?: string; cut?: true }
  | { startedAt: number; stamp: string; same: true }
  | { startedAt: number; stamp: string; from: number; more: string };

export declare function traceAnswer(options: { fs: TraceFs; file: string; startedAt: number; had?: string }): TraceAnswer;
