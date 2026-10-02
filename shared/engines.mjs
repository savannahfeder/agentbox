// WHICH CODING AGENT A TASK IS HANDED TO.
//
// AND THE PREMISE SHE GAVE FOR IT DID NOT HOLD. Measured head to head on her
// Mac the same day, identical task, four fresh repos each: Codex 16.8 / 45.3 /
// 96.9 / 18.6 seconds, Claude Code 19.0 / 19.8 / 19.8 / 21.2. Both correct
// every run. Codex is NOT faster; it is slower on median and it wanders. That
// is written here rather than in a report because it is the reason this file
// must never make Codex the default for anybody, including her. Claude Code is
// the default and stays the default until she says otherwise. What this file
// buys is a SECOND ENGINE on a second subscription, which is the thing that
// actually went wrong for her, and a choice she makes per task.
//
// THIS FILE WAS DELETED AND IS COMING BACK IN STAGES, WHICH IS WHY IT NOW HAS
// A GATE. Her own message on that commit says thirteen; the number here is the
// one the tree can be asked for.
//
// `engine` DID NOT GO. It is still a live name on the work-item contract
// (`WORK_ITEM_FIELDS`, shared/work-items.mjs:95, accepted by the patch
// validator at :290, stored as a free string and validated against nothing,
// because "nothing here reads them"). The fold has no migration and drops
// nothing, so a row marked between 08-25 and 08-27 still carries
// `engine: "codex"` UNLESS a later line overwrote that one field — which is
// possible: the fold lets an equal-or-stronger write replace a field held by
// an earlier one (`beats`, the authority comparison near shared/work-items.mjs
// :494). Nothing has ever been written to clear it on purpose, so the honest
// statement is "probably still there", not "always will be".
//
// HOW MANY SUCH ROWS A STORE ACTUALLY HAS IS AN OPEN QUESTION, AND IT IS NOT
// ZERO UNTIL SOMEBODY LOOKS. It could not be measured from the machine this was
// written on: there is no ~/Zero there at all. On a real store it is one command,
// `grep -rho '"engine":"[a-z]*"' ~/Zero | sort | uniq -c`, and the answer
// belongs in this paragraph when someone runs it. The gate below costs nothing
// if the count turns out to be zero, and is the whole story if it is not.
//
// So the 08-25 resolver, restored unchanged, would have been a silent reversal
// of the decision to withhold Codex: those rows would start choosing Codex again the moment this
// module landed, with no picker, nothing in Settings, and no approval path
// built. The resolver is therefore CLOSED unless the caller hands it
// `ENGINE_CHOICE_ENABLED` below. A caller that passes nothing gets Claude
// Code, because the safe answer is the one that has to be the accident.
//
// This module holds the names and the one rule. Everything Codex-shaped —
// arguments, its event stream, where it writes its transcript — belongs in
// main/codex.mjs when that comes back, because the renderer must never import
// spawn code.

/** The engines, in the order the picker draws them. */
export const ENGINES = [
  { id: 'claude', label: 'Claude Code', word: 'Claude Code' },
  { id: 'codex', label: 'Codex', word: 'Codex' },
];

export const ENGINE_IDS = ENGINES.map((e) => e.id);

/**
 * What a task runs on when nobody has chosen.
 *
 * Not a setting and not a coin flip. See the measurement above: Claude Code is
 * faster on median and never wandered, and it is the only one of the two that
 * is WIRED to stop and ask her for permission mid-run.
 *
 * That second clause used to say Codex CANNOT ask, and it is now wrong twice
 * over. It was true of `codex exec`, which is what the removed 08-25 build
 * drove and what the sentence was written about. `codex app-server` raises real
 * approval requests, measured 2026-09-04, main/codex-app-server.mjs answers
 * them, main/codex-approvals.mjs draws them as the card she already knows, and
 * the spool they land in is the one the other engine uses. This paragraph went
 * on listing all four of those as missing for a whole slice after two of them
 * had been built.
 *
 * THE PICKER IS BUILT NOW TOO, 2026-09-04: a word in the composer's sentence
 * ("With Codex."), a row in Settings, and the engine named in the byline --
 * every one of them drawn only where `Supervisor#engineChoices` says this Mac
 * really offers a choice, which means the gate is open and the binary is there.
 * That paragraph used to say the missing picker was why the default had not
 * moved, and it was the last of four such claims to stop being true.
 *
 * SO THE DEFAULT IS HELD BY THE MEASUREMENT AT THE TOP OF THIS FILE AND BY
 * NOTHING ELSE. Codex is slower on median and it wanders; Claude Code stays the
 * default until she says otherwise, and now that there is a picker that is a
 * decision rather than a consequence.
 */
