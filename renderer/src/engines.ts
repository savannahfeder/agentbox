// The renderer's half of the engine choice: what a card remembers between
// cards, and nothing else.
//
// The names, the default and the rule about which engine a row runs on live in
// ../../shared/engines.mjs, because main and the renderer both need them and a
// second copy is a copy that can disagree with the running fleet. WHETHER THERE
// IS A CHOICE AT ALL is not here either: that needs the capability gate and is
// answered by main, on the snapshot. This file is only the localStorage, and it
// is the exact shape ../models.ts uses for the model, on purpose: two controls
// that behave the same in her hand should be two files that read the same.

import { DEFAULT_ENGINE, isEngine, type Engine } from '../../shared/engines.mjs';

export const LAST_ENGINE_KEY = 'zero.lastEngine';

/**
 * THE REMEMBERED WORD, CLAMPED TO WHAT THIS MAC ACTUALLY OFFERS.
 *
 * `readLastEngine` below asks whether the stored word is an engine AT ALL; this
 * asks the different and later question of whether it is one this Mac can
 * honour. Both are needed and neither implies the other: `codex` is a real
 * engine on every machine and an offer on almost none.
 *
 * MEASURED BY RENDERING THE REAL CARD, 2026-09-05. With `zero.lastEngine` set to
 * `codex` and one engine on the snapshot -- which is every Mac with no Codex, and
 * every Mac before she opens the gate -- the composer drew
 * `<button class="compose-word set">gpt-5.6-sol</button>`: the other harness's
 * slug in her sentence, with no "With Codex." clause beside it to explain the
 * word (`EnginePicker` refuses itself below two engines, on purpose) and with
 * the whole Claude Code model list gone from the drawer behind it, because
 * `codexModels` is empty on such a Mac.
 *
 * THE LIST IS NOT WORKED OUT HERE AND COULD NOT BE. Whether a choice is real
 * needs the capability gate, which lives in main; `choices` is
 * `Supervisor#engineChoices`, handed over on the snapshot, exactly as the picker
 * gets it. A clamp that asked `availableEngines` itself would keep a word on a
 * card the supervisor is about to refuse, which is the same lie one layer up.
 *
 * NULL IS THE ANSWER FOR CLAUDE CODE, not the word `claude`, because null is
 * what the card already means by "she has not chosen": it is what
 * `readLastEngine` returns after resolving the workspace fallback, and
 * what the picker uses for Claude Code. That is the one
 * comparison this file makes on its own, against the same constant the two
 * functions below already compare against, and it is deliberately NOT
 * `enginePicked`: tests/a-codex-row-from-august-still-runs-on-claude.test.mjs
 * holds an exact list of that helper's callers so that the renderer cannot grow
 * a second opinion about what is on this Mac, and there is no reason to spend
 * that line on a comparison the file already spells twice.
 *
 * EVERYTHING ELSE IS THE LIST AND NOTHING BUT THE LIST. A word that is not in
 * `choices` is refused whether it is an unknown engine, a model slug, or a real
 * engine this Mac cannot offer, so there is no second membership rule here to
 * disagree with main's.
 */
export function engineThisMacOffers(id: string | null, choices: Engine[] | undefined): string | null {
  if (!id || id === DEFAULT_ENGINE) return null;
  return (choices ?? []).some((e) => e.id === id) ? id : null;
}

// Remembered the moment she picks, exactly like the project, the level and the
// model: a card that forgets what you chose the second it closes makes you
// choose again (hers).
export function readLastEngine(store: Storage | undefined = globalThis.localStorage, workspace: string | null = null): string | null {
  const fallback = workspace && isEngine(workspace) && workspace !== DEFAULT_ENGINE ? workspace : null;
  try {
    const raw = store?.getItem(LAST_ENGINE_KEY);
    // Not merely absent: a name we no longer know reads as no choice rather
    // than as a choice nothing can honour, so a picker cannot open on a word
    // that is not in its own list.
    if (!raw || !isEngine(raw)) return fallback;
    if (raw === DEFAULT_ENGINE) return null;
    return raw;
  } catch { return fallback; }
}

export function writeLastEngine(id: string | null, store: Storage | undefined = globalThis.localStorage): void {
  try {
    // An explicit Claude pick differs from never having picked an agent.
    store?.setItem(LAST_ENGINE_KEY, id || DEFAULT_ENGINE);
  } catch { /* a refused store is not a reason to lose the send */ }
}
