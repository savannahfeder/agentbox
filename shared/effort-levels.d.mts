export declare const EFFORT_LEVELS: ReadonlyArray<{
  /** What the app sends Claude Code after `--effort`. */
  id: string;
  /** The word on the strip in the model drawer. */
  label: string;
}>;

/** Whether a value is one of the five words Claude Code takes after `--effort`. */
export declare function isEffort(value: unknown): value is string;

/** Whether a value has the shape of a level at all: one short lowercase word. */
export declare function isEffortWord(value: unknown): value is string;

/** The word on the strip for a level id, on either engine, or null for a non-word. */
export declare function effortLabel(id: unknown): string | null;
