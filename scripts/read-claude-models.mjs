#!/usr/bin/env node
// WHICH MODEL EACH ALIAS REALLY IS, READ OUT OF THE BINARY RATHER THAN TYPED.
//
// THE FEAR IS THE RIGHT ONE AND A TYPED LABEL CANNOT ANSWER IT. Agentbox sends the
// CLI an ALIAS (`--model opus`), never a version, so that the picker stays
// correct when a new model ships. That is still right. But it means the app was
// printing "Opus" while the CLI decided what Opus meant, and nothing on either
// side would ever notice the two drifting apart. A version number typed into
// our file would be worse than none: it would look authoritative and be a guess.
//
// So the label is READ FROM THE SAME TABLE THE CLI RESOLVES THE ALIAS WITH. Both
// come out of one build step, which is the only arrangement in which the word on
// the screen cannot disagree with the model that runs.
//
// WHAT IS IN THERE, verbatim out of 2.1.257 on her Mac, 2026-09-01. Claude Code
// carries a "Hand-maintained baked-in model catalog" as an object literal, with
// an entry per model and an alias table at the end of it:
//
//   latest_per_family:{fable:"claude-fable-5-1",opus:"claude-opus-5",
//                      sonnet:"claude-sonnet-5",haiku:"claude-haiku-4-5"}
//
// and each model carries its own display name:
//
//   id:"claude-fable-5-1",family:"fable",display_name:"Fable 5.1"
//
// So `fable` already resolved to 5.1 before this script existed. Her instruction
// is satisfied by proving that rather than by changing it, and this is the proof:
// if a future Claude Code points `fable` somewhere older, the label on her picker
// changes with it at the next build, and the diff says so.
//
// IT FAILS LOUDLY, the same as the commands reader beside it. A missing alias, a
// missing display name, or a family we ask for that the catalog has dropped stops
// the build with the name in the error, because a picker offering a model the CLI
// cannot resolve is the exact failure this is here to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { findClaudeBin } from '../main/claude-bin.mjs';
import { commandBundle, localText, onlyTheStampsMoved, shown } from './read-claude-commands.mjs';
// The app's name is never typed, here or in what this writes out.
import { Name } from '../shared/product-name.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// A module rather than a .json, for the same reason as the commands table: main
// (node ESM) and the renderer (vite) import it the same way with no assertion.
//
// AND A BUILD DOES NOT WRITE IT, for the reason read-claude-commands.mjs gives
// at its own OUT: it is tracked, and a build that rewrote it made every folder
// that had run the app look like it held work. This one churns harder than the
// commands table does, because it carries real runtime data: measured
// 2026-10-07, `haiku` had moved from Haiku 4.5 to Haiku 5.5 since the committed
// snapshot was taken. Which is exactly why it must be a decision to adopt it
// and not a side effect of a build.
export const OUT = path.join(ROOT, 'shared', 'claude-models.generated.mjs');

// WHAT THIS MACHINE READ. Gitignored, and the floor main/claude-models.mjs
// prefers over the committed table when the installed CLI cannot be read: it was
// read on THIS machine, so it is never older than the one that shipped.
export const LOCAL = path.join(ROOT, 'shared', 'claude-models.local.json');

/**
 * HER FOUR, IN HER ORDER. The one list in this pipeline that is ours: Opus,
 * Sonnet and Haiku are her three from, and Fable is the one she added on.
 * Everything else about them is read. */
export const WANTED = ['opus', 'sonnet', 'haiku', 'fable'];

/* --------------------------- reading the bundle --------------------------- */
// THE READING ITSELF IS NOT HERE ANY MORE, AND THAT IS THE POINT.
//
// This script had its own copy of the scan, which was right while the table it
// wrote was the only table the app ever drew. Since the picker reads the
// installed Claude Code at the moment it is asked, there are TWO readers, and
// two readers of one binary that must agree are one bug waiting for a catalog
// change. main/claude-models.mjs owns it; this file decides what to WRITE with
// the answer, and refuses loudly when the answer is not usable.
export { readAliases, readNames, scan, nameOf } from '../main/claude-models.mjs';
import { scan, nameOf, rowsFrom } from '../main/claude-models.mjs';

