// A PROCESS STARTED WITH THE TYPE FLAG PASSES IT ON.
//
// On 2026-11-13 the daily test day's tester never got a copy of the app: on
// this Mac's Node 22.14, live.mjs re-ran itself with --experimental-strip-types,
// which sets process.features.typescript to 'strip', so stripTypesFlags() gave
// nothing and the copy (bin/agentbox.mjs) died on main/store/home.mts with
// ERR_UNKNOWN_FILE_EXTENSION. A Node that strips types only because it was
// asked to has children that will not, unless they are asked too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripTypesFlags } from '../main/strip-types.mts';

const FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];

describe('the type flag for a child of a process that has it', () => {
  it('is passed on when this process strips types only because it was started with the flag', () => {
    expect(stripTypesFlags({ typescript: 'strip' }, ['--experimental-strip-types'])).toEqual(FLAGS);
    expect(stripTypesFlags({ typescript: 'strip' }, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'])).toEqual(FLAGS);
  });

  it('is left off when this Node strips types on its own', () => {
    expect(stripTypesFlags({ typescript: 'strip' }, [])).toEqual([]);
    expect(stripTypesFlags({ typescript: 'strip' }, ['--inspect'])).toEqual([]);
  });

  it('reaches a grandchild started the way live.mjs starts the app', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-on-'));
    fs.writeFileSync(path.join(dir, 'typed.mts'), 'const n: number = 2;\nconsole.log(n * 21);\n');
    const helper = path.resolve(import.meta.dirname, '..', 'main', 'strip-types.mts');
    fs.writeFileSync(path.join(dir, 'parent.mts'), [
      `import { spawnSync } from 'node:child_process';`,
      `import { stripTypesFlags } from ${JSON.stringify(helper)};`,
      `const r = spawnSync(process.execPath, [...stripTypesFlags(), ${JSON.stringify(path.join(dir, 'typed.mts'))}], { encoding: 'utf8' });`,
      `process.stdout.write(r.stdout); process.stderr.write(r.stderr);`,
    ].join('\n'));
    const run = spawnSync(process.execPath, [...FLAGS, path.join(dir, 'parent.mts')], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: '' } });
    expect(run.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
    expect(run.stdout.trim()).toBe('42');
  });
});
