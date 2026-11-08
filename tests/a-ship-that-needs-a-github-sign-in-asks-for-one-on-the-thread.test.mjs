// A SHIP THAT NEEDS A GITHUB SIGN-IN ASKS FOR ONE ON THE THREAD.
//
// What broke: when git on the person's computer had no GitHub sign-in, the
// ship's push was refused and the refusal went back to the thread's agent.
// The agent, often on a cloud machine, could do nothing about the computer's
// sign-in, so it answered in words ("run gh auth login in Terminal") or said
// it was checking whether it could use one, and no card ever appeared. Five
// threads in one week ended that way. Measured by feeding the queue the push
// output those threads got and reading what the thread then holds: the app's
// own note, no hand-back, a sign-in card, and a ship again once one is saved.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHIP_LABEL, ShipQueue } from '../main/ship-queue.mts';
import { Store } from '../main/store.mts';
import { gitHubPushSignIn, TOKEN_VAR } from '../main/github-push-sign-in.mts';
import { notShipped, notShippedLine } from '../shared/not-shipped.mts';
import {
  GITHUB_REFUSED_SIGN_IN, NO_GITHUB_SIGN_IN, SHIPPING_AGAIN, asksForGitHubSignIn, notPushedNote, pushNeedsGitHubSignIn,
} from '../shared/github-push-sign-in.mts';

const { GitHubSignInCard } = await import('../renderer/src/components/GitHubSignInCard.tsx');

// What the three threads' pushes printed, around git's own line.
const REFUSED = (line) => `ship: pushing to origin main (attempt 1 of 3). The hook runs the tests and the public check now.\n${line}\nship: that push was refused rather than raced, so nothing was retried. The reason is above.\n`;

describe('which refusals a GitHub sign-in answers', () => {
  it.each([
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "fatal: could not read Password for 'https://someone@github.com': terminal prompts disabled",
    "fatal: Authentication failed for 'https://github.com/savannahfeder/agentbox.git/'",
    'remote: Invalid username or token. Password authentication is not supported for Git operations.',
    'remote: Permission to savannahfeder/agentbox.git denied to someone.',
    'git@github.com: Permission denied (publickey).',
  ])('%s', (line) => {
    expect(pushNeedsGitHubSignIn(REFUSED(line))).toBe(true);
  });

  it('not a red test run, a conflict or a race', () => {
    expect(pushNeedsGitHubSignIn(REFUSED(' FAIL  tests/something.test.mjs > it broke'))).toBe(false);
    expect(pushNeedsGitHubSignIn('CONFLICT (content): Merge conflict in renderer/src/App.tsx')).toBe(false);
    expect(pushNeedsGitHubSignIn(' ! [rejected]        HEAD -> main (fetch first)')).toBe(false);
  });

  it('not a test run that quotes the words in a diff', () => {
    expect(pushNeedsGitHubSignIn(REFUSED("- Expected: \"fatal: could not read Username for 'https://github.com'\""))).toBe(false);
    expect(pushNeedsGitHubSignIn(REFUSED("+ fatal: could not read Username for 'https://github.com'"))).toBe(false);
  });

  it('not a sign-in to somewhere else', () => {
    expect(pushNeedsGitHubSignIn(REFUSED("fatal: could not read Username for 'https://gitlab.com': terminal prompts disabled"))).toBe(false);
  });
});

let tmp; let repo; let userDir; let folders;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-github-'));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
  fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }];
const folderFor = (item) => path.join(folders, item.id);
const row = (over = {}) => ({ id: 'w-a', product: 'team', status: 'blocked', labels: [SHIP_LABEL, 'ui'], updatedAt: 1000, ...over });
const fakeStore = () => { const calls = []; return { calls, shipped: (...a) => calls.push(['shipped', ...a]), shipFailed: (...a) => calls.push(['shipFailed', ...a]) }; };
const NO_USERNAME = REFUSED("fatal: could not read Username for 'https://github.com': terminal prompts disabled");

describe('the ship queue, when the push needs a GitHub sign-in', () => {
  it('writes its own note and does not wake the agent', async () => {
    const store = fakeStore();
    const handed = [];
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, handBack: (i, r) => handed.push(r), run: async () => ({ code: 1, out: NO_USERNAME }) });
    await q.tick([row()], products());
    expect(store.calls).toEqual([['shipFailed', 'team', 'w-a', { note: notPushedNote(false), labels: ['ui'] }]]);
    expect(handed).toEqual([]);
  });

  it('says the saved sign-in was refused when one was used', async () => {
    const store = fakeStore();
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, pushSignIn: () => ({ env: { [TOKEN_VAR]: 't' }, config: [] }), run: async () => ({ code: 1, out: NO_USERNAME }) });
    await q.tick([row()], products());
    expect(store.calls[0][3].note).toBe(notPushedNote(true));
  });

  it('still hands any other refusal back to the agent', async () => {
    const store = fakeStore();
    const handed = [];
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, handBack: (i, r) => handed.push(r), run: async () => ({ code: 1, out: REFUSED(' FAIL  tests/x.test.mjs > broke') }) });
    await q.tick([row()], products());
    expect(handed).toHaveLength(1);
  });

  it('gives the saved sign-in to the push, and nothing when none is saved', async () => {
    const seen = [];
    const run = async (script, cwd, opts) => { seen.push(opts); return { code: 0, out: 'ship: shipped abc1234.\n' }; };
    await new ShipQueue({ store: fakeStore(), userDir, folderFor, isLive: () => false, run }).tick([row()], products());
    await new ShipQueue({ store: fakeStore(), userDir, folderFor, isLive: () => false, run,
      pushSignIn: () => ({ env: { [TOKEN_VAR]: 'tok' }, config: [['credential.https://github.com.helper', 'x']] }) }).tick([row({ updatedAt: 2000 })], products());
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeUndefined();
    expect(seen[1].env[TOKEN_VAR]).toBe('tok');
    expect(seen[1].gitConfig).toEqual([['credential.https://github.com.helper', 'x']]);
  });
});

