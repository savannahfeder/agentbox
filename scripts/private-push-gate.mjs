// The private checkout's pre-push hook (scripts/private-hooks/pre-push), which
// main/private-folder.mts and the ship point that checkout at. What is pushed
// there reaches every later agent's instructions and the suite this Mac runs,
// so it gets the public push's rules for keys and unsafe settings and the
// skill tests the change reaches. Not the rules for what only the public
// repository must not hold: the private words, the home folder, the plans.
//
// Git runs it in the private checkout with `<local ref> <local sha> <remote
// ref> <remote sha>` lines on stdin. The way past it: git push --no-verify.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scan } from './check-before-public.mjs';
import { gateFor } from './lib/tests-the-push-runs.mjs';

const ZERO = /^0+$/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const PUBLIC_ONLY = /^(names a real home folder|carries a word from the private list|is part of the private repository)/;
const TESTS_MS = 8 * 60_000;

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const exists = (rev) => { try { git(['cat-file', '-e', `${rev}^{commit}`]); return true; } catch { return false; } };
const refuse = (why) => { console.error(`private push refused: ${why}`); process.exit(1); };

/** The public checkout whose `.agentbox/private.json` names this folder, or null. */
function publicRootOf(here) {
  for (let dir = path.dirname(here); ; dir = path.dirname(dir)) {
    try {
      const { path: rel } = JSON.parse(fs.readFileSync(path.join(dir, '.agentbox/private.json'), 'utf8'));
      if (typeof rel === 'string' && path.resolve(dir, rel) === here) return { root: dir, rel };
    } catch { /* not this one */ }
    if (path.dirname(dir) === dir) return null;
  }
}

function rangesPushed(input, remote) {
  const out = [];
  for (const line of input.split('\n')) {
    const [, local, , theirs] = line.trim().split(/\s+/);
    if (!local || ZERO.test(local) || !exists(local)) continue;
    if (theirs && !ZERO.test(theirs) && exists(theirs)) { out.push({ base: theirs, head: local }); continue; }
    let base = EMPTY_TREE;
    try {
      const edge = git(['rev-list', '--boundary', local, '--not', `--remotes=${remote}`]).split('\n').find((l) => l.startsWith('-'));
      if (edge) base = edge.slice(1);
    } catch { /* read the whole tree */ }
    out.push({ base, head: local });
  }
  return out;
}

const here = process.cwd();
const ranges = rangesPushed(fs.readFileSync(0, 'utf8'), process.argv[2] || 'origin');

const blocked = [];
const changed = new Set();
for (const range of ranges) {
  for (const f of scan({ ...range, words: [] }).findings) {
    if (f.severity === 'block' && !PUBLIC_ONLY.test(f.why)) blocked.push(f);
  }
  const names = range.base === EMPTY_TREE ? git(['ls-tree', '-r', '--name-only', range.head]) : git(['diff', '--name-only', range.base, range.head]);
  for (const name of names.split('\n').filter(Boolean)) changed.add(name);
}
if (blocked.length) {
  for (const f of blocked) console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.why}`);
  refuse(`${blocked.length} thing(s) no push may carry, first ${blocked[0].file}${blocked[0].line ? `:${blocked[0].line}` : ''} ${blocked[0].why}`);
}

const tests = gateFor([...changed], here).files.filter((f) => /\.test\.m[jt]s$/.test(f) && fs.existsSync(path.join(here, f)));
if (tests.length) {
  const owner = publicRootOf(here);
  if (!owner) refuse(`the skill tests (${tests.join(', ')}) run from the public checkout, and none names this folder`);
  const vitest = path.join(owner.root, 'node_modules', '.bin', 'vitest');
  if (!fs.existsSync(vitest)) refuse('the skill tests need the public checkout\'s packages; run npm ci there');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  console.error(`private push: running the ${tests.length} skill test file(s) this push reaches.`);
  const run = spawnSync(vitest, ['run', '--passWithNoTests', ...tests.map((f) => path.join(owner.rel, f))], {
    cwd: owner.root, env, stdio: ['ignore', 2, 2], timeout: TESTS_MS, killSignal: 'SIGKILL',
  });
  if (run.status !== 0) refuse(`the skill tests failed (${tests.join(', ')})`);
}
console.error('private push: checked.');
