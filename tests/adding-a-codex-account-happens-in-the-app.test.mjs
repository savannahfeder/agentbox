// ADDING A CODEX ACCOUNT HAPPENS IN THE APP.
//
// The card printed a command for her to run, and the command was WRONG. Her
// report, pasted verbatim:
//
// you@... % CODEX_HOME=~/.codex-work codex login WARNING: proceeding, even
// though we could not create PATH aliases: CODEX_HOME points to
// "/Users/you/.codex-work", but that path does not exist Error loading
// configuration: CODEX_HOME points to "/Users/you/.codex-work", but that path
// does not exist
//
// codex-cli will not create the home it is pointed at. Reproduced on this Mac
// the same day: with the folder made first, `CODEX_HOME=<dir> codex login
// status` answers "Not logged in" and exits 0; without it, the two lines above.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexLoginCommand, makeCodexHome } from '../main/codex-account.mjs';
import { SETTINGS_TERMINAL } from '../shared/settings-terminal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the folder exists before anything is pointed at it', () => {
  // THE WHOLE BUG, IN ONE ASSERTION.
  it('makes the folder, rather than naming one and hoping', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const made = makeCodexHome({ home });
    expect(fs.existsSync(made.home)).toBe(true);
    expect(fs.statSync(made.home).isDirectory()).toBe(true);
  });

  // PRESSING ADD TWICE MUST NOT HAND THE SECOND LOGIN THE FIRST ONE'S FOLDER,
  // which would sign one account in over another and lose the first.
  it('counts rather than guesses, so a second press gets a second folder', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const first = makeCodexHome({ home });
    const second = makeCodexHome({ home });
    expect(second.home).not.toBe(first.home);
    expect(fs.existsSync(first.home)).toBe(true);
    expect(fs.existsSync(second.home)).toBe(true);
  });

  it('steps over a folder that is already there', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    fs.mkdirSync(path.join(home, '.codex-2'));
    expect(makeCodexHome({ home }).home).toBe(path.join(home, '.codex-3'));
  });

  // THE PROFILE IS THE PATH, which is what `_codexProfileHome` expects of
  // anything that is not her primary login.
  it('hands back a profile the fleet can spawn on', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const made = makeCodexHome({ home });
    expect(made.profile).toBe(made.home);
  });
});

describe('the command it hands the terminal', () => {
  // NO TILDE. `CODEX_HOME=~/x` is not expanded the same way by every shell
  // inside a variable assignment, and the home is already known in full.
  it('spells the folder out rather than leaving it to the shell', () => {
    expect(codexLoginCommand('/Users/x/.codex-2')).toBe('CODEX_HOME=/Users/x/.codex-2 codex login');
    expect(codexLoginCommand('/Users/x/.codex-2')).not.toContain('~');
  });
});

describe('it is the app doing it, not a command she has to run', () => {
  const settings = read('renderer/src/components/Settings.tsx');

  it('no longer prints a command on the card', () => {
    // The two strings the broken round shipped.
    expect(settings).not.toContain('CODEX_HOME=~/.codex-work codex login');
    expect(settings).not.toContain('ac-cmd');
  });

  it('opens the app’s own terminal and types the line for her', () => {
    expect(settings).toContain('function SettingsTerminal(');
    expect(settings).toContain("action: 'open'");
    expect(settings).toContain("action: 'write', data: `${command}\\r`");
    // The app's terminal, not a second one.
    expect(settings).toContain('<TaskTerminal product={SETTINGS_TERMINAL.product}');
  });

  // SIGNING IN TWICE IS WORSE THAN NOT AT ALL, and React may run an effect
  // twice, so the write is guarded.
  it('types it once', () => {
    const fn = settings.slice(settings.indexOf('function SettingsTerminal('));
    expect(fn.slice(0, fn.indexOf('\\n}'))).toContain('if (!command || sent.current) return;');
  });

  it('registers the login before the sign in, so an abandoned one is visible', () => {
    const main = read('main/settings.mjs');
    expect(main).toContain('export function addCodexAccount(');
    const fn = main.slice(main.indexOf('export function addCodexAccount('));
    const body = fn.slice(0, fn.indexOf('\\n}'));
    expect(body.indexOf('makeCodexHome')).toBeLessThan(body.indexOf('codexProfiles'));
    expect(body).toContain('codexLoginCommand');
  });
});

describe('the reserved terminal key', () => {
  // A KEY THE RENDERER CANNOT AIM. Every other shell resolves through a work
  // item that has to exist; this one resolves to the folder main just made.
  it('is shared by both sides rather than spelled twice', () => {
    expect(read('main/ipc.mjs')).toContain("import {SETTINGS_TERMINAL} from '../shared/settings-terminal.mjs';");
    expect(read('renderer/src/components/Settings.tsx')).toContain("import { SETTINGS_TERMINAL } from '../../../shared/settings-terminal.mjs';");
  });

  // A COLON, SO NO PROJECT CAN COLLIDE WITH IT. A product here is a slug taken
  // from a folder name, and a colon never survives that.
  it('cannot be a project slug', () => {
    expect(SETTINGS_TERMINAL.product).toContain(':');
  });

  it('never reaches the resolver that demands a task', () => {
    const ipc = read('main/ipc.mjs');
    const resolve = ipc.slice(ipc.indexOf('const terminals=new TaskTerminals('), ipc.indexOf('let terminalQuitPending'));
    // The reserved key returns before `terminalPlace` is ever consulted.
    expect(resolve.indexOf('terminalPlace({store')).toBeGreaterThan(-1);
    expect(resolve.indexOf('SETTINGS_TERMINAL')).toBeLessThan(resolve.indexOf('terminalPlace({store'));
    // And the folder is main's own, never one the window asked for. One
    // variable serves both agents since w-3498e0cad2, because there is one
    // settings terminal and so only ever one sign in happening at a time.
    expect(resolve).toContain('pendingLogin ?? config.home');
  });

  it('ends the previous sign-in shell, so it cannot be holding the old folder', () => {
    const ipc = read('main/ipc.mjs');
    const handler = ipc.slice(
      ipc.indexOf("ipcMain.handle('zero:codex-add-account'"),
      ipc.indexOf("ipcMain.handle('zero:settings-set-project'"),
    );
    expect(handler).toContain('terminals.close(JSON.stringify(SETTINGS_TERMINAL))');
  });
});
