// WHICH MODELS CLAUDE CODE CAN BE ASKED FOR, READ OFF THIS MAC AT THE MOMENT
// IT IS ASKED, RATHER THAN AT THE MOMENT AGENTBOX WAS BUILT.
//
// WHAT WAS ALREADY RIGHT, AND IS NOT CHANGED HERE. Agentbox sends the CLI an
// ALIAS (`--model opus`), never a version, so the RUN is already on whatever
// Opus is on the day it spawns. Nothing about that needed fixing, and this file
// does not touch it.
//
// WHAT WAS WRONG IS THE WORD ON THE SCREEN. The picker's labels came out of
// `shared/claude-models.generated.mjs`, written by
// `scripts/read-claude-models.mjs` at BUILD time. That was built to stop a
// typed label drifting from the model that runs, and it does. But a table
// frozen at build time drifts from the model that runs in the other direction:
// she updates Claude Code, the alias starts resolving somewhere newer, and her
// picker keeps printing the old name until somebody rebuilds Agentbox. MEASURED
// 2026-09-22 and this is exactly what happened: her Claude Code 2.1.270
// resolves `opus` to `claude-opus-5`; 2.1.280, published the same week,
// resolves it to `claude-opus-5-5` ("Opus 5.5"). The build table could not have
// known.
//
// SO IT IS READ AT THE MOMENT IT IS ASKED FOR, which is the stance
// main/codex-models.mjs already takes beside this one for the same reason, and
// hers is the same question both times. One `statSync` decides whether the
// answer is still good; a `claude update` changes the binary's size and mtime,
// so the next read is a fresh one and her picker says the new name with no
// rebuild and no release.
//
// AND THE FAMILIES ARE READ TOO, NOT LISTED. The build script carries a typed
// `WANTED = ['opus','sonnet','haiku','fable']`, which is her order and is also
// the reason a brand new family could never appear on its own. Here, her four
// come first in her order and EVERY OTHER ALIAS THE CLI RESOLVES follows them.
// If Anthropic ships a fifth family tomorrow, it is in her picker the moment she
// updates Claude Code, labelled with Claude Code's own name for it.
//
// THE COMMITTED TABLE IS STILL THE FLOOR. A Mac with no Claude Code on it, or a
// Claude Code whose catalog this can no longer read, answers with the generated
// list rather than with nothing. An empty picker is a worse answer than a
// slightly old one, and it is the one failure that would stop her sending a task
// at all.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAUDE_MODELS, READ_FROM } from '../shared/claude-models.generated.mjs';

// WHAT THE LAST BUILD ON THIS MACHINE READ, which is a better floor than the
// committed table and is not a file anybody edits.
//
// The committed table is tracked, so a build that wrote over it made every
// folder that had run the app look like it held work (w-6bbb709b1f, 2026-10-07).
// The build writes this instead. It is gitignored, it is absent on a machine
// that has never built, and it is read with `fs` rather than imported, for the
// one reason that decides the whole shape: this module is node, but
// shared/claude-commands.mjs next door is shared with the renderer, where an
// import of a file that may not exist cannot be made to resolve. A read is a
// read in node and nothing at all in a bundle.
const LOCAL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'claude-models.local.json');

/** The table this machine read at build time, or null if there is none to trust. */
function readLocal(at) {
  try {
    const table = JSON.parse(fs.readFileSync(at, 'utf8'));
    if (!Array.isArray(table.models) || !table.models.length) return null;
    // Every row has to carry what the picker draws. A half-written file is a
    // worse answer than the committed table, not a better one.
    if (!table.models.every((m) => m && typeof m.alias === 'string' && typeof m.label === 'string')) return null;
    return table;
  } catch { return null; }
}

/**
 * HER ORDER, AND ONLY HER ORDER. Not a filter: an alias missing from this list
 * is still offered, after these. Her three are from and Fable is the one she
 * added on. */
export const HER_ORDER = ['opus', 'sonnet', 'haiku', 'fable'];

// The binary is ~200 MB, so it is read in chunks with an overlap longer than the
// longest record we care about, exactly as scripts/read-claude-commands.mjs does.
const CHUNK = 8 * 1024 * 1024;
const OVERLAP = 64 * 1024;

/** The alias table: which model id each family word resolves to. */
export function readAliases(text) {
  const m = text.match(/latest_per_family:\{([^}]*)\}/);
  if (!m) return null;
  const out = {};
  for (const [, alias, id] of m[1].matchAll(/([a-z_]+):"([^"]+)"/g)) out[alias] = id;
  return Object.keys(out).length ? out : null;
}

