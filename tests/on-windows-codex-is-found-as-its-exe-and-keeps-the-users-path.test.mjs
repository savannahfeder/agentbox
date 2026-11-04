// ON WINDOWS A CODEX WORKER STARTS FROM codex.exe, WITH THE PERSON'S PATH.
//
// Codex had no Windows entry, so the finder took the first PATH file named
// exactly `codex`. npm puts `codex` (a `#!/bin/sh` script), `codex.cmd` and
// `codex.ps1` in `%APPDATA%\npm`, and none of them can be spawned.
//
// Measured on Windows 11 and Node 24.11.
//
//   spawnSync('...\\codex', ['--version'])      ENOENT
//   spawnSync('...\\codex.cmd', ['--version'])  EINVAL
//
// With @openai/codex 0.163.0 installed by `npm install -g --prefix`, the
// finder on main found nothing. With this change it returned
// `node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\
// x86_64-pc-windows-msvc\bin\codex.exe`, signed by OpenAI, which started
// with the launch env below and printed "codex-cli 0.163.0".
//
// The launch env read `source.PATH`. Started from PowerShell or Explorer the
// key is `Path`, so the person's PATH was dropped and a new `PATH` key added
// beside it. Measured from PowerShell, where the parent's key is `Path`.
//
//   { ...process.env, PATH: 'only-new-dir' }  the child's PATH is 'only-new-dir'
//   { Path: 'from-Path', PATH: 'from-PATH' }  the child sees 'from-PATH', in
//                                             either order
//
// The rest comes from npm's metadata and the launcher's source.
// @openai/codex 0.166.0 has `bin: { codex: 'bin/codex.js' }` and the optional
// dependencies `@openai/codex-win32-x64` and `@openai/codex-win32-arm64`, and
// its codex.js runs `<that package>/vendor/<triple>/bin/codex.exe` with the
// triples x86_64-pc-windows-msvc and aarch64-pc-windows-msvc, setting
// CODEX_MANAGED_PACKAGE_ROOT to the package folder and CODEX_MANAGED_BY_NPM
// to 1 after removing the other CODEX_MANAGED_BY_ names. Its install.ps1
// puts codex.exe in `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin`, a junction to
// `%USERPROFILE%\.codex\packages\standalone\current\bin`.

import { afterEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findEngine } from '../main/engine-bin.mjs';
import { codexLaunchEnv } from '../main/codex-launch-env.mjs';

