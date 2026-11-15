// A ship of the TypeScript back end died on 2026-11-01 with 32 red tests, the
// first "a cloud relay runs in a process group of its own". The push check ran
// them on the Mac's Node 22.14, which loads a .mts file only when asked with
// --experimental-strip-types (22.18 and Electron's Node 24 load it without).
// Every helper process and thread the app starts on its own .mts files went
// down at once: the cloud relay and host, the run host, the terminal host, and
// the off-thread readers. Reproduced here with Node 22.14: the relay never
// wrote its pid. The app now adds the flag when the Node it runs on needs it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripTypesFlags } from '../main/strip-types.mts';

const root = path.resolve(import.meta.dirname, '..');

describe('the flag a helper process is started with', () => {
  it('is asked for on a Node that does not strip types on its own', () => {
    expect(stripTypesFlags({ typescript: false })).toEqual(['--experimental-strip-types', '--disable-warning=ExperimentalWarning']);
    expect(stripTypesFlags({})).toEqual(['--experimental-strip-types', '--disable-warning=ExperimentalWarning']);
  });

  it('is left off where Node already does, Electron included', () => {
    expect(stripTypesFlags({ typescript: 'strip' })).toEqual([]);
    expect(stripTypesFlags({ typescript: 'transform' })).toEqual([]);
  });

  it('lets this Node run a typed file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-'));
    fs.writeFileSync(path.join(dir, 'typed.mts'), 'const n: number = 41;\nconsole.log(n + 1);\n');
    const run = spawnSync(process.execPath, [...stripTypesFlags(), path.join(dir, 'typed.mts')], { encoding: 'utf8', timeout: 30_000 });
    expect(run.stdout.trim()).toBe('42');
  });
});

describe('every helper the app starts on a .mts file asks for it', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

  it.each([
    ['main/supervisor.mts', /spawn\(process\.execPath, \[\.\.\.stripTypesFlags\(\), this\._cloudRunPath\(\)/],
    ['main/supervisor.mts', /spawn\(process\.execPath, \[\.\.\.stripTypesFlags\(\), fileURLToPath\(new URL\('\.\/cloud\/host\.mts'/],
    ['main/supervisor.mts', /spawn\(process\.execPath, \[\.\.\.stripTypesFlags\(\), fileURLToPath\(new URL\('\.\/run-host\.mts'/],
    ['main/terminal-hosts.mts', /spawn\(process\.execPath, \[\.\.\.stripTypesFlags\(\), fileURLToPath\(new URL\('\.\/terminal-host\.mts'/],
  ])('%s starts it with the flag', (file, line) => {
    expect(read(file)).toMatch(line);
  });

  it.each(['main/codex-threads.mts', 'main/freeze-recorder.mts', 'main/git-change-offthread.mts', 'main/task-folders-offthread.mts'])('%s starts its thread with the flag', (file) => {
    expect(read(file)).toMatch(/new Worker\(new URL\('\.\/[\w-]+\.mts', import\.meta\.url\), \{[^}]*execArgv: \[\.\.\.process\.execArgv, \.\.\.stripTypesFlags\(\)\]/);
  });

  it('and the approval server falls back to a plain node with it too', () => {
    expect(read('scripts/approval-server.sh')).toMatch(/--experimental-strip-types/);
  });
});
