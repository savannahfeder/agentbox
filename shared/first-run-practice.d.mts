// Types for shared/first-run-practice.mjs, which the renderer imports for the
// practice project's copy. Same pattern as agents.d.mts beside it: the module
// is plain JavaScript so both halves can read it, and this says what it is.

export const PRACTICE_NAME: string;
export const PRACTICE_SLUG: string;
export const PRACTICE_FLAG: string;
export const PRACTICE_TASK: { title: string; body: string };
export const PRACTICE_ANSWER: string;
export const PRACTICE_TASK_TRACE: string[];
/** The practice project's sidebar note, written to its `pinned.md` and drawn
 *  beside the third introduction slab. */
export const PRACTICE_NOTE: string;
export const PRACTICE_ROWS: {
  kind: string;
  title: string;
  /** The sentence a person typed to start it. */
  body: string;
  /** The lines the run wrote while it worked, in the shape traceStreamLine
   *  writes a real one: `[Tool] argument`, or a plain sentence when the agent
   *  is talking. The store stamps the times. */
  trace: string[];
  result: string;
  agoMs: number;
  /** THE ONE THAT IS NOT FINISHED. An agent is stopped on it, waiting for an
   *  answer, and beat thirteen is about the difference between this row and the
   *  other two. Exactly one of the three carries it. */
  waiting?: boolean;
  /** THE ONE THAT IS NOT FOR TODAY. Real work, nobody's emergency, and the row
   *  beat fourteen snoozes. Exactly one of the four carries it. */
  later?: boolean;
}[];
