// THE WAY OUT OF A SEARCH THAT MISSED, AND IT IS NOT A RELEASE.
//
// The note this came from (w-e217e577e5): "It has a really hard time finding the
// install on the person's computer, and we keep having bug reports and then
// patching that specific case. We want to solve this in a generalist way."
//
// Asking the login shell first (main/engine-bin.mts) covers every installer a
// person's own PATH knows about, which is most of them. It cannot cover the rest:
// a wrapper script somewhere nobody would guess, a tool on a volume, a machine
// whose login shell will not start at all. For those, every fix used to be a
// path we ship and a release they wait for -- and `claudeBin` in
// zero.config.json, which is a file nobody is told about and which the app gives
// no way to edit.
//
// So there is a door on the screen now: point Agentbox at the file yourself, in
// Settings and on the last card of the walk, and it stops being blocked on us.
//
// WHAT THIS PINS, and the refusals are most of it: a chosen path is never
// searched around, it is written where a restart will still find it, it can be
// given back so the search takes over again, and the three things that are not a
// coding agent are refused with a sentence rather than written to the config and
// discovered at spawn.
//
// AND NO PATH FROM THE RENDERER IS EVER TRUSTED. The picker opens in the main
// process and applies in the same call, the way `zero:project-icon` already
// does, so the only path that crosses the bridge is one the open panel itself
// produced. tests/where-codex-runs-from-is-not-a-file-a-worker-can-write.test.mts
// is the sibling rule about the same config key.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pointAtEngineBin, searchForEngineBin, claudeState, codexState,
} from '../main/settings.mts';
import { forgetClaudeBin } from '../main/claude-bin.mts';
import { forgetCodexBin } from '../main/codex-bin.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** An app directory with a config file in it, which is what saveConfig needs. */
function install(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'point-at-'));
  fs.writeFileSync(path.join(dir, 'zero.config.json'), `${JSON.stringify(overrides, null, 2)}\n`);
  return { dir, config: { appDir: dir, ...overrides } };
}

/** A file that is really there and really runnable. */
function runnable(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'point-bin-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, '#!/bin/sh\necho hello\n');
  fs.chmodSync(file, 0o755);
  return file;
}

const onDisk = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));

describe('pointing the app at the file yourself', () => {
  it.each([
    ['claude', 'claudeBin'],
    ['codex', 'codexBin'],
  ])('takes a %s somebody chose, and writes it where a restart will find it', (engine, key) => {
    forgetClaudeBin();
    forgetCodexBin();
    const { dir, config } = install();
    const chosen = runnable(engine);

    const r = pointAtEngineBin(config, engine, chosen);
    expect(r.ok).toBe(true);
    // On the live object, because every consumer reads config.* per call and a
    // setting that waits for a restart is the same failure as a fix that is not
    // running.
    expect(config[key]).toBe(chosen);
    expect(config[`${engine}BinConfigured`]).toBe(chosen);
    // And on disk, because that is the half that survives the restart.
    expect(onDisk(dir)[key]).toBe(chosen);
  });

  // AND THE FACT THE FLEET ACTUALLY SPAWNS ON MOVES WITH IT, which is the half
  // a write to the file alone would miss. The two engines keep that fact in
  // different places and both are deliberate (main/settings.mts, the rechecks):
  // `claudeFound` is what `Supervisor#_enginesFound` reads, and a null
  // `codexBin` is what `engineFor` reads as "this computer cannot run Codex".
  it('puts the fact the fleet reads in step with the choice, for either one', () => {
    forgetClaudeBin();
    forgetCodexBin();
    const { config } = install();
    pointAtEngineBin(config, 'claude', runnable('claude'));
    expect(config.claudeFound).toBe(true);
    const codex = runnable('codex');
    pointAtEngineBin(config, 'codex', codex);
    expect(config.codexBin).toBe(codex);
  });

  it('is what the screen then reads, and the screen says it was chosen', () => {
    forgetClaudeBin();
    forgetCodexBin();
    const { config } = install();
    const claude = runnable('claude');
    const codex = runnable('codex');

    pointAtEngineBin(config, 'claude', claude);
    pointAtEngineBin(config, 'codex', codex);

    expect(claudeState(config)).toMatchObject({ claudeBin: claude, claudeFound: true, claudeChosen: true });
    expect(codexState(config)).toMatchObject({ bin: codex, found: true, chosen: true });
  });

  // THE PROMISE THAT MAKES THIS A WAY OUT AT ALL. A chosen path is never
  // searched around, so a tool the search would have found somewhere else does
  // not quietly win over the one somebody pointed at.
  it('never searches around a chosen path, even when the search would find another', () => {
    forgetClaudeBin();
    const { config } = install();
    const chosen = runnable('claude');
    pointAtEngineBin(config, 'claude', chosen);
    expect(claudeState(config).claudeBin).toBe(chosen);
    // The machine running this suite has its own Claude Code somewhere; the
    // chosen one wins regardless of where that is.
    expect(claudeState(config).claudeChosen).toBe(true);
  });

  // AND GIVING IT BACK PUTS THE SEARCH IN CHARGE AGAIN, which is the other half:
  // a wrong choice that could only be undone by hand-editing a file nobody is
  // told about is not a door, it is a trap.
  it.each([
    ['claude', 'claudeBin'],
    ['codex', 'codexBin'],
  ])('hands %s back to the search, and takes the key out of the file', (engine, key) => {
    forgetClaudeBin();
    forgetCodexBin();
    const chosen = runnable(engine);
    const { dir, config } = install({ [key]: chosen });
    config[`${engine}BinConfigured`] = chosen;

    const r = searchForEngineBin(config, engine);
    expect(r.ok).toBe(true);
    expect(config[`${engine}BinConfigured`]).toBe(null);
    expect(key in onDisk(dir)).toBe(false);
  });
});