export const DEFAULT_ENGINE = 'claude';

/**
 * THE CAPABILITY GATE: an explicit code opt-in, saying that whoever wrote this
 * call site knew there was a second engine and meant to allow it.
 *
 * BE PRECISE ABOUT WHAT IT PROVES, because a gate believed to be stronger than
 * it is, is worse than no gate. It is a hard barrier against SERIALIZED DATA:
 * nothing that arrives as a ledger line, a config file or an IPC message can
 * open it, ever. It is NOT proof that the approval path she needs was actually
 * built, and it is not a defence against our own code — any module in this repo
 * can import the token. It moves the decision from data to source, and that is
 * all it does. It is the second half, the picker and her consent, that makes
 * the choice real.
 *
 * It is a Symbol, and that shape is the whole design:
 *
 * - A SYMBOL CANNOT ARRIVE FROM OUTSIDE THE PROCESS. Every input that could
 *   carry a stale `codex` is serialized: the ledger line off disk and
 *   `zero.config.json` are JSON, which has no way to spell a Symbol and drops
 *   it in silence, and an Electron IPC payload goes through the structured
 *   clone algorithm, which does not drop a Symbol but THROWS DataCloneError on
 *   one. Neither can express the gate. The louder of the two failures is the
 *   better one and we get it where it matters least; the point is that the
 *   untrusted data and the permission live in different type systems.
 * - IT IS `Symbol`, NEVER `Symbol.for`. The global registry would let any code
 *   anywhere mint an equal one out of a string. This one exists only where
 *   somebody imported this module and named it.
 * - IT IS NOT A BOOLEAN. `enabled: true` is the kind of thing a caller spreads
 *   in by accident from some other options object. This is not.
 */
export const ENGINE_CHOICE_ENABLED = Symbol('the second engine is wired up in this build');

/**
 * WHEN SHE OPENED THE GATE, read off `zero.config.json`, or null. This is the
 * one value in the app that can cause the Symbol above to be handed over
 * (main/supervisor.mjs `_engineFor`, the only holder of it).
 *
 * THE OPT-IN IS A MOMENT AND NOT A FLAG, and that is the whole design of it.
 *
 * `engine` survived the 2026-08-27 removal on the work-item contract and the
 * fold drops nothing, so her store may still hold rows marked `codex` between
 * 08-25 and 08-27. How many is unknown; on her Mac it is one command,
 * `grep -rho '"engine":"[a-z]*"' ~/Zero | sort | uniq -c`, and the answer
 * belongs here when somebody runs it. A boolean opt-in would mean "every row
 * that ever said codex is live from now on", and the first thing it would do is
 * route an unknown number of those onto a second engine she had marked before
 * there was any way to choose. That is the exact hazard the gate was built for,
 * so an opt-in that walks into it is not one worth having. The picker built on
 * 2026-09-04 does not soften this: an August row is still not a choice she is
 * making now, and the byline draws it as the engine that will really run it.
 *
 * THOSE TWO MEANINGS ARE SEPARABLE, AND THE LEDGER ALREADY HOLDS WHAT
 * SEPARATES THEM. The fold records `wrote[field] = { ts, source }` per field
 * and stopped deleting it on the way out precisely because readers needed it
 * (shared/work-items.mjs:324; shared/answers.mjs reads `wrote.answer.ts` the
 * same way). So "Codex may be chosen FROM NOW ON" is a checkable statement
 * rather than a hope, and `engineChoiceOnRowIsStale` below is the check.
 *
 * WHY NOT A BOOLEAN PLUS A REMEMBERED "first seen at". Because that would live
 * in the app's own state rather than in her file: a fresh install, a state file
 * she deleted, or a second Mac would each invent a different moment, and the
 * one thing this value must be is the same on every machine reading the same
 * store. A date the user typed is a fact about their decision; a date we noticed is a
 * fact about a process.
 *
 * THE WORKSPACE DEFAULT (`config.engine`) IS TIME-SCOPED TOO, SINCE 2026-09-05,
 * AND THIS PARAGRAPH USED TO SAY IT COULD NOT BE. Its words were: "JSON has no
 * per-key write times, and `engine` sits in the same file as this, so opening
 * that file to write the moment is the same act as reading the line above it."
 * The first clause is true of JSON and irrelevant: the APP has write times, one
 * module writes that key (`setWorkspaceSetting`, main/settings.mjs), and
 * `saveConfig` takes a patch of several keys, so `engineAt` rides in the same
 * write. Without it, closing the gate and reopening it with a NEWER moment
 * re-armed a workspace default set weeks earlier -- every row that names
 * nothing went straight back to Codex without her saying so again, which is the
 * exact claim this value is supposed to make impossible, and the rollback
 * lifecycle is the thing the gate is FOR.
 *
 * AND THE SECOND CLAUSE, READ CORRECTLY, IS WHY AN ABSENT STAMP MEANS HONOURED.
 * `engineChoice` is hand-written into this file; a hand-written `engine` on the
 * line above it was put there by the same hand in the same act, so the two ARE
 * contemporaneous and there is nothing to be stale against. Only a default the
 * app wrote can carry a stamp, and only a stamped default can go stale — which
 * is also what keeps every config that exists today behaving exactly as it did.
 * `engineDefaultIsStale` below is the check.
 *
 * IT IS PARSED STRICTLY, WHICH IS NOT THE SAME AS PARSED. `Date.parse` reads
 * "1", "2026", "Sep 4 2026" and "2026/09/04" as real dates, so a bare parse
 * would let `"engineChoice": "1"` open the second engine. The shape is checked
 * first and everything else is off, because the safe answer is the one that has
 * to be the accident.
 */
