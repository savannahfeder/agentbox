// NOTHING PRIVATE GOES TO THE PUBLIC REPOSITORY.
//
// The repository went public with its author's working notes, a recording of a
// real session listing her skills and connectors, and several hundred comments
// quoting her, and nothing stood between a commit and the push. So
// scripts/check-before-public.mjs now runs in the pre-push hook, and this file
// proves it refuses what it should and lets through what it should.
//
// The fake keys and quotes below are built from pieces on purpose. Written out
// whole, this file would be refused by the very check it tests.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLine, checkPath, checkRecording } from '../scripts/check-before-public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(root, 'scripts/check-before-public.mjs');
const HOOK = path.join(root, 'scripts/hooks/pre-push');

const KEY = 'sk-ant-' + 'api03-' + 'Q'.repeat(40);
const GH = 'gh' + 'p_' + 'a1B2'.repeat(10);
const AWS = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const QUOTE = '// Her' + 's, 2026-08-24: "run every test before a push"';
const HER_WORDS = '// Her ' + 'words: "this was wrong"';
const FOUNDER = '// the ' + 'founder, 2026-08-16, approving the card';
const TLS = 'agent: { rejectUnauth' + 'orized: false }';
const WORD = 'zanzibarquux';

const blocks = (file, text, opts) => checkLine(file, text, opts).filter((f) => f.severity === 'block');

describe('a line the push adds', () => {
  it('is refused when it carries a real-shaped key', () => {
    for (const k of [KEY, GH, AWS]) expect(blocks('a.mjs', `const k = '${k}';`)).not.toEqual([]);
  });

  it('passes a stand-in that only looks like a key', () => {
    expect(blocks('a.test.mjs', "vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-not-real');")).toEqual([]);
    expect(blocks('a.test.mjs', "posthogKey: 'phc_baked'")).toEqual([]);
  });

  it('is refused when it names the home folder of whoever is pushing, and not a made-up one', () => {
    expect(blocks('a.mjs', `const p = '${os.homedir()}/Desktop/x';`)).not.toEqual([]);
    expect(blocks('a.mjs', "const p = '/Users/you/Desktop/x';")).toEqual([]);
    expect(blocks('a.mjs', "const p = '/Users/leon/Desktop/x';")).toEqual([]);
  });

  it('is refused when it carries a private word, as a whole word only', () => {
    expect(blocks('a.mjs', `// thanks ${WORD}`, { words: [WORD] })).not.toEqual([]);
    expect(blocks('a.mjs', `// thanks ${WORD.toUpperCase()}`, { words: [WORD] })).not.toEqual([]);
    expect(blocks('a.mjs', `// github.com/${WORD}smith/x`, { words: [WORD] })).toEqual([]);
  });

  it('is refused when it quotes a person, and only warned about in an audit', () => {
    expect(blocks('a.mjs', QUOTE)).not.toEqual([]);
    expect(blocks('a.mjs', HER_WORDS)).not.toEqual([]);
    expect(blocks('a.mjs', QUOTE, { soft: true })).toEqual([]);
    expect(checkLine('a.mjs', QUOTE, { soft: true })).toHaveLength(1);
    expect(blocks('a.mjs', FOUNDER)).not.toEqual([]);
    expect(blocks('a.mjs', '// Her' + 's, same day: "drop the last two"')).not.toEqual([]);
    expect(blocks('a.mjs', '// the user wants every test run before a push')).toEqual([]);
    // The pronoun alone is how this code names its user, and is not a quote.
    expect(blocks('a.mjs', "it('keeps a sentence exactly as she typed it', () => {")).toEqual([]);
    expect(blocks('a.mjs', '// hands her words back to the queue when the run died')).toEqual([]);
    expect(blocks('a.mjs', '// this, and that')).toEqual([]);
  });

  it('is refused when it switches off a security boundary', () => {
    expect(blocks('a.mjs', TLS)).not.toEqual([]);
    expect(blocks('a.mjs', 'webPrefs: { nodeInteg' + 'ration: true }')).not.toEqual([]);
    expect(blocks('a.mjs', 'webPrefs: { contextIsolation: true }')).toEqual([]);
  });

  it('is let through when it says public-check: allow on purpose', () => {
    expect(blocks('a.test.mjs', `expect(reject('${KEY}')).toBe(true); // public-check: allow`)).toEqual([]);
  });
});

