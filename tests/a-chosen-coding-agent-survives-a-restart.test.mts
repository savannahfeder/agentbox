// A PATH SOMEBODY CHOSE IS STILL THE PATH AFTER THE APP IS CLOSED AND OPENED.
//
// That is what the Settings row and the walk's "I already have one" actually
// promise, and it was the one half of w-ce8c1a9275 with no test behind it.
// tests/you-can-point-agentbox-at-the-coding-agent-yourself checks that the key
// lands in zero.config.json; what it never did was READ THAT FILE BACK. The
// promise goes through `loadConfig`, which re-reads the file from disk and runs
// the whole finder over it again, and none of that was being exercised.
//
// Written 2026-10-11 off "test it thoroughly".
//
// It also walks every refusal the way main/ipc.mts hits it, because a path that
// is written and later refused by `spawn` is a fleet that dies once per row,
// naming a file nobody meant to name.

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mts';
import { pointAtEngineBin, searchForEngineBin, claudeState, codexState } from '../main/settings.mts';
import { forgetClaudeBin } from '../main/claude-bin.mts';
import { forgetCodexBin } from '../main/codex-bin.mts';

const made = [];
afterAll(() => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });
// The shell answer is held for thirty seconds and a restart is not. Forgetting
// it is what makes each `loadConfig` below a real second launch.
beforeEach(() => { forgetClaudeBin(); forgetCodexBin(); });

/** An app directory and a home, the shape a real install has. */
function install() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chosen-app-'));
  made.push(dir);
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(dir, 'zero.config.json'), '{}\n');
  return { dir, home };
}
function runnable(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chosen-bin-'));
  made.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, '#!/bin/sh\necho hi\n');
  fs.chmodSync(file, 0o755);
  return file;
}
const onDisk = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));
/** Close the app and open it again. */
const relaunch = (dir, home) => { forgetClaudeBin(); forgetCodexBin(); return loadConfig(dir, { home }); };

describe('choosing it, and finding it still chosen next launch', () => {
  it.each([
    ['claude', 'claudeBin', 'claudeBinConfigured', 'claudeFrom'],
    ['codex', 'codexBin', 'codexBinConfigured', 'codexFrom'],
  ])('keeps the %s somebody chose across a restart', (engine, bin, set, from) => {
    const { dir, home } = install();
    const chosen = runnable(engine);

    const first = loadConfig(dir, { home });
    expect(first[set]).toBe(null);

    expect(pointAtEngineBin(first, engine, chosen)).toMatchObject({ ok: true });
    // The live object, because every consumer reads config.* per call and a
    // setting that waits for a relaunch is a fix that is not running.
    expect(first[bin]).toBe(chosen);

    const after = relaunch(dir, home);
    expect(after[set]).toBe(chosen);
    expect(after[bin]).toBe(chosen);
    expect(after[from]).toBe('settings');
  });

  it('says on the screen that it was chosen rather than found', () => {
    const { dir, home } = install();
    const claude = runnable('claude');
    const codex = runnable('codex');
    const c = loadConfig(dir, { home });
    pointAtEngineBin(c, 'claude', claude);
    pointAtEngineBin(c, 'codex', codex);

    const after = relaunch(dir, home);
    expect(claudeState(after)).toMatchObject({ claudeBin: claude, claudeFound: true, claudeChosen: true });
    expect(codexState(after)).toMatchObject({ bin: codex, found: true, chosen: true });
  });

  // THE OTHER HALF, and it matters as much: a wrong choice that could only be
  // undone by hand-editing a file nobody is told about is not a door, it is a
  // trap.
  it.each(['claude', 'codex'])('hands %s back to the search, and that survives too', (engine) => {
    const key = `${engine}Bin`;
    const { dir, home } = install();
    const chosen = runnable(engine);
    const c = loadConfig(dir, { home });
    pointAtEngineBin(c, engine, chosen);
    expect(onDisk(dir)[key]).toBe(chosen);

    expect(searchForEngineBin(c, engine)).toMatchObject({ ok: true });
    // REMOVED, not emptied: main/config.mts only reads a non-empty string as
    // chosen, so an empty one left behind would mean something else entirely.
    expect(key in onDisk(dir)).toBe(false);

    const after = relaunch(dir, home);
    expect(after[`${engine}BinConfigured`]).toBe(null);
    expect(after[`${engine}From`]).not.toBe('settings');
  });

  // THE CASE WORTH KEEPING HONEST. The path stays THEIRS, so anything that
  // spawns it fails naming the file they chose rather than one we picked, while
  // the screen says it was not found and offers the install link as usual.
  it('keeps a chosen path that has since gone, and reports it honestly', () => {
    const { dir, home } = install();
    const chosen = runnable('claude');
    pointAtEngineBin(loadConfig(dir, { home }), 'claude', chosen);
    fs.rmSync(chosen);

    const after = relaunch(dir, home);
    expect(after.claudeBin).toBe(chosen);
    expect(after.claudeFound).toBe(false);
    // Certain, because they named it: this is not a search that missed.
    expect(after.claudeCertain).toBe(true);
    expect(claudeState(after)).toMatchObject({ claudeChosen: true, claudeFound: false });
  });
});

