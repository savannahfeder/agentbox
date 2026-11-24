// The push hook ran a branch's own tests as the person, outside any sandbox,
// while the push carried their GitHub sign-in. A test a prompt-injected worker
// wrote could rewrite the app folder's ship scripts or git settings, and so take
// the token on the next ship; it could also read their keys, reach the bridge
// to their signed-in browser in /tmp, or leave code in the task folder for the
// web app's deploy, which ran there afterwards with their Cloudflare sign-in.
// Measured 2026-11-23 on the Mac with the real hook and a hostile stand-in
// vitest: before, every one of these went through.
//
// Only a Mac has the sandbox, and a sandbox cannot start inside another, so the
// real-sandbox cases run on a Mac outside one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSandboxed, alreadySandboxed } from '../scripts/lib/branch-sandbox.mjs';
import { cleanCopy } from '../scripts/lib/web-app-deploy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, 'scripts/hooks/pre-push');
const onAMac = process.platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec') && !alreadySandboxed();
const ZERO = '0000000000000000000000000000000000000000';
const real = (p: string) => fs.realpathSync(p);
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let tmp: string;
beforeAll(() => { tmp = real(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-sandbox-'))); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/** A repository with one commit, as a task folder's branch looks to the hook. */
function repo(name: string) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.mjs'), 'export const x = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

describe.skipIf(!onAMac)('the push hook runs the branch\'s tests in the sandbox', () => {
  it('leaves a hostile test no sign-in, no git settings, no open push file and nothing outside the task folder', () => {
    const dir = repo('hook');
    const outside = real(fs.mkdtempSync(path.join(os.tmpdir(), 'app-folder-')));
    const signIn = path.join(tmp, 'sign-in');
    fs.writeFileSync(signIn, 'dummy-push-token');
    const seen = path.join(dir, 'seen');
    const bin = path.join(dir, 'node_modules/.bin/vitest');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, [
      '#!/bin/sh',
      `say() { echo "$1" >> "${seen}"; }`,
      'env | grep -q dummy-push-token && say env-token',
      `touch "${path.join(dir, '.git', 'hooks', 'planted')}" 2>/dev/null && say wrote-git`,
      `echo "[http] proxy = x" >> "${path.join(dir, '.git', 'config')}" 2>/dev/null && say wrote-git-config`,
      `touch "${path.join(outside, 'push-credential.mjs')}" 2>/dev/null && say wrote-app-folder`,
      '(cat <&3) 2>/dev/null | grep -q dummy-push-token && say read-fd3',
      'say ran',
      'exit 0',
    ].join('\n') + '\n');
    fs.chmodSync(bin, 0o755);
    const hook = path.join(dir, 'pre-push');
    fs.copyFileSync(HOOK, hook);
    fs.chmodSync(hook, 0o755);
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts/red-test-files.mjs'), path.join(dir, 'scripts/red-test-files.mjs'));
    fs.cpSync(path.join(ROOT, 'scripts/lib'), path.join(dir, 'scripts/lib'), { recursive: true });
    const sha = git(dir, 'rev-parse', 'HEAD');
    const fd = fs.openSync(signIn, 'r');
    const r = spawnSync(hook, [], {
      cwd: dir, input: `refs/heads/main ${sha} refs/heads/main ${ZERO}\n`, encoding: 'utf8',
      env: { ...process.env, AGENTBOX_PUSH_FULL_SUITE: '1', GH_TOKEN: 'dummy-push-token', AGENTBOX_PUSH_TOKEN: 'dummy-push-token' },
      stdio: ['pipe', 'pipe', 'pipe', fd],
    });
    fs.closeSync(fd);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(fs.readFileSync(seen, 'utf8').trim().split('\n')).toEqual(['ran']);
    expect(fs.existsSync(path.join(outside, 'push-credential.mjs'))).toBe(false);
  }, 60_000);
});

describe.skipIf(!onAMac)('the sandbox', () => {
  let home: string; let main: string; let task: string; let before: string; let bridge: net.Server; let bridgePath: string;
  beforeAll(async () => {
    home = path.join(tmp, 'home');
    fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'dummy key');
    fs.writeFileSync(path.join(home, '.gitconfig'), '[user]\n  name = Test\n');
    main = path.join(home, 'dev', 'app');
    fs.mkdirSync(path.dirname(main), { recursive: true });
    fs.renameSync(repo('app-src'), main);
    fs.mkdirSync(path.join(main, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(main, 'scripts', 'ship.mjs'), '// the ship\n');
    fs.mkdirSync(path.join(main, 'cloud'), { recursive: true });
    fs.writeFileSync(path.join(main, 'cloud', 'team.config.json'), '{}');
    git(main, 'worktree', 'add', '-q', '-b', 'task', '.claude/worktrees/task');
    git(main, 'worktree', 'add', '-q', '-b', 'other', '.claude/worktrees/other');
    task = path.join(main, '.claude', 'worktrees', 'task');
    fs.writeFileSync(path.join(main, '.claude', 'worktrees', 'other', 'theirs.txt'), 'another task\'s work');
    fs.mkdirSync(path.join(task, 'node_modules', 'pkg'), { recursive: true });
    before = real(fs.mkdtempSync('/tmp/already-here-'));
    bridgePath = path.join(before, 'bridge.sock');
    bridge = net.createServer((s) => s.end('browser')).listen(bridgePath);
    await new Promise((res) => bridge.once('listening', res));
  });
  afterAll(() => { bridge?.close(); fs.rmSync(before, { recursive: true, force: true }); });

  /** Runs one probe in the sandbox and says whether it got through. */
  const probe = (code: string, opts: { stage?: string; env?: Record<string, string>; writable?: string[] } = {}) => {
    const out = path.join(task, `probe-${Math.random().toString(36).slice(2)}`);
    const status = runSandboxed(process.execPath, ['-e', `const fs=require('fs');const net=require('net');const done=(v)=>{fs.writeFileSync(${JSON.stringify(out)},String(v));process.exit(0)};(async()=>{${code}})().then(()=>done('through'),()=>done('stopped'))`], {
      cwd: task, home, stage: opts.stage, writable: opts.writable, env: { ...process.env, ...opts.env }, stdio: 'ignore',
    });
    const said = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : `no answer (exit ${status})`;
    fs.rmSync(out, { force: true });
    return said;
  };
  const read = (p: string) => probe(`fs.readFileSync(${JSON.stringify(p)})`);
  const write = (p: string, opts = {}) => probe(`fs.mkdirSync(require('path').dirname(${JSON.stringify(p)}),{recursive:true});fs.writeFileSync(${JSON.stringify(p)},'x')`, opts);
  const connect = (where: object, opts = {}) => probe(`await new Promise((res,rej)=>net.connect(${JSON.stringify(where)}).on('connect',res).on('error',rej))`, opts);

  it('reads the task folder, the app folder and git\'s settings, and nothing else in the home folder', () => {
    expect(read(path.join(task, 'app.mjs'))).toBe('through');
    expect(read(path.join(main, 'scripts', 'ship.mjs'))).toBe('through');
    expect(read(path.join(home, '.gitconfig'))).toBe('through');
    expect(read(path.join(home, '.ssh', 'id_ed25519'))).toBe('stopped');
    expect(read(path.join(main, 'cloud', 'team.config.json'))).toBe('stopped');
    expect(read(path.join(main, '.claude', 'worktrees', 'other', 'theirs.txt'))).toBe('stopped');
  });

  it('writes the task folder, and not its git, the app folder, git\'s settings or the installed packages', () => {
    expect(write(path.join(task, 'made-by-a-test.txt'))).toBe('through');
    expect(write(path.join(task, 'node_modules', '.vite', 'cache.json'))).toBe('through');
    expect(write(path.join(task, 'node_modules', 'pkg', 'index.js'))).toBe('stopped');
    expect(write(path.join(task, '.git'))).toBe('stopped');
    expect(write(path.join(main, '.git', 'config'))).toBe('stopped');
    expect(write(path.join(main, '.git', 'worktrees', 'task', 'config.worktree'))).toBe('stopped');
    expect(write(path.join(main, 'scripts', 'ship.mjs'))).toBe('stopped');
    expect(write(path.join(home, '.gitconfig'))).toBe('stopped');
  });

  it('lets an install write the packages, and still not the shared npm cache', () => {
    expect(write(path.join(task, 'node_modules', 'pkg', 'index.js'), { stage: 'download' })).toBe('through');
    expect(write(path.join(task, 'node_modules', 'pkg', 'index.js'), { stage: 'build' })).toBe('through');
    expect(write(path.join(home, '.npm', '_npx', 'planted.js'), { stage: 'download' })).toBe('stopped');
    expect(write(path.join(home, 'Library', 'Caches', 'electron', 'planted.zip'), { stage: 'build' })).toBe('stopped');
  });

  it('runs the install scripts with no way out, and lets only npm itself fetch', () => {
    expect(connect({ host: '1.1.1.1', port: 443 }, { stage: 'build' })).toBe('stopped');
    expect(probe(`if (process.env.npm_config_ignore_scripts !== 'true') throw 0`, { stage: 'download' })).toBe('through');
  });

  it('adds to /tmp, and touches nothing that was already there', async () => {
    expect(write(path.join('/tmp', `new-${process.pid}-${Date.now()}`, 'x'))).toBe('through');
    expect(write(path.join(before, 'x'))).toBe('stopped');
    expect(connect({ path: bridgePath })).toBe('stopped');
    const reports = real(fs.mkdtempSync('/tmp/reports-'));
    expect(write(path.join(reports, 'run.json'), { writable: [reports] })).toBe('through');
    fs.rmSync(reports, { recursive: true, force: true });
  });

  it('reaches the ports and sockets it opens itself, and no other computer', () => {
    const own = (listen: string, reach: string) => probe(`const s=net.createServer(c=>c.end());await new Promise(r=>s.listen(${listen},r));await new Promise((res,rej)=>net.connect(${reach}).on('connect',res).on('error',rej));s.close()`);
    expect(own(`0,'127.0.0.1'`, `{host:'127.0.0.1',port:s.address().port}`)).toBe('through');
    expect(own(`0,'::1'`, `{host:'::1',port:s.address().port}`)).toBe('through');
    expect(own(`require('path').join(require('os').tmpdir(),'own.sock')`, `{path:require('path').join(require('os').tmpdir(),'own.sock')}`)).toBe('through');
    expect(connect({ host: '1.1.1.1', port: 443 })).toBe('stopped');
  });

  it('reaches no port that was already listening when it started', async () => {
    const other = net.createServer((s) => s.end()).listen(0, '127.0.0.1');
    await new Promise((res) => other.once('listening', res));
    expect(connect({ host: '127.0.0.1', port: (other.address() as net.AddressInfo).port })).toBe('stopped');
    other.close();
  });

  it('hands over no sign-in from the environment, and runs no keychain', () => {
    expect(probe(`if (process.env.GH_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.AWS_SECRET_ACCESS_KEY) throw 0`, { env: { GH_TOKEN: 'x', ANTHROPIC_API_KEY: 'x', AWS_SECRET_ACCESS_KEY: 'x' } })).toBe('through');
    expect(probe(`require('child_process').execFileSync('/usr/bin/security',['list-keychains'])`)).toBe('stopped');
    expect(probe(`require('child_process').execFileSync('/usr/bin/open',['-a','Terminal'])`)).toBe('stopped');
  });
});

describe('the web app is built from a copy the branch\'s tests never ran in', () => {
  it('has the shipped commit and the app folder\'s packages, and nothing the tests left behind', () => {
    const task = repo('deploy-task');
    const trusted = repo('deploy-app');
    fs.writeFileSync(path.join(task, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.writeFileSync(path.join(trusted, 'package-lock.json'), '{"lockfileVersion":3}\n');
    git(task, 'add', '-A'); git(task, 'commit', '-q', '-m', 'lock');
    const sha = git(task, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(task, 'app.mjs'), 'export const x = "planted";\n');
    fs.writeFileSync(path.join(task, 'left-behind.mjs'), 'planted');
    fs.mkdirSync(path.join(task, 'node_modules', 'vite'), { recursive: true });
    fs.writeFileSync(path.join(task, 'node_modules', 'vite', 'index.js'), 'planted');
    fs.mkdirSync(path.join(trusted, 'node_modules', 'vite'), { recursive: true });
    fs.writeFileSync(path.join(trusted, 'node_modules', 'vite', 'index.js'), 'the real one');
    const into = fs.mkdtempSync(path.join(tmp, 'deploy-'));
    const copy = cleanCopy({ root: task, sha, trusted, into });
    expect(git(copy, 'rev-parse', 'HEAD')).toBe(sha);
    expect(fs.readFileSync(path.join(copy, 'app.mjs'), 'utf8')).toBe('export const x = 1;\n');
    expect(fs.existsSync(path.join(copy, 'left-behind.mjs'))).toBe(false);
    expect(fs.readFileSync(path.join(copy, 'node_modules', 'vite', 'index.js'), 'utf8')).toBe('the real one');
  });

  it('and the ship hands it the folder it runs from', () => {
    expect(fs.readFileSync(path.join(ROOT, 'scripts/ship.mjs'), 'utf8')).toMatch(/deployAfterShip\(\{[^}]*\btrusted\b/);
    expect(fs.readFileSync(path.join(ROOT, 'scripts/lib/web-app-deploy.mjs'), 'utf8')).not.toMatch(/cwd: root, env: branchEnv/);
  });
});

describe('an Electron upgrade is fetched with the app folder\'s own downloader', () => {
  it('takes only a version number from the branch\'s lockfile', async () => {
    const { electronVersionOf } = await import('../scripts/lib/fetch-electron.mjs');
    const lock = (version: unknown) => JSON.stringify({ packages: { 'node_modules/electron': { version } } });
    expect(electronVersionOf(lock('43.8.4'))).toBe('43.8.4');
    expect(electronVersionOf(lock('44.0.0-beta.2'))).toBe('44.0.0-beta.2');
    expect(electronVersionOf(lock('43.8.4; touch /tmp/x'))).toBeNull();
    expect(electronVersionOf(lock('../../evil'))).toBeNull();
    expect(electronVersionOf(lock(43))).toBeNull();
    expect(electronVersionOf('not json')).toBeNull();
    expect(electronVersionOf(JSON.stringify({ packages: {} }))).toBeNull();
  });
});

describe('the private skills push runs its tests the same way', () => {
  it('starts vitest through the sandbox', () => {
    const gate = fs.readFileSync(path.join(ROOT, 'scripts/private-push-gate.mjs'), 'utf8');
    expect(gate).toMatch(/runSandboxed\(vitest,/);
    expect(gate).not.toMatch(/spawnSync\(vitest/);
  });
});
