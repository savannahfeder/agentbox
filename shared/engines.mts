import { HARNESS_DEFINITIONS } from './harness-definitions.mts';
// Which coding agent a task is handed to.
//
// Claude Code is the default. Codex measured slower on median and wandered on
// the same tasks, so do not make it the default for anybody.
//
// Old rows may still carry `engine: "codex"`, because the work-item fold keeps
// every field it was given. So `engineFor` answers Claude Code unless the
// caller hands it `ENGINE_CHOICE_ENABLED`, and a caller that passes nothing
// gets the safe answer.
//
// This module holds the names and the one rule. Codex arguments and its event
// stream live in main/codex.mts, because the renderer imports this file and
// must never import spawn code.

/**
 * The engines, in the order the picker draws them. Admitted harnesses only: a
 * registered harness (OpenCode, say) still works through `harnessFor` by name
 * but is not offered anywhere until it is admitted. The bar for admission is in
 * docs/harnesses.md.
 */
export interface Engine {
  id: string;
  label: string;
  word: string;
}

/** A row as the fold hands it over: the engine, the model chosen for it, and when the engine field was set. */
export interface EngineRow {
  engine?: string | null;
  model?: string | null;
  wrote?: Record<string, { ts?: number; source?: string } | undefined>;
}

/**
 * The workspace's half. `engineChoice` and `engineAt` are `unknown` on purpose:
 * anything that is not an ISO date string is off, so writing `true` must not
 * satisfy the type.
 */
export interface EngineWorkspace {
  engine?: string | null;
  engineChoice?: unknown;
  engineAt?: unknown;
}

/** Which engine binaries the finders found, by engine id. */
export type EnginesFound = Record<string, boolean | undefined>;

export const ENGINES: Engine[] = HARNESS_DEFINITIONS
  .filter(({ admitted }) => admitted !== false)
  .map(({ id, label, word }) => ({ id, label, word }));

export const ENGINE_IDS: string[] = ENGINES.map((e) => e.id);

/**
 * What a task runs on when nobody has chosen. It is Claude Code for the speed
 * reason at the top of this file, not because Codex lacks approvals or a
 * picker: both exist now.
 */
export const DEFAULT_ENGINE = 'claude';

/**
 * WHAT A CLAUDE CODE RUN IS ON WHEN NO ROW NAMES A MODEL. An alias, so the run
 * is on whatever Opus is the day it spawns.
 *
 * Here because both ends read it: the card draws and sends this word
 * (renderer/src/models.ts DEFAULT_MODEL) and `spawnPlan` pins it on every other
 * kind of run. Two constants could drift, and a screen naming one model over a
 * run on another is the bug that closed
 * (tests/a-run-nobody-picked-a-model-for-is-on-the-model-the-card-names).
 */
export const DEFAULT_CLAUDE_MODEL = 'opus';

/**
 * The capability gate: passing this to `engineFor` says the call site meant to
 * allow a second engine. It blocks serialized data only. Any module here can
 * import it.
 *
 * It is a Symbol because nothing from outside the process can carry one: JSON
 * drops it, and Electron's structured clone throws DataCloneError on it. It
 * uses `Symbol`, not `Symbol.for`, so no string can mint an equal one, and it
 * is not a boolean, so a spread options object cannot open it by accident.
 */
export const ENGINE_CHOICE_ENABLED = Symbol('the second engine is wired up in this build');

// The shape of a date somebody wrote down. `Date.parse` alone would accept "1"
// or "2026", and `"engineChoice": "1"` must not open the second engine.
const A_MOMENT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function momentIn(written: unknown): number | null {
  if (typeof written !== 'string' || !A_MOMENT.test(written)) return null;
  const at = Date.parse(written);
  return Number.isFinite(at) ? at : null;
}

/**
 * When the user opened the gate (`engineChoice` in zero.config.json), or null.
 * It is a moment, not a flag, so an engine written on a row or as the default
 * before it is not a choice made now and is ignored. It lives in the config
 * rather than app state so every machine reading the same store agrees.
 * main/supervisor.mts `_engineFor` is the only place that turns it into the token.
 */
export function engineChoiceSince(config: EngineWorkspace | null = {}): number | null {
  return momentIn(config?.engineChoice);
}

/**
 * When the app last wrote the workspace default (`engineAt`, written beside
 * `engine` by `setWorkspaceSetting`), or null. Null means the default was typed
 * into the file by hand, in the same act as `engineChoice`, so it is never stale.
 */
export function engineDefaultSince(config: EngineWorkspace | null = {}): number | null {
  return momentIn(config?.engineAt);
}

/**
 * Whether the workspace default was set before the gate's current moment.
 * Never true for Claude Code: discarding that default could only move work onto
 * the second engine.
 */
