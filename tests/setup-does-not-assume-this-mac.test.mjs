// NOTHING THE APP DOES MAY BE TRUE ONLY ON HER MAC.
//
// Agentbox is downloaded now, so every person who runs it is a person whose home
// directory is not `/Users/you`, whose folders are not `~/Desktop/dev`, and who
// has Claude Code somewhere Homebrew or nvm or Volta put it. The parts of this
// that involve reading the disk are already tested (a stranger's Mac boots the
// store, Claude Code is found wherever it is, a second account gets its
// tooling). What was not tested is simpler and quieter: a path with her
// username in it, sitting in shipped code as a default, doing the right thing
// on her machine and the wrong thing on everybody else's.
//
// One was really there when this file was written. `shortPath` in
// shared/work-lines.mjs took `home = '/Users/you'`, and `workSubject` called it
// without a home, so a work line under a running agent read
//
//   ~/notes.md              on her Mac
//   /Users/leon/notes.md    on his
//
// which is the one thing that file exists to prevent: measured over her 535
// work lines, 61% ran past the end of the box and the readable part was all
// prefix. It only ever showed up as somebody else's screen being worse.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstRunNeeded, forcedStep } from '../renderer/src/onboarding.ts';
import { workSubject } from '../shared/work-lines.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/**
 * Every source file the app really ships, walked. `renderer/src/fixtures.ts`
 *  is left out on purpose: it is the made-up store the design shots are drawn
 *  against, and its paths are meant to look like hers. */
const SKIP_FILES = new Set(['renderer/src/fixtures.ts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'assets', 'games', 'editor']);

/**
 * THE TWO LINES THAT ARE ALLOWED TO NAME HER MAC, AND WHY EACH ONE IS.
 *
 *  Both stand behind the fixtures switch, which only answers in a page with no
 *  main process behind it. They exist so a screen that is only reachable
 *  through the Mac's own dialogs can be PHOTOGRAPHED in the real app instead of
 *  hand drawn, and neither can be reached by anybody who downloaded Agentbox.
 *
 *  Adding to this list is a decision, not a formality: whatever goes in it is a
 *  line somebody has read and found to be unreachable in a shipped app. */
const FIXTURE_ONLY = [
  {
    file: 'renderer/src/api.ts',
    contains: "return { path: '/Users/you/Desktop/dev/house' };",
    guard: 'useFixtures',
    why: 'the folder the fixtures answer the Mac dialog with, so the new-project card can be shot',
  },
];

function sources(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) sources(rel, out);
      continue;
    }
    if (!/\.(mjs|cjs|ts|tsx)$/.test(e.name)) continue;
    if (SKIP_FILES.has(rel)) continue;
    out.push(rel);
  }
  return out;
}

/**
 * The code, with the comments taken out. This file is about what RUNS: half
 *  the paths in this repo are in comments quoting a measurement off her screen,
 *  and those are the record of why a thing is the way it is. */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, '$1'))
    .join('\n');
}