const A_MOMENT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * One strict parse, used by both moments in this file, so the two cannot come
 *  to disagree about what counts as a date somebody wrote down. */
function momentIn(written) {
  if (typeof written !== 'string' || !A_MOMENT.test(written)) return null;
  const at = Date.parse(written);
  return Number.isFinite(at) ? at : null;
}

export function engineChoiceSince(config = {}) {
  return momentIn(config?.engineChoice);
}

/**
 * WHEN THE WORKSPACE DEFAULT WAS SET, read off `zero.config.json`, or null.
 *
 * Null means no stamp, and no stamp means a hand-written default — see the long
 * note above `engineChoiceSince`. It is the same strict parse for the same
 * reason: a claim that cannot be read is not a claim, so it reads as no stamp,
 * which is the hand-written case.
 */
export function engineDefaultSince(config = {}) {
  return momentIn(config?.engineAt);
}

/**
 * Whether the workspace default is one she set BEFORE the gate's current
 * moment: a setting from the build before the rollback, rather than a decision
 * she is making now.
 *
 * False when nobody has opted in, because there is no moment to be stale
 * against. False when the default is Claude Code, which asks for nothing the
 * gate withholds — the same rule `engineChoiceOnRowIsStale` follows below, and
 * for the same reason: discarding it could only ever move work TO the second
 * engine, which is the one direction the gate exists to prevent. False when
 * there is no stamp, which is a default typed beside the moment itself.
 */
export function engineDefaultIsStale(config = {}) {
  const since = engineChoiceSince(config);
  if (since === null) return false;
  if (!enginePicked(config?.engine)) return false;
  const at = engineDefaultSince(config);
  return at !== null && at < since;
}

/**
 * Whether the engine named on this row is one picked BEFORE she opened the
 * gate: an August row, rather than a decision she is making now.
 *
 * False when nobody has opted in, because there is no moment to be stale
 * against and the gate itself is what refuses then. False when the row names no
 * engine, or names one nothing recognises, because neither is asking for
 * anything and a warning on an ordinary row is noise on every row. True when
 * the row names an engine and there is no `wrote.engine.ts` at or after the
 * moment — which also covers an imported session and an old line with no
 * `wrote` map at all, where there is simply no evidence she chose anything.
 *
 * AND FALSE FOR A ROW THAT NAMES CLAUDE CODE, WHICH THIS ASKED WITH `isEngine`
 * AND GOT BACKWARDS. A row saying `engine: "claude"`, written before the moment,
 * was discarded as stale — and `engineFor` then fell through to `config.engine`,
 * which may be `codex`. So her explicit "run this on Claude Code" was read as no
 * choice at all and answered with the second engine, which is the precise
 * opposite of what staleness is for. `enginePicked` is the fix and it is the
 * whole of it: naming the DEFAULT asks for nothing the gate withholds, so there
 * is nothing to be stale about, and discarding it could only ever move work onto
 * the engine the gate was built to hold back.
 *
 * `wrote.engine.source` is deliberately NOT consulted. would be the stronger
 * rule, but CLAUDE.md is explicit that a ledger line names its own author as a
 * plain string and nothing checks it, so a source check would guard against an
 * accident and never against a hostile worker, while silently refusing whatever
 * a future picker happens to write. Who may write `engine` at all belongs to
 * the slice that draws one.
 */
