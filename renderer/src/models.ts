// The models a task can be handed to. CLAUDE CODE'S ARE HERE; CODEX'S ARE READ
// OFF THE MAC, and the rule about which list belongs to which engine is at the
// bottom of this file.
//
// FOUR NAMES, AND EVERY ONE OF THEM CARRIES ITS VERSION.
//
// Do not put a row like that back.
//
// WHAT IS SENT IS AN ALIAS, NEVER A VERSION, and that half has not changed. She
// asked whether the list could come from Claude Code rather than be maintained
// here, and the CLI has no command that lists models. But `--model` takes an
// alias: "Provide an alias for the latest model (e.g. 'fable', 'opus', or
// 'sonnet') or a model's full name". So `opus` is whatever Opus is on the day
// the task runs, resolved by the CLI at spawn, and nothing here goes stale.
//
// WHAT IS DRAWN IS READ OUT OF THE CLI, AND THAT IS NEW.
//
// The fear is exactly right, and it is the cost of the alias: the CLI decides
// what "Opus" means and this file was only printing the word, so the two could
// drift apart with nothing on either side noticing. A version typed in here by
// hand would be worse than the bare word, because it would look authoritative
// while being a guess.
//
// So the rows are generated at build time out of the SAME table the CLI resolves
// the alias with (scripts/read-claude-models.mjs, reading its baked-in model
// catalog). One source, so the name on her screen cannot disagree with the model
// that runs, and a Claude Code that ever points an alias at something older
// changes her label with it and shows up as a diff.
//
// MEASURED on her Mac against 2.1.257, 2026-09-01: `fable` already resolved to
// `claude-fable-5-1`. Her instruction was answered by proving that rather than
// by changing anything, and this is what keeps it proven.
//
// A model set by hand outside this list still draws as itself; see modelChoices.

import { CLAUDE_MODELS } from '../../shared/claude-models.generated.mjs';

export interface ModelChoice {
  /** What the CLI is sent. Always an alias, never a version. */
  id: string;
  /** Claude Code's own name for what that alias resolves to: "Opus 5". */
  label: string;
  /** The version it resolves to today, for the one place that says it in full. */
  model?: string;
  /**
   * A CODEX MODEL'S OWN REASONING LEVELS, read off this Mac beside its name
   *  (main/codex-models.mjs). Absent on every Claude Code row, whose levels are
   *  the CLI's five for any model (../../shared/effort-levels.mjs). */
  levels?: string[];
  defaultLevel?: string | null;
}

/**
 * THE TABLE COMMITTED AT BUILD TIME, which is now the FLOOR rather than the
 * answer.
 *
 * Kept exactly as it was, and it is what every Mac draws until main has said
 * otherwise: a build with no Claude Code on the machine that made it, a first
 * paint before the settings trip returns, and every test that does not care.
 */
export const BUILT_MODELS: ModelChoice[] = CLAUDE_MODELS.map((m) => ({
  id: m.alias,
  label: m.label,
  model: m.id,
  defaultLevel: m.defaultLevel,
}));

/**
 * WHAT THIS MAC'S CLAUDE CODE SAYS TODAY, handed down by main once per launch.
 *
 * The answer is that the alias Agentbox sends already runs the new model; it was
 * only the WORD that was frozen, because it came out of a file written when
 * Agentbox was built. MEASURED that day: her Claude Code 2.1.270 resolves `opus`
 * to Opus 5, and 2.1.280 resolves it to Opus 5.5. Now main reads the installed
 * CLI and this is where the answer lands (`main/claude-models.mjs`).
 *
 * WHY A MODULE-LEVEL VALUE AND NOT A PROP. Codex's list is threaded through
 * Compose, Focus and Settings as `codexModels`, and it has to be: it is drawn
 * only beside a Codex card, so the components that draw it are the ones that
 * know. Claude Code's list is the opposite. It is every model row on every
 * screen, `MODELS` is imported flat in half a dozen places, and threading a
 * fifth prop through each of them to say the same sentence would be five more
 * chances to forget one and leave a picker quietly printing last year's name.
 * Set once, in the settings trip App already makes on mount, BEFORE the
 * `setState` beside it that repaints the tree.
 */
