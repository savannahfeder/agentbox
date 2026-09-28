export interface Engine {
  id: string;
  label: string;
  word: string;
}

export declare const ENGINES: Engine[];
export declare const ENGINE_IDS: string[];
export declare const DEFAULT_ENGINE: string;
// The capability gate. `unique symbol` is what makes TypeScript refuse a
// boolean or a string here, so an honest caller is stopped at compile time. BE
// PRECISE ABOUT WHAT THAT BUYS: `any` walks straight through it, as it does
// through every type in this file, so the declaration is a guard rail and not
// the guarantee. The guarantee is at runtime and it is unchanged -- the value
// is a `Symbol` from this module and nothing serialized can be equal to it.
export declare const ENGINE_CHOICE_ENABLED: unique symbol;

/**
 * A row as the fold hands it over: the engine, the model she chose for it, and
 *  when the engine field was set. */
export interface EngineRow {
  engine?: string | null;
  model?: string | null;
  wrote?: Record<string, { ts?: number; source?: string } | undefined>;
}
/**
 * The workspace's half. `engineChoice` is `unknown` ON PURPOSE: the whole
 *  point of the parse is that anything which is not an ISO date string is off,
 *  so a caller must not be able to satisfy the type by writing `true`. */
export interface EngineWorkspace {
  engine?: string | null;
  engineChoice?: unknown;
  /**
   * When the default above was set, written by the settings screen. `unknown`
   *  for the same reason `engineChoice` is. */
  engineAt?: unknown;
}
export declare function engineChoiceSince(config?: EngineWorkspace): number | null;
export declare function engineDefaultSince(config?: EngineWorkspace): number | null;
export declare function engineDefaultIsStale(config?: EngineWorkspace): boolean;
export declare function engineChoiceOnRowIsStale(
  item: EngineRow | null | undefined,
  config?: EngineWorkspace,
): boolean;
export declare function isEngine(id: unknown): boolean;
export declare function engineLabel(id: string | null): string;
export declare function availableEngines(found?: Record<string, boolean>): Engine[];
export declare function engineChoiceExists(found?: Record<string, boolean>): boolean;
export declare function engineFor(
  item: EngineRow | null | undefined,
  where?: {
    config?: EngineWorkspace;
    found?: Record<string, boolean>;
    enabled?: typeof ENGINE_CHOICE_ENABLED;
  },
): string;
export declare function enginePicked(id: string | null): boolean;
/** The model on this row, or null because it belongs to the other harness. */
export declare function modelForEngine(
  item: EngineRow | null | undefined,
  engine: string | null,
): string | null;
