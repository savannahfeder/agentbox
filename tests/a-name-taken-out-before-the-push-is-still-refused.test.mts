// A NAME TAKEN OUT BEFORE THE PUSH IS STILL REFUSED.
//
// One commit named three real sales leads in a test comment, the next took the
// names out, and both reached the public main in one push. The check before a
// public push read only the push's net change, where the names cancel, so it
// passed them; every commit's diff is public, so they stayed in history.
// Measured on the real commits: the net change of the push held none of the
// names, the first commit's own diff held all three.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(root, 'scripts/check-before-public.mjs');
const WORD = 'zanzibarquux';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-check-history-'));
  const g = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q');
  g('config', 'user.name', 'Someone');
  g('config', 'user.email', 'someone@users.noreply.github.com');
  g('config', 'commit.gpgsign', 'false');
  const commit = (file: string, text: string) => {
    fs.writeFileSync(path.join(dir, file), text);
    g('add', '-A');
    g('commit', '-q', '-m', `change ${file}`);
    return g('rev-parse', 'HEAD');
  };
  const words = path.join(dir, '..', `${path.basename(dir)}-words.txt`);
  fs.writeFileSync(words, `${WORD}\n`);
  const check = (range: string) => spawnSync('node', [CHECK, '--range', range], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, AGENTBOX_PUBLIC_CHECK_LLM: '0', AGENTBOX_PRIVATE_WORDS: words },
  });
  return { commit, check };
}

describe('the check before a public push', () => {
  it('refuses a private word one commit adds and a later commit in the same push removes', () => {
    const { commit, check } = repo();
    const base = commit('a.mjs', 'export const x = 1;\n');
    commit('a.mjs', `// measured on ${WORD}'s film\nexport const x = 1;\n`);
    const head = commit('a.mjs', '// measured on one lead\'s film\nexport const x = 1;\n');
    const r = check(`${base}..${head}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('a.mjs');
  });

  it('passes the same push when the word never went in', () => {
    const { commit, check } = repo();
    const base = commit('a.mjs', 'export const x = 1;\n');
    commit('a.mjs', '// measured on a film\nexport const x = 1;\n');
    const head = commit('a.mjs', '// measured on one lead\'s film\nexport const x = 1;\n');
    expect(check(`${base}..${head}`).status).toBe(0);
  });

  it('does not refuse a word added and removed before the push, which is already public', () => {
    const { commit, check } = repo();
    commit('a.mjs', `// ${WORD}\n`);
    const base = commit('a.mjs', 'export const x = 1;\n');
    const head = commit('b.mjs', 'export const y = 2;\n');
    expect(check(`${base}..${head}`).status).toBe(0);
  });
});
