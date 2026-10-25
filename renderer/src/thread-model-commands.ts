// PURE. The model rows ⌘K offers for the thread you are pointing at.
//
// There were none, and ⌘K was the first place both power testers looked
// (power-test-1 issue 20, power-test-2 issues 39 and 40). A thread's model was
// only reachable through the reply box's drawer, and that drawer lists ONE
// engine's models, so a thread begun on Claude Code could not be carried on in
// Codex by any path in the app at all.
//
// PICKING A MODEL IS PICKING AN ENGINE, which is the rule the new thread card
// already runs on (threads/composer-rules.ts): Anthropic models run in Claude
// Code and GPT models run in Codex, so one row answers both questions and the
// two can never disagree.
//
// They are named "Model: …" the way the appearance rows are named "Theme: …",
// so one word typed into ⌘K brings the whole set up.

import { engineModelLabel, type ModelChoice } from './models';
import { engineLabel, type Engine } from '../../shared/engines.mjs';
import { recentModels, sameModel, type Harness, type ModelPick } from './threads/composer-rules';

export interface ModelCommand {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  pick: ModelPick;
}

/** Every word that should find these rows, whichever one somebody reaches for. */
export const MODEL_KEYWORDS = 'model models engine harness switch change use agent claude code codex gpt opus sonnet haiku fable';

// Three, the same number the new thread card's Recent shows, because this is
// that list: the models you are actually using, and never the whole catalogue,
// which is sixteen rows and would be most of ⌘K.
const ROWS = 3;

/**
 * `on` is the thread's engine and model as the row holds them. `items` is the
 * inbox, read for which models are in use (`recentModels`).
 *
 * THE OTHER ENGINE IS ALWAYS REACHABLE when this Mac offers it, even if every
 * recent model is on this one, because reaching the other engine is the whole
 * reported need and a list of three favourites can easily not contain it.
 */
export function modelCommands(
  on: { engine?: string | null; model?: string | null },
  { items, codexModels = [], codexDefault = null, engines = [] }: {
    items: ReadonlyArray<{ createdAt?: number; model?: string; engine?: string }>;
    codexModels?: ModelChoice[];
    codexDefault?: string | null;
    engines?: readonly Engine[];
  },
): ModelCommand[] {
  const offered = (id: Harness) => (engines.length === 0 ? id === 'claude' : engines.some((e) => e.id === id));
  const codexOffered = offered('codex');
  const claudeOffered = offered('claude');
  if (!codexOffered && !claudeOffered) return [];

  const here: ModelPick | null = on.model
    ? { engine: on.engine === 'codex' ? 'codex' : 'claude', model: on.model }
    : null;
  const picks = recentModels(items, { codexModels, codexDefault, codexOffered, claudeOffered });
  const elsewhere: ModelPick[] = here?.engine === 'claude' && codexOffered
    ? [{ engine: 'codex', model: codexDefault ?? codexModels[0]?.id ?? '' }]
    : here?.engine === 'codex' && claudeOffered
      ? picks.filter((p) => p.engine === 'claude').slice(0, 1)
      : [];

  const out: ModelCommand[] = [];
  const seen = new Set<string>();
  for (const pick of [...elsewhere, ...picks]) {
    if (!pick.model || out.length >= ROWS) continue;
    const key = `${pick.engine}:${pick.model}`;
    if (seen.has(key) || sameModel(pick, here)) continue;
    seen.add(key);
    out.push({
      id: `model-${key}`,
      label: `Model: ${engineModelLabel(pick.engine, pick.model, { codexModels, codexDefault })}`,
      // The engine, because Recent mixes both lists and the name alone does
      // not say which coding agent picks the thread up.
      hint: engineLabel(pick.engine),
      keywords: MODEL_KEYWORDS,
      pick,
    });
  }
  return out;
}
