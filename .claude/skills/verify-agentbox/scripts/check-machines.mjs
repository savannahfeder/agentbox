#!/usr/bin/env node
// DOES AGENTBOX FIND AND START CLAUDE CODE AND CODEX ON MACHINES UNLIKE THIS ONE?
//
// For each shape in machines.mjs: lay the machine out, then do what the app
// does when it is opened from the Dock, using the app's own modules and not a
// copy of them:
//
//   1. recover the PATH from the login shell        main/shell-path.mjs
//   2. ask the shell where the sessions live         main/shell-path.mjs
//   3. find Claude Code and Codex                    main/claude-bin.mjs, main/codex-bin.mjs
//   4. build a worker's environment and launch it    main/harnesses.mjs (workerEnv, launchEnv)
//
// and compare each answer with what a person on that machine needs. Step 4
// really spawns the found binary with `--version`, under the environment the
// app would hand a worker, so "found but cannot start" is caught.
//
//   node .claude/skills/verify-agentbox/scripts/check-machines.mjs [shape ...] [--out <dir>] [--keep]
//
// Exit 0 only if every shape held. Evidence: <out>/machines.json and a table on
// stdout. --keep leaves the fake machines on disk to poke at.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHAPES, build, CLAUDE_VERSION, CODEX_VERSION } from './machines.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { recoverShellPath, readShellSettings, launchAdditions } = await import(path.join(repo, 'main/shell-path.mjs'));
const { findClaudeBin, askShell } = await import(path.join(repo, 'main/claude-bin.mjs'));
const { shellRunner } = await import(path.join(repo, 'main/engine-bin.mjs'));
const { findCodexBin } = await import(path.join(repo, 'main/codex-bin.mjs'));
const { harnessFor } = await import(path.join(repo, 'main/harnesses.mjs'));

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const args = isMain ? process.argv.slice(2) : [];
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = flag('--out') ?? path.join('/tmp', 'agentbox-verify', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-machines`);
const keep = args.includes('--keep');
const wanted = args.filter((a) => !a.startsWith('--'));

const FINDERS = { claude: findClaudeBin, codex: findCodexBin };

/** The app's own probe runner (main/engine-bin.mjs), with the fake machine's environment instead of ours. */
const asTheMachine = (env) => shellRunner(env);
const VERSIONS = { claude: CLAUDE_VERSION, codex: CODEX_VERSION };

/** One shape, start to finish. Returns facts and the list of what did not hold. */
export async function checkShape(shape) {
  const m = build(shape);
  const facts = { shape: shape.name, why: shape.why };
  const wrong = [];
  try {
    const boot = await recoverShellPath({ env: m.launchEnv, platform: m.platform });
    facts.bootPath = { error: boot.error, entries: boot.path.split(':').map(m.tilde) };
    for (const folder of shape.expect.bootPath ?? []) {
      if (!facts.bootPath.entries.includes(folder)) wrong.push(`the app's PATH does not hold ${folder}${boot.error ? ` (${boot.error.split('\n')[0]})` : ''}`);
    }
    // What learnShellDataDirs reads and puts into the app's environment: the
    // two folders, and the proxy, certificate and language settings.
    const settings = await readShellSettings({ env: m.launchEnv, platform: m.platform });
    const bootEnv = { ...m.launchEnv, ...launchAdditions(settings, m.launchEnv, m.platform), PATH: boot.path };
    facts.shellDirs = Object.fromEntries(Object.entries(settings.dirs).map(([k, v]) => [k, m.tilde(v)]));
    for (const [k, v] of Object.entries(shape.expect.shellDirs ?? {})) {
      if (facts.shellDirs[k] !== v) wrong.push(`${k} from the shell: expected ${v}, got ${facts.shellDirs[k] ?? 'nothing'}`);
    }

    for (const engine of ['claude', 'codex']) {
      const want = shape.expect[engine];
      const found = FINDERS[engine]({
        home: m.home, env: bootEnv,
        exists: m.virtual.exists, readdir: m.virtual.readdir, dangles: m.virtual.dangles,
        // The app's own probe runs its shells with the app's whole environment,
        // which here would be this terminal's HOME and its .zshrc. Same shells,
        // same flags, same timeouts, run as the fake machine.
        shellLookup: () => askShell({ env: bootEnv, exists: m.virtual.exists, bin: engine, run: asTheMachine(bootEnv) }),
      });
      const fact = { found: found.found, from: found.from, certain: found.certain, path: m.tilde(found.path), evidence: m.tilde(found.evidence) };
      if (found.found !== want.found) wrong.push(`${engine}: expected ${want.found ? 'found' : 'not found'}, got ${found.found ? `found at ${fact.path}` : 'not found'}`);
      if (want.from && found.from !== want.from) wrong.push(`${engine}: expected found from ${want.from}, got ${found.from}`);
      if (want.certain !== undefined && found.certain !== want.certain) {
        wrong.push(`${engine}: ${want.certain ? 'should be sure it is missing, and is not' : 'would tell them it is not installed, without knowing that'}`);
      }
      if (found.found) {
        const h = harnessFor(engine);
        const env = h.launchEnv(found.path, h.workerEnv(bootEnv), { home: m.home, exists: m.virtual.executable, readdir: m.virtual.readdir });
        const run = spawnSync(m.toReal(found.path), ['--version'], {
          env: { ...env, PATH: m.realPath(env.PATH) }, encoding: 'utf8', timeout: 10_000,
        });
        fact.runs = run.status === 0 && String(run.stdout).includes(VERSIONS[engine]);
        fact.started = run.status === 0 ? 'ok' : (String(run.stderr || run.error?.message || `exit ${run.status}`).trim().split('\n')[0]);
        fact.workerPath = env.PATH.split(':').map(m.tilde);
        if (want.runs && !fact.runs) wrong.push(`${engine}: found but a worker cannot start it: ${fact.started}`);
        const leaked = (shape.expect.scrubbed?.[engine] ?? []).filter((k) => k in env);
        if (leaked.length) wrong.push(`${engine}: a worker would be handed ${leaked.join(', ')}`);
        for (const [k, v] of Object.entries(shape.expect.workerEnv ?? {})) {
          const got = env[k] === undefined ? undefined : m.tilde(env[k]);
          const held = v instanceof RegExp ? v.test(got ?? '') : got === v;
          if (!held) wrong.push(`${engine}: a worker's ${k} should be ${v}, got ${got ?? 'nothing'}`);
        }
      }
      facts[engine] = fact;
    }
  } catch (error) {
    wrong.push(`the check itself failed: ${error?.stack ?? error}`);
  } finally {
    if (!keep) fs.rmSync(m.root, { recursive: true, force: true });
    else facts.root = m.root;
  }
  return { ...facts, ok: wrong.length === 0, wrong };
}