describe('the thread', () => {
  let root; let dir; let store;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-github-store-'));
    dir = path.join(root, 'p');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Example' }));
    store = await new Store({ accountRoot: root, products: [] }).init();
  });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

  const failed = (note) => {
    const item = store.composeItem('p', { title: 'A task' });
    vi.advanceTimersByTime(1);
    store.shipFailed('p', item.id, { note, labels: ['ui'] });
    vi.advanceTimersByTime(1);
    return item.id;
  };

  it('reads as not shipped, for want of a sign-in, and in Needs you', () => {
    const id = failed(notPushedNote(false));
    const item = store.readItem('p', id);
    expect(item.status).toBe('open');
    expect(notShipped(item).why).toBe(NO_GITHUB_SIGN_IN);
    expect(asksForGitHubSignIn(notShipped(item).why)).toBe(true);
    expect(item.note).toBe('It did not ship because this computer could not sign in to GitHub.');
    expect(notShippedLine(item)).toBe('Not shipped. This computer could not sign in to GitHub');
  });

  it('ships again once the sign-in is saved, and only the threads that waited on it', () => {
    const waiting = failed(notPushedNote(false));
    const refused = failed(notPushedNote(true));
    const red = failed('It did not ship, and it went back to its agent: 2 tests failed');
    expect(store.shipAgainAfterGitHubSignIn().sort()).toEqual([waiting, refused].sort());
    for (const id of [waiting, refused]) {
      const item = store.readItem('p', id);
      expect(item.labels).toEqual(['ui', 'ship']);
      expect(item.note).toBe(SHIPPING_AGAIN);
      expect(notShipped(item)).toBeNull();
    }
    expect(store.readItem('p', red).labels).toEqual(['ui']);
  });
});

describe('the sign-in kept on this computer', () => {
  const cipher = { encrypt: (t) => Buffer.from(`sealed:${t}`), decrypt: (b) => String(b).replace(/^sealed:/, '') };
  const answers = (status, scopes = null) => async () => ({ status, headers: { get: (n) => (n === 'x-oauth-scopes' ? scopes : null) } });
  const file = () => path.join(tmp, 'github-sign-in.sealed');

  it('is kept sealed once GitHub takes it, and goes to the push', async () => {
    const s = gitHubPushSignIn({ file: file(), cipher, fetchImpl: answers(200, 'repo, workflow') });
    expect(s.forPush()).toBeNull();
    await s.save('  ghp_abc  ');
    expect(fs.readFileSync(file(), 'utf8')).toMatch(/^sealed:/);
    expect(s.forPush().env).toEqual({ [TOKEN_VAR]: 'ghp_abc' });
  });

  it('is refused, and nothing kept, when GitHub does not take it', async () => {
    await expect(gitHubPushSignIn({ file: file(), cipher, fetchImpl: answers(401) }).save('ghp_bad')).rejects.toThrow('GitHub did not accept that token');
    await expect(gitHubPushSignIn({ file: file(), cipher, fetchImpl: answers(200, 'read:user') }).save('ghp_weak')).rejects.toThrow('repo box');
    await expect(gitHubPushSignIn({ file: file(), cipher, fetchImpl: async () => { throw new Error('offline'); } }).save('ghp_x')).rejects.toThrow('GitHub did not answer');
    expect(fs.existsSync(file())).toBe(false);
  });

  it('takes a fine-grained token, which lists no scopes', async () => {
    await gitHubPushSignIn({ file: file(), cipher, fetchImpl: answers(200, null) }).save('github_pat_abc');
    expect(gitHubPushSignIn({ file: file(), cipher }).has()).toBe(true);
  });

  it('is not kept where nothing can seal it', async () => {
    await expect(gitHubPushSignIn({ file: file(), cipher: null, fetchImpl: answers(200) }).save('ghp_abc')).rejects.toThrow('cannot encrypt');
  });

  it('asks GitHub with a deadline', async () => {
    let signal = null;
    await gitHubPushSignIn({ file: file(), cipher, fetchImpl: async (u, init) => { signal = init.signal; return { status: 200, headers: { get: () => null } }; } }).save('ghp_abc');
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe('the card', () => {
  const draw = (why) => renderToStaticMarkup(h(GitHubSignInCard, { why, signIn: async () => ({ error: 'x' }), save: async () => null, openLink: () => {}, copy: () => {} }));

  it('asks for a sign-in, with a token as the other way', () => {
    const html = draw(NO_GITHUB_SIGN_IN);
    expect(html).toContain('Sign in to GitHub');
    expect(html).toContain('Sign in with GitHub');
    expect(html).toContain('Paste a token instead');
  });

  it('says a saved token was refused', () => {
    expect(draw(GITHUB_REFUSED_SIGN_IN)).toContain('Sign in to GitHub again');
    expect(draw(NO_GITHUB_SIGN_IN)).not.toContain('again<');
  });
});
