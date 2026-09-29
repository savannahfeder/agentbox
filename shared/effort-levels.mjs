// HOW HARD A RUN THINKS, in each engine's own words.
//
// Then, of five drawn mechanisms: "A inside the model menu works great." So the
// levels live in the model drawer on the new task card, under a hairline, and
// nowhere else. And on 2026-09-14, merging it onto a main that had grown a
// second engine: "In addition to us literally even supporting codex and those
// models." So the strip is per engine now.
//
// ONE LIST FOR CLAUDE CODE, SHARED BY BOTH SIDES. The renderer draws these
// words and the main process hands one to `--effort`; a level the card can name
// that the spawn then refuses (or the other way round) is the drift
// ../renderer/src/priority.ts exists to prevent, so both read this file.
//
// THE IDS ARE THE CLI'S OWN. Measured against Claude Code 2.1.257 on her Mac,
// 2026-09-01, and again against 2.1.270 on 2026-09-14: `claude --help` prints
//   --effort <level>   Effort level for the current session (low, medium, high, xhigh, max)
// The slash command's usage line adds `ultracode` and `auto`; the flag's does
// not, so they are not here. `isEffort` is the gate the spawn uses, because a
// word the CLI does not know would stop the run with a usage error instead of
// running the task.
//
// CODEX'S WORDS ARE NOT IN THIS FILE, ON PURPOSE. They are PER MODEL and they
// really differ: measured in her `~/.codex/models_cache.json` on 2026-09-14
// (codex-cli 0.154.0), `gpt-6-astra` and `gpt-5.6-sol` take low, medium, high,
// xhigh, max and ultra; `gpt-5.6-luna` stops at max; `gpt-5.5` stops at xhigh.
// So a Codex model's levels are read off the Mac beside its name
// (main/codex-models.mjs, `levels`) and the strip draws THOSE. What this file
// holds for Codex is only the shape of a word (`isEffortWord`) and the label
// for one (`effortLabel`), so the two engines spell "xhigh" the same way on the
// card.
//
// NOTHING SET MEANS NOTHING SENT. There is no row for "the default", for the
// same reason the model list has none (she killed that row twice on): a level
// nobody picked is the engine's own choice for the model (Claude Code's, or the
// `model_reasoning_effort` line in her Codex config.toml), and this app does
// not know what that is per model, so it does not claim to. The strip draws no
// lit button until she picks one.

export const EFFORT_LEVELS = Object.freeze([
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  // Claude Code spells it `xhigh`. The word on the card is hers to read, and
  // "Extra" beside "High" says it in the room the strip has.
  { id: 'xhigh', label: 'Extra' },
  { id: 'max', label: 'Max' },
]);

/** Whether a word is one Claude Code will take after `--effort`. */
export function isEffort(value) {
  return typeof value === 'string' && EFFORT_LEVELS.some((e) => e.id === value);
}

/**
 * Whether a value has the SHAPE of a reasoning level at all: one short
 * lowercase word. This is the gate at the ledger, where the engine's own list
 * is not in hand (Codex's is per model and read off the Mac at spawn). The
 * spawn is the real gate for each engine: `isEffort` for Claude Code, the
 * model's own advertised levels for Codex (`Supervisor#codexEffortRefusal`).
 */
export function isEffortWord(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9]{0,23}$/.test(value);
}

/**
 * The word on the strip for a level id, for either engine. Claude Code's five
 * keep their labels above; any other id a Codex model advertises (`ultra`) is
 * shown with its first letter up, so the app never invents a name for a level
 * it only learned about from the cache.
 */
export function effortLabel(id) {
  const known = EFFORT_LEVELS.find((e) => e.id === id);
  if (known) return known.label;
  if (!isEffortWord(id)) return null;
  return id.charAt(0).toUpperCase() + id.slice(1);
}
