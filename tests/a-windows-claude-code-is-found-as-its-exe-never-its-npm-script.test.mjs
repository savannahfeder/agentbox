// ON WINDOWS THE FINDER RETURNS A REAL .exe, NEVER npm'S SCRIPTS.
//
// On Windows the finder asked a login shell, `$SHELL` or `/bin/zsh`, then took
// the first PATH file named exactly `claude`. An npm install puts three launchers
// in `%APPDATA%\npm`, `claude` (a `#!/bin/sh` script), `claude.cmd` and
// `claude.ps1`, so the finder handed the sh script to `spawn`.
//
// Measured on Windows 11 and Node 24.11, Claude Code installed with npm.
//
//   spawn('...\\npm\\claude', ['--version'])                       ENOENT
//   spawn('...\\npm\\claude.cmd', ['--version'])                   EINVAL
//   spawn('...\\npm\\claude.cmd', ['--version'], { shell: true })  exit 1, the
//     space in the home folder's name split the path
//   a JSON argument through cmd.exe     {"env":{...}} arrived as {env:{...}}
//   spawn('...\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe')
//                                                  printed its version
//
// Started from PowerShell, the environment's key is `Path`, so a copy of it
// has no `PATH` at all.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findEngine, pathDirs, envValue, lookAgain, warmShellAnswers, ENGINES } from '../main/engine-bin.mjs';

const w = path.win32;
const HOME = 'C:\\Users\\Some One';
const NPM = 'C:\\Users\\Some One\\AppData\\Roaming\\npm';
const PACKAGE_EXE = w.join(NPM, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
const INSTALLER_EXE = w.join(HOME, '.local', 'bin', 'claude.exe');
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const shellMustNotRun = () => { throw new Error('the shell was asked on Windows'); };

const find = (exists, env = { Path: `C:\\Windows\\system32;${NPM}` }) => findEngine('claude', {
  platform: 'win32', home: HOME, env, exists, dangles: never, readdir: () => [], shellLookup: shellMustNotRun,
});

describe('Claude Code on Windows', () => {
  it('is the exe inside the npm package, not the shim beside it', () => {
    const shims = [w.join(NPM, 'claude'), w.join(NPM, 'claude.cmd'), w.join(NPM, 'claude.ps1')];
    expect(find(only(...shims, PACKAGE_EXE))).toMatchObject({ path: PACKAGE_EXE, found: true, from: 'path' });
  });

  it('is never a .cmd or an extensionless script, even when nothing else is there', () => {
    const found = find(only(w.join(NPM, 'claude'), w.join(NPM, 'claude.cmd')));
    expect(found.found).toBe(false);
    expect(found.path).toBe(null);
  });

  it('is the official installer\'s exe when PATH does not carry it', () => {
    expect(find(only(INSTALLER_EXE), { Path: 'C:\\Windows\\system32' })).toMatchObject({ path: INSTALLER_EXE, from: 'disk' });
  });

  it('is a claude.exe on PATH, before the installer\'s copy', () => {
    const onPath = 'C:\\tools\\claude.exe';
    expect(find(only(onPath, INSTALLER_EXE), { Path: 'C:\\tools' })).toMatchObject({ path: onPath, from: 'path' });
  });

  it('never asks a login shell', () => {
    expect(() => find(never)).not.toThrow();
  });

  it('never starts a login shell at launch to seed the answers', () => {
    let ran = false;
    warmShellAnswers({ platform: 'win32', run: () => { ran = true; return ''; } });
    expect(ran).toBe(false);
  });

  // Check again used to start Git Bash with the person's profile, about 1.4 s a
  // click, for an answer the Windows search then ignores.
  it('never asks a login shell when looking again', async () => {
    let asked = false;
    await lookAgain('claude', { platform: 'win32', shellLookupLater: () => { asked = true; return { path: null, answered: true }; } });
    expect(asked).toBe(false);
  });

  it('takes npm\'s package exe from a PATH directory only beside its shim, as npm lays it out', () => {
    const elsewhere = 'C:\\tools';
    const planted = w.join(elsewhere, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    expect(find(only(planted), { Path: elsewhere }).found).toBe(false);
    expect(find(only(planted, w.join(elsewhere, 'claude.cmd')), { Path: elsewhere }).path).toBe(planted);
  });
});

describe('a Windows PATH is read whatever its key is called', () => {
  it.each(['Path', 'PATH', 'path'])('reads %s, split on semicolons', (key) => {
    expect(pathDirs({ [key]: 'C:\\a;D:\\b c;relative' }, 'win32')).toEqual(['C:\\a', 'D:\\b c']);
  });

  it('is case-sensitive everywhere else, as those systems are', () => {
    expect(envValue({ Path: '/usr/bin' }, 'PATH', 'linux')).toBe(undefined);
    expect(pathDirs({ PATH: '/usr/bin:/bin' }, 'darwin')).toEqual(['/usr/bin', '/bin']);
  });
});

describe('an engine\'s candidates', () => {
  it('can be read off the engine without calling it as a method', () => {
    const { candidates } = ENGINES.claude;
    expect(candidates(HOME, () => [], 'win32', {})).toEqual([INSTALLER_EXE]);
  });
});

describe('a Mac is untouched', () => {
  it('still takes the extensionless claude on PATH', () => {
    const found = findEngine('claude', {
      platform: 'darwin', home: '/Users/x', env: { PATH: '/opt/bin' }, exists: only('/opt/bin/claude'),
      dangles: never, readdir: () => [], shellLookup: () => ({ path: null, answered: true }),
    });
    expect(found).toMatchObject({ path: '/opt/bin/claude', from: 'path' });
  });
});
