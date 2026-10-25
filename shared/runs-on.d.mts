export interface RunsOn {
  /** 'claude' or 'codex', or null on a computer where nothing is signed in. */
  engine?: string | null;
}

/** The word for the plan behind an engine, or null for one we cannot name. */
export declare function runsOnName(engine?: string | null): string | null;

/** The one line the walk says where it was already set up. Null for null. */
export declare function foundOnThisComputer(facts?: RunsOn): string | null;
