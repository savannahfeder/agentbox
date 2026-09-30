// WHICH MODELS CODEX CAN BE ASKED FOR, READ OFF THIS MAC RATHER THAN LISTED.
//
// She is right and the card was wrong. `renderer/src/models.ts` holds four
// names -- Opus, Sonnet, Haiku, Fable -- and drew them whatever the engine was,
// so a task set to run on Codex read "On Opus. With Codex.", which is two
// sentences that cannot both be true.
//
// AND THE LIST IS NOT OURS TO KEEP. Claude Code's four are safe to generate
// once into a committed file because `--model` there takes an ALIAS (`opus` is
// whatever Opus is on the day the task runs, resolved by the CLI at spawn), so
// `shared/claude-models.generated.mjs` cannot silently point at an old model.
// Codex has no aliases: `-m` and `thread/start`'s `model` want the exact slug
// of one specific model, and OpenAI ships new ones on their own schedule. A
// hardcoded Codex list is a list that is wrong the week after it is written,
// and a generated one is a list that is wrong the week after the build.
//
// SO IT IS READ AT THE MOMENT IT IS ASKED FOR, AND THE CLI HAS ALREADY FETCHED
// IT. codex-cli keeps `<home>/models_cache.json`, refreshed against the server
// with an etag, holding every model the logged-in account may use. Measured on
// this Mac 2026-09-04 against codex-cli 0.148.0: 198,977 bytes, 8 models,
// `fetched_at` 2026-09-04T10:21:25.048219Z, `client_version` "0.148.0". Six
// carry `visibility: "list"` and two carry `"hide"`. Reading that file IS the
// fetch: one readFileSync of a file the CLI maintains, no network, and it
// cannot disagree with what Codex will actually accept.
//
// NOTHING HERE SPAWNS ANYTHING. `codex` has no subcommand that prints its
// models (checked against 0.148.0), and even if it did, a picker must never be
// the reason a login shell is spawned while she is typing.
//
// AND NOTHING HERE IS CACHED IN MEMORY, for the reason main/codex-bin.mjs
// gives about its own stat calls: caching a cheap read is how a screen ends up
// still saying the old answer after the thing changed underneath it. The CLI
// rewrites this file whenever its etag moves, and a spawn is not a hot path.
//
// ---------------------------------------------------------------------------
// TWO QUESTIONS, NOT ONE, AND THE 2026-08-26 ORIGINAL ONLY ASKED THE FIRST.
//
//   WHAT MAY SHE BE OFFERED -> `codexModels`, the six with `visibility: "list"`.
//     `gpt-reserve` and `codex-auto-review` are Codex's own internal models and
//     a person who chose one would get a session that behaves nothing like a
//     coding agent.
//
//   WHAT WOULD CODEX ACCEPT -> `codexKnownSlugs`, all eight. This one is new,
//     and it exists because main/supervisor.mjs now REFUSES to start a run
//     whose model this Mac's Codex does not know. Answering that question with
//     the offer list would refuse `gpt-reserve` -- a slug Codex takes -- and a
//     false refusal is a row that cannot run for a reason that is not true.
//
// `priority` is ascending and is the order the CLI's own picker uses, so the
// newest frontier model is first and the small old ones are last. Sorted by it
// rather than by name, so the list never reorders itself when a model ships.
//
// REASONING LEVELS ARE PER MODEL AND THEY REALLY DIFFER. Measured in the same
// file the same day: `gpt-5.6-sol` supports low/medium/high/xhigh/max/ultra and
// `gpt-5.5` stops at xhigh; the defaults differ too (`low` against `medium`).
// One shared list beside a picker would offer her a level half these models
// cannot run.-- but they are carried here so the slice that does draw them does
// not have to come back and re-read a 199KB file.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const liveCatalogs=new Map();
export function rememberCodexModels(home,models){
 const rows=models.filter(m=>typeof m.model==='string'&&m.model).map((m,i)=>({slug:m.model,display_name:m.displayName,visibility:m.hidden?'hide':'list',priority:i,default_reasoning_level:m.defaultReasoningEffort,supported_reasoning_levels:(m.supportedReasoningEfforts||[]).map(l=>({effort:l.reasoningEffort,description:l.description}))}));
 if(rows.length)liveCatalogs.set(home,rows);
}
const catalogRows=(home,read)=>liveCatalogs.get(home)??modelRows(read(path.join(home,'models_cache.json')));

/**
 * WHICH CODEX HOME. Her own setting first, then the environment, then the
 * default -- the same precedence the install script itself uses, read
 * 2026-09-04: `CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"`. An empty
 * `CODEX_HOME` falls through exactly as `${VAR:-default}` does, so an
 * exported-but-blank one cannot turn this into a read at the root of the disk.
 *
 * main/codex-bin.mjs looks under BOTH `CODEX_HOME` and `~/.codex` for signs of
 * an install, and that is not this rule rather than a contradiction of it: its
 * job is to make an ABSENCE hard to claim, so two homes is the right answer
 * there. This one has to name the single home a specific Codex reads, because
 * offering models out of the wrong one would offer models a different login
 * cannot run.
 */