/**
 * Every model in the catalog that carries a display name of its own, IN THE
 * ORDER THE CATALOG LISTS THEM.
 *
 * The order is load-bearing now and it was not before. Her pick on this item is
 * that the drawer names the model before the newest one as well, and "the one
 * before" has to come from somewhere. Parsing a version out of the id cannot do
 * it: the ids are not one shape, since `claude-3-5-haiku` and `claude-haiku-4-5`
 * are both real and sit on either side of a naming change, so a comparator over
 * them is a guess that will one day sort a newer model as older and quietly
 * offer the wrong one.
 *
 * The catalog is already ascending within each family, and it is the same order
 * Claude Code's own picker uses. MEASURED against 2.1.270 and 2.1.280 on
 * 2026-09-22: haiku 3.5 then 4.5; sonnet 3.5, 3.7, 4, 4.5, 4.6, 5; opus 4, 4.1,
 * 4.5, 4.6, 4.7, 4.8, 5, 5.5; fable 5 then 5.1. So "the one before" is the entry
 * immediately before the alias's own, inside its family, and no version number
 * is ever read by us.
 */
export function readNames(text) {
  const out = [];
  for (const m of text.matchAll(/id:"(claude-[a-z0-9-]+)",family:"([a-z]+)",display_name:"([^"]+)"(.{0,1200}?)(?=id:"claude-|$)/gs)) {
    const [, id, family, label, rest] = m;
    out.push({ id, family, label, defaultLevel: rest.match(/default_effort:"([a-z]+)"/)?.[1] ?? null });
  }
  return out;
}

/** The catalog's own name for one id, or undefined if it names none. */
export const nameOf = (names, id) => names.find((n) => n.id === id)?.label;

// AND HOW HARD THAT MODEL THINKS WHEN NOBODY SAYS.
//
// The strip drew nothing lit because this app genuinely did not know the answer,
// and shared/effort-levels.mjs says so in as many words: "a level nobody picked
// is the engine's own choice for the model... and this app does not know what
// that is per model, so it does not claim to." That was true and it is not any
// more. Claude Code's catalog carries `default_effort` on each model, beside the
// display name this file already reads, exactly as Codex's cache carries
// `default_reasoning_level` (main/codex-models.mjs reads that one already).
//
// AND IT REALLY IS PER MODEL, which is why a single typed word would have been
// wrong. MEASURED out of 2.1.280 on 2026-09-22: Opus 5.5 medium, Opus 5 high,
// Opus 4.8 high, Opus 4.7 xhigh, Sonnet 5 high, Fable 5.1 high. So the word the
// strip lights changes when she changes model, and it is read rather than
// guessed, for the same reason the label beside it is.
//
// NULL IS A REAL ANSWER. A model the catalog gives no default_effort for, such
// as Haiku 4.5 in 2.1.280, lights nothing, which is exactly what the strip did
// before. Nothing here invents a level.

/**
 * Walk the binary once for both halves of the catalog.
 *
 * IT STOPS EARLY ON PURPOSE. Claude Code keeps its catalog as one object
 * literal, so the alias table and every display name sit inside a few hundred
 * kilobytes of each other, and reading the remaining ~190 MB to find nothing is
 * time she spends waiting for a picker to open. Measured on her Mac against
 * 2.1.270: 82 ms for the whole file, 8 ms stopping at the alias table.
 */