/*
 * THE REFUSALS NEED NO LAUNCH, and that is not laziness: `pointAtEngineBin`
 * refuses before it touches the config at all, so handing it a loaded one would
 * buy nothing and cost a real login-shell probe per case (about 0.9 s each
 * since the search asks the shell first). What they do need is a real appDir,
 * because the half that matters is that NOTHING is written.
 */
describe('what the door refuses, and that it writes nothing when it does', () => {
  it.each([
    ['a path with nothing at it', '/definitely/not/here/claude', /could not find/i],
    ['a relative path', 'claude', /file itself/i],
    ['nothing at all', '', /file itself/i],
  ])('refuses %s', (_what, p, shape) => {
    const { dir, home } = install();
    const r = pointAtEngineBin({ appDir: dir, home }, 'claude', p);
    expect(r.ok).toBe(false);
    expect(r.say).toMatch(shape);
    expect('claudeBin' in onDisk(dir)).toBe(false);
  });

  it('refuses a folder, because the file inside it is the thing', () => {
    const { dir, home } = install();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'chosen-folder-'));
    made.push(folder);
    const r = pointAtEngineBin({ appDir: dir, home }, 'claude', folder);
    expect(r.ok).toBe(false);
    expect(r.say).toMatch(/folder/i);
    expect('claudeBin' in onDisk(dir)).toBe(false);
  });

  // A README, a log, a half-downloaded file: readable, and not a program. This
  // is the one that would otherwise reach `spawn` and fail there.
  it('refuses a file that cannot be run, and takes that very file once it can', () => {
    const { dir, home } = install();
    const c = { appDir: dir, home };
    const file = runnable('claude');
    fs.chmodSync(file, 0o644);
    expect(pointAtEngineBin(c, 'claude', file)).toMatchObject({ ok: false });
    expect('claudeBin' in onDisk(dir)).toBe(false);
    fs.chmodSync(file, 0o755);
    expect(pointAtEngineBin(c, 'claude', file)).toMatchObject({ ok: true });
    expect(onDisk(dir).claudeBin).toBe(file);
  });

  it('refuses an engine nobody declared, and invents no key for it', () => {
    const { dir, home } = install();
    const c = { appDir: dir, home };
    expect(pointAtEngineBin(c, 'gemini', runnable('gemini'))).toMatchObject({ ok: false });
    expect(searchForEngineBin(c, 'gemini')).toMatchObject({ ok: false });
    expect('geminiBin' in onDisk(dir)).toBe(false);
  });

  // A copy with nowhere to save must answer in words rather than throw out of
  // the handler, which would reach the window as an error card.
  it('says so rather than throwing when there is nowhere to save', () => {
    const { home } = install();
    const r = pointAtEngineBin({ home, claudeBinConfigured: null }, 'claude', runnable('claude'));
    expect(r).toMatchObject({ ok: false });
    expect(r.say).toMatch(/nowhere to save/i);
  });
});
