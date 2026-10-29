// A FIRST TASK THAT COULD NOT BE FINISHED (F-139).
//
// On the Linux QA box 2026-10-28, a brand-new user ran the README's desktop
// path and gave the app its first task. The agent wrote the change, could not
// commit it, and asked in the thread: "What name and email should I use for
// the commit?" Under that question the app drew its own offer:
//
//   This change was never committed.
//   1 Commit it and ship (recommended)   2 Discard the change
//
// Neither press says a name or an email, so the recommended one cannot answer
// the question above it. The worker checks the identity with
// `COMMIT_IDENTITY_CHECK` and asks again, which is where the thread stops. Two
// runs out of two.
//
// The app reads the same question off the folder when the run ends, and when
// git cannot name an author the offer becomes the one press that can finish
// the task: a line to fill in with a name and an email.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotRepo, changeFromRepo, gitKnowsYou } from '../main/git-change.mjs';
import { writeChangeForRun, knowsYouAcross } from '../main/code-change.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { changePath } from '../main/code-change.mjs';
import { COMMIT_IDENTITY_CHECK, workerGitBrief } from '../main/worker-git.mjs';
import {
  COMMIT_FIRST_OFFER, NAME_YOURSELF_ASK, NAME_YOURSELF_OFFER, NOT_COMMITTED_ASK, SHIP_OFFER,
  shipOfferFor, standingFrom, UNREAD,
} from '../renderer/src/ship-offer.ts';
import { needsYourWords, discardsTheChange } from '../renderer/src/format.ts';

// NOBODY ON THIS MACHINE: no global config, no system config, and none of the
// variables git reads a name from. Every `git` below runs with this.
const NAMELESS = { HOME: '/nonexistent', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const env = () => {
  const out = { ...process.env, ...NAMELESS };
  for (const k of Object.keys(out)) if (/^GIT_(AUTHOR|COMMITTER)/.test(k) || k === 'EMAIL') delete out[k];
  return out;
};
const run = (cwd, ...args) => execFileSync('git', args, { cwd, env: env(), encoding: 'utf8', stdio: 'pipe' });

describe('whether git in this folder can name an author', () => {
  let dir;
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    Object.assign(process.env, NAMELESS);
    for (const k of Object.keys(process.env)) if (/^GIT_(AUTHOR|COMMITTER)/.test(k) || k === 'EMAIL') delete process.env[k];
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nameless-')));
    run(dir, 'init', '-q', '-b', 'main', '.');
    fs.writeFileSync(path.join(dir, 'README.md'), '# wordcount\n');
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('says no when nothing anywhere names the person', () => {
    expect(gitKnowsYou(dir)).toBe(false);
  });

  it('says yes once they are named, and that is both halves of a commit', () => {
    run(dir, 'config', 'user.name', 'Example Developer');
    expect(gitKnowsYou(dir)).toBe(false);
    run(dir, 'config', 'user.email', 'developer@example.test');
    expect(gitKnowsYou(dir)).toBe(true);
  });

  // THE APP AND THE WORKER ASK THE SAME QUESTION. The worker's brief runs
  // COMMIT_IDENTITY_CHECK and asks the thread when it fails; an offer read off
  // a looser question would go on recommending a commit the worker then
  // refuses to make, which is the loop F-139 ended in. A git that would make
  // an identity up out of the account and the host name is a no to both.
  it('agrees with the check the worker runs, in every state', () => {
    const check = () => {
      try { execFileSync('/bin/sh', ['-c', COMMIT_IDENTITY_CHECK], { cwd: dir, env: env(), stdio: 'pipe' }); return true; }
      catch { return false; }
    };
    expect(gitKnowsYou(dir)).toBe(check());
    run(dir, 'config', 'user.name', 'Example Developer');
    expect(gitKnowsYou(dir)).toBe(check());
    run(dir, 'config', 'user.email', 'developer@example.test');
    expect(gitKnowsYou(dir)).toBe(check());
  });

  it('answers nothing where there is no repository to read', () => {
    expect(gitKnowsYou(null)).toBe(null);
    expect(gitKnowsYou(path.join(dir, 'gone'))).toBe(null);
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
    try { expect(gitKnowsYou(plain)).toBe(null); } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });

  // One answer out of every checkout a run touched. A folder that cannot
  // commit stops the offer even when another one can, because the press is one
  // press and it has to be true of all of them.
  it('reads one answer out of every checkout a run touched', () => {
    expect(knowsYouAcross([])).toBe(null);
    expect(knowsYouAcross([{ knowsYou: true }, { knowsYou: true }])).toBe(true);
    expect(knowsYouAcross([{ knowsYou: true }, { knowsYou: false }])).toBe(false);
    expect(knowsYouAcross([{ knowsYou: null }])).toBe(null);
  });

  it('is saved with the change, and corrected by a later run', () => {
    const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'nameless-docs-'));
    const savedChange = () => JSON.parse(fs.readFileSync(machineryPath(docs, changePath('w-139')), 'utf8'));
    try {
      run(dir, 'add', '-A');
      run(dir, '-c', 'user.name=Base', '-c', 'user.email=base@example.test', 'commit', '-qm', 'base');
      run(dir, 'checkout', '-q', '-b', 'agentbox/w-139');
      const before = snapshotRepo(dir);
      fs.appendFileSync(path.join(dir, 'README.md'), '\n## Usage\n');
      const endRun = (snap) => writeChangeForRun({
        transcript: path.join(dir, 'no-such-session.jsonl'),
        docsDir: docs,
        itemId: 'w-139',
        roots: [dir],
        repos: [changeFromRepo(snap)],
      });
      expect(endRun(before)).toBeTruthy();
      expect(savedChange()).toMatchObject({ committed: false, uncommitted: true, knowsYou: false });

      // The second round: they say who they are, and the run that commits it
      // writes no change of its own. The offer must not go on asking.
      const second = snapshotRepo(dir);
      run(dir, 'config', 'user.name', 'Example Developer');
      run(dir, 'config', 'user.email', 'developer@example.test');
      run(dir, 'commit', '-qam', 'usage');
      expect(endRun(second)).toBe(null);
      expect(savedChange()).toMatchObject({ committed: true, uncommitted: false, knowsYou: true });
    } finally { fs.rmSync(docs, { recursive: true, force: true }); }
  }, 30_000);
});