export function scan(binPath, { chunk = CHUNK } = {}) {
  let aliases = null;
  const names = [];
  const seen = new Set();
  const fd = fs.openSync(binPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(chunk + OVERLAP);
    for (let at = 0; at < size; at += chunk) {
      const read = fs.readSync(fd, buf, 0, chunk + OVERLAP, at);
      if (read <= 0) break;
      const text = buf.toString('latin1', 0, read);
      aliases = aliases ?? readAliases(text);
      // The chunks overlap, so the same record is read twice at every seam and
      // the second copy must not become a second row in a list whose ORDER is
      // now what decides which model is offered as the previous one.
      for (const m of readNames(text)) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        names.push(m);
      }
      // Both halves are in hand and they agree: there is nothing left to find.
      if (aliases && Object.values(aliases).every((id) => seen.has(id))) break;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { aliases, names };
}

/* A family with only one model in the * catalog contributes one row, not a duplicate.
*/
export function rowsFrom({ aliases, names }) {
  if (!aliases) return null;
  const order = [...HER_ORDER, ...Object.keys(aliases).filter((a) => !HER_ORDER.includes(a)).sort()];
  const rows = [];
  for (const alias of order) {
    const id = aliases[alias];
    const self = names.find((x) => x.id === id);
    const label = self?.label;
    if (!id || !label) continue;
    // `defaultLevel` travels beside the name rather than as a list of its own,
    // the way main/codex-models.mjs carries its models' levels: it is per model,
    // so a table of its own could disagree with the row it belongs to.
    rows.push({ alias, id, label, defaultLevel: self.defaultLevel ?? null });
    // The entry immediately before this one inside its own family. The catalog
    // is ascending, so that is the model she was on before the newest shipped.
    const family = names.filter((n) => n.family === self.family);
    const before = family[family.findIndex((n) => n.id === id) - 1];
    if (before) {
      rows.push({ alias: before.id, id: before.id, label: before.label, defaultLevel: before.defaultLevel ?? null });
    }
  }
  return rows.length ? rows : null;
}

/* --------------------------------- caching -------------------------------- */
// KEYED ON THE BINARY ITSELF, NOT ON A CLOCK. main/codex-models.mjs refuses to
// cache at all, and says why: caching a cheap read is how a screen ends up still
// saying the old answer after the thing changed underneath it. Its read is one
// 199 KB parse. This one is a walk through a 200 MB file, which is not cheap
// enough to repeat on every settings read while she is typing, so it is cached
// against the one fact that decides whether the answer can still be right: the
// path, size and mtime of the binary that produced it. `claude update` replaces
// that file, so the very next read is a fresh one. There is no staleness window
// and no interval to tune.
let memo = null;

/** Exported for the tests, and for anything that has a reason to force a re-read. */
export function forget() { memo = null; }

function stampOf(binPath) {
  try {
    const s = fs.statSync(binPath);
    return `${binPath}:${s.size}:${s.mtimeMs}`;
  } catch { return null; }
}

/**
 * WHAT MAY SHE BE OFFERED FOR CLAUDE CODE, and what version said so.
 *
 * `{ models: [{ alias, id, label }], readFrom, source }` where `source` is
 * `'cli'` when it came off this Mac's Claude Code at the moment it was asked,
 * `'read'` when it is what the last build on this machine read out of it, and
 * `'built'` when it is the table committed to the repository. Never empty: the
 * committed table is the floor under both of them.
 *
 * THE PATH IS HANDED IN, NEVER SEARCHED FOR HERE. `config.claudeBin` is already
 * resolved once at startup (main/config.mjs), and `findClaudeBin` falls back to
 * asking a login shell when the known folders miss. main/codex-models.mjs states
 * the rule this follows: a picker must never be the reason a shell is spawned
 * while she is typing.
 *
 * AND NOTHING HERE SPAWNS ANYTHING EITHER. An earlier draft asked the CLI its
 * `--version` so the Settings screen could say which one it read. That is one
 * `execFileSync` on the path a settings read takes, and no label on a screen is
 * worth a process started while she waits. `readFrom` is the committed table's
 * version, and it is meaningful whenever `source` is not `'cli'`.
 */
export function claudeModels({ bin = null, local = LOCAL } = {}) {
  // THE FLOOR IS THE FRESHER OF THE TWO TABLES NOBODY HAS TO ASK FOR: what the
  // last build on this machine read, and the one committed to the repository.
  const read = readLocal(local);
  const built = {
    models: (read?.models ?? CLAUDE_MODELS).map((m) => ({
      alias: m.alias, id: m.id, label: m.label, defaultLevel: m.defaultLevel ?? null,
    })),
    readFrom: read ? read.readFrom ?? null : READ_FROM,
    source: read ? 'read' : 'built',
  };
  if (!bin) return built;
  const stamp = stampOf(bin);
  if (!stamp) return built;
  if (memo?.stamp === stamp) return memo.value;
  let rows = null;
  try { rows = rowsFrom(scan(bin)); } catch { rows = null; }
  // A CLI WE CANNOT READ IS NOT A REASON TO DRAW AN EMPTY PICKER, and it is not
  // a reason to stop either: this is the labelling, not the spawn, and the alias
  // Agentbox sends works whether or not this file could find the table it is in.
  const value = rows ? { models: rows, readFrom: null, source: 'cli' } : built;
  memo = { stamp, value };
  return value;
}

/** Just the rows, for the callers that do not care where they came from. */
export function claudeModelRows(opts = {}) { return claudeModels(opts).models; }
