// Fast iteration: --working. Whole branch: default, or --base <parent> for a stack.
// --plan explains the selection without invoking Vitest. Unsafe selections run full.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChanges, planTests } from './lib/test-plan.mjs';

export function parseOptions(args) {
  const options = { files: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--working') options.working = true;
    else if (arg === '--plan') options.explain = true;
    else if (arg === '--base') {
      const base = args[++i];
      if (!base || base.startsWith('-')) throw Error('--base requires a Git ref');
      options.base = base;
    } else if (arg.startsWith('-')) throw Error(`Unknown option: ${arg}`);
    else options.files.push(arg);
  }
  if (options.working && options.base) throw Error('--working and --base are mutually exclusive');
  if (options.files.length && (options.working || options.base)) throw Error('Pass explicit files or a comparison mode, not both');
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = options.files.map(file => {
    const relative = path.relative(root, path.resolve(root, file));
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw Error(`Input is outside this repository: ${file}`);
    return relative;
  });
  const changes = files.length
    ? { files, deleted: files.filter(file => !fs.existsSync(path.join(root, file))) }
    : collectChanges({ root, ...options });
  const plan = planTests({ root, ...changes });
  console.log(`test:changed: ${plan.mode}: ${plan.reason}.`);
  console.log(`Inputs: ${plan.files.length}; additional source-reading tests: ${plan.readers.length}.`);
  if (options.explain) { console.log(JSON.stringify(plan, null, 2)); return 0; }
  if (plan.mode === 'none') return 0;
  const command = plan.mode === 'full'
    ? ['run']
    : ['related', '--run', '--passWithNoTests', ...plan.files, ...plan.readers];
  const run = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), ...command], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, VITEST_MAX_FORKS: process.env.VITEST_MAX_FORKS ?? '2', VITEST_MIN_FORKS: process.env.VITEST_MIN_FORKS ?? '1' },
  });
  if (run.error) console.error(run.error.message);
  return run.status ?? 1;
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