if (isMain) {
  const unknown = wanted.filter((w) => !SHAPES.some((s) => s.name === w));
  if (unknown.length) { console.error(`No such shape: ${unknown.join(', ')}. Shapes: ${SHAPES.map((s) => s.name).join(', ')}`); process.exit(2); }
  if (process.platform !== 'darwin') { console.error('These shapes are Mac machines (Dock launch, zsh, /opt/homebrew). Run on macOS.'); process.exit(2); }
  const shapes = wanted.length ? SHAPES.filter((s) => wanted.includes(s.name)) : SHAPES;
  fs.mkdirSync(out, { recursive: true });
  // One at a time: each shape runs up to four login shells, and a loaded Mac
  // turns a shell timeout into a false "no answer".
  const results = [];
  for (const shape of shapes) {
    const r = await checkShape(shape);
    results.push(r);
    r.known = shape.known ?? null;
    const cell = (f) => (!f ? '-' : f.found ? `${f.runs ? 'runs' : 'NO START'} (${f.from})` : `missing${f.certain ? '' : ', unsure'}`);
    const mark = r.ok ? 'PASS' : r.known ? 'KNOWN' : 'FAIL';
    console.log(`${mark.padEnd(5)} ${shape.name.padEnd(36)} claude: ${cell(r.claude).padEnd(18)} codex: ${cell(r.codex)}`);
    for (const w of r.wrong) console.log(`      ${w}`);
    if (!r.ok && r.known) console.log(`      known gap: ${r.known}`);
    if (r.ok && r.known) console.log('      this known gap now holds: take `known` off the shape');
  }
  fs.writeFileSync(path.join(out, 'machines.json'), `${JSON.stringify({ at: new Date().toISOString(), node: process.version, results }, null, 1)}\n`);
  const bad = results.filter((r) => !r.ok && !r.known);
  const known = results.filter((r) => !r.ok && r.known).length;
  console.log(`\n${results.length - bad.length - known}/${results.length} machines held${known ? `, ${known} known gap(s)` : ''}. Evidence: ${path.join(out, 'machines.json')}`);
  process.exit(bad.length ? 1 : 0);
}