export function engineChoiceOnRowIsStale(item, config = {}) {
  const since = engineChoiceSince(config);
  if (since === null) return false;
  if (!enginePicked(item?.engine)) return false;
  const ts = item?.wrote?.engine?.ts;
  return !(Number.isFinite(ts) && ts >= since);
}

export function isEngine(id) {
  return typeof id === 'string' && ENGINE_IDS.includes(id);
}

export function engineLabel(id) {
  return ENGINES.find((e) => e.id === id)?.label ?? ENGINES[0].label;
}

/**
 * Which engines this Mac can actually run, given what the finders found.
 *
 * `found` is a map of id to boolean. An engine whose binary is not on the
 * machine is not offered, because a picker that offers something that cannot
 * run is a picker that hands her a session that dies on arrival. Claude Code
 * is in the list even when it was not found, UNLESS Codex was: a Mac with only
 * Codex is offered only Codex (`homeEngine` below). With neither, the app
 * refuses to open an inbox and says so in its own words.
 *
 * UNGATED, AND THE INVARIANT IS THEREFORE SCOPED TO ROUTING. Say it plainly,
 * because the file must not claim more than the code delivers: this function,
 * `engineChoiceExists` and `enginePicked` will all happily describe a two-engine
 * Mac without anyone holding the token. A future renderer could draw a picker
 * out of them, and the gate would not stop it — she would be offered a choice
 * that `engineFor` then refuses, which is its own kind of lie.
 *
 * That is a deliberate trade and not an oversight. These three answer "what is
 * on this Mac" and "what did she pick"; they spawn nothing, and requiring a
 * capability token to answer a question about the filesystem buys nothing real.
 *
 * AND THE SLICE THAT DREW A PICKER ANSWERED FOR IT, 2026-09-04. There is
 * exactly one caller, `Supervisor#engineChoices`, and it asks
 * `engineChoiceSince` FIRST -- the same expression `_engineFor` derives the gate
 * token from -- so the offer and the routing are refused by the same fact and
 * cannot come apart. A Mac with Codex installed and no moment written answers
 * one engine here and Claude Code there. The renderer calls none of these: it
 * is handed the list on the snapshot. tests/a-codex-row-from-august-still-runs-on-claude.test.mjs
 * holds the caller list exactly, so the next one has to argue for itself here.
 */
export function availableEngines(found = {}) {
  const home = homeEngine(found);
  return ENGINES.filter((e) => e.id === home || (e.id !== DEFAULT_ENGINE && found[e.id]));
}

/**
 * WHAT RUNS WHEN NOBODY HAS CHOSEN, ON THIS MAC. Claude Code, unless this Mac
 * has said for certain that Claude Code is not here and Codex is. The app needs
 * one of the two, not both, so a Mac with only Codex runs everything on Codex.
 *
 * `found.claude` has to be an explicit `false`. A caller that never asked
 * (every call written before this, and every test config) leaves it undefined,
 * and that reads as Claude Code being here, which is what it always meant.
 */
export function homeEngine(found = {}) {
  return found.claude === false && found.codex ? 'codex' : DEFAULT_ENGINE;
}

/** Whether there is a choice to make at all. One engine is not a choice. */
export function engineChoiceExists(found = {}) {
  return availableEngines(found).length > 1;
}

