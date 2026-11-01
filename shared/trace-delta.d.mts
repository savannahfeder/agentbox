// Types for shared/trace-delta.mjs, for the window side.

export interface TraceReader {
  /** The stamps of the logs held for `product/id`, or nothing. */
  have(key: string): Record<string, string> | undefined;
  /** The answer with every log's text, or null when a log marked the same is
   *  no longer held and the read should be asked again with no stamps. */
  take<T>(key: string, answer: T): T | null;
}

export declare function traceReader(options?: { keep?: number }): TraceReader;