let LIVE: ModelChoice[] | null = null;

/** Main's answer, or null to go back to the committed table (used by the tests). */
export function setClaudeModels(rows: ModelChoice[] | null | undefined): void {
  LIVE = Array.isArray(rows) && rows.length ? rows : null;
}

/** The Claude Code rows in force right now. */
export function claudeModelRows(): ModelChoice[] { return LIVE ?? BUILT_MODELS; }

/**
 * @deprecated for new code: it is a snapshot of the committed table taken at
 * import time, so it cannot see a `claude update`. Call `claudeModelRows`.
 * Kept because the fixtures and several tests name it.
 */
export const MODELS: ModelChoice[] = BUILT_MODELS;

/**
 * What a card opens on when she has never picked.
 *
 * With the fourth row gone there is no way to say "whatever the workspace is
 * set to" in the sentence, so the sentence has to name one, and it names the
 * one Agentbox already runs on everywhere else (`fixtures.ts`, the packaged
 * app's own session args).
 *
 * AND IT IS WIRED SINCE 2026-09-23 (w-12081d32cc). Settings has no Model row
 * any more, so the card is the only place the question is asked and the word on
 * it has to be the model that runs: Compose sends this constant on a Claude
 * Code card nobody has touched, instead of sending nothing and letting a
 * `--model` flag in zero.config.json answer a question already answered.
 */
export const DEFAULT_MODEL = 'opus';

/**
 * A model set by hand that is none of the three is shown AS ITSELF rather than
 * rounded to the nearest name or left with nothing lit. Same rule the settings
 * screen follows: a control that draws a value it is not running has started
 * lying about the fleet. This is also what keeps a pinned id from a previous
 * build (`claude-opus-5`) readable instead of vanishing.
 */
export function modelChoices(id: string | null): ModelChoice[] {
  const value = id ?? DEFAULT_MODEL;
  const rows = claudeModelRows();
  const known = rows.some((m) => m.id === value);
  return known ? rows : [...rows, { id: value, label: value }];
}

export function modelLabelOf(id: string | null): string {
  const value = id ?? DEFAULT_MODEL;
  return modelChoices(value).find((m) => m.id === value)?.label ?? value;
}

/* --------------------------- THE SECOND ENGINE ---------------------------- */
// Everything above this line is CLAUDE CODE'S. `--model opus` is an alias its
// CLI resolves at spawn; Codex has no aliases and `thread/start`'s `model`
// wants an exact slug (`gpt-5.6-sol`). So "On Opus. With Codex." was not merely
// a card that read wrong -- since 2026-09-04 it is a row that cannot run at
// all, because `codexModelRefusal` in main/supervisor.mjs stops a Codex run
// whose model this Mac's Codex does not know rather than picking a stand-in.
//
// CODEX'S LIST IS NOT IN THIS FILE ON PURPOSE. It is read off the Mac, out of
// the cache codex-cli itself maintains, and arrives here through settings
// (main/codex-models.mjs says why a hardcoded one is wrong the week after it is
// written and a generated one wrong the week after the build). This module
// holds the RULE about which list is which; neither list is invented here.

/**
 * THE ROW THAT MEANS "SEND NO MODEL AND LET CODEX DECIDE".
 *
 * It exists for exactly one Mac: a Codex whose `config.toml` names no model, so
 * `codexDefaultModel` answers null and the app genuinely does not know the word.
 *
 * Both alternatives are worse. Printing the first row of the offer list would
 * print OUR sort order as her default, which main/codex-models.mjs refuses by
 * name. Printing `opus` would be the Claude alias on a Codex card that this
 * whole section exists to stop. Her rejection of "the default model" on was of
 * a row whose job was to explain that the picker might not be picking anything;
 * this row names who picks, and it is drawn only on a Mac where the app truly
 * cannot know.
 *
 * The empty string rather than null, so it is a `ModelChoice.id` like any other
 * row and so `engineModelPicked` reads it as no pick without a special case.
 */
export const CODEX_OWN = '';