/**
 * THE RULE. Which engine one work item runs on, and it is deliberately narrow.
 *
 * The gate answers first: without `enabled: ENGINE_CHOICE_ENABLED` this is
 * Claude Code, whatever the row says and whatever the workspace says. That is
 * what holds the August rows described at the top of this file, and it means
 * the honest answer for any caller that has not been taught about the second
 * engine — including every caller written before it comes back — is the engine
 * she is running.
 *
 * Then her choice on the task, over the workspace default, which is hers to
 * set in Settings, over Claude Code. An engine named on a row whose binary is
 * not on this Mac falls back rather than dying: she may have chosen Codex on
 * her laptop and be reading the row on a machine without it, and a session
 * that never starts tells her nothing about why. That fallback is unchanged
 * and the gate is IN ADDITION to it, not instead of it — the binary is a fact
 * about this Mac, the gate is a fact about this build, and either one missing
 * is enough to answer Claude Code.
 *
 * AND A CHOICE FROM BEFORE SHE OPENED THE GATE IS NOT A CHOICE SHE IS MAKING.
 * When the config names the moment she opted in, a row whose `engine` predates
 * it reads as no choice at all and the workspace default answers instead. That
 * is `engineChoiceOnRowIsStale` above, and it is the whole of what makes the
 * opt-in mean "Codex may be chosen from now on" rather than "every row that
 * ever said codex is live". A caller that passes no such moment gets the old
 * rule unchanged, which is why every assertion written before this one still
 * holds -- but the single caller in the app that can open the gate derives the
 * token FROM that same value, so in her app the two cannot come apart.
 */
export function engineFor(item, { config = {}, found = {}, enabled } = {}) {
  // ONE ENGINE ON THE MAC IS NOT A CHOICE, so the gate has nothing to guard.
  // Without Claude Code, a row marked `claude` would only die on arrival.
  if (homeEngine(found) !== DEFAULT_ENGINE) return homeEngine(found);
  if (enabled !== ENGINE_CHOICE_ENABLED) return DEFAULT_ENGINE;
  const wanted = isEngine(item?.engine) && !engineChoiceOnRowIsStale(item, config) ? item.engine : null;
  const fallback = isEngine(config?.engine) && !engineDefaultIsStale(config) ? config.engine : DEFAULT_ENGINE;
  const pick = wanted ?? fallback;
  if (pick === DEFAULT_ENGINE) return DEFAULT_ENGINE;
  return found[pick] ? pick : DEFAULT_ENGINE;
}

/**
 * Whether the engine on this row is one she chose, as opposed to the one it
 * would run on anyway. What makes the composer's footer stay open, the same
 * rule the level and the model follow (renderer/src/compose-footer.ts).
 */
export function enginePicked(id) {
  return isEngine(id) && id !== DEFAULT_ENGINE;
}

/**
 * THE MODEL ON THIS ROW, OR NULL BECAUSE IT BELONGS TO THE OTHER HARNESS.
 *
 * THE MIRROR OF `codexModelRefusal`, WHICH ONLY EVER GUARDED ONE DIRECTION.
 * That one stops a Claude alias reaching a Codex run. Nothing stopped the
 * reverse, and the reverse happens BY ITSELF: `engineFor` above falls back to
 * Claude Code when Codex is not on this Mac -- which is correct and stays --
 * and `spawnPlan` then applied `item.model` without asking which engine wrote
 * it. Measured 2026-09-05 by reading the resolved plan: a row saying `engine:
 * "codex", model: "gpt-5.6-sol"` -- the slug her own config.toml names --
 * produced `claude -p <brief> --model gpt-5.6-sol`, which Claude Code has never
 * heard of. It dies on arrival and dies again on every retry.
 *
 * THE TWO FIELDS ARE ONE CHOICE AND THIS IS WHY. The composer's model list is
 * scoped to the engine (`engineModelChoices`, renderer/src/models.ts) because
 * the two vocabularies do not overlap at all: `opus` is an alias Claude Code
 * resolves, `gpt-5.6-sol` is an exact slug Codex takes. So a model word means
 * nothing without the engine beside it, and a row whose engine has changed
 * under it has no model, rather than one that reads across.
 *
 * NULL IS NOT A STAND-IN AND THE CALLER MUST NOT TREAT IT AS ONE. This says
 * "there is no model on this row for this run"; whether that means running on
 * the workspace's own model or refusing the run outright is the caller's
 * decision, and main/supervisor.mjs makes it -- it refuses, and says so on the
 * row, for the reason `codexModelRefusal` gives on the other side.
 *
 * A ROW THAT NAMES NO ENGINE IS UNTOUCHED, which is every row she has ever
 * written: there is no other harness in the sentence, so the model rides
 * exactly as it did.
 */
export function modelForEngine(item, engine) {
  const model = typeof item?.model === 'string' && item.model ? item.model : null;
  if (!model) return null;
  if (isEngine(item?.engine) && item.engine !== engine) return null;
  return model;
}