export function codexHome({ configured = null, env = process.env, home = os.homedir() } = {}) {
  return configured || env?.CODEX_HOME || path.join(home, '.codex');
}

/**
 * The models this Mac's Codex may be OFFERED, in the order it ranks them.
 *
 * `{ id, label, description, defaultLevel, levels }`, where `levels` is the
 * model's own `[{ id, description }]`. Every word in it is Codex's; nothing is
 * typed here, for the reason `shared/claude-models.generated.mjs` gives about
 * its own labels -- a name typed into a file of ours looks authoritative while
 * being a guess.
 *
 * An unreadable, absent or half-written cache answers `[]` rather than a guess.
 * `[]` is not "there are no models"; it is "this Mac cannot say", and the
 * supervisor's refusal is built to need a list before it refuses anything.
 */
export function codexModels({ home = codexHome(), read = readJson } = {}) {
  return catalogRows(home,read)
    .filter((m) => m.visibility === 'list')
    .sort((a, b) => priorityOf(a) - priorityOf(b))
    .map((m) => ({
      id: String(m.slug),
      label: String(m.display_name || m.slug),
      description: typeof m.description === 'string' ? m.description : '',
      defaultLevel: typeof m.default_reasoning_level === 'string' ? m.default_reasoning_level : null,
      levels: (Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [])
        .filter((l) => l && typeof l.effort === 'string' && l.effort)
        .map((l) => ({ id: l.effort, description: typeof l.description === 'string' ? l.description : '' })),
    }));
}

/**
 * Every slug in the cache, hidden ones included: what Codex would accept if it
 * were handed the word, which is a different question from what she may pick.
 */
export function codexKnownSlugs({ home = codexHome(), read = readJson } = {}) {
  return new Set(catalogRows(home,read).map((m) => String(m.slug)));
}

/**
 * The reasoning levels ONE model advertises, hidden models included, as the
 * bare words `turn/start`'s `effort` takes.
 *
 * Null when this Mac cannot say -- no readable cache, or a slug it does not
 * list -- which the caller has to tell apart from a model that lists none:
 * the first is "carry the word and let Codex answer", the second is a level
 * nothing can run. Same two questions as `codexKnownSlugs` against
 * `codexModels`, asked about the other field.
 */
export function codexModelLevels(slug, { home = codexHome(), read = readJson } = {}) {
  const cache = liveCatalogs.has(home)?{models:liveCatalogs.get(home)}:read(path.join(home, 'models_cache.json'));
  if (!cache) return null;
  const row = modelRows(cache).find((m) => m.slug === slug);
  if (!row) return null;
  return (Array.isArray(row.supported_reasoning_levels) ? row.supported_reasoning_levels : [])
    .filter((l) => l && typeof l.effort === 'string' && l.effort)
    .map((l) => l.effort);
}

/**
 * WHAT CODEX RUNS ON WHEN NOBODY HAS CHOSEN, WHICH IS HER OWN SETTING.
 *
 * Read out of the bare `model = "..."` line at the top of the home's
 * config.toml, because that is the model her `codex` in a terminal already
 * uses, and a fleet quietly running a different one would be a fleet she cannot
 * reason about. Hers on 2026-09-04 is `gpt-5.6-sol`.
 *
 * A DELIBERATELY SMALL PARSER, and the smallness is the safety. The only thing
 * it is ever allowed to take out of that file is one top-level string, so it
 * scans line by line and STOPS AT THE FIRST TABLE HEADER. That is not a
 * shortcut, it is TOML: once a `[table]` opens, every key below it belongs to
 * that table, so a bare top-level key can only appear above the first one. Her
 * real config is 234 lines with 71 `[projects."..."]` tables in it, and a regex
 * over the whole file reports whichever project it hit first as her default.
 *
 * `model_reasoning_effort` sits on the line directly below `model` in that same
 * file and shares its first eight characters, which is why the key is anchored
 * on both sides rather than merely at the start.
 *
 * NULL IS A REAL ANSWER: pass no model at all and let Codex decide, which is
 * what happens today. The 2026-08-26 version fell back to the top-priority
 * model in the list instead, and that is our sort order's first row rather than
 * Codex's default. The two are equal on this Mac by luck, and a screen printing
 * one as the other would be wrong with nothing here able to notice.
 */
export function codexDefaultModel({ home = codexHome(), read = readText } = {}) {
  const text = read(path.join(home, 'config.toml'));
  if (!text) return null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) return null; // a table opens; the top level is over
    const hit = /^model\s*=\s*["']([^"']+)["']/.exec(line);
    if (hit) return hit[1];
  }
  return null;
}

/** The `models` array, or nothing, however badly the file is malformed. */
function modelRows(cache) {
  const rows = Array.isArray(cache?.models) ? cache.models : [];
  return rows.filter((m) => m && typeof m === 'object' && typeof m.slug === 'string' && m.slug);
}

// A model with no priority sorts last rather than first. A new field arriving
// with a null in it must not silently jump to the top of her picker.
function priorityOf(m) {
  return Number.isFinite(m.priority) ? m.priority : Number.MAX_SAFE_INTEGER;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