/* ------------------------------ the refusals ------------------------------ */

// THE CASES THAT MUST NOT MATCH. Each of these used to be possible by hand in
// zero.config.json and each of them becomes a spawn that fails once per row,
// with a message about a file nobody meant to name.
describe('what is refused, with a sentence instead of a broken fleet', () => {
  it('refuses a path with nothing at it', () => {
    const { dir, config } = install();
    const r = pointAtEngineBin(config, 'claude', '/definitely/not/here/claude');
    expect(r.ok).toBe(false);
    expect(r.say).toMatch(/could not find/i);
    expect('claudeBin' in onDisk(dir)).toBe(false);
    expect(config.claudeBinConfigured).toBeUndefined();
  });

  it('refuses a folder, because the file inside it is the thing', () => {
    const { dir, config } = install();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'point-folder-'));
    const r = pointAtEngineBin(config, 'claude', folder);
    expect(r.ok).toBe(false);
    expect(r.say).toMatch(/folder/i);
    expect('claudeBin' in onDisk(dir)).toBe(false);
  });

  // THE BOUNDARY EITHER SIDE. A readable file that cannot be run is the shape a
  // README, a log or a half-downloaded file has, and it is the one that would
  // otherwise be written to the config and fail at spawn.
  it('refuses a file that cannot be run, and takes the same file once it can be', () => {
    forgetClaudeBin();
    const { config } = install();
    const file = runnable('claude');
    fs.chmodSync(file, 0o644);
    expect(pointAtEngineBin(config, 'claude', file)).toMatchObject({ ok: false });
    fs.chmodSync(file, 0o755);
    expect(pointAtEngineBin(config, 'claude', file)).toMatchObject({ ok: true });
  });

  it('refuses a relative path, which is a path about nowhere in particular', () => {
    const { config } = install();
    expect(pointAtEngineBin(config, 'claude', 'claude')).toMatchObject({ ok: false });
  });

  it('refuses a coding agent nobody declared, rather than inventing a config key', () => {
    const { dir, config } = install();
    expect(pointAtEngineBin(config, 'gemini', runnable('gemini'))).toMatchObject({ ok: false });
    expect(searchForEngineBin(config, 'gemini')).toMatchObject({ ok: false });
    expect('geminiBin' in onDisk(dir)).toBe(false);
  });
});

/* --------------------------- and it is on the screen ---------------------- */

// A door nobody can find is not a door. These are text checks for the same
// reason the Codex card's are: the rows are two hundred lines apart in a file
// that no test renders, and what matters is that both surfaces offer it and
// that the picker never takes a path from the window.
describe('the door is on both surfaces, and the picker opens in main', () => {
  const ipc = read('main/ipc.mts');
  const settings = read('renderer/src/components/Settings.tsx');
  const onboarding = read('renderer/src/components/Onboarding.tsx');

  it('opens the picker and applies it in one call, so no path crosses the bridge', () => {
    expect(ipc).toMatch(/zero:engine-bin/);
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:engine-bin'"));
    const block = handler.slice(0, handler.indexOf('ipcMain.handle', 10));
    expect(block).toMatch(/showOpenDialog/);
    expect(block).toMatch(/pointAtEngineBin/);
    expect(block).toMatch(/searchForEngineBin/);
    // The window hands over which engine it is asking about, and nothing else.
    expect(block).not.toMatch(/payload\.path|\{\s*path\s*\}/);
  });

  it('is a row on the Settings card for either coding agent', () => {
    expect(settings).toMatch(/pointAt|engineBin/);
    expect(settings).toMatch(/Choose/);
  });

  // AND ON THE PLAN QUESTION, WHICH IS WHERE IT REALLY BELONGS (w-ce8c1a9275,
  // 2026-10-09). It was a third button on the walk's last card; the founder
  // called that rough and pointed at the component the walk already has for
  // choosing a harness, so it is a row on the plan question and the last card
  // draws the same list. tests/already-have-one-is-an-answer-to-which-plan
  // holds the shape of both.
  it('is offered in the walk too, where somebody is stuck', () => {
    expect(onboarding).toMatch(/gateRows/);
    expect(read('renderer/src/plan-setup.ts')).toMatch(/haveOne/);
  });

  it('is reachable from the window at all, which is the bridge', () => {
    expect(read('preload.cjs')).toMatch(/zero:engine-bin/);
    expect(read('renderer/src/api.ts')).toMatch(/engineBin/);
  });

  // Cancelling the panel is not a failure and must not draw one.
  it('treats a cancelled panel as nothing happening', () => {
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:engine-bin'"));
    expect(handler.slice(0, 2000)).toMatch(/canceled/);
  });
});
