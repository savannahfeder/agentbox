// THE FINDER AGAINST REAL FILESYSTEMS, NOT FAKE `exists` FUNCTIONS.
//
// Every other test of main/engine-bin.mjs hands in `exists`, `readdir` and
// `dangles` as functions. That is the right way to test the STRATEGY and it is
// what keeps the search a pure function somebody can put a tool anywhere for.
// It also means the real `fs.existsSync`, `fs.readdirSync` and `fs.lstatSync`
// branches -- the ones that actually run on somebody's computer -- had never
// once been run against a directory really on a disk.
//
// THE CASE THAT MADE THIS WORTH WRITING is the dangling symlink. `existsSync`
// FOLLOWS a link, so it answers false for a link whose target has gone, which
// is indistinguishable from nothing being there and means the opposite: a tool
// mid-upgrade. `lstatSync` is what tells them apart, and a fake `dangles`
// cannot be wrong about it. Both engines' ordinary installs are exactly that
// shape -- a stable link at a versioned file, swapped on every update -- so
// this is the common case, not an odd one.
//
// Written 2026-10-11 off "test it thoroughly" on w-ce8c1a9275. Every case here
// builds a throwaway home, writes real files into it, and hands in only the
// REAL fs: nothing outside that home exists, so the machine running the suite,
// which has both agents on it, cannot answer for any of them.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findEngine, installEvidence } from '../main/engine-bin.mjs';

const made = [];
afterAll(() => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-disk-'));
  made.push(dir);
  return dir;
}
function put(dir, rel) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '#!/bin/sh\n');
  fs.chmodSync(p, 0o755);
  return p;
}
/** Only this home is on the disk, as far as the search is concerned. */
const only = (h) => (p) => p.startsWith(h) && fs.existsSync(p);
const noShell = () => ({ path: null, answered: true });
const look = (key, h, env = {}) => findEngine(key, { home: h, env, exists: only(h), shellLookup: noShell });

describe('the hand-written list, walked over real files', () => {
  it.each([
    ['claude', '.local/bin/claude'],
    ['claude', '.claude/local/claude'],
    ['claude', 'bin/claude'],
    ['codex', '.local/bin/codex'],
    ['codex', '.codex/packages/standalone/current/bin/codex'],
    ['codex', '.codex/packages/standalone/current/codex'],
    ['codex', '.local/share/pnpm/codex'],
  ])('finds %s at %s', (key, rel) => {
    const h = home();
    const real = put(h, rel);
    expect(look(key, h)).toMatchObject({ path: real, found: true, from: 'disk' });
  });
});

describe('one bin directory per installed Node, really read off the disk', () => {
  it('offers a path per version and takes one that is really there', () => {
    const h = home();
    put(h, '.nvm/versions/node/v18.20.4/bin/claude');
    put(h, '.nvm/versions/node/v22.14.0/bin/claude');
    // A version whose directory exists with no claude in it, which is the case
    // a glob would get wrong.
    fs.mkdirSync(path.join(h, '.nvm/versions/node/v20.11.0/bin'), { recursive: true });

    const r = look('claude', h);
    expect(r.found).toBe(true);
    expect(r.from).toBe('disk');
    expect(r.searched.filter((p) => p.includes('/.nvm/'))).toHaveLength(3);
    expect(r.path).not.toBe(path.join(h, '.nvm/versions/node/v20.11.0/bin/claude'));
  });
});

// THE ONE A FAKE CANNOT BE WRONG ABOUT.
describe('a link that reaches nothing, which is a tool mid-upgrade', () => {
  it('is not found, is not an absence, and is named as the evidence', () => {
    const h = home();
    const target = put(h, 'Caskroom/codex/0.148.0/bin/codex');
    const link = path.join(h, '.local/bin/codex');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
    fs.rmSync(target); // the upgrade, caught mid-swap

    // The shape really is the one this is about, said out loud so a fixture
    // that stops dangling cannot quietly pass.
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(link)).toBe(false);

    const r = look('codex', h);
    expect(r.found).toBe(false);
    // AND THE HALF THAT REACHES THE SCREEN: we may not say Codex is missing.
    expect(r.certain).toBe(false);
    expect(r.evidence).toBe(link);
  });

  // THE BOUNDARY THE OTHER SIDE: a link that reaches a real file is just found.
  it('follows a link that still reaches its file', () => {
    const h = home();
    const target = put(h, 'Caskroom/codex/0.152.1/bin/codex');
    const link = path.join(h, '.local/bin/codex');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
    expect(look('codex', h)).toMatchObject({ path: link, found: true, from: 'disk' });
  });
});

describe('what a tool leaves behind, read off a real directory', () => {
  it('will not call an empty-looking computer empty while a trace is on it', () => {
    const h = home();
    fs.mkdirSync(path.join(h, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(h, '.codex/auth.json'), '{}');
    expect(look('codex', h)).toMatchObject({ found: false, certain: false });
    expect(installEvidence('codex', { home: h, env: {}, exists: only(h) })).toBeTruthy();
  });

  // THE CASE THAT MUST NOT MATCH: a home with nothing in it really is empty,
  // and the screen is entitled to say so.
  it('is certain about a home that has never held either tool', () => {
    const h = home();
    expect(look('claude', h)).toMatchObject({ found: false, certain: true });
    expect(look('codex', h)).toMatchObject({ found: false, certain: true });
  });

  it('follows CODEX_HOME when the directory has been moved, and not when it has not', () => {
    const h = home();
    const moved = home();
    fs.writeFileSync(path.join(moved, 'auth.json'), '{}');
    const seen = (p) => (p.startsWith(h) || p.startsWith(moved)) && fs.existsSync(p);
    const where = { home: h, exists: seen, shellLookup: noShell };
    expect(findEngine('codex', { ...where, env: { CODEX_HOME: moved } })).toMatchObject({ certain: false });
    expect(findEngine('codex', { ...where, env: {} })).toMatchObject({ certain: true });
  });
});

describe('the copy a desktop app carries, sorted off a real listing', () => {
  it('takes the newest by number rather than by spelling, and loses to an install', () => {
    const h = home();
    const where = 'Library/Application Support/Claude/claude-code';
    put(h, `${where}/2.0.99/claude.app/Contents/MacOS/claude`);
    put(h, `${where}/2.1.209/claude.app/Contents/MacOS/claude`);
    put(h, `${where}/2.1.30/claude.app/Contents/MacOS/claude`);

    const inside = look('claude', h);
    expect(inside.from).toBe('app');
    expect(inside.path).toContain('/2.1.209/');

    put(h, '.local/bin/claude');
    expect(look('claude', h).from).toBe('disk');
  });
});

describe('the shell beats the list, on a real disk', () => {
  it('takes what the shell says over a path that is really there', () => {
    const h = home();
    put(h, '.local/bin/claude');
    const theirs = put(h, 'somewhere/odd/claude');
    expect(findEngine('claude', {
      home: h, env: {}, exists: only(h), shellLookup: () => ({ path: theirs, answered: true }),
    })).toMatchObject({ path: theirs, from: 'shell' });
  });

  // The app will not open an inbox without Claude Code, so a probe that blows
  // up may not take it away from somebody who has it.
  it('falls to the list when the shell blows up', () => {
    const h = home();
    const real = put(h, '.local/bin/claude');
    expect(findEngine('claude', {
      home: h, env: {}, exists: only(h), shellLookup: () => { throw new Error('no shell here'); },
    })).toMatchObject({ path: real, found: true, from: 'disk' });
  });
});
