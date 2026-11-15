// A PUSH CARRYING THE RETIRED HISTORY IS REFUSED.
//
// On 2026-10-06 the public main was rewritten from its first commit, because
// that commit carried two real account ids in a test. All 611 commits got new
// ids; the ids were gone from every one of them (0 matches across every object,
// measured after the force-push). About twenty agent branches were still built
// on the old history at that moment.
//
// `npm run ship` merges origin/main with a plain merge, which refuses unrelated
// histories, so those branches stop rather than leak. But the content check
// compares FILES, and an old branch merged in with --allow-unrelated-histories
// can end with files identical to main's: the content check reads no added line
// and lets the whole old history, ids and all, back onto the public main. So
// the check also refuses any push whose commits reach the retired first commit.
//
// AGENTBOX_RETIRED_ROOTS stands in for the real sha here, because a throwaway
// repository cannot hold the real one.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED_ROOTS } from '../scripts/check-before-public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(root, 'scripts', 'check-before-public.mjs');
const ENV = { ...process.env, AGENTBOX_PUBLIC_CHECK_LLM: '0', AGENTBOX_PRIVATE_WORDS: '/nonexistent' };

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-history-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Someone');
  g('config', 'user.email', 'someone@users.noreply.github.com');
  g('config', 'commit.gpgsign', 'false');
  const commit = (file, text, message = `add ${file}`) => {
    fs.writeFileSync(path.join(dir, file), text);
    g('add', '-A');
    g('commit', '-q', '-m', message);
    return g('rev-parse', 'HEAD');
  };
  return { dir, g, commit };
}

/** An old history and a rewritten one with the same files, as on the day. */
function rewritten() {
  const r = repo();
  const oldRoot = r.commit('README.md', '# hello\n');
  r.g('checkout', '-q', '--orphan', 'new');
  r.g('rm', '-rq', '--cached', '.');
  // Same files, so the commit must differ some other way or git, within the
  // same second, hands back the very same commit as the old root.
  const newRoot = r.commit('README.md', '# hello\n', 'add README.md, rewritten');
  expect(newRoot).not.toBe(oldRoot);
  const newTip = r.commit('main.mts', 'export const x = 1;\n');
  return { ...r, oldRoot, newRoot, newTip };
}

const check = (dir, range, retired) => spawnSync('node', [CHECK, '--range', range], {
  cwd: dir, encoding: 'utf8', env: { ...ENV, AGENTBOX_RETIRED_ROOTS: retired },
});

describe('the retired history stays off the public repository', () => {
  it('knows the real retired first commit', () => {
    expect(RETIRED_ROOTS).toContain('be60b8132d7d836336aed45eb30b9d484358f75c');
  });

  it('refuses an old branch merged back in, even when its files match main exactly', () => {
    const { dir, g, oldRoot, newTip } = rewritten();
    g('merge', '-q', '--allow-unrelated-histories', '-s', 'ours', '-m', 'merge old', 'main');
    const merged = g('rev-parse', 'HEAD');
    expect(g('rev-parse', `${merged}^{tree}`)).toBe(g('rev-parse', `${newTip}^{tree}`));
    const r = check(dir, `${newTip}..${merged}`, oldRoot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('retired');
  });

  it('refuses a push of the old branch itself', () => {
    const { dir, g, oldRoot, newRoot } = rewritten();
    const oldTip = g('rev-parse', 'main');
    expect(check(dir, `${newRoot}..${oldTip}`, oldRoot).status).toBe(1);
  });

  it('lets through work built on the rewritten history', () => {
    const { dir, oldRoot, newRoot, newTip } = rewritten();
    const r = check(dir, `${newRoot}..${newTip}`, oldRoot);
    expect(r.status).toBe(0);
  });

  it('says nothing in a copy that has never held the retired commit', () => {
    const { dir, newRoot, newTip } = rewritten();
    const r = check(dir, `${newRoot}..${newTip}`, '0123456789012345678901234567890123456789');
    expect(r.status).toBe(0);
  });
});