export function engineDefaultIsStale(config: EngineWorkspace | null = {}): boolean {
  const since = engineChoiceSince(config);
  if (since === null) return false;
  if (!enginePicked(config?.engine)) return false;
  const at = engineDefaultSince(config);
  return at !== null && at < since;
}

/**
 * Whether the engine named on this row was written before the gate's moment.
 * A row with no `wrote.engine.ts` counts as stale, since there is no evidence
 * of a choice. A row naming Claude Code is never stale: discarding it would let
 * `engineFor` fall through to a Codex workspace default.
 *
 * `wrote.engine.source` is not consulted, because a ledger line names its own
 * author as an unchecked string.
 */
export function engineChoiceOnRowIsStale(item: EngineRow | null | undefined, config: EngineWorkspace | null = {}): boolean {
  const since = engineChoiceSince(config);
  if (since === null) return false;
  if (!enginePicked(item?.engine)) return false;
  const ts = item?.wrote?.engine?.ts;
  return !(Number.isFinite(ts) && ts! >= since);
}

export function isEngine(id: unknown): id is string {
  return typeof id === 'string' && ENGINE_IDS.includes(id);
}

export function engineLabel(id: string | null | undefined): string {
  return ENGINES.find((e) => e.id === id)?.label ?? ENGINES[0].label;
}

/**
 * Which engines this Mac can run, given `found` (id to boolean from the
 * finders). Claude Code is listed even when not found, unless Codex was.
 *
 * This is ungated, like `engineChoiceExists` and `enginePicked`. Its one caller
 * is `Supervisor#engineChoices`, which asks `engineChoiceSince` first, so the
 * offer and the routing cannot disagree. The renderer gets the list on the
 * snapshot. tests/a-codex-row-from-august-still-runs-on-claude.test.mts pins the
 * caller list.
 */
export function availableEngines(found: EnginesFound = {}): Engine[] {
  const home = homeEngine(found);
  return ENGINES.filter((e) => e.id === home || (e.id !== DEFAULT_ENGINE && found[e.id]));
}

/**
 * What runs on this Mac when nobody has chosen: Codex only when `found.claude`
 * is explicitly false and Codex was found. Undefined means a caller that never
 * asked, and reads as Claude Code being here.
 */
export function homeEngine(found: EnginesFound = {}): string {
  return found.claude === false && found.codex ? 'codex' : DEFAULT_ENGINE;
}

/** Whether there is a choice to make at all. One engine is not a choice. */
export function engineChoiceExists(found: EnginesFound = {}): boolean {
  return availableEngines(found).length > 1;
}

/**
 * Which engine one work item runs on. A Mac with only Codex runs Codex.
 * Otherwise, without `enabled: ENGINE_CHOICE_ENABLED` it is Claude Code. With
 * it, the row's engine wins over the workspace default, each ignored if written
 * before the gate's moment. An engine whose binary is not on this Mac falls back
 * to Claude Code, since the row may have been chosen on another machine.
 */
export function engineFor(
  item: EngineRow | null | undefined,
  { config = {}, found = {}, enabled }: { config?: EngineWorkspace | null; found?: EnginesFound; enabled?: typeof ENGINE_CHOICE_ENABLED } = {},
): string {
  if (homeEngine(found) !== DEFAULT_ENGINE) return homeEngine(found);
  if (enabled !== ENGINE_CHOICE_ENABLED) return DEFAULT_ENGINE;
  const wanted = isEngine(item?.engine) && !engineChoiceOnRowIsStale(item, config) ? item.engine : null;
  const fallback = isEngine(config?.engine) && !engineDefaultIsStale(config) ? config.engine : DEFAULT_ENGINE;
  const pick = wanted ?? fallback;
  if (pick === DEFAULT_ENGINE) return DEFAULT_ENGINE;
  return found[pick] ? pick : DEFAULT_ENGINE;
}

/**
 * Whether the row names an engine other than the default. The composer's footer
 * stays open on it, like the level and the model (renderer/src/compose-footer.ts).
 */
export function enginePicked(id: unknown): boolean {
  return isEngine(id) && id !== DEFAULT_ENGINE;
}

/**
 * The row's model for a run on `engine`, or null when the row names a different
 * engine. Claude and Codex model names do not overlap, so a Codex slug must not
 * reach `claude --model` when `engineFor` falls back to Claude Code. This is the
 * mirror of `codexModelRefusal`. Null means "no model for this run", and
 * main/supervisor.mts decides what to do with it. A row naming no engine keeps
 * its model.
 */
export function modelForEngine(item: EngineRow | null | undefined, engine: string | null): string | null {
  const model = typeof item?.model === 'string' && item.model ? item.model : null;
  if (!model) return null;
  if (isEngine(item?.engine) && item.engine !== engine) return null;
  return model;
}
