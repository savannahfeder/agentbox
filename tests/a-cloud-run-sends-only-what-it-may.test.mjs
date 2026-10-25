// A CLOUD RUN SENDS ONLY WHAT IT MAY.
//
// A cloud run (docs/cloud/PLAN.md) uploads, besides the task's own branch, any
// file the prompt names under the store, so an attachment she pasted reaches
// the agent in the sandbox. Codex's review (2026-10-13) showed the first
// version decided "under the store" on the path AS WRITTEN: `<store>/../x`
// passed, and so did a link inside the store pointing anywhere on the disk. It
// also showed that the git remote went up as written, which for an https URL
// can carry a token in it. These are the rules that close both.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesNamedIn, remoteForTheCloud, settingsForTheCloud, toolEnv } from '../main/cloud/run.mjs';

let tmp; let store; let cwd; let outside;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sends-')));
  store = path.join(tmp, 'store');
  cwd = path.join(tmp, 'repo');
  outside = path.join(tmp, 'private');
  for (const d of [store, cwd, outside]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(store, 'note.txt'), 'attachment');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'not for the cloud');
  fs.writeFileSync(path.join(cwd, 'in-repo.txt'), 'travels in the bundle');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('the files a prompt names', () => {
  it('sends a file under the store', () => {
    expect(filesNamedIn(`see ${store}/note.txt please`, { cwd, roots: [store] })).toEqual([`${store}/note.txt`]);
  });

  it('refuses a path that climbs out of the store with ..', () => {
    expect(filesNamedIn(`see ${store}/../private/secret.txt`, { cwd, roots: [store] })).toEqual([]);
  });

  it('refuses a link inside the store that points out of it', () => {
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(store, 'innocent.txt'));
    expect(filesNamedIn(`see ${store}/innocent.txt`, { cwd, roots: [store] })).toEqual([]);
  });

  it('refuses a file outside every root, and one already in the task folder', () => {
    expect(filesNamedIn(`${outside}/secret.txt and ${cwd}/in-repo.txt`, { cwd, roots: [store] })).toEqual([]);
  });

  it('refuses a folder, a file that is not there, and one too big to send', () => {
    fs.writeFileSync(path.join(store, 'huge.bin'), Buffer.alloc(26 * 1024 * 1024));
    expect(filesNamedIn(`${store} ${store}/missing.txt ${store}/huge.bin`, { cwd, roots: [store] })).toEqual([]);
  });
});

describe('the git remote the sandbox may fetch from', () => {
  it('keeps a plain https remote', () => {
    expect(remoteForTheCloud('https://github.com/someone/repo.git')).toBe('https://github.com/someone/repo.git');
  });
  it('drops the credentials an https remote carries', () => {
    // A made-up key, the one this test proves never reaches the sandbox.
    expect(remoteForTheCloud('https://user:ghp_secret@github.com/someone/repo.git')).toBe('https://github.com/someone/repo.git'); // public-check: allow
  });
  it('turns an ssh remote into its https twin, since the sandbox holds no keys', () => {
    expect(remoteForTheCloud('git@github.com:someone/repo.git')).toBe('https://github.com/someone/repo.git');
  });
  it('sends no remote for a local path or anything that is not https', () => {
    expect(remoteForTheCloud('/Users/someone/repo')).toBe(null);
    expect(remoteForTheCloud('http://example.com/repo.git')).toBe(null);
    expect(remoteForTheCloud('')).toBe(null);
  });
});

describe('the app\'s own tools, run on this Mac for a cloud run', () => {
  it('never inherit an AWS sign-in or the Claude token', () => {
    const env = toolEnv({ PATH: '/bin', ZERO_ITEM: 'w-1', AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET_ACCESS_KEY: 's', AWS_SESSION_TOKEN: 't', AWS_PROFILE: 'admin', AWS_REGION: 'us-east-1', CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-x' });
    expect(env).toEqual({ PATH: '/bin', ZERO_ITEM: 'w-1', AWS_REGION: 'us-east-1' });
  });
});

describe('the settings sent up', () => {
  it('keep the permissions and lose the hooks that run programs on this Mac', () => {
    const s = JSON.stringify({ permissions: { allow: ['Bash'], additionalDirectories: ['/x'] }, hooks: { PreToolUse: [] } });
    expect(JSON.parse(settingsForTheCloud(s))).toEqual({ permissions: { allow: ['Bash'], additionalDirectories: ['/x'] } });
  });
});
