// The effort level a task runs at, as the new task card remembers it.
//
// Her pick, 2026-09-01, out of five drawn: "A inside the model menu works
// great." The five levels sit under a hairline in the model drawer; the footer
// sentence itself does not change, which was the constraint she set.
//
// It is ../models.ts's twin: the same remembering across cards, for the same
// reason (a card that forgets makes her choose again), the same rule about what
// counts as a pick, and since 2026-09-14 the same PER-ENGINE memory. Claude
// Code's words are in ../../shared/effort-levels so the spawn and the card
// cannot disagree about them; Codex's are per model and arrive beside the
// model's name off this Mac (`levels` on a codexModels row,
// main/codex-models.mjs).

import { EFFORT_LEVELS, effortLabel, isEffort, isEffortWord } from '../../shared/effort-levels.mjs';
import { CODEX_OWN, claudeModelRows, defaultModelFor, type ModelChoice } from './models';

export interface EffortChoice {
  /** What the engine is sent: `--effort <id>` for Claude Code, `turn/start`'s `effort` for Codex. */
  id: string;
  /** The word on the strip. */
  label: string;
}

/** Claude Code's five, in the CLI's order. */
export const EFFORTS: EffortChoice[] = EFFORT_LEVELS.map((e) => ({ id: e.id, label: e.label }));

/**
 * THE ROWS THE STRIP DRAWS, FOR ONE ENGINE AND ONE MODEL.
 *
 * Claude Code: the five, whatever the model, because that is what `--effort`
 * takes. Codex: the levels THAT MODEL advertises in this Mac's cache, which
 * differ per model (six on gpt-6-astra, four on gpt-5.5, measured 2026-09-14).
 * A Codex model this Mac has no list for -- no cache, or "Codex's own" with no
 * model named in her config.toml -- answers an EMPTY list, and the drawer then
 * draws no strip at all rather than a guess: Codex refuses a level a model does
 * not advertise, and a lit button the run would refuse is worse than none.
 */
export function effortChoicesFor(
  engine: string | null,
  model: string | null,
  { codexModels = [], codexDefault = null }: { codexModels?: ModelChoice[]; codexDefault?: string | null } = {},
): EffortChoice[] {
  if (engine !== 'codex') return EFFORTS;
  const id = model ?? defaultModelFor(engine, codexDefault);
  if (id === CODEX_OWN) return [];
  const row = codexModels.find((m) => m.id === id);
  return (row?.levels ?? [])
    .filter((l) => isEffortWord(l))
    .map((l) => ({ id: l, label: effortLabel(l) ?? l }));
}

/**
 * Null is not a level; it is "send nothing and let the engine choose". And a
 * remembered word the current rows do not carry is not a pick either: it stays
 * in memory (she may come back to the model that takes it) but it is neither
 * lit nor sent.
 */
export function effortPicked(id: string | null, rows: EffortChoice[] = EFFORTS): id is string {
  return !!id && rows.some((e) => e.id === id);
}

/**
 * WHAT THE PICKED MODEL THINKS AT WHEN SHE HAS PICKED NO LEVEL.
 *
 * The strip drew nothing lit, and until today that was the honest answer:
 * ../../shared/effort-levels.mjs says "a level nobody picked is the engine's own
 * choice for the model... and this app does not know what that is per model, so
 * it does not claim to." It knows now. BOTH engines publish it per model and it
 * arrives beside the model's own name from each: `default_reasoning_level` out
 * of Codex's cache and `default_effort` out of Claude Code's catalog
 * (main/codex-models.mjs, main/claude-models.mjs).
 *
 * NULL IS A REAL ANSWER and it draws the strip exactly as it drew before. A
 * model whose catalog entry names no default gets no lit button rather than a
 * guess, and Haiku 4.5 is one of those today.
 */
export function defaultEffortFor(
  engine: string | null,
  model: string | null,
  { codexModels = [], codexDefault = null }: { codexModels?: ModelChoice[]; codexDefault?: string | null } = {},
): string | null {
  const id = model ?? defaultModelFor(engine, codexDefault);
  if (engine === 'codex') {
    if (id === CODEX_OWN) return null;
    return codexModels.find((m) => m.id === id)?.defaultLevel ?? null;
  }
  return claudeModelRows().find((m) => m.id === id)?.defaultLevel ?? null;
}

/**
 * THE WORD THE STRIP LIGHTS: her pick, else the model's own default.
 *
 * IT IS SHOWN, NOT SENT, and that is the whole of the design. A card she has not
 * touched still sends no level, so the engine goes on choosing and the run is
 * byte for byte what it was yesterday; what changed is that the word it will
 * choose is lit instead of the strip being blank. Sending it explicitly would
 * pin today's default into every card and quietly disagree with the engine the
 * day that default moves, which is the same failure a typed model label would
 * have been. So this is kept apart from `effortPicked`, which is what Compose
 * reads to decide what goes on the row.
 */
export function effortShown(
  id: string | null,
  rows: EffortChoice[],
  fallback: string | null,
): string | null {
  if (effortPicked(id, rows)) return id;
  return fallback && rows.some((e) => e.id === fallback) ? fallback : null;
}

export function effortLabelOf(id: string | null, rows: EffortChoice[] = EFFORTS): string | null {
  if (!effortPicked(id, rows)) return null;
  return rows.find((e) => e.id === id)?.label ?? null;
}

export const LAST_EFFORT_KEY = 'zero.lastEffort';

/**
 * ONE KEY PER ENGINE, the rule ../models.ts gives for the model: a level
 * remembered for Codex (`ultra`) is a word Claude Code's CLI refuses outright,
 * and the other way round is a word a Codex model may not advertise. Claude
 * Code keeps the original key, so a level she has already chosen survives.
 */
export function lastEffortKey(engine: string | null = null): string {
  return engine === 'codex' ? `${LAST_EFFORT_KEY}.codex` : LAST_EFFORT_KEY;
}

// Remembered the moment she picks, like the level, the project and the model.
// A word that is not a level is not remembered: a stale key from some other
// build must not become a flag the engine refuses. Claude Code's memory is
// checked against its five; Codex's against the shape of a word, because which
// words are right depends on the model, and `effortPicked` settles that at the
// moment of drawing and of sending.
export function readLastEffort(
  store: Storage | undefined = globalThis.localStorage,
  engine: string | null = null,
): string | null {
  try {
    const raw = store?.getItem(lastEffortKey(engine));
    const ok = engine === 'codex' ? isEffortWord(raw) : isEffort(raw);
    return ok ? (raw as string) : null;
  } catch { return null; }
}

export function writeLastEffort(
  id: string | null,
  store: Storage | undefined = globalThis.localStorage,
  engine: string | null = null,
): void {
  try {
    const ok = engine === 'codex' ? isEffortWord(id) : isEffort(id);
    if (!ok) store?.removeItem(lastEffortKey(engine));
    else store?.setItem(lastEffortKey(engine), id as string);
  } catch { /* a refused store is not a reason to lose the send */ }
}