export function claudeVersion(binPath) {
  try {
    return execFileSync(binPath, ['--version'], { encoding: 'utf8', timeout: 20_000 })
      .trim().split(/\s+/)[0] || null;
  } catch { return null; }
}

export function build(binPath) {
  const { aliases, names } = scan(binPath);
  const version = claudeVersion(binPath) ?? 'on this Mac';
  if (!aliases) {
    throw new Error(
      `Claude Code ${version} no longer carries the alias table this reads ` +
      '(latest_per_family in its baked-in model catalog). Agentbox labels its model picker ' +
      'from it so the word on screen cannot disagree with the model that runs. ' +
      'Read the binary and fix scripts/read-claude-models.mjs.',
    );
  }
  const missing = WANTED.filter((a) => !aliases[a]);
  if (missing.length) {
    throw new Error(
      `Claude Code ${version} no longer resolves these model aliases: ${missing.join(', ')}. ` +
      'Agentbox offers them in its picker, so it would be offering a model the CLI cannot ' +
      'resolve. Either they were renamed or dropped; fix WANTED in ' +
      'scripts/read-claude-models.mjs.',
    );
  }
  const unnamed = WANTED.filter((a) => !nameOf(names, aliases[a]));
  if (unnamed.length) {
    throw new Error(
      `Claude Code ${version} resolves ${unnamed.join(', ')} to a model with no display_name ` +
      `in its catalog (${unnamed.map((a) => aliases[a]).join(', ')}). The picker prints that ` +
      'name so an old model cannot be picked by mistake, and a guess here would defeat it.',
    );
  }
  return {
    readFrom: claudeVersion(binPath),
    readAt: new Date().toISOString().slice(0, 10),
    // EACH FAMILY'S NEWEST AND THE ONE BEFORE IT, which is her pick on and is
    // `rowsFrom`'s job, not this file's. Written out so a Mac with no Claude
    // Code on it falls back to the same shape of list the app would have
    // drawn, rather than to half of it.
    models: rowsFrom({ aliases, names }).map((m) => ({
      // What Agentbox sends the CLI. An alias on the newest row, so it stays
      // current on its own when a new model ships; the exact id on the row
      // under it, which is the only way to pin a version.
      alias: m.alias,
      // What that row runs TODAY, on the Claude Code that built this.
      // Printed beside the name so nobody has to trust the name alone.
      id: m.id,
      // Claude Code's own display name for that id, character for character.
      label: m.label,
      // And how hard that model thinks when nobody picks a level, out of the
      // same catalog. Null for a model that names none.
      defaultLevel: m.defaultLevel,
    })),
  };
}

/* --------------------------------- writing -------------------------------- */

export function moduleText(table) {
  return [
    '// GENERATED BY scripts/read-claude-models.mjs. DO NOT EDIT BY HAND.',
    '//',
    "// Which model each alias really is, and Claude Code's own name for it, read",
    '// out of the copy of Claude Code installed on a machine that ran',
    '// `npm run read:claude`. A BUILD DOES NOT REWRITE THIS: a build wrote what it',
    '// read over this tracked file, and every folder that had run the app then',
    '// looked like it held work. Committed so a machine with no Claude Code on it',
    '// can still build, and so a version that points an alias at a different model',
    '// shows up as a diff rather than as a wrong label on the picker.',
    '//',
    '// WHY IT IS READ AND NOT TYPED: labelling a model wrong is expensive, because',
    `// ${Name} sends the alias, the CLI decides what the alias means, and a version`,
    '// number typed into a file of ours would look authoritative while being a',
    '// guess. Running an old model by mistake is the failure being avoided.',
    '',
    `export const READ_FROM = ${JSON.stringify(table.readFrom)};`,
    `export const READ_AT = ${JSON.stringify(table.readAt)};`,
    '',
    'export const CLAUDE_MODELS = [',
    ...table.models.map((m) => `  ${JSON.stringify(m)},`),
    '];',
    '',
  ].join('\n');
}

