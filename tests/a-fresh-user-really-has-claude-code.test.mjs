// A report that a fresh user was told Claude Code is missing, on a Mac that has
// it, alongside the stuck Submit.
//
// WHAT IS AND IS NOT ESTABLISHED HERE, because the difference matters.
//
// Not established: which window she was looking at. Her own copy was checked
// on 2026-08-23 and `~/.local/bin/claude` is there, so `findClaudeBin` answers
// found on the first of its four paths, and a live probe of both a dev copy and
// the packaged app in a throwaway home answered `claudeFound: true` as well.
// None of the three configurations available that day reproduces the reported line.
//
// Established: exactly one thing in the code can make that line appear on a Mac
// that has Claude Code, and this file is about it. A "new user" copy runs
// inside a throwaway HOME, so the four paths are searched under THAT home and
// the login shell it asks has none of her shell files. `~/.local/bin/claude` is
// on none of her PATHs — measured, `command -v claude` finds nothing — so the
// shell cannot save it either. The whole thing rests on one symlink made by
// `prepareHome`, and `link` used to report that symlink as good WITHOUT EVER
// CHECKING THAT IT RESOLVED: `lstat` does not follow a link, so a dangling one
// answered yes. A throwaway home chained off another that was later tidied
// away, or a target that moved, is exactly that.
//
// So a copy could be launched, report nothing wrong on the way out, and then
// tell the person who opened it that they have no Claude Code. That is a real
// defect whether or not it is the one she hit, and it is the only one in reach
// of that sentence.
//
// AND THE DISK IS HANDED IN, BECAUSE OTHERWISE THIS FILE IS ABOUT THE BUILD
// MACHINE (2026-09-04). `findClaudeBin` searches `candidatePaths`, and four of
// the fifteen are ABSOLUTE and outside any home: /opt/homebrew/bin/claude,
// /usr/local/bin/claude, /opt/local/bin/claude, /usr/bin/claude. Every case
// below builds a throwaway home with no Claude Code in it and then asserts the
// finder says so — but it used the real `fs.existsSync`, so on a Mac with the
// Homebrew cask the finder correctly answered FOUND off
// `/opt/homebrew/bin/claude -> /opt/homebrew/Caskroom/claude-code/1.0.108/claude`
// and three assertions read `expected true to be false`. The finder was right
// every time; the test was describing whoever ran it.
//
// WHAT IS AND IS NOT STUBBED, because the whole value of this file is that it
// is not weakened. `findClaudeBin` already takes `exists` and `dangles` for
// exactly this, and NOTHING ELSE IS REPLACED: the real `candidatePaths` list is
// still walked in order, `versionedPaths` still reads the throwaway home's own
// version-manager directories off the real disk, the shell step is still asked
// and still answers in its two different silences, and `certain` is still
// computed from `answered && !evidence` by the code under test. The one thing
// handed in is the answer to "what else is on this disk", which is the one thing
// a test cannot control and the one thing the claim must not depend on: a fresh
// user's Mac with no system-wide install is the machine being described, so that
// is the machine that gets described. `stillFindsASystemWideOne` at the bottom
// of the first block is the case that must NOT match, and it exists so this
// stub can never quietly become "answer false to everything".

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareHome, freshEnv } from '../shared/fresh-user-home.mjs';
import { candidatePaths, findClaudeBin } from '../main/claude-bin.mjs';

const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `zero-${tag}-`));

/**
 * A symlink that reaches nothing, which is what `defaultDangles` answers about
 *  and is a real state: the installer points ~/.local/bin/claude at a versioned
 *  file and swaps that file on every update. */
const dangling = (p) => {
  try { return !!fs.lstatSync(p) && !fs.existsSync(p); } catch { return false; }
};

/**
 * THE DISK, AS A MAC THAT HAS ONLY THIS HOME ON IT.
 *
 * Truthful about everything inside `home` and about nothing outside it, so a
 * Homebrew, MacPorts or system install on whatever machine is running the suite
 * cannot answer a question this file is asking about a fresh user's Mac.
 *
 * `also` is how a machine that DOES have one somewhere is described, which is
 * the other half of the same fact and is asserted below.
 */
function diskWithOnly(home, also = []) {
  const inside = (p) => String(p) === home || String(p).startsWith(`${home}${path.sep}`);
  const extra = new Set(also);
  return {
    exists: (p) => extra.has(String(p)) || (inside(p) && fs.existsSync(p)),
    dangles: (p) => inside(p) && dangling(p),
  };
}

/**
 * A shell with no Claude Code on its PATH that RAN and said so, which is the
 *  half that entitles a screen to claim an absence. */
const shellSaidNo = () => ({ path: null, answered: true });

/** A pretend real home with Claude Code installed the way hers is. */
function realHomeWithClaude() {
  const home = tmp('realhome');
  const bin = path.join(home, '.local/bin/claude');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, '#!/bin/sh\n');
  return { home, bin };
}