describe('a home directory nobody typed', () => {
  const files = [...sources('main'), ...sources('shared'), ...sources('renderer/src'), 'preload.cjs'];

  it('finds real source to look at, so a broken walk cannot pass this quietly', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain('shared/work-lines.mjs');
    expect(files).toContain('renderer/src/onboarding.ts');
  });

  it('is nowhere in the code that runs', () => {
    const found = [];
    for (const rel of files) {
      const code = codeOnly(fs.readFileSync(path.join(root, rel), 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (!/\/Users\/[A-Za-z0-9._-]+/.test(line)) return;
        if (FIXTURE_ONLY.some((a) => a.file === rel && line.includes(a.contains))) return;
        found.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(found, `a path off one machine, in code that ships:\n${found.join('\n')}`).toEqual([]);
  });

  it('is only ever allowed behind a fixtures switch, and each one says why', () => {
    // The allowlist is not a way past this test, it is the list of lines that
    // have been LOOKED AT. Every one has to still be there and still be behind
    // the switch, so deleting the guard and leaving the path fails here.
    for (const a of FIXTURE_ONLY) {
      const text = fs.readFileSync(path.join(root, a.file), 'utf8');
      expect(text, `${a.file} no longer holds ${a.contains}`).toContain(a.contains);
      expect(text, `${a.file} lost its fixtures switch`).toContain(a.guard);
    }
  });

  it('is nowhere in the code as a default argument, which is how the last one hid', () => {
    const found = [];
    for (const rel of files) {
      const code = codeOnly(fs.readFileSync(path.join(root, rel), 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (/=\s*['"`]\/(Users|home)\b/.test(line)) found.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(found, found.join('\n')).toEqual([]);
  });
});

describe('the path under a running agent', () => {
  it('says ~ on the Mac it is actually running on', () => {
    const home = os.homedir();
    expect(workSubject({ file_path: `${home}/notes.md` }, '', home)).toBe('~/notes.md');
    // And on somebody else's, told whose it is.
    expect(workSubject({ file_path: '/Users/leon/notes.md' }, '', '/Users/leon')).toBe('~/notes.md');
    expect(workSubject({ file_path: '/Users/leon/notes.md' }, '', '/Users/you'))
      .toBe('/Users/leon/notes.md');
  });

  it('is still relative inside the folder the session is running in', () => {
    expect(workSubject({ file_path: '/Users/leon/dev/site/src/app.ts' }, '/Users/leon/dev/site', '/Users/leon'))
      .toBe('src/app.ts');
  });

  it('shortens nothing when nobody said whose Mac it is, rather than guessing', () => {
    expect(workSubject({ file_path: '/Users/leon/notes.md' }, '')).toBe('/Users/leon/notes.md');
  });
});

describe('whether the walk runs at all on this Mac', () => {
  it('runs on a store with nothing in it, which is the only honest new install', () => {
    expect(firstRunNeeded({ products: 0, done: false })).toBe(true);
  });

  it('does not run again for somebody who already has projects', () => {
    expect(firstRunNeeded({ products: 1, done: false })).toBe(false);
    expect(firstRunNeeded({ products: 12, done: false })).toBe(false);
  });

  it('does not run again for somebody who finished it and then deleted everything', () => {
    expect(firstRunNeeded({ products: 0, done: true })).toBe(false);
  });

  it('runs when it is asked for, whatever the machine looks like', () => {
    // ⌘K "Walk through onboarding again", and `?firstrun=1`. This is the row
    // she asked for on 08-23 so a downloaded app can be seen as a new user
    // without throwing the install away.
    expect(firstRunNeeded({ products: 9, done: true, forced: true })).toBe(true);
  });
});

describe('opening the walk at a named step', () => {
  it('opens at the beginning on 1', () => {
    expect(forcedStep('1')).toBe('welcome');
  });

  it('opens at a step this version really has', () => {
    for (const step of ['welcome', 'folder', 'name',
      // The introduction, in front of the app since 2026-08-23.
      'inbox', 'away', 'goal', 'hand',
      'make', 'task', 'working', 'open', 'answer',
      'clear', 'unblock', 'command', 'done', 'landed']) {
      expect(forcedStep(step)).toBe(step);
    }
  });

  it('refuses a step this version has deleted, rather than opening the welcome', () => {
    // `agents` and `zero` were both beats of this walk within the last week. A
    // typo or a stale bookmark that silently means "the welcome" is how a shot
    // of the wrong screen gets filed as the right one.
    expect(forcedStep('agents')).toBe(null);
    expect(forcedStep('zero')).toBe(null);
    // `inbox` used to be on this list and it is a real step now: it is the
    // first slab of the introduction. `practice` is the near-miss that replaces
    // it, because the practice project is the thing somebody would guess a step
    // was called and the step is `hand`.
    expect(forcedStep('practice')).toBe(null);
    expect(forcedStep('')).toBe(null);
    expect(forcedStep(null)).toBe(null);
  });
});
