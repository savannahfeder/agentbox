// `npx agentbox-app` DIED BEFORE ITS FIRST LINE (2026-11-17).
//
// A tester trying Agentbox on their own computer hit an error, and the README's
// one-command route was checked: the published 0.1.26, installed with npm and
// started on Node 22.23, threw ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING on
// main/serve.mts. Node strips types from a .mts by itself, but never from a file
// under node_modules, which is where npm puts the whole app. So the command had
// failed for everyone since the back end became .mts.
//
// bin/typescript-in-node-modules.mjs strips them itself, and every helper the
// app starts is handed it through stripTypesFlags().
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';
import { stripTypesFlags } from '../main/strip-types.mts';

const repo = path.resolve(import.meta.dirname, '..');
const HOOK = path.join(repo, 'bin', 'typescript-in-node-modules.mjs');
const ON_ITS_OWN = { typescript: 'strip' };
// The hook needs Node 22.15; the package asks for 22.18, and the Mac that ships may be older.
const HOOKS_HERE = typeof (nodeModule as { registerHooks?: unknown }).registerHooks === 'function';

let dir: string;
let pkg: string;

// A package as npm installs it: bin/ and main/ under node_modules, with the hook
// beside the bin as the real package has it.
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-copy-'));
  pkg = path.join(dir, 'node_modules', 'agentbox-app');
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'main'), { recursive: true });
  if (fs.existsSync(HOOK)) fs.copyFileSync(HOOK, path.join(pkg, 'bin', 'typescript-in-node-modules.mjs'));
  fs.copyFileSync(path.join(repo, 'main', 'strip-types.mts'), path.join(pkg, 'main', 'strip-types.mts'));
  fs.writeFileSync(path.join(pkg, 'main', 'answer.mts'), 'interface Shape { n: number }\nexport const answer = ({ n }: Shape): number => n * 21;\n');
  fs.writeFileSync(path.join(pkg, 'main', 'child.mts'), "import { answer } from './answer.mts';\nconsole.log(`child ${answer({ n: 2 })}`);\n");
  fs.writeFileSync(path.join(pkg, 'main', 'thread.mts'), "import { parentPort } from 'node:worker_threads';\nimport { answer } from './answer.mts';\nparentPort!.postMessage(answer({ n: 1 }));\n");
  fs.writeFileSync(path.join(pkg, 'main', 'parent.mts'), [
    "import { spawnSync } from 'node:child_process';",
    "import { Worker } from 'node:worker_threads';",
    "import { stripTypesFlags } from './strip-types.mts';",
    "const child = spawnSync(process.execPath, [...stripTypesFlags(), new URL('./child.mts', import.meta.url).pathname], { encoding: 'utf8' });",
    'process.stdout.write(child.stdout); process.stderr.write(child.stderr);',
    "const w = new Worker(new URL('./thread.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });",
    "w.on('message', (m) => { console.log(`thread ${m}`); w.terminate(); });",
    "w.on('error', (e) => { console.error(`thread failed: ${e.message}`); process.exitCode = 1; });",
  ].join('\n'));
  fs.writeFileSync(path.join(pkg, 'bin', 'start.mjs'), [
    "import './typescript-in-node-modules.mjs';",
    "await import(new URL('../main/parent.mts', import.meta.url));",
  ].join('\n'));
});

afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const node = (args: string[]) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: '' } });

describe('the app installed by npm', () => {
  it('cannot load its .mts on plain Node, which is what broke', () => {
    const run = node([path.join(pkg, 'main', 'child.mts')]);
    // Below 22.18 Node will not load a .mts at all without a flag.
    expect(run.stderr).toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING|ERR_UNKNOWN_FILE_EXTENSION/);
    expect(run.status).not.toBe(0);
  });

  it.skipIf(!HOOKS_HERE)('starts, and so do a helper process and a thread it starts', () => {
    const run = node([...stripTypesFlags(), path.join(pkg, 'bin', 'start.mjs')]);
    expect(run.stderr).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
    expect(run.stderr).not.toMatch(/ExperimentalWarning/);
    expect(run.stdout.trim().split('\n').sort()).toEqual(['child 42', 'thread 21']);
    expect(run.status).toBe(0);
  });

  it('passes the hook on from a copy under node_modules', () => {
    const here = pathToFileURL(path.join(pkg, 'main', 'strip-types.mts')).href;
    const hook = pathToFileURL(path.join(pkg, 'bin', 'typescript-in-node-modules.mjs')).href;
    expect(stripTypesFlags(ON_ITS_OWN, [], here)).toEqual(['--import', hook]);
    expect(stripTypesFlags(ON_ITS_OWN, ['--experimental-strip-types'], here)).toEqual(['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--import', hook]);
  });

  it('adds nothing for a checkout, or a folder that only looks like node_modules', () => {
    expect(stripTypesFlags(ON_ITS_OWN, [], pathToFileURL(path.join(repo, 'main', 'strip-types.mts')).href)).toEqual([]);
    expect(stripTypesFlags(ON_ITS_OWN, [], 'file:///home/a/my_node_modules/app/main/strip-types.mts')).toEqual([]);
    expect(stripTypesFlags(ON_ITS_OWN, [], 'file:///home/a/node_modules_old/app/main/strip-types.mts')).toEqual([]);
  });

  it('starts the real launcher with the hook before any .mts', () => {
    const bin = fs.readFileSync(path.join(repo, 'bin', 'agentbox.mjs'), 'utf8');
    const hookAt = bin.indexOf("import './typescript-in-node-modules.mjs'");
    expect(hookAt).toBeGreaterThan(-1);
    // A static import of a .mts is loaded before any line of the file runs, hook or not.
    expect(bin).not.toMatch(/^import [^\n]*\.mts['"]/m);
  });

  it('lets a checkout start on a Node too old for the hook', () => {
    const hook = fs.readFileSync(HOOK, 'utf8');
    // A named import of what Node 22.14 lacks is a SyntaxError before any check can run.
    expect(hook).not.toMatch(/import\s*\{[^}]*registerHooks/);
    const run = node([HOOK]);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('ships the hook in the package', () => {
    const files: string[] = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).files;
    expect(files).toContain('bin/');
  });
});
