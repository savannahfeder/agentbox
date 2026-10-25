// PURE. Which model and level a reply runs on: what the box opens carrying,
// and what a pick writes back.
//
// TWO WORDS FOR NOTHING, AND THEY ARE NOT THE SAME NOTHING.
//
// The store says "nothing chosen" with the EMPTY STRING: `answerItem` writes
// `model: ''` to clear, because `modelForEngine` (../../shared/engines.mjs)
// reads '' as nothing and a JSON null would need a special case in both
// engines' argument builders. Read with `??` it survives as a model id with no
// label, which is a footer reading "On ." and a model word nought pixels wide.
//
// The DRAWER says "the engine's own default" with NULL, which is what keeps
// the new task card's footer shut (./compose-footer.ts). Sent as the model
// that null means clear it, so picking the default unpinned the thread instead
// of pinning what she picked. `pickToSend` resolves the two, on the rule
// Compose.tsx already sends by: Claude Code always gets a model, Codex gets one
// only when it is named, because with nothing named her config.toml decides.

import { DEFAULT_MODEL, type ModelChoice } from './models';
import { effortChoicesFor, effortLabelOf } from './effort';

export interface ReplyPick {
  /** An alias or slug, or null for whatever the engine runs by default. */
  model: string | null;
  /** A level, or null for "send nothing and let the engine choose". */
  effort: string | null;
  /** WHICH CODING AGENT, and only when the pick MOVES the thread to the other
   *  one (w-e1a42f6b21). Absent is the ordinary reply, which says nothing
   *  about agents and leaves the row's own alone. */
  engine?: string | null;
}

interface EngineFacts {
  engine?: string | null;
  codexModels?: ModelChoice[];
  codexDefault?: string | null;
}

/** What is really set on this thread, with the store's '' read as nothing. */
export function pickOnTheRow(item: { model?: string | null; effort?: string | null } | null | undefined): ReplyPick {
  return { model: item?.model || null, effort: item?.effort || null };
}

/**
 * What the box opens on: the pick she left in it, else the thread's own.
 *
 * `touched` is the difference between a value the box is MERELY DISPLAYING and
 * one she chose, which is what decides whether the send writes anything at all
 * (the priority tag's rule). A kept pick is hers by definition, model `null`
 * included: that null is her choosing the engine's default, not the absence of
 * a choice, so it must not fall through to the model the row already had.
 */
export function replyOpensOn(
  item: { model?: string | null; effort?: string | null } | null | undefined,
  kept: ReplyPick | null,
): { pick: ReplyPick; touched: boolean } {
  if (kept) return { pick: { model: kept.model, effort: kept.effort }, touched: true };
  return { pick: pickOnTheRow(item), touched: false };
}

/**
 * The pick as the row must record it, so the next run reads what she picked.
 *
 * `engine` is the agent the pick runs on, which is the row's own until the
 * menu's other column moves it. It is only WRITTEN when it moves the thread
 * (`was` is what the row runs on now) and when this Mac has more than one
 * agent to move it between, which is the rule the new task card sends by.
 */
export function pickToSend(
  pick: ReplyPick,
  { engine = null, was = null, engineCount = 1 }: EngineFacts & { was?: string | null; engineCount?: number } = {},
): ReplyPick {
  // Claude Code has an alias for every row in the drawer, so there is no way to
  // say "clear it" there and nothing is lost by naming what she picked. Codex
  // has no alias for its default and "Codex's own" is a real row, so null is
  // her saying her config.toml decides.
  const model = engine === 'codex' ? pick.model : (pick.model ?? DEFAULT_MODEL);
  const moves = engineCount > 1 && !!was && !!engine && engine !== was;
  return { model, effort: pick.effort, ...(moves ? { engine } : {}) };
}

/**
 * The level in the reply footer, or null when there is nothing to say.
 *
 * Only a level that will really be sent. Nothing set means the engine chooses
 * for the model, which the drawer lights already (../effort.ts: shown, not
 * sent), and a level this model does not take is not sent either.
 */
export function effortSaid(
  pick: ReplyPick,
  { engine = null, codexModels = [], codexDefault = null }: EngineFacts = {},
): string | null {
  return effortLabelOf(pick.effort, effortChoicesFor(engine, pick.model, { codexModels, codexDefault }));
}