describe('the offer the app makes when git cannot name an author', () => {
  it('reads the third fact off a saved change, and nothing else as it', () => {
    expect(standingFrom({ committed: false, uncommitted: true, knowsYou: false }))
      .toEqual({ committed: false, uncommitted: true, knowsYou: false });
    expect(standingFrom({ committed: false, uncommitted: true })).toMatchObject({ knowsYou: null });
    expect(standingFrom({ knowsYou: 'yes' })).toEqual(UNREAD);
  });

  // F-139 itself.
  it('asks for a name and an email instead of recommending a commit', () => {
    const offer = shipOfferFor({ committed: false, uncommitted: true, knowsYou: false });
    expect(offer?.ask).toBe(NAME_YOURSELF_ASK);
    expect(NAME_YOURSELF_ASK).toBe('Git does not know who you are, so this change was never committed.');
    expect(offer?.options.map((o) => o.text))
      .toEqual(['Commit it and ship, as the name and email below', 'Discard the change']);
    expect(offer?.options.filter((o) => o.recommended).map((o) => o.n)).toEqual([1]);
    expect(offer?.headed).toBe(true);
  });

  // The press opens the reply box with its own words in it rather than sending
  // them, and the name and email go on the line under them
  // (renderer/src/format.ts, the way "Change something first" already works).
  it('makes the recommended press one that takes their words', () => {
    expect(needsYourWords(NAME_YOURSELF_OFFER[0].text)).toBe(true);
    expect(needsYourWords('Commit it and ship, as the name and email below (recommended)')).toBe(true);
    expect(discardsTheChange(NAME_YOURSELF_OFFER[1].text)).toBe(true);
    // And what must NOT open a box: the offer made where git knows them.
    expect(needsYourWords(COMMIT_FIRST_OFFER[0].text)).toBe(false);
    expect(needsYourWords('Commit it and ship')).toBe(false);
    expect(needsYourWords('Ship it')).toBe(false);
  });

  // And the task after this one must not ask the same question again.
  it('tells the worker to keep the name and email they give it', () => {
    const brief = workerGitBrief('/a/repository');
    expect(brief).toContain('set them for this repository with git config');
    expect(brief).toContain('in that same command');
  });

  it('is the old offer wherever git can name an author', () => {
    expect(shipOfferFor({ committed: false, uncommitted: true, knowsYou: true })?.ask).toBe(NOT_COMMITTED_ASK);
    expect(shipOfferFor({ committed: false, uncommitted: true, knowsYou: true })?.options).toBe(COMMIT_FIRST_OFFER);
    // Unread is every product with no repository, and it is left as it was.
    expect(shipOfferFor({ committed: false, uncommitted: true, knowsYou: null })?.options).toBe(COMMIT_FIRST_OFFER);
  });

  // The boundaries either side: there is nothing to commit, so who git thinks
  // you are does not come into it.
  it('says nothing about identity when the commit is already made or the work is gone', () => {
    expect(shipOfferFor({ committed: true, uncommitted: false, knowsYou: false })?.options).toBe(SHIP_OFFER);
    expect(shipOfferFor({ committed: false, uncommitted: false, knowsYou: false })).toBe(null);
  });
});