/**
 * What the word says when she has picked nothing on this card.
 *
 * For Claude Code that is Opus, as it has been. For Codex it is whatever her
 * own `~/.codex/config.toml` runs, handed down through settings, because a
 * default that disagreed with her terminal would be a fleet she cannot reason
 * about -- and `CODEX_OWN` when that file names nothing.
 */
export function defaultModelFor(engine: string | null, codexDefault: string | null = null): string {
  if (engine !== 'codex') return DEFAULT_MODEL;
  return codexDefault ?? CODEX_OWN;
}

/**
 * The rows for one engine, with the current value included even when the
 * fetched list does not carry it.
 *
 * Same rule `modelChoices` follows above and for the same reason: a control
 * that draws a value it is not running has started lying about the fleet. It
 * matters more here, because her config.toml may name a model the cache marks
 * hidden (`visibility: "hide"`, which the offer list drops on purpose), and a
 * picker that silently left it out would look like it had chosen for her.
 */
export function engineModelChoices(
  engine: string | null,
  id: string | null,
  { codexModels = [], codexDefault = null }: { codexModels?: ModelChoice[]; codexDefault?: string | null } = {},
): ModelChoice[] {
  if (engine !== 'codex') return modelChoices(id);
  const value = id ?? defaultModelFor(engine, codexDefault);
  if (value === CODEX_OWN) return [...codexModels, { id: CODEX_OWN, label: "Codex's own" }];
  return codexModels.some((m) => m.id === value) ? codexModels : [...codexModels, { id: value, label: value }];
}

/** The word itself, for one engine. */
export function engineModelLabel(
  engine: string | null,
  id: string | null,
  opts: { codexModels?: ModelChoice[]; codexDefault?: string | null } = {},
): string {
  const value = id ?? defaultModelFor(engine, opts.codexDefault ?? null);
  return engineModelChoices(engine, value, opts).find((m) => m.id === value)?.label ?? value;
}

/**
 * Whether she has moved off this engine's default, which is what keeps the
 * composer's footer open and what decides whether `model` is written on the row
 * at all. The engine-aware twin of `modelPicked` below: `opus` is the default
 * on Claude Code and is a MEANINGLESS word on Codex, so the two cannot share
 * one constant.
 */
export function engineModelPicked(
  engine: string | null,
  id: string | null,
  codexDefault: string | null = null,
): boolean {
  return !!id && id !== defaultModelFor(engine, codexDefault);
}

/**
 * Whether she has moved off the default, as opposed to the clause merely
 *  saying what runs. What makes the footer stay open, so agreeing with the
 *  default is not a reason to keep the sentence up. */
export function modelPicked(id: string | null): boolean {
  return !!id && id !== DEFAULT_MODEL;
}

export const LAST_MODEL_KEY = 'zero.lastModel';

/**
 * ONE KEY PER ENGINE.
 *
 * The memory used to be a single string, which was right while there was one
 * engine and is wrong now: remembering `haiku` and then handing it to Codex
 * puts a word on the card its CLI has never heard of, and since 2026-09-04
 * `codexModelRefusal` stops that run rather than picking a stand-in. Claude
 * Code keeps the original key, so a model she has already chosen survives this
 * change untouched.
 */
export function lastModelKey(engine: string | null = null): string {
  return engine === 'codex' ? `${LAST_MODEL_KEY}.codex` : LAST_MODEL_KEY;
}

// Remembered the moment she picks, exactly like the project and the level: a
// card that forgets what you chose the second it closes makes you choose again.
export function readLastModel(
  store: Storage | undefined = globalThis.localStorage,
  engine: string | null = null,
  codexDefault: string | null = null,
): string | null {
  try {
    const raw = store?.getItem(lastModelKey(engine));
    if (!raw || raw === defaultModelFor(engine, codexDefault)) return null;
    return raw;
  } catch { return null; }
}

export function writeLastModel(
  id: string | null,
  store: Storage | undefined = globalThis.localStorage,
  engine: string | null = null,
  codexDefault: string | null = null,
): void {
  try {
    if (!id || id === defaultModelFor(engine, codexDefault)) store?.removeItem(lastModelKey(engine));
    else store?.setItem(lastModelKey(engine), id);
  } catch { /* a refused store is not a reason to lose the send */ }
}
