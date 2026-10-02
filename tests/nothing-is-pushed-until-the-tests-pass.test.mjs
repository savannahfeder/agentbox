// Tests run locally before every push. It began as the whole suite, because
// GitHub Actions had stopped starting runs for the old organisation; since
// 2026-10-01 GitHub runs the whole suite on every push to the public repo, and
// the hook runs the tests for what the push changed (see "a push tests what it
// changed" below).
//
// So the guard against breaking onboarding is now a git hook, and a hook is a
// strange thing to trust: it lives outside the code it protects, git will not
// version the directory it has to sit in, and when it silently does nothing the
// symptom is a push that looks exactly like a push that passed. That is the
// whole reason for this file. Every test here runs the real
// scripts/hooks/pre-push in a throwaway repository with a stand-in vitest, so
// what is measured is the script itself rather than a description of it.
//
// The stand-in matters: a hook test that ran the real suite would run the suite
// inside the suite, which is both slow and circular.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'scripts/hooks/pre-push');
const INSTALLER = path.join(root, 'scripts/install-hooks.mjs');

const ZERO = '0000000000000000000000000000000000000000';
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function tmpRepo(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `zero-${tag}-`));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** A vitest that does what we tell it, and leaves a note saying it ran. */
function fakeVitest(dir, { exitCode }) {
  const bin = path.join(dir, 'node_modules/.bin/vitest');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(
    bin,
    `#!/bin/sh\necho ran > "${path.join(dir, 'vitest-ran')}"\necho "pretend suite output"\nexit ${exitCode}\n`,
  );
  fs.chmodSync(bin, 0o755);
}

/**
 * A vitest that is red the first time and green the second, which is what a
 * busy Mac looks like. It writes the json report the hook reads to decide what
 * to re-run, and records the arguments of every call so a test can check that
 * the retry asked for the right file and nothing else. */
function flakyVitest(dir, { redFiles, stillRedOnRetry = false }) {
  const bin = path.join(dir, 'node_modules/.bin/vitest');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  const calls = path.join(dir, 'vitest-calls');
  // The named files really exist, the way they do in the repo, because the
  // hook has to turn an absolute path in the report back into one it can hand
  // to vitest.
  for (const name of redFiles) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), '// a test that went red\n');
  }
  const report = JSON.stringify({
    testResults: redFiles.map((name) => ({
      name: path.join(dir, name),
      status: 'failed',
      assertionResults: [{ status: 'failed', title: 'went red because the Mac was busy' }],
    })),
  });
  fs.writeFileSync(
    bin,
    [
      '#!/bin/sh',
      `echo ran > "${path.join(dir, 'vitest-ran')}"`,
      // One line per call, holding that call's arguments.
      `echo "$@" >> "${calls}"`,
      `n=$(wc -l < "${calls}" | tr -d " ")`,
      // The report only exists on the first pass, the way vitest writes it.
      'for a in "$@"; do',
      '  case "$a" in',
      `    --outputFile.json=*) printf '%s' '${report}' > "\${a#--outputFile.json=}" ;;`,
      '  esac',
      'done',
      'echo "pretend suite output"',
      `if [ "$n" -eq 1 ]; then exit 1; fi`,
      `exit ${stillRedOnRetry ? 1 : 0}`,
    ].join('\n') + '\n',
  );
  fs.chmodSync(bin, 0o755);
  return () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : []);
}

/**
 * Runs the real hook the way git runs it: cwd at the tree root, refs on stdin,
 *  and git's own variables in the environment. */
