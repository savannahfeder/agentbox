// Agentbox looked for Claude Code in one place and gave up quietly.
//
// The one place was `~/.local/bin/claude`, where Claude Code's own installer
// puts it. Anyone who installed through npm or Homebrew has it somewhere else,
// so the app found nothing, drew a grey dot saying "missing", and said nothing
// about what was wrong or where to get it.
//
// These pin the two halves of the fix: the search finds it in every normal
// place (and asks the shell for the ones no list can cover), and when it truly
// is not there the app says so rather than reporting a path as if it were fine.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findClaudeBin, candidatePaths, askShell, resolveClaudeBin, forgetClaudeBin, INSTALL_URL,
} from '../main/claude-bin.mjs';
import { claudeState } from '../main/settings.mjs';

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const noShell = () => null;

describe('finding Claude Code', () => {
  it('finds the installer path, which is the one it always knew', () => {
    const found = findClaudeBin({
      home: HOME, exists: only(`${HOME}/.local/bin/claude`), shellLookup: noShell,
    });
    expect(found).toMatchObject({ path: `${HOME}/.local/bin/claude`, found: true, from: 'disk' });
  });

  // The bug itself. Each of these machines used to report "missing".
  it.each([
    ['claude migrate-installer', `${HOME}/.claude/local/claude`],
    ['Homebrew on Apple Silicon', '/opt/homebrew/bin/claude'],
    ['Homebrew on Intel, and npm -g', '/usr/local/bin/claude'],
  ])('finds it after %s', (_how, where) => {
    const found = findClaudeBin({ home: HOME, exists: only(where), shellLookup: noShell });
    expect(found).toMatchObject({ path: where, found: true, from: 'disk' });
  });

  it('asks the shell when none of the known paths have it, which is how nvm and volta are found', () => {
    const viaNvm = `${HOME}/.nvm/versions/node/v22.3.0/bin/claude`;
    const found = findClaudeBin({
      home: HOME, exists: only(viaNvm), shellLookup: () => viaNvm,
    });
    expect(found).toMatchObject({ path: viaNvm, found: true, from: 'shell' });
    // And it only pays for the subprocess after the cheap checks miss.
    expect(found.searched).toEqual(candidatePaths(HOME));
  });

  it('says not found rather than naming a path that is not there', () => {
    const found = findClaudeBin({ home: HOME, exists: () => false, shellLookup: noShell });
    expect(found).toMatchObject({ path: null, found: false, from: null });
  });

  it('never searches around a claudeBin she set herself', () => {
    const hers = '/somewhere/she/chose/claude';
    const found = findClaudeBin({
      configured: hers,
      home: HOME,
      exists: only(hers, '/opt/homebrew/bin/claude'),
      shellLookup: () => { throw new Error('must not shell out over her setting'); },
    });
    expect(found).toMatchObject({ path: hers, found: true, from: 'settings' });
  });

  it('keeps her path but reports not found when her path is not there', () => {
    // The path stays hers so anything that spawns it fails naming HER path,
    // while the screen still offers the install link like any other machine.
    const found = findClaudeBin({ configured: '/gone/claude', home: HOME, exists: () => false });
    expect(found).toMatchObject({ path: '/gone/claude', found: false, from: 'settings' });
  });
});