describe('a throwaway home is where the line can appear at all', () => {
  it('a home with no claude in it, asked by a shell that has none either, says missing and means it', () => {
    const home = tmp('bare');
    const found = findClaudeBin({ home, shellLookup: shellSaidNo, ...diskWithOnly(home) });
    expect(found.found).toBe(false);
    // Certain is the half that puts the sentence on the screen.
    expect(found.certain).toBe(true);
    // And it looked only under THAT home, which is the point.
    expect(found.searched.slice(0, 2)).toEqual(candidatePaths(home).slice(0, 2));
    // It really did walk the whole list rather than stopping at the home's own
    // two, which is what makes the case below a different question and not a
    // restatement of this one.
    expect(found.searched).toEqual(expect.arrayContaining(['/opt/homebrew/bin/claude', '/usr/local/bin/claude']));
  });

  // THE CASE THAT MUST NOT MATCH. A throwaway home on a Mac that has Claude Code
  // installed system-wide finds it, and no sentence about missing software is
  // earned. This is the state the machine that wrote this comment is really in,
  // and it is why the three cases either side of it hand the disk in: without
  // this one, "answer false to everything" would pass the whole file.
  it('still finds a system-wide install from inside a throwaway home', () => {
    const home = tmp('brewed');
    const found = findClaudeBin({
      home,
      shellLookup: () => { throw new Error('the shell must not be needed'); },
      ...diskWithOnly(home, ['/opt/homebrew/bin/claude']),
    });
    expect(found.found).toBe(true);
    expect(found.path).toBe('/opt/homebrew/bin/claude');
    expect(found.from).toBe('disk');
  });

  it('a shell that could not answer keeps the screen quiet, which is her rule', () => {
    const home = tmp('bare2');
    const found = findClaudeBin({
      home, shellLookup: () => ({ path: null, answered: false }), ...diskWithOnly(home),
    });
    expect(found.found).toBe(false);
    expect(found.certain).toBe(false);
  });
});

describe('the one symlink the whole thing rests on', () => {
  it('links Claude Code through, so a fresh copy finds it on the first path', () => {
    const real = realHomeWithClaude();
    const fresh = tmp('fresh');
    const prepared = prepareHome(fresh, { realHome: real.home });

    expect(prepared.claudeBin).toBe(true);
    expect(fs.existsSync(path.join(fresh, '.local/bin/claude'))).toBe(true);
    // Which is what the app will conclude, with no shell involved.
    const found = findClaudeBin({
      home: fresh,
      shellLookup: () => { throw new Error('the shell must not be needed'); },
      ...diskWithOnly(fresh),
    });
    expect(found.found).toBe(true);
    expect(found.from).toBe('disk');
    // ON THE FIRST PATH, said out loud. Without the disk handed in, a machine
    // with Homebrew's copy would satisfy `found` and `from` off /opt/homebrew
    // and the link this whole case is about would be doing nothing.
    expect(found.path).toBe(path.join(fresh, '.local/bin/claude'));
  });

  it('does not believe a link whose target is gone, and mends it', () => {
    // THE DEFECT. A throwaway home is prepared, the thing it pointed at goes
    // away, and the home is prepared again — chaining off a home that was later
    // tidied is exactly this shape.
    const real = realHomeWithClaude();
    const fresh = tmp('dangling');
    prepareHome(fresh, { realHome: real.home });
    fs.rmSync(path.join(real.home, '.local/bin/claude'));

    const link = path.join(fresh, '.local/bin/claude');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true); // still there
    expect(fs.existsSync(link)).toBe(false);                // and reaches nothing

    // Prepared again against a home that really has it: the dead link is
    // replaced rather than trusted.
    const again = realHomeWithClaude();
    const prepared = prepareHome(fresh, { realHome: again.home });
    expect(prepared.claudeBin).toBe(true);
    expect(fs.existsSync(link)).toBe(true);
    expect(findClaudeBin({ home: fresh, shellLookup: shellSaidNo, ...diskWithOnly(fresh) }).found).toBe(true);
  });

  it('says no when there is nothing to link, rather than yes to a dead link', () => {
    const fresh = tmp('nothing');
    const emptyHome = tmp('empty');
    const prepared = prepareHome(fresh, { realHome: emptyHome });
    expect(prepared.claudeBin).toBe(false);
    // And the copy launched into it really would say Claude Code is missing,
    // which is the truth about that copy and is why the note exists.
    const found = findClaudeBin({ home: fresh, shellLookup: shellSaidNo, ...diskWithOnly(fresh) });
    expect(found.found).toBe(false);
    // AND IT IS ENTITLED TO SAY SO, which is the half that reaches the screen.
    // Nothing Claude Code leaves behind is in that home either, so there is no
    // evidence to hold the sentence back.
    expect(found.certain).toBe(true);
    expect(found.evidence).toBe(null);
  });

  it('what it reports is always what the fresh copy will see', () => {
    // The narrow claim, stated on its own so it cannot be lost in a rewrite of
    // the case above: the answer is never a description of what we TRIED. Three
    // states, and the middle one is the defect: a dangling link with a real
    // source used to report true while resolving to nothing.
    const link = (home) => path.join(home, '.local/bin/claude');
    const check = (fresh, realHome) =>
      expect(prepareHome(fresh, { realHome }).claudeBin).toBe(fs.existsSync(link(fresh)));

    const fresh = tmp('report');
    check(fresh, tmp('empty-source'));         // nothing to link
    const real = realHomeWithClaude();
    check(fresh, real.home);                   // linked, and it resolves
    fs.rmSync(link(real.home));                // the target goes away
    check(fresh, realHomeWithClaude().home);   // dangling, mended
  });
});

describe('the throwaway home is really the copy home', () => {
  it('moves both variables, because HOME alone does not move Chromium', () => {
    const env = freshEnv('/tmp/somewhere', { PATH: '/usr/bin', HOME: '/Users/real' });
    expect(env.HOME).toBe('/tmp/somewhere');
    expect(env.CFFIXED_USER_HOME).toBe('/tmp/somewhere');
    expect(env.PATH).toBe('/usr/bin');
  });
});
