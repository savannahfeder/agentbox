#!/usr/bin/env node
// 2026-09-16: reads every public headless command; WANTED is a compatibility
// floor, not the menu cap. Historical eight-command rationale follows.
// THE EIGHT CLAUDE CODE COMMANDS, READ OUT OF THE BINARY RATHER THAN TYPED.
//
// SO THIS IS THE "CANNOT ROT QUIETLY" HALF, and it is the whole point of the
// script. Four versions of Claude Code landed on this Mac in the four days to
// 26 August (2.1.241, 243, 245, 246). A list of somebody else's commands typed
// into a file of ours goes stale between one of those and the next, and nothing
// says so: the menu keeps offering a word the CLI has renamed and the person
// reading it finds out by being told the command does not exist.
//
// So `npm run build` runs this, it reads the command table out of the installed
// binary, and it writes shared/claude-commands.json. The file is COMMITTED, so a
// machine with no Claude Code on it can still build; and because it is
// committed, a version that renames or drops one of the eight shows up as a
// diff in the build rather than as a wrong menu at run time.
//
// AND IT FAILS LOUDLY. If Claude Code is on this machine and one of the eight
// is gone, or has stopped carrying `supportsNonInteractive`, the build stops
// with the name in the error. That is the difference between a list that rots
// and a list that cannot.
//
// WHERE THE WORDS COME FROM. Claude Code registers its commands as plain object
// literals in the bundle, and the ones a headless run can execute carry
// `supportsNonInteractive:!0`. A record looks like this, verbatim out of
// 2.1.246:
//
// {type:"local",name:"model",supportsNonInteractive:!0, description:"Set the AI
// model for Claude Code",argumentHint:"<model>", isEnabled:=>It,get
// isHidden{return!It},load:=>import(...)}
//
// Every description below is theirs, character for character, except where a
// getter computes it at run time; `/fast` is the one of the eight that does
// (`get description{return`Toggle fast mode (${cqt})`}`) and it is cut at the
// interpolation, which is stated in the output so nobody mistakes the shortened
// line for a quotation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { findClaudeBin } from '../main/claude-bin.mjs';
// The app's name is never typed, here or in what this writes out.
import { Possessive } from '../shared/product-name.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
// A MODULE RATHER THAN A .json, so main (node ESM) and the renderer (vite)
// import it the same way with no import assertion and no bundler plugin. The
// logic that reads it lives next door in claude-commands.mjs, hand-written;
// this file is only the table.
export const OUT = path.join(ROOT, 'shared', 'claude-commands.generated.mjs');

/**
 * HER EIGHT, IN HER ORDER. This is the one list in the pipeline that is ours,
 *  and it is the judgement she named as the cost of picking this option: "the
 *  line between 'means something here' and 'does not' is a judgement somebody
 *  has to keep making." Everything else about them is read. */
export const WANTED = ['model', 'effort', 'fast', 'goal', 'context', 'usage', 'mcp', 'compact', 'advisor', 'autocompact', 'output-style', 'recap', 'reload-skills', 'list-agents'];

/* --------------------------- reading the bundle --------------------------- */

// The binary is ~230 MB, so it is read in chunks rather than held as one
// string. The overlap is longer than the longest record we care about, so a
// record straddling a chunk boundary is still whole in the next window.
const CHUNK = 8 * 1024 * 1024;
const OVERLAP = 8 * 1024;

/**
 * Walk a JS object literal from its opening brace to its matching close,
 *  stepping over braces that are inside strings, template literals or regex-
 *  free comments. Returns the source of the record, or null if it does not
 *  close inside the window (which is what a chunk boundary looks like). */