describe('asking the shell', () => {
  const shellSaying = (text) => () => text;

  it('takes an absolute path that exists', () => {
    expect(askShell({
      env: { SHELL: '/bin/zsh' }, exists: () => true, run: shellSaying('/usr/local/bin/claude\n'),
    })).toMatchObject({ path: '/usr/local/bin/claude', answered: true });
  });

  it('uses a login, interactive shell, because that is where nvm puts itself on PATH', () => {
    let seen = null;
    askShell({
      env: { SHELL: '/bin/zsh' }, exists: () => true,
      run: (shell, args) => { seen = [shell, args]; return '/x/claude'; },
    });
    expect(seen[0]).toBe('/bin/zsh');
    expect(seen[1][0]).toBe('-lic');
  });

  it('refuses a shell function or alias, which spawn() cannot run', () => {
    // It still ANSWERED. The shell ran and what it printed is not something
    // that can be spawned, which is a fact about this machine.
    expect(askShell({
      env: {}, exists: () => true, run: shellSaying('claude () {\n\tnode /x/cli.js\n}\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  it('refuses a path the shell named that is not on disk', () => {
    expect(askShell({
      env: {}, exists: () => false, run: shellSaying('/gone/claude\n'),
    })).toMatchObject({ path: null, answered: true });
  });

  // THE HALF THAT USED TO BE THROWN AWAY. A shell that exits non-zero has told
  // us claude is not on PATH. A shell that times out, or that does not exist,
  // has told us nothing, and the two used to arrive here as the same null.
  it('counts a non-zero exit as the shell saying no', () => {
    const exited = Object.assign(new Error('exit 1'), { status: 1 });
    expect(askShell({
      env: {}, exists: () => true, run: () => { throw exited; },
    })).toMatchObject({ path: null, answered: true });
  });

  it('counts a timeout as no answer at all', () => {
    const timedOut = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', signal: 'SIGTERM' });
    expect(askShell({
      env: {}, exists: () => true, run: () => { throw timedOut; },
    })).toMatchObject({ path: null, answered: false });
  });

  it('counts a shell that will not start as no answer at all', () => {
    const gone = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    expect(askShell({
      env: { SHELL: '/bin/nope' }, exists: () => true, run: () => { throw gone; },
    })).toMatchObject({ path: null, answered: false });
  });
});

// WHETHER THE ANSWER IS WORTH DRAWING. Only a search that got an answer may
// put "the app could not find Claude Code on this Mac" on somebody's screen.
describe('how sure the search is', () => {
  it('is sure when it found the file', () => {
    const found = findClaudeBin({ home: HOME, exists: only(`${HOME}/.local/bin/claude`), shellLookup: noShell });
    expect(found).toMatchObject({ found: true, certain: true });
  });

  it('is sure when nothing is on disk and the shell answered', () => {
    const found = findClaudeBin({ home: HOME, exists: () => false, shellLookup: () => ({ path: null, answered: true }) });
    expect(found).toMatchObject({ found: false, certain: true });
  });

  it('is NOT sure when nothing is on disk and the shell never answered', () => {
    const found = findClaudeBin({ home: HOME, exists: () => false, shellLookup: () => ({ path: null, answered: false }) });
    expect(found).toMatchObject({ found: false, certain: false });
  });

  it('is sure about a path she set herself, either way', () => {
    expect(findClaudeBin({ configured: '/gone/claude', home: HOME, exists: () => false }))
      .toMatchObject({ found: false, certain: true });
  });

  it('still reads a bare path from a lookup, which is what askShell used to return', () => {
    const viaNvm = `${HOME}/.nvm/versions/node/v22.3.0/bin/claude`;
    const found = findClaudeBin({ home: HOME, exists: only(viaNvm), shellLookup: () => viaNvm });
    expect(found).toMatchObject({ path: viaNvm, found: true, certain: true, from: 'shell' });
  });
});

describe('what the settings screen is told', () => {
  it('carries the sentence it needs: not found, and where to get it', () => {
    forgetClaudeBin();
    const state = claudeState({ claudeBinConfigured: '/definitely/not/here/claude', claudeBin: '/definitely/not/here/claude' });
    expect(state.claudeFound).toBe(false);
    // And that this is a real answer, which is what lets a screen say it.
    expect(state.claudeCertain).toBe(true);
    expect(state.claudeInstallUrl).toBe(INSTALL_URL);
    expect(INSTALL_URL).toMatch(/^https:\/\//);
  });

  it('reports found, with the real path, when it is really there', () => {
    forgetClaudeBin();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-bin-'));
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, '#!/bin/sh\n');
    const state = claudeState({ claudeBinConfigured: bin, claudeBin: bin });
    expect(state).toMatchObject({ claudeBin: bin, claudeFound: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The screen tells them to install it and come back. If a not-found answer
  // were cached for the life of the process, coming back would still say no.
  it('looks again after a not-found answer, so installing it and returning works', () => {
    forgetClaudeBin();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-bin-'));
    const bin = path.join(dir, 'claude');
    const config = { claudeBinConfigured: bin, claudeBin: bin };

    expect(claudeState(config).claudeFound).toBe(false);
    fs.writeFileSync(bin, '#!/bin/sh\n'); // they install it
    expect(claudeState(config).claudeFound).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The shell is the only expensive step and the only one held, so a screen
  // that is read again after every switch she flips does not pay for it each
  // time. Everything else is a stat call and is never cached, which is what
  // makes "install it, then open this screen again" true.
  it('asks the shell once inside its window, and again after it', () => {
    forgetClaudeBin();
    let asks = 0;
    const t0 = 1_000_000;
    const bare = { home: HOME, exists: () => false, shellLookup: () => { asks += 1; return null; } };

    resolveClaudeBin(null, { ...bare, now: t0 });
    resolveClaudeBin(null, { ...bare, now: t0 + 1_000 });
    resolveClaudeBin(null, { ...bare, now: t0 + 29_999 });
    expect(asks).toBe(1);

    resolveClaudeBin(null, { ...bare, now: t0 + 30_001 });
    expect(asks).toBe(2);
    forgetClaudeBin();
  });
});