const w = path.win32;
const HOME = 'C:\\Users\\Some One';
const NPM = 'C:\\Users\\Some One\\AppData\\Roaming\\npm';
const inPackage = (arch, triple) => ['node_modules', '@openai', 'codex', 'node_modules', '@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe'];
const X64 = inPackage('x64', 'x86_64-pc-windows-msvc');
const X64_EXE = w.join(NPM, ...X64);
const ARM64_EXE = w.join(NPM, ...inPackage('arm64', 'aarch64-pc-windows-msvc'));
const INSTALLER_EXE = w.join(HOME, 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
const STANDALONE_EXE = w.join(HOME, '.codex', 'packages', 'standalone', 'current', 'bin', 'codex.exe');
const SHIMS = [w.join(NPM, 'codex'), w.join(NPM, 'codex.cmd'), w.join(NPM, 'codex.ps1')];
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;

const find = (exists, env = { Path: `C:\\Windows\\system32;${NPM}` }) => findEngine('codex', {
  platform: 'win32', home: HOME, env, exists, dangles: never, readdir: () => [],
  shellLookup: () => { throw new Error('the shell was asked on Windows'); },
});

describe('Codex on Windows is found', () => {
  it('as the x64 exe inside the npm package, not the shims beside it', () => {
    expect(find(only(...SHIMS, X64_EXE))).toMatchObject({ path: X64_EXE, found: true, from: 'path' });
  });

  it('as the arm64 exe inside the npm package', () => {
    expect(find(only(...SHIMS, ARM64_EXE))).toMatchObject({ path: ARM64_EXE, found: true });
  });

  it('never as a shim, even when nothing else is there', () => {
    const found = find(only(...SHIMS));
    expect(found.found).toBe(false);
    expect(found.path).toBe(null);
  });

  it('inside a package only beside npm\'s shim', () => {
    const planted = w.join('C:\\tools', ...X64);
    expect(find(only(planted), { Path: 'C:\\tools' }).found).toBe(false);
    expect(find(only(planted, 'C:\\tools\\codex.cmd'), { Path: 'C:\\tools' }).path).toBe(planted);
  });

  it('as the installer\'s exe when PATH does not carry it', () => {
    expect(find(only(INSTALLER_EXE), { Path: 'C:\\Windows\\system32' })).toMatchObject({ path: INSTALLER_EXE, from: 'disk' });
    expect(find(only(STANDALONE_EXE), { Path: 'C:\\Windows\\system32' })).toMatchObject({ path: STANDALONE_EXE, from: 'disk' });
  });

  it('as a codex.exe on PATH, before the installer\'s copy', () => {
    expect(find(only('C:\\tools\\codex.exe', INSTALLER_EXE), { Path: 'C:\\tools' })).toMatchObject({ path: 'C:\\tools\\codex.exe' });
  });
});

const temps = [];
afterEach(() => { for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(process.platform !== 'win32')('on a real Windows disk', () => {
  it('the exe in an npm layout is found, never the shims', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-win-'));
    temps.push(home);
    const npm = path.join(home, 'AppData', 'Roaming', 'npm');
    const exe = path.join(npm, ...X64);
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, '');
    fs.writeFileSync(path.join(npm, 'codex'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(npm, 'codex.cmd'), '@echo off\r\n');
    const found = findEngine('codex', { platform: 'win32', home, env: { Path: npm }, dangles: never, readdir: () => [] });
    expect(found).toMatchObject({ path: exe, found: true, from: 'path' });
  });
});

describe('the Codex launch env on Windows', () => {
  const binDir = w.dirname(X64_EXE);
  const launch = (source) => codexLaunchEnv(X64_EXE, source, { platform: 'win32', home: HOME, exists: () => true, readdir: () => [] });

  it('keeps the person\'s PATH under the key it came with', () => {
    const env = launch({ Path: 'C:\\Windows\\system32;C:\\Program Files\\Git\\cmd', CODEX_HOME: 'C:\\account' });
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toEqual(['Path']);
    expect(env.Path).toBe(`${binDir};C:\\Windows\\system32;C:\\Program Files\\Git\\cmd`);
    expect(env.CODEX_HOME).toBe('C:\\account');
  });

  it('adds no Node folder, as codex.exe needs none', () => {
    expect(launch({ Path: 'C:\\Windows\\system32' }).Path).toBe(`${binDir};C:\\Windows\\system32`);
  });

  it('writes PATH when there was none', () => {
    expect(launch({})).toMatchObject({ PATH: binDir });
  });

  it('hands over one PATH, the one a child would have seen, when two spellings came in', () => {
    const env = launch({ Path: 'C:\\from-Path', PATH: 'C:\\from-PATH' });
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toEqual(['PATH']);
    expect(env.PATH).toBe(`${binDir};C:\\from-PATH`);
  });

  it('says the exe came from npm, as npm\'s codex.js does', () => {
    const env = launch({ Path: 'C:\\Windows', CODEX_MANAGED_BY_BUN: '1' });
    expect(env.CODEX_MANAGED_PACKAGE_ROOT).toBe(w.join(NPM, 'node_modules', '@openai', 'codex'));
    expect(env.CODEX_MANAGED_BY_NPM).toBe('1');
    expect(env.CODEX_MANAGED_BY_BUN).toBe(undefined);
  });

  it('says nothing about npm for the installer\'s exe', () => {
    const env = codexLaunchEnv(INSTALLER_EXE, { Path: 'C:\\Windows' }, { platform: 'win32' });
    expect(Object.keys(env).filter((k) => k.startsWith('CODEX_MANAGED'))).toEqual([]);
  });

  it.skipIf(process.platform !== 'win32')('reaches a real child with one PATH when two spellings came in', () => {
    const rest = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const env = codexLaunchEnv(process.execPath, { ...rest, Path: 'C:\\from-Path', PATH: `C:\\from-PATH;${process.env.PATH}` });
    const out = spawnSync(process.execPath, ['-e', 'console.log(process.env.PATH)'], { env, encoding: 'utf8' });
    expect(out.stdout.trim().split(';').slice(0, 2)).toEqual([path.dirname(process.execPath), 'C:\\from-PATH']);
  });

  it.skipIf(process.platform !== 'win32')('reaches a real child with the person\'s PATH', () => {
    const userDir = 'C:\\a-dir-only-the-person-has';
    const rest = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const env = codexLaunchEnv(process.execPath, { ...rest, Path: `${userDir};${process.env.PATH}` });
    const out = spawnSync(process.execPath, ['-e', 'console.log(process.env.PATH)'], { env, encoding: 'utf8' });
    expect(out.stdout.trim().split(';')).toContain(userDir);
  });
});

describe('a Mac is untouched', () => {
  it('still takes the extensionless codex on PATH', () => {
    const found = findEngine('codex', {
      platform: 'darwin', home: '/Users/x', env: { PATH: '/opt/bin' }, exists: only('/opt/bin/codex'),
      dangles: never, readdir: () => [], shellLookup: () => ({ path: null, answered: true }),
    });
    expect(found).toMatchObject({ path: '/opt/bin/codex', from: 'path' });
  });
});
