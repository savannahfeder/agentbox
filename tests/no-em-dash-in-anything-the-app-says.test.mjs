// No em dash in any text the app shows.
//
// WHY THIS FILE EXISTS RATHER THAN JUST A ONE-TIME SWEEP. The sweep was true
// about the tree it ran on. The onboarding work was being written on another
// branch at the same time, and when it was folded in the next day it carried
// THREE fresh em dashes into strings a user can read: the
// practice-project refusal, the "the app could not check" line in Settings, and
// the Shortcuts lede. Nothing failed. They were found by hand, and the next
// round of parallel work would have put more back the same way.
//
// WHY A GREP CANNOT DO THIS. There are about five hundred em dashes in the
// tree and almost every one is prose inside a `/* */` block, because this
// codebase argues with itself in its comments. A grep for the character is
// five hundred hits and zero signal. So this walks the source with a small
// state machine and only ever looks at two places: inside a string literal,
// and in the plain text between JSX tags. Comments are skipped, which is the
// whole point, and they stay free to use the character as much as they like.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EM_DASH = '—';

// The surfaces that can reach her eye. Tests and scripts are excluded on
// purpose: a script writes to a terminal, and a test's own prose is a comment
// by another name. `fixtures.ts` IS included, because she never runs on
// fixtures but every screenshot an agent sends her is drawn from them.
const ROOTS = ['renderer/src', 'main', 'shared'];
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js']);

// THE THREE THAT STAY, EACH A DECISION AND NOT AN OVERSIGHT. Matched on the
// fragment rather than a line number, so the allowance cannot drift onto some
// other line as the file moves underneath it.
const ALLOWED = [
  {
    file: 'renderer/src/rail-metrics.ts',
    fragment: "value: '—'",
    why: 'A mark standing in for a figure that was never measured, so an absence '
      + 'cannot be misread as a zero. Not punctuation in a sentence.',
  },
  {
    file: 'shared/claude-commands.generated.mjs',
    fragment: 'Set a goal',
    why: "Claude Code's own words, read out of the installed binary by the build "
      + '(w-23a7b3f568). Editing it here is undone by the next build and makes '
      + 'the record stop matching the binary. Stripped at the render boundary '
      + 'instead, by commandHint in shared/claude-commands.mjs.',
  },
  {
    file: 'main/main.mjs',
    fragment: 'recovery',
    why: 'A console.log to the terminal. She never sees it.',
  },
  // THE TWO STRIPPERS. Both are regex literals rather than anything anybody
  // reads, and both exist to TAKE the character out. A guard that made them
  // give up their dash would be a guard that switched the strippers off.
  {
    file: 'shared/claude-commands.mjs',
    fragment: 'menuDescription',
    why: 'commandHint, which is what takes the dash out of the slash menu as it '
      + 'draws each line. The dash in it is the thing being removed.',
  },
  {
    file: 'shared/dashboard.mjs',
    fragment: '.replace(',
    why: 'The same removal on the dashboard side. The dash in it is the pattern, '
      + 'not a word.',
  },
  {
    file: 'renderer/src/search.ts',
    fragment: "'—': '-'",
    why: "The fold table, so a search for a hyphen still finds a row somebody "
      + 'else typed with a dash in it. Removing this would make search worse, '
      + 'not cleaner.',
  },
  {
    file: 'renderer/src/search.ts',
    fragment: 'toLowerCase',
    why: 'The character class the fold table is applied through. Same reason.',
  },
];

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...files(rel));
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Every em dash in `src` that is NOT inside a comment, with the line it sits on.
 *
 * IT HAS EXACTLY ONE JOB: TELL A COMMENT FROM EVERYTHING ELSE. It does not try
 * to know a string from JSX text from a regex, because it does not need to.
 * Anything outside a comment is either something the app says or one of the
 * three regexes named in ALLOWED, and that is a small enough set to read.
 *
 * The first cut of this file DID try to track string state, and it was wrong
 * within an hour. A template literal in `shared/agents.mjs:564` interpolates a
 * `join(', ')` inside `${}`, the tracker went out of step on the quotes inside
 * the braces, and eleven COMMENT lines further down that file were reported as
 * text she could see. Doing less is what makes this trustworthy.
 *
 * The one thing it can be fooled by is `//` inside a string, which is why a
 * slash pair preceded by a colon does not open a comment: `https://` is the
 * only form of it that actually occurs here. The cost of being fooled is a
 * missed dash, never a false alarm.
 */
function saidOutLoud(src) {
  const hits = [];
  let line = 1;
  let state = 'code'; // code | line-comment | block-comment
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '\n') line += 1;

    if (state === 'line-comment') {
      if (c === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (c === '*' && next === '/') { state = 'code'; i += 1; }
      continue;
    }
    if (c === '/' && next === '/' && src[i - 1] !== ':') { state = 'line-comment'; i += 1; continue; }
    if (c === '/' && next === '*') { state = 'block-comment'; i += 1; continue; }
    if (c === EM_DASH) hits.push(line);
  }
  return hits;
}

function offenders() {
  const found = [];
  for (const dir of ROOTS) {
    for (const file of files(dir)) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      if (!src.includes(EM_DASH)) continue;
      const lines = src.split('\n');
      for (const n of saidOutLoud(src)) {
        const text = lines[n - 1];
        const allowed = ALLOWED.some((a) => a.file === file && text.includes(a.fragment));
        if (!allowed) found.push(`${file}:${n}  ${text.trim()}`);
      }
    }
  }
  return found;
}

describe('no em dash in anything the app says', () => {
  it('finds none in any string or any line of JSX text', () => {
    expect(offenders()).toEqual([]);
  });

  it('still catches one when it is put back', () => {
    // The guard is only worth having if it fails. This is the Shortcuts lede as
    // it actually arrived on 08-29, which the suite let through.
    const putBack = `<p className="set-lede">You never need any of them ${EM_DASH} everything here can be clicked.</p>`;
    expect(saidOutLoud(putBack)).toEqual([1]);
    const inAString = `const say = 'Schedule canceled ${EM_DASH} back in the inbox';`;
    expect(saidOutLoud(inAString)).toEqual([1]);
  });

  it('leaves the comments alone, which is why it is usable', () => {
    // Roughly five hundred of these exist and every one of them is fine.
    const prose = `// she picked it ${EM_DASH} on 2026-08-21\n/* and again ${EM_DASH} later */`;
    expect(saidOutLoud(prose)).toEqual([]);
  });

  it('names a reason for each of the three it allows', () => {
    for (const a of ALLOWED) {
      expect(fs.existsSync(path.join(root, a.file))).toBe(true);
      expect(fs.readFileSync(path.join(root, a.file), 'utf8')).toContain(a.fragment);
      expect(a.why.length).toBeGreaterThan(40);
    }
  });
});
