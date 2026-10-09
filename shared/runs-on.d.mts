export interface RunsOn {
  /** 'claude' or 'codex', or null on a Mac where nothing is signed in. */
  engine?: string | null;
}

/** The word for the plan behind an engine, or null for one we cannot name. */
export declare function runsOnName(engine?: string | null): string | null;

/** The one line the walk says on a Mac that was already set up. Null for null. */
export declare function foundOnThisMac(facts?: RunsOn): string | null;