// AND ITS TYPES, written by the same script for the same reason the table is.
// The renderer is TypeScript and this module is generated JavaScript, so without
// a declaration beside it the import is `any` and the one file whose whole job is
// being exact would be the one file nothing checks.
export function typesText() {
  return [
    '// GENERATED BY scripts/read-claude-models.mjs. DO NOT EDIT BY HAND.',
    '',
    'export declare const READ_FROM: string | null;',
    'export declare const READ_AT: string;',
    '',
    'export declare const CLAUDE_MODELS: ReadonlyArray<{',
    '  /** What Agentbox sends the CLI: an alias, never a version. */',
    '  alias: string;',
    '  /** What that alias resolved to on the Claude Code that built this. */',
    '  id: string;',
    "  /** Claude Code's own display name for that id, e.g. \"Opus 5\". */",
    '  label: string;',
    '  /** The level it thinks at when nobody picks one, out of the same catalog. */',
    '  defaultLevel: string | null;',
    '}>;',
    '',
  ].join('\n');
}

export function write(table, out = OUT) {
  fs.writeFileSync(out, moduleText(table));
  // AND ITS TYPES GO WITH IT, always. A .d.mts describing a table it no longer
  // matches is worse than none, because the renderer would typecheck against a
  // model list that is not there.
  fs.writeFileSync(out.replace(/\.mjs$/, '.d.mts'), typesText());
  return out;
}

/**
 * THE WHOLE OF WHAT EITHER MODE DOES, the same shape as the commands reader's
 * `run` beside it and for the same reasons; that one carries the comments.
 */
export function run({ bin = null, out = OUT, local = LOCAL, snapshot = false, log = console.log } = {}) {
  let had = null;
  try { had = fs.readFileSync(out, 'utf8'); } catch { /* first build */ }
  if (!bin) {
    // NOT AN ERROR, AND NOT SILENT EITHER, which is the stance the commands
    // reader beside this one takes and the reason it takes it: Agentbox has to
    // build on a machine that has never had Claude Code on it, and the committed
    // table is exactly what makes that possible. What must not happen is a build
    // that quietly ships a stale one, so this says which it is shipping.
    if (!had) throw new Error(`No Claude Code on this machine and no ${shown(out)} to fall back on.`);
    const was = had.match(/READ_FROM = "([^"]+)"/)?.[1] ?? 'an unknown version';
    log(`read-claude-models: no Claude Code here, keeping the table read from ${was}`);
    return;
  }
  // The refusals in `build` run on every build, as they always did: an alias the
  // picker offers that the CLI cannot resolve stops it, with the name in it.
  const table = build(bin);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, localText(table));
  const rows = table.models.map((m) => `${m.alias}=${m.label} (${m.id})`).join(', ');
  if (snapshot) {
    if (had === moduleText(table)) {
      log(`read-claude-models: committed table unchanged, ${rows}`);
      return;
    }
    write(table, out);
    log(`read-claude-models: wrote ${rows} from Claude Code ${table.readFrom} into ${shown(out)} (commit it)`);
    return;
  }
  if (had && !onlyTheStampsMoved(had, table, moduleText)) {
    log(
      `read-claude-models: the Claude Code here (${table.readFrom}) resolves these aliases ` +
      `differently from the committed ${shown(out)}: ${rows}. The picker reads the ` +
      'installed CLI at the moment it is asked, so it is already right; the committed table is ' +
      `the floor, what was read is in ${shown(local)}, and \`npm run read:claude\` adopts it.`,
    );
    return;
  }
  log(`read-claude-models: ${rows} from Claude Code ${table.readFrom}, same as the committed table`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = findClaudeBin();
  run({
    bin: found.found && found.path ? commandBundle(found.path) : null,
    snapshot: process.argv.includes('--snapshot'),
  });
}