function objectAt(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * A JS double-quoted string literal, decoded. Their descriptions carry `\u`
 *  escapes (goal's em dash is `—`) and apostrophes, so this cannot be a
 *  raw slice. */
function jsString(source) {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function field(record, name) {
  const m = record.match(new RegExp(`(?:^|[,{])${name}:("(?:[^"\\\\]|\\\\.)*")`));
  return m ? jsString(m[1]) : null;
}

/**
 * The getter form, for the one of the eight whose description is composed at
 *  run time. Cut at the interpolation; the caller marks it as shortened. */
function getterText(record, name) {
  const m = record.match(new RegExp(`get ${name}\\(\\)\\{return\`([^\`]*)\``));
  if (!m) return null;
  const cut = m[1].indexOf('${');
  const text = (cut < 0 ? m[1] : m[1].slice(0, cut)).trim().replace(/[\s(]+$/, '');
  return text || null;
}

function aliases(record) {
  const m = record.match(/(?:^|[,{])aliases:\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((a) => jsString(`"${a[1]}"`)).filter(Boolean);
}

/**
 * Every `{type:"local",name:"<one of the eight>"...}` record in the bundle,
 *  keyed by name. A name appears more than once (the interactive twin, the
 *  tool of the same name); the one we keep is the one that says it can run
 *  outside an interactive session, because that is the only kind a headless
 *  worker can execute. */
// Commands whose lifecycle or access semantics need a PowerUp adapter. They
// remain explicit gaps; discovering a name is not permission to change policy.
export const NATIVE_ADAPTER_GAPS = new Set(['skill-doctor', 'plugin-types', 'agents', 'add-dir', 'auto-mode-setup', 'clear', 'color', 'config', 'import', 'design-consent', 'design-revoke', 'rename', 'heapdump', 'exit', 'stop', 'workflow-launch-exec', 'usage-credits', 'extra-usage']);
export function readRecords(binPath, { chunk = CHUNK } = {}) {
  const found = new Map();
  const fd = fs.openSync(binPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(chunk + OVERLAP);
    for (let at = 0; at < size; at += chunk) {
      const read = fs.readSync(fd, buf, 0, chunk + OVERLAP, at);
      if (read <= 0) break;
      const text = buf.toString('latin1', 0, read);
      for (const match of text.matchAll(/\{type:"local",name:"([a-z][a-z-]*)"/g)) {
        const name = match[1];
        if (found.has(name) || NATIVE_ADAPTER_GAPS.has(name)) continue;
        const record = objectAt(text, match.index);
        if (!record || !/(?:^|[,{])supportsNonInteractive:!0/.test(record)) continue;
        if (!WANTED.includes(name) && /(?:isHidden:!0|isEnabled:\(\)=>!1)/.test(record)) continue;
        // Dynamic descriptions that cannot be decoded are retained in the
        // audit inventory, not presented as invented provider copy.
        try { commandFrom(name, record); } catch { continue; }
        found.set(name, record);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return found;
}

/** One record turned into the row the menu draws. */
export function commandFrom(name, record) {
  const literal = field(record, 'description');
  const getter = literal ? null : getterText(record, 'description');
  const description = literal ?? getter;
  if (!description) throw new Error(`/${name}: no description in the binary`);
  return {
    name,
    description,
    // THEIR OWN SHORTER LINE, WHERE THEY HAVE WRITTEN ONE. Ours is a menu, so
    // where theirs exists it is the one to print, and it is still their
    // sentence rather than our compression of theirs.
    menuDescription: field(record, 'menuDescription'),
    // Whether the sentence above is Claude Code's whole sentence. False means a
    // getter composed it and we cut it at the interpolation, and the menu must
    // not present it as a quotation.
    whole: !!literal,
    // What it takes after the word, in their words. Several of the eight
    // compute this at run time (`get argumentHint{return C4r("<",">")}`) and
    // then there is nothing honest to print, so it is null rather than guessed.
    argumentHint: field(record, 'argumentHint'),
    aliases: aliases(record),
  };
}

export function claudeVersion(binPath) {
  try {
    const out = execFileSync(binPath, ['--version'], { encoding: 'utf8', timeout: 20_000 });
    return out.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

export function build(binPath) {
  const records = readRecords(binPath);
  const missing = WANTED.filter((n) => !records.has(n));
  if (missing.length) {
    throw new Error(
      `Claude Code ${claudeVersion(binPath) ?? 'on this Mac'} no longer registers these as ` +
      `commands a headless run can execute: ${missing.map((n) => `/${n}`).join(', ')}. ` +
      'The reply-box menu offers them, so it would be offering a word the CLI does not know. ' +
      'Either they were renamed, or they stopped carrying supportsNonInteractive; read the ' +
      'binary and fix WANTED in scripts/read-claude-commands.mjs.',
    );
  }
  return {
    readFrom: claudeVersion(binPath),
    readAt: new Date().toISOString().slice(0, 10),
    commands: [...WANTED, ...[...records.keys()].filter(n => !WANTED.includes(n)).sort()].map((name) => commandFrom(name, records.get(name))),
  };
}

/* --------------------------------- writing -------------------------------- */

export function moduleText(table) {
  return [
    '// GENERATED BY scripts/read-claude-commands.mjs. DO NOT EDIT BY HAND.',
    '//',
    `// Claude Code's own words for the commands ${Possessive} reply box offers,`,
    '// read out of the copy of Claude Code installed on the machine that built',
    '// this. `npm run build` rewrites it. Committed so a machine with no Claude',
    '// Code on it can still build, and so a version that renames one of the eight',
    '// shows up as a diff rather than as a wrong menu.',
    '//',
    '// WHY IT IS READ AND NOT TYPED: reading them out of the installed binary at',
    '// build time, rather than typing them into a file, is the only way the list',
    '// cannot rot quietly.',
    '',
    `export const READ_FROM = ${JSON.stringify(table.readFrom)};`,
    `export const READ_AT = ${JSON.stringify(table.readAt)};`,
    `export const CLAUDE_COMMANDS = ${JSON.stringify(table.commands, null, 2)};`,
    '',
  ].join('\n');
}

function main() {
  const found = findClaudeBin();
  if (!found.found || !found.path) {
    // NOT AN ERROR, AND NOT SILENT EITHER. Agentbox has to build on a machine
    // that has never had Claude Code on it, and the committed file is exactly
    // what makes that possible. What must not happen is a build that quietly
    // ships a year-old list, so this says out loud which one it is shipping.
    let had = null;
    try { had = fs.readFileSync(OUT, 'utf8'); } catch { /* first build */ }
    if (!had) throw new Error(`No Claude Code on this machine and no ${path.relative(ROOT, OUT)} to fall back on.`);
    const from = had.match(/READ_FROM = "([^"]*)"/)?.[1] ?? 'an older version';
    const at = had.match(/READ_AT = "([^"]*)"/)?.[1] ?? 'an unknown day';
    console.log(`[claude-commands] no Claude Code here; keeping the list read from ${from} on ${at}`);
    return;
  }
  const next = build(found.path);
  let before = null;
  try { before = fs.readFileSync(OUT, 'utf8'); } catch { /* first build */ }
  const text = moduleText(next);
  if (before === text) {
    console.log(`[claude-commands] unchanged, ${next.commands.length} commands from ${next.readFrom}`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`[claude-commands] wrote ${next.commands.length} commands from ${next.readFrom} (the file changed; commit it)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
