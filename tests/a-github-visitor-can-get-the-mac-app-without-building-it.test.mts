// A GITHUB VISITOR CAN GET THE MAC APP WITHOUT BUILDING IT (w-c2801d56ef).
//
// What broke: the repo page is the one place strangers keep finding Agentbox
// (39 to 46 people a day in early November, read off the daily report), and
// its README never linked the signed Mac app. "Get it" led to `git clone`,
// `npm install` and a paragraph about vulnerability counts, while the
// notarised build sat at agentbox.ac/download with no link to it from GitHub.
// Measured by searching the README's whole history for agentbox.ac, .dmg and
// /releases: no commit ever added one.
//
// npm had the same gap in words: its description and keywords said "inbox"
// and never GUI, git worktree or parallel, the words people search, so a
// search for "claude code gui" on npm did not find the package in the top 20.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const DOWNLOAD = 'https://agentbox.ac/download';
const install = readme.slice(readme.indexOf('## Install'), readme.indexOf('\n## ', readme.indexOf('## Install') + 1));

describe('the README hands a visitor the Mac app', () => {
  it('links the signed download', () => {
    expect(readme).toContain(DOWNLOAD);
  });

  it('offers it in Install before the steps that build from source', () => {
    expect(install).toContain(DOWNLOAD);
    expect(install.indexOf(DOWNLOAD)).toBeLessThan(install.indexOf('git clone'));
  });

  it('still keeps building from source for anyone who wants it', () => {
    expect(install).toContain('git clone https://github.com/savannahfeder/agentbox.git');
  });

  it('does not tell a Mac app user they need Node', () => {
    // The packaged app carries its own runtime. The Node floor is for the
    // checkout and the browser copy only.
    expect(install).not.toMatch(/Both need Node/);
  });
});

describe('npm describes the package in the words people search', () => {
  it('says GUI, parallel and git worktree in the description', () => {
    expect(pkg.description).toMatch(/GUI/);
    expect(pkg.description).toMatch(/parallel/);
    expect(pkg.description).toMatch(/git worktree/);
  });

  it('carries the same search words as the repo topics', () => {
    for (const k of ['claude-code', 'codex', 'claude-code-gui', 'git-worktree', 'parallel-agents', 'coding-agents']) {
      expect(pkg.keywords).toContain(k);
    }
  });
});
