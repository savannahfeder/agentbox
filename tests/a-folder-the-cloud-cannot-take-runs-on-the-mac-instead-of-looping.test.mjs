// A FOLDER THE CLOUD CANNOT TAKE RUNS ON THE MAC, INSTEAD OF LOOPING.
//
// What broke (2026-10-19): with cloud runs on, nothing ran. One thread's task
// folder was halfway through a git merge. Every cloud start begins by saving
// the folder (`git write-tree`), which refuses a folder with unmerged files, so
// each start died in under a second; the shared host turned the error into
// exit 75, "not home yet, try again", which spends no attempt, and the app
// started it again at every check: 16,135 failed starts, one every 15 seconds
// from 10am one day to 3:50pm the next, with nothing said anywhere.
//
// Now a folder the cloud cannot take ends its cloud run at once with its own
// code (KEEP_ON_MAC), saying why, and the app keeps that thread on this Mac,
// where the agent can finish the merge, without spending an attempt. And any
// thread whose cloud start fails three times in a row before its agent starts
// is kept on the Mac too, so no other instant failure can loop like this.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { cloudRun, KEEP_ON_MAC, IMPORT_FAILED } from '../main/cloud/run.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let tmp; let repo;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-midmerge-')));
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'dev@example.com');
  git(repo, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
});

function midMerge() {
  git(repo, 'checkout', '-q', '-b', 'other');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'theirs\n');
  git(repo, 'commit', '-q', '-am', 'theirs');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'ours\n');
  git(repo, 'commit', '-q', '-am', 'ours');
  try { git(repo, 'merge', 'other'); } catch { /* the conflict is the point */ }
}

async function start() {
  const asked = [];
  const transport = { async invoke(_s, p) { asked.push(p.action); return { ok: true, state: 'running', events: [] }; }, async stop() {} };
  const storage = { async put() {}, async get() { return null; }, async getUrl(k) { return `http://x/${k}`; }, async putUrl(k) { return `http://x/${k}`; } };
  let err = '';
  const stderr = new PassThrough();
  stderr.on('data', (d) => { err += d; });
  const code = await cloudRun({
    argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1' }, cwd: repo, transport, storage,
    login: { engine: 'claude', id: 'L', key: 'logins/claude/L.json' }, stdin: new PassThrough(), stdout: new PassThrough(), stderr,
    signals: new EventEmitter(), watchParent: false, homeDir: path.join(tmp, 'home'), remoteCommand: '/usr/local/bin/node',
  });
  return { code, err, asked };
}

describe('a cloud run from a folder halfway through a merge', () => {
  it('starts nothing in the cloud, says why, and asks to stay on this Mac', async () => {
    midMerge();
    const { code, err, asked } = await start();
    expect(code).toBe(KEEP_ON_MAC);
    expect(asked).not.toContain('start');
    expect(err).toMatch(/this folder cannot go to the cloud \(a merge in it is not finished\), so the thread runs on this Mac/);
  });

  it('is not the code that means "try the cloud again"', () => {
    expect(KEEP_ON_MAC).not.toBe(IMPORT_FAILED);
    expect(KEEP_ON_MAC).not.toBe(0);
  });
});

describe('the app', () => {
  function supervisor() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-keep-'));
    return new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root, root, root);
  }
  const cloudSession = (extra = {}) => ({ cloud: true, itemId: 'w-1', tail: [], sessionId: null, result: null, ...extra });
  // For the request that failed there; tests/a-thread-the-cloud-sent-to-the-mac-goes-back-after-that-request.
  const onMac = (s, id) => !s._mayRunInCloud({ id }, { slug: 'p', repoPath: '/r' }, `/r/.claude/worktrees/${id}`);

  it('keeps a thread the cloud refused on this Mac, without counting it against the cloud or the thread', () => {
    const s = supervisor();
    const session = cloudSession();
    expect(s._cloudKeptOnMac({ id: 'w-1' }, session, KEEP_ON_MAC)).toBe(true);
    expect(onMac(s, 'w-1')).toBe(true);
    expect(session.handedBack).toBe(true);
    s._noteCloudOutcome(session, KEEP_ON_MAC);
    expect(s._cloudHealthNow().health).toBe('ok');
  });

  it('keeps a thread on this Mac after three cloud starts in a row die before its agent starts, and not after two', () => {
    const s = supervisor();
    expect(s._cloudKeptOnMac({ id: 'w-2' }, cloudSession({ itemId: 'w-2' }), IMPORT_FAILED)).toBe(false);
    expect(s._cloudKeptOnMac({ id: 'w-2' }, cloudSession({ itemId: 'w-2' }), IMPORT_FAILED)).toBe(false);
    expect(onMac(s, 'w-2')).toBe(false);
    expect(s._cloudKeptOnMac({ id: 'w-2' }, cloudSession({ itemId: 'w-2' }), IMPORT_FAILED)).toBe(true);
    expect(onMac(s, 'w-2')).toBe(true);
  });

  it('starts the count again when the agent did start, and never counts a Stop or a folder still bringing a run home', () => {
    const s = supervisor();
    s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3' }), IMPORT_FAILED);
    s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3' }), IMPORT_FAILED);
    s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3', sessionId: 'abc' }), IMPORT_FAILED);
    s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3', stoppedByUs: true }), IMPORT_FAILED);
    s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3', tail: ['stderr: agentbox cloud: an earlier cloud run in this folder is still going'] }), IMPORT_FAILED);
    expect(s._cloudKeptOnMac({ id: 'w-3' }, cloudSession({ itemId: 'w-3' }), IMPORT_FAILED)).toBe(false);
    expect(onMac(s, 'w-3')).toBe(false);
    // Not a cloud run at all: nothing to do with the cloud.
    expect(s._cloudKeptOnMac({ id: 'w-4' }, { cloud: false, tail: [] }, 1)).toBe(false);
  });

  it('reads the exit at the moment a cloud run ends', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/this\._cloudKeptOnMac\(item, session, code, signal\)/);
  });
});