describe('a file the push adds', () => {
  it('is refused by its path when it is private by nature', () => {
    for (const p of ['.env', 'app/.env.local', 'zero.config.json', 'briefs/founder.md', 'work-items.jsonl',
      'decisions.md', 'shots/demo.mp4', 'secrets/id_rsa', 'build/cert.p12']) {
      expect(checkPath(p), p).not.toEqual([]);
    }
  });

  it('passes ordinary files and example configs', () => {
    for (const p of ['.env.example', 'README.md', 'main/main.mjs', 'renderer/src/App.tsx', 'tests/fixtures/x.jsonl']) {
      expect(checkPath(p), p).toEqual([]);
    }
  });

  it('is refused when it is a recorded session listing its machine\'s setup', () => {
    const init = (extra) => JSON.stringify({ type: 'system', subtype: 'init', mcp_servers: [], skills: [], plugins: [], ...extra });
    expect(checkRecording('t/run.stream.jsonl', init({ skills: ['my-private-skill'] }))).not.toEqual([]);
    expect(checkRecording('t/run.stream.jsonl', init({ mcp_servers: [{ name: 'claude.ai Slack' }] }))).not.toEqual([]);
    expect(checkRecording('t/run.stream.jsonl', init({}))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The script and the hook, run for real against a throwaway repository.

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-check-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q');
  g('config', 'user.name', 'Someone');
  g('config', 'user.email', 'someone@users.noreply.github.com');
  g('config', 'commit.gpgsign', 'false');
  const commit = (file, text, env = {}) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
    g('add', '-A');
    execFileSync('git', ['commit', '-q', '-m', `add ${file}`], { cwd: dir, env: { ...process.env, ...env } });
    return g('rev-parse', 'HEAD');
  };
  return { dir, g, commit };
}

const ENV = { ...process.env, AGENTBOX_PUBLIC_CHECK_LLM: '0', AGENTBOX_PRIVATE_WORDS: '/nonexistent' };

function runCheck(dir, args, env = {}) {
  return spawnSync('node', [CHECK, ...args], { cwd: dir, encoding: 'utf8', env: { ...ENV, ...env } });
}

describe('the check, run by hand over a range', () => {
  it('refuses a range that adds a key and passes one that does not', () => {
    const { dir, commit } = repo();
    const base = commit('README.md', '# hello\n');
    const clean = commit('main.mjs', 'export const x = 1;\n');
    const dirty = commit('config.mjs', `export const key = '${KEY}';\n`);
    expect(runCheck(dir, ['--range', `${base}..${clean}`]).status).toBe(0);
    const r = runCheck(dir, ['--range', `${clean}..${dirty}`]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('config.mjs:1');
  });

  it('still checks when it is reached through a link, the way /tmp is on a Mac', () => {
    // It used to compare the path it was run by against its own real path, and
    // through a link the two differ, so it exited 0 having read nothing.
    const { dir, commit } = repo();
    const base = commit('README.md', '# hello\n');
    const dirty = commit('config.mjs', `export const key = '${KEY}';\n`);
    const link = path.join(dir, '..', `${path.basename(dir)}-check.mjs`);
    fs.symlinkSync(CHECK, link);
    const r = spawnSync('node', [link, '--range', `${base}..${dirty}`], { cwd: dir, encoding: 'utf8', env: ENV });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUSH REFUSED');
  });

  it('does not refuse what was already there before the range', () => {
    const { dir, commit } = repo();
    commit('old.mjs', `${QUOTE}\n`);
    const base = commit('README.md', '# hello\n');
    const head = commit('new.mjs', 'export const y = 2;\n');
    expect(runCheck(dir, ['--range', `${base}..${head}`]).status).toBe(0);
  });

  it('refuses a commit signed with an email from the private list', () => {
    const { dir, commit } = repo();
    const base = commit('README.md', '# hello\n');
    const head = commit('a.mjs', 'export const z = 3;\n', {
      GIT_AUTHOR_EMAIL: `${WORD}@example.com`, GIT_COMMITTER_EMAIL: `${WORD}@example.com`,
    });
    const words = path.join(dir, '..', `${path.basename(dir)}-words.txt`);
    fs.writeFileSync(words, `# private\n${WORD}@example.com\n`);
    const r = runCheck(dir, ['--range', `${base}..${head}`], { AGENTBOX_PRIVATE_WORDS: words });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('private email');
  });
});

describe('the pre-push hook', () => {
  function fakeVitest(dir) {
    const bin = path.join(dir, 'node_modules/.bin/vitest');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\necho ran > "${path.join(dir, 'vitest-ran')}"\nexit 0\n`);
    fs.chmodSync(bin, 0o755);
  }

  // The throwaway repo names its public home the way this one does, in
  // package.json, and that is the only remote the check guards.
  const PUBLIC = 'https://example.com/public/x.git';
  const PKG = JSON.stringify({ name: 'x', repository: { type: 'git', url: `git+${PUBLIC}` } });

  function push(dir, base, head, url = PUBLIC) {
    return spawnSync('sh', [HOOK, 'origin', url], {
      cwd: dir, encoding: 'utf8', env: ENV,
      input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
    });
  }

  it('refuses a push to the public repo that adds a key, before the suite even starts', () => {
    const { dir, commit } = repo();
    const base = commit('package.json', PKG);
    const head = commit('config.mjs', `export const key = '${KEY}';\n`);
    fakeVitest(dir);
    const r = push(dir, base, head);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUSH REFUSED');
    expect(fs.existsSync(path.join(dir, 'vitest-ran'))).toBe(false);
  });

  it('does not guard a push to any other remote', () => {
    // A private remote may hold what the public one may not, a maintainer's
    // own signed email for one, and refusing it would teach skipping the hook.
    const { dir, commit } = repo();
    const base = commit('package.json', PKG);
    const head = commit('config.mjs', `export const key = '${KEY}';\n`);
    fakeVitest(dir);
    const r = push(dir, base, head, 'https://example.com/private/x.git');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('not the public repository');
  });

  it('lets a clean push through to the suite', () => {
    const { dir, commit } = repo();
    const base = commit('package.json', PKG);
    const head = commit('main.mjs', 'export const x = 1;\n');
    fakeVitest(dir);
    const r = push(dir, base, head);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(dir, 'vitest-ran'))).toBe(true);
  });
});