function runHook(dir, stdin, env = {}, args = []) {
  const hook = path.join(dir, 'pre-push');
  fs.copyFileSync(HOOK, hook);
  fs.chmodSync(hook, 0o755);
  // The hook reads the red files out of the json report with this helper, so
  // the throwaway repo needs it too.
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/red-test-files.mjs'), path.join(dir, 'scripts/red-test-files.mjs'));
  const r = spawnSync(hook, args, { cwd: dir, input: stdin, encoding: 'utf8', env: { ...process.env, AGENTBOX_PUSH_FULL_SUITE: '', ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const ranTests = (dir) => fs.existsSync(path.join(dir, 'vitest-ran'));

describe('the hook decides whether the push happens', () => {
  it('lets the push through when the suite is green', () => {
    const dir = tmpRepo('green');
    fakeVitest(dir, { exitCode: 0 });
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    expect(code).toBe(0);
    expect(ranTests(dir)).toBe(true);
    expect(out).toContain('green');
  });

  it('refuses the push when one test is red, and says how to get past it anyway', () => {
    const dir = tmpRepo('red');
    fakeVitest(dir, { exitCode: 1 });
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    // A non-zero exit is the whole mechanism. Nothing leaves.
    expect(code).toBe(1);
    expect(ranTests(dir)).toBe(true);
    expect(out).toContain('PUSH REFUSED');
    expect(out).toContain('--no-verify');
  });

  // A RED RUN ON A BUSY MAC IS NOT A VERDICT ON THE CODE.
  //
  // Three pushes of one green tree were refused in a row on 2026-09-19, at 363s,
  // 1267s and 1765s against a suite that takes 22s quiet. Each named something
  // different and not one was an assertion about behaviour: two vitest worker
  // RPC timeouts and `expected 2012 to be less than 1000` from a chess search
  // that costs 44ms. So the red files get a second, quiet run before the push
  // is refused.
  it('lets the push through when a red file passes on its own', () => {
    const dir = tmpRepo('flaky');
    const calls = flakyVitest(dir, { redFiles: ['tests/games-chess.test.mjs'] });
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    expect(code).toBe(0);
    expect(out).toContain('tests/games-chess.test.mjs');
    expect(out).toContain('That was the machine, not the code');
    expect(out).not.toContain('PUSH REFUSED');
    // Twice: the whole suite, then that one file.
    expect(calls().length).toBe(2);
  });

  it('re-runs only the red file, alone, and not the whole suite again', () => {
    const dir = tmpRepo('onlyred');
    const calls = flakyVitest(dir, { redFiles: ['tests/games-chess.test.mjs'] });
    runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    const retry = calls()[1];
    expect(retry).toContain('tests/games-chess.test.mjs');
    // Nothing running beside it, because competing forks are the condition
    // being ruled out. Not `--poolOptions.forks.maxForks=1`, which conflicts
    // with the default minimum and kills the run before a test executes.
    expect(retry).toContain('--no-file-parallelism');
  });

  it('still refuses when the red file is red on its own too', () => {
    const dir = tmpRepo('reallyred');
    flakyVitest(dir, { redFiles: ['tests/a-real-break.test.mjs'], stillRedOnRetry: true });
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    expect(code).toBe(1);
    expect(out).toContain('PUSH REFUSED');
    expect(out).toContain('failed twice');
  });

  it('runs the whole suite again when the red run named no file at all', () => {
    // What an unhandled worker error looks like: the run fails and no single
    // file is marked failed. There is nothing to retry by name, so the only
    // honest second opinion is the whole suite.
    const dir = tmpRepo('noname');
    const calls = flakyVitest(dir, { redFiles: [] });
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    expect(code).toBe(0);
    expect(out).toContain('without naming a file');
    expect(calls().length).toBe(2);
    // The second run is the whole suite: no file was named on it.
    expect(calls()[1]).not.toContain('tests/');
  });

  it('will not pretend the tests passed when there is no vitest to run them', () => {
    const dir = tmpRepo('novitest');
    const { code, out } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
    expect(code).toBe(1);
    expect(out).toContain('PUSH REFUSED');
    expect(out).toContain('npm install');
  });

  it('hands the suite a clean environment, with none of git s own variables in it', () => {
    // THE FIRST PUSH THIS HOOK EVER RAN FAILED ON THIS, 2026-08-24. Git exports
    // GIT_DIR to its hooks, GIT_DIR beats `git -C somewhere-else`, and so a test
    // that asks git about a throwaway folder was answered about this repository.
    // Three tests were red inside the hook and green from a shell on the same
    // commit, which is the worst shape a guard can have: it refuses a push and
    // the failure will not reproduce when you go looking for it.
    const dir = tmpRepo('env');
    const bin = path.join(dir, 'node_modules/.bin/vitest');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\nenv > "${path.join(dir, 'env-seen')}"\nexit 0\n`);
    fs.chmodSync(bin, 0o755);

    const { code } = runHook(dir, `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`, {
      GIT_DIR: '/somewhere/else/.git',
      GIT_INDEX_FILE: '/somewhere/else/.git/index',
      GIT_REFLOG_ACTION: 'push',
    });
    expect(code).toBe(0);

    const seen = fs.readFileSync(path.join(dir, 'env-seen'), 'utf8').split('\n');
    expect(seen.filter((l) => l.startsWith('GIT_'))).toEqual([]);
  });

  it('costs nothing when git hands it nothing, which is what a rejected branch looks like', () => {
    const dir = tmpRepo('empty');
    fakeVitest(dir, { exitCode: 1 });
    const { code, out } = runHook(dir, '');
    expect(code).toBe(0);
    expect(ranTests(dir)).toBe(false);
    expect(out).toContain('nothing to test');
  });

  it('costs nothing on a push that only deletes a branch', () => {
    const dir = tmpRepo('delete');
    fakeVitest(dir, { exitCode: 1 });
    // An all-zero local sha is git saying "delete the remote ref". No code moves.
    const { code } = runHook(dir, `(delete) ${ZERO} refs/heads/old ${SHA}\n`);
    expect(code).toBe(0);
    expect(ranTests(dir)).toBe(false);
  });

  it('still runs when a delete and a real branch go up together', () => {
    const dir = tmpRepo('mixed');
    fakeVitest(dir, { exitCode: 0 });
    const { code } = runHook(
      dir,
      `(delete) ${ZERO} refs/heads/old ${SHA}\nrefs/heads/main ${SHA} refs/heads/main ${ZERO}\n`,
    );
    expect(code).toBe(0);
    expect(ranTests(dir)).toBe(true);
  });
});

// A PUSH RUNS THE TESTS FOR WHAT IT CHANGED, NOT ALL OF THEM (2026-10-01).
//
// Every push ran all 618 files, and every agent ran them again before it
// reported. On a Mac with several agents at once the suite took 170 to 1964
// seconds instead of about 25, at load averages of 14 to 23, and agents sat in
// the hook for most of their run. GitHub runs the whole suite on every push to
// the public repo (and is green since d82043d), so the hook runs what the
// change can break: `vitest related` on the files the push carries. A change to
// something every test depends on still runs everything.
function commit(dir, files, message = 'change') {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('add', '-A');
  git('-c', 'user.email=t@x.test', '-c', 'user.name=t', 'commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD').trim();
}

/** A repo with a first commit, as a remote already has it, and the vitest stand-in. */
function repoWithBase(tag) {
  const dir = tmpRepo(tag);
  const calls = flakyVitest(dir, { redFiles: [] });
  // The stand-in is green from its first call here: this block is about what
  // the hook ASKS for, not about retries.
  fs.writeFileSync(path.join(dir, 'node_modules/.bin/vitest'),
    `#!/bin/sh\necho ran > "${path.join(dir, 'vitest-ran')}"\necho "$@" >> "${path.join(dir, 'vitest-calls')}"\nexit 0\n`);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\nvitest-*\npre-push\nscripts/red-test-files.mjs\n');
  const base = commit(dir, { 'main/a.mjs': 'export const a = 1;\n', 'docs/notes.md': 'notes\n' }, 'base');
  return { dir, calls, base };
}

describe('a push tests what it changed', () => {
  it('runs only the tests related to the files the push carries', () => {
    const { dir, calls, base } = repoWithBase('related');
    const head = commit(dir, { 'main/a.mjs': 'export const a = 2;\n', 'tests/a.test.mjs': '// a\n' });
    const { code, out } = runHook(dir, `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(code).toBe(0);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatch(/^related --run /);
    expect(calls()[0]).toContain('main/a.mjs');
    expect(calls()[0]).toContain('tests/a.test.mjs');
    expect(out).toContain('GitHub runs the whole suite');
  });

  it('runs no tests at all for a push that changes only words', () => {
    const { dir, calls, base } = repoWithBase('docs');
    const head = commit(dir, { 'docs/notes.md': 'more notes\n', 'README.md': 'hi\n' });
    const { code, out } = runHook(dir, `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(code).toBe(0);
    expect(calls()).toEqual([]);
    expect(out).toContain('no code');
  });

  it('runs the whole suite when the push changes what every test depends on', () => {
    const { dir, calls, base } = repoWithBase('deps');
    const head = commit(dir, { 'package.json': '{}\n', 'main/a.mjs': 'export const a = 3;\n' });
    runHook(dir, `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]).not.toContain('related');
  });

  it('measures a new branch from where it left main, not from nothing', () => {
    const { dir, calls, base } = repoWithBase('branch');
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', base], { cwd: dir });
    const head = commit(dir, { 'main/b.mjs': 'export const b = 1;\n' });
    runHook(dir, `refs/heads/x ${head} refs/heads/x ${ZERO}\n`, {}, ['origin', 'https://example.test/r.git']);
    expect(calls()[0]).toMatch(/^related --run /);
    expect(calls()[0]).toContain('main/b.mjs');
    expect(calls()[0]).not.toContain('main/a.mjs');
  });

  it('runs the whole suite when it cannot tell what changed', () => {
    // The remote's commit is not here, so there is nothing to compare with.
    const { dir, calls } = repoWithBase('unknown');
    const head = commit(dir, { 'main/a.mjs': 'export const a = 4;\n' });
    runHook(dir, `refs/heads/main ${head} refs/heads/main ${SHA}\n`);
    expect(calls()[0]).not.toContain('related');
  });

  it('runs the whole suite when asked to', () => {
    const { dir, calls, base } = repoWithBase('forced');
    const head = commit(dir, { 'main/a.mjs': 'export const a = 5;\n' });
    runHook(dir, `refs/heads/main ${head} refs/heads/main ${base}\n`, { AGENTBOX_PUSH_FULL_SUITE: '1' });
    expect(calls()[0]).not.toContain('related');
  });
});

describe('the hook is switched on without anyone remembering to', () => {
  /** A checkout-shaped copy: scripts/ and a git dir, which is all the installer reads. */
  function checkout(tag) {
    const dir = tmpRepo(tag);
    fs.mkdirSync(path.join(dir, 'scripts/hooks'), { recursive: true });
    fs.copyFileSync(INSTALLER, path.join(dir, 'scripts/install-hooks.mjs'));
    fs.copyFileSync(HOOK, path.join(dir, 'scripts/hooks/pre-push'));
    return dir;
  }

  /**
   * No GIT_ variables: this stands in for npm install in an ordinary shell,
   *  and an inherited GIT_DIR would make a folder that is not a repo look
   *  like one. */
  const install = (dir) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    return spawnSync(process.execPath, [path.join(dir, 'scripts/install-hooks.mjs')], { encoding: 'utf8', env });
  };

  const hooksPath = (dir) =>
    spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).stdout.trim();

  it('points git at the versioned hooks directory', () => {
    const dir = checkout('install');
    expect(install(dir).status).toBe(0);
    expect(hooksPath(dir)).toBe('scripts/hooks');
  });

  it('says so and changes nothing when it is already on', () => {
    const dir = checkout('again');
    install(dir);
    const second = install(dir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('already on');
    expect(hooksPath(dir)).toBe('scripts/hooks');
  });

  it('leaves a hooks path somebody else chose alone', () => {
    const dir = checkout('theirs');
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: dir });
    expect(install(dir).status).toBe(0);
    expect(hooksPath(dir)).toBe('.husky');
  });

  it('does not break an install where there is no git repository at all', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-nogit-'));
    fs.mkdirSync(path.join(dir, 'scripts/hooks'), { recursive: true });
    fs.copyFileSync(INSTALLER, path.join(dir, 'scripts/install-hooks.mjs'));
    fs.copyFileSync(HOOK, path.join(dir, 'scripts/hooks/pre-push'));
    const r = install(dir);
    // npm runs this on every install. It may complain; it may not fail.
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('not a git checkout');
  });

  it('runs itself from npm install, which is how a second computer gets it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.prepare).toBe('node scripts/install-hooks.mjs');
    expect(pkg.scripts['hooks:install']).toBe('node scripts/install-hooks.mjs');
  });

  it('is committed executable, because git will skip a hook that is not', () => {
    const mode = execFileSync('git', ['ls-files', '-s', 'scripts/hooks/pre-push'], {
      cwd: root,
      encoding: 'utf8',
    }).split(' ')[0];
    expect(mode).toBe('100755');
  });
});

// THE DEFECT THE HOOK FOUND ON ITS FIRST PUSH.
//
// The first task of the setup walk answers with a sentence about the folder the
// person picked, and half of that sentence is git's answer for when it last
// changed. `git -C <folder> log` looks like it is asking about that folder, and
// it is not: an exported GIT_DIR overrules -C. So Agentbox started from a shell
// that had one, which is any shell inside a git hook, described every project
// with a stranger's commits, including folders that are not repositories at all.
describe('the first task s sentence is about the folder, not about wherever we were started from', () => {
  it('says a folder that is not a repository was last touched, whatever GIT_DIR says', async () => {
    const { lastCommit } = await import('../main/first-run.mjs');
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-notarepo-'));
    fs.writeFileSync(path.join(notARepo, 'main.py'), 'print(1)\n');

    const before = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(root, '.git');
    try {
      expect(lastCommit(notARepo)).toBe(null);
    } finally {
      if (before === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = before;
    }
  });

  it('still gives git s own answer for a folder that really is a repository', async () => {
    const { lastCommit } = await import('../main/first-run.mjs');
    const repo = tmpRepo('realrepo');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n');
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'], { cwd: repo });
    expect(lastCommit(repo)).toMatch(/ago$|^just now$/);
  });
});
