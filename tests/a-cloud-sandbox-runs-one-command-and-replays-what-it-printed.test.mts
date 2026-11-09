// A CLOUD SANDBOX RUNS ONE COMMAND AND CAN REPLAY EVERYTHING IT PRINTED.
//
// Cloud runs (docs/cloud/PLAN.md) put a thread's agent in an AWS AgentCore
// microVM, and the Mac reads what the agent prints over a connection that will
// drop: the lid closes, a stream hits AgentCore's 60-minute ceiling, the app
// restarts. So the sandbox's server (cloud/sandbox/server.mjs) keeps every byte
// the command wrote, numbered, and hands back everything after the last number
// the Mac saw. A gap or a repeat here is a corrupted stream-json line in the
// supervisor, which is a thread that silently never finishes.
//
// It also has to tell AgentCore the truth about being busy: AgentCore reaps a
// session that answers "Healthy" for 15 minutes, and a run whose results have
// not been collected yet is not finished, however long ago its command exited.
//
// These drive the real server in process against a real git repository and a
// real child process, with the bundle fetched over a real local HTTP server.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createSandbox } from '../cloud/sandbox/server.mjs';

/**
 * Git, with its own housekeeping turned off (2026-10-14).
 *
 * `git fetch` and `git merge` end by asking git to tidy the repository, and
 * when it decides to, it does that in a process that outlives the command and
 * writes inside `.git`. Nothing here needs tidying, and a write arriving after
 * the last command returned is a write racing the folder being deleted, which
 * is what the `tmpGone` note below is about. So none of these commands may
 * start one.
 */
const GIT_LEAVES_NOTHING_BEHIND = ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.fsmonitor=false'];
const git = (cwd, ...args) => execFileSync('git', [...GIT_LEAVES_NOTHING_BEHIND, ...args], { cwd, encoding: 'utf8' }).trim();

let tmp; let files; let fileServer; let base; let sandbox;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
  files = new Map();
  fileServer = http.createServer((req, res) => {
    if (req.method === 'GET') {
      const body = files.get(req.url);
      if (!body) { res.writeHead(404); return res.end(); }
      res.writeHead(200); return res.end(body);
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { files.set(req.url, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${fileServer.address().port}`;
});

/**
 * THE FOLDER GOES, AND IF IT WILL NOT, THE TEST STILL STANDS (2026-10-14).
 *
 * This deleted the folder in one go, and on GitHub's Linux runner that threw
 * `ENOTEMPTY: directory not empty, rmdir '…/mac/repo/.git'` after every
 * assertion in "brings back new commits" had passed: something put an entry
 * back in `.git` between the delete reading the folder and emptying it. That
 * failed the test, and main was red for four days over it (run 38654506193 and
 * the four before it; the Mac job was green in every one).
 *
 * Which write it was, this never pinned down, so this does not pretend to have
 * fixed it: the retries let one already on its way land and then take the
 * folder again, and a folder that still will not go is left in the operating
 * system's own temp folder rather than failing a test that has already proved
 * its point. The other thirty-five test files here clean up the same way.
 */
const tmpGone = (dir) => {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* best effort */ }
};

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  tmpGone(tmp);
});

// A repository on "the Mac", on a task branch, packed the way the proxy packs it.
function packedRepo() {
  const repo = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@example.com');
  git(repo, 'config', 'user.name', 'A');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  const bundle = path.join(tmp, 'in.bundle');
  git(repo, 'bundle', 'create', bundle, 'agentbox/w-1', 'main');
  files.set('/in.bundle', fs.readFileSync(bundle));
  return { repo, head: git(repo, 'rev-parse', 'HEAD') };
}

async function until(fn, what, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function drain(since = 0) {
  const out = [];
  let at = since;
  for (;;) {
    const r = await sandbox.handle({ action: 'events', since: at, waitMs: 0 });
    if (!r.events.length) return { events: out, at };
    out.push(...r.events);
    at = r.events[r.events.length - 1].seq;
  }
}

const stdoutOf = (events) => Buffer.concat(events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64'))).toString('utf8');

describe('a cloud sandbox', () => {
  it('runs the command in the same folder path the Mac uses, on the task branch', async () => {
    const { head } = packedRepo();
    const cwd = path.join(tmp, 'vm', 'Users', 'someone', 'repo-w-1');
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const started = await sandbox.handle({
      action: 'start', runId: 'run-1', cwd, branch: 'agentbox/w-1',
      bundleUrl: `${base}/in.bundle`,
      argv: [process.execPath, '-e', 'const {execSync}=require("child_process");process.stdout.write(process.cwd()+"\\n"+execSync("git rev-parse --abbrev-ref HEAD")+execSync("git rev-parse HEAD"))'],
      env: {},
    });
    expect(started.ok).toBe(true);
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    const { events } = await drain();
    const [where, branch, sha] = stdoutOf(events).trim().split('\n');
    expect(fs.realpathSync(where)).toBe(fs.realpathSync(cwd));
    expect(branch).toBe('agentbox/w-1');
    expect(sha).toBe(head);
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 0 });
  });

  it('replays from any sequence number without a gap or a repeat, including after the command has exited', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const script = 'for(let i=0;i<300;i++)process.stdout.write(JSON.stringify({n:i})+"\\n")';
    await sandbox.handle({ action: 'start', runId: 'run-2', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', script], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    const all = await drain(0);
    const lines = stdoutOf(all.events).trim().split('\n').map((l) => JSON.parse(l).n);
    expect(lines).toEqual([...Array(300).keys()]);
    // Seq numbers are 1..n with no holes.
    expect(all.events.map((e) => e.seq)).toEqual(all.events.map((_, i) => i + 1));
    // Reading again from the middle gives exactly the tail, once.
    const mid = all.events[Math.floor(all.events.length / 2)].seq;
    const tail = await drain(mid);
    expect(tail.events.map((e) => e.seq)).toEqual(all.events.filter((e) => e.seq > mid).map((e) => e.seq));
    // And from the end, nothing.
    expect((await drain(all.at)).events).toEqual([]);
  });

  it('a long poll waits for the next event instead of returning empty at once', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    await sandbox.handle({ action: 'start', runId: 'run-3', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', 'setTimeout(()=>process.stdout.write("late\\n"),400)'], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'running', 'the command to start');
    const { events } = await drain(0);
    const at = events.length ? events.at(-1).seq : 0;
    const t0 = Date.now();
    const r = await sandbox.handle({ action: 'events', since: at, waitMs: 5000 });
    expect(Date.now() - t0).toBeGreaterThan(200);
    expect(Date.now() - t0).toBeLessThan(4500);
    expect(stdoutOf(r.events)).toContain('late');
  });

  it('passes stdin through, in order, and closes it when told', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const echo = 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write("got:"+s))';
    await sandbox.handle({ action: 'start', runId: 'run-4', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', echo], env: {} });
    await sandbox.handle({ action: 'stdin', data: Buffer.from('hello ').toString('base64') });
    await sandbox.handle({ action: 'stdin', data: Buffer.from('world').toString('base64'), end: true });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(stdoutOf((await drain()).events)).toBe('got:hello world');
  });

  it('gives the command only the environment it was sent, never the sandbox server\'s own', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), baseEnv: { PATH: process.env.PATH, HOME: path.join(tmp, 'vm', 'home') } });
    process.env.SANDBOX_SECRET_FOR_TEST = 'must-not-leak';
    try {
      await sandbox.handle({ action: 'start', runId: 'run-5', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', 'process.stdout.write(JSON.stringify({s:process.env.SANDBOX_SECRET_FOR_TEST||null,z:process.env.ZERO_ITEM||null}))'], env: { ZERO_ITEM: 'w-1' } });
      await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
      expect(JSON.parse(stdoutOf((await drain()).events))).toEqual({ s: null, z: 'w-1' });
    } finally {
      delete process.env.SANDBOX_SECRET_FOR_TEST;
    }
  });

  it('stays busy for AgentCore until its results are collected, then lets the session go idle', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    expect(sandbox.ping().status).toBe('Healthy');
    await sandbox.handle({ action: 'start', runId: 'run-6', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', ''], env: {} });
    expect(sandbox.ping().status).toBe('HealthyBusy');
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(sandbox.ping().status).toBe('HealthyBusy');
    await sandbox.handle({ action: 'collect', bundleUrl: `${base}/out.bundle`, changesUrl: `${base}/changes.bundle`, bring: [] });
    expect(sandbox.ping().status).toBe('Healthy');
  });

  it('brings back new commits and uncommitted work, and nothing from before the run', async () => {
    const { head } = packedRepo();
    const cwd = path.join(tmp, 'vm', 'w');
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const work = [
      'const fs=require("fs"),{execSync:x}=require("child_process");',
      'x("git config user.email b@example.com && git config user.name B");',
      'fs.writeFileSync("b.txt","two\\n");x("git add b.txt && git commit -q -m second");',
      'fs.writeFileSync("a.txt","changed\\n");fs.writeFileSync("new.txt","untracked\\n");',
    ].join('');
    await sandbox.handle({ action: 'start', runId: 'run-7', cwd, branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', work], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    const collected = await sandbox.handle({ action: 'collect', bundleUrl: `${base}/out.bundle`, changesUrl: `${base}/changes.bundle`, bring: [] });
    expect(collected).toMatchObject({ ok: true, startSha: head, commits: 1, uncommitted: true });

    // Apply on "the Mac" the way the proxy does.
    const mac = path.join(tmp, 'mac', 'repo');
    fs.writeFileSync(path.join(tmp, 'out.bundle'), files.get('/out.bundle'));
    git(mac, 'fetch', '-q', path.join(tmp, 'out.bundle'), 'agentbox/w-1:refs/agentbox/cloud');
    git(mac, 'merge', '-q', '--ff-only', 'refs/agentbox/cloud');
    expect(fs.readFileSync(path.join(mac, 'b.txt'), 'utf8')).toBe('two\n');
    fs.writeFileSync(path.join(tmp, 'changes.bundle'), files.get('/changes.bundle'));
    git(mac, 'fetch', '-q', path.join(tmp, 'changes.bundle'), `${collected.changesRef}:refs/agentbox/changes`);
    const patch = execFileSync('git', [...GIT_LEAVES_NOTHING_BEHIND, 'diff', '--binary', 'HEAD', 'refs/agentbox/changes'], { cwd: mac });
    execFileSync('git', [...GIT_LEAVES_NOTHING_BEHIND, 'apply'], { cwd: mac, input: patch });
    expect(fs.readFileSync(path.join(mac, 'a.txt'), 'utf8')).toBe('changed\n');
    expect(fs.readFileSync(path.join(mac, 'new.txt'), 'utf8')).toBe('untracked\n');
  });

  it('uploads its results by itself the moment the command exits, so a Mac that is asleep loses nothing', async () => {
    const { head } = packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const configDir = path.join(tmp, 'vm', 'claude-home');
    const work = [
      'const fs=require("fs"),{execSync:x}=require("child_process");',
      'x("git config user.email b@example.com && git config user.name B");',
      'fs.writeFileSync("c.txt","three\\n");x("git add c.txt && git commit -q -m third");',
      `fs.mkdirSync(${JSON.stringify(path.join(configDir, 'projects', 'p'))},{recursive:true});`,
      `fs.writeFileSync(${JSON.stringify(path.join(configDir, 'projects', 'p', 's.jsonl'))},"{}\\n");`,
      'process.stdout.write("{\\"type\\":\\"result\\"}\\n");',
    ].join('');
    await sandbox.handle({
      action: 'start', runId: 'run-auto', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`,
      argv: [process.execPath, '-e', work], env: {},
      results: {
        bundleUrl: `${base}/r/out.bundle`, changesUrl: `${base}/r/changes.bundle`,
        eventsUrl: `${base}/r/events.jsonl`, doneUrl: `${base}/r/done.json`,
        bring: [{ dir: path.join(configDir, 'projects'), url: `${base}/r/projects.tgz` }],
      },
    });
    await until(() => files.has('/r/done.json'), 'the sandbox to upload its results');
    const done = JSON.parse(files.get('/r/done.json'));
    expect(done).toMatchObject({ ok: true, runId: 'run-auto', exitCode: 0, startSha: head, commits: 1, uncommitted: false });
    expect(files.has('/r/out.bundle')).toBe(true);
    expect(files.has('/r/projects.tgz')).toBe(true);
    // The event log in S3 holds everything, through the exit, in order, so the
    // Mac can replay what it missed from there even once the session is gone.
    const logged = files.get('/r/events.jsonl').toString().trim().split('\n').map((l) => JSON.parse(l));
    expect(logged.map((e) => e.seq)).toEqual(logged.map((_, i) => i + 1));
    expect(stdoutOf(logged)).toContain('"type":"result"');
    expect(logged.some((e) => e.kind === 'exit' && e.code === 0)).toBe(true);
    expect(done.lastSeq).toBe(logged.at(-1).seq);
    // Nothing is left to wait for, so AgentCore may let the session go. (The
    // state turns a moment after done.json lands, which is the order it must
    // go in: done.json last of everything uploaded.)
    await until(() => sandbox.ping().status === 'Healthy', 'the session to go idle', 5000);
  });

  it('keeps the session alive and says so when an upload fails, so the Mac can ask again', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), uploadRetryMs: 10 });
    await sandbox.handle({
      action: 'start', runId: 'run-fail', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`,
      argv: [process.execPath, '-e', 'require("fs").writeFileSync("d.txt","x")'], env: {},
      results: { bundleUrl: 'http://127.0.0.1:1/nope', changesUrl: 'http://127.0.0.1:1/nope', eventsUrl: 'http://127.0.0.1:1/nope', doneUrl: 'http://127.0.0.1:1/nope', bring: [] },
    });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'collect-failed', 'the upload to fail');
    expect(sandbox.ping().status).toBe('HealthyBusy');
    const again = await sandbox.handle({ action: 'collect', bundleUrl: `${base}/x/out.bundle`, changesUrl: `${base}/x/changes.bundle`, eventsUrl: `${base}/x/events.jsonl`, doneUrl: `${base}/x/done.json`, bring: [] });
    expect(again).toMatchObject({ ok: true, uncommitted: true });
    expect(files.has('/x/done.json')).toBe(true);
    expect(sandbox.ping().status).toBe('Healthy');
  });

  it('applies numbered input once: a repeat is acknowledged and dropped, a gap is refused with the number it wants', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const echo = 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write("got:"+s))';
    await sandbox.handle({ action: 'start', runId: 'run-n', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', echo], env: {} });
    const b64 = (s) => Buffer.from(s).toString('base64');
    expect(await sandbox.handle({ action: 'stdin', n: 1, data: b64('a') })).toMatchObject({ ok: true });
    expect(await sandbox.handle({ action: 'stdin', n: 1, data: b64('a') })).toMatchObject({ ok: true, dup: true });
    expect(await sandbox.handle({ action: 'stdin', n: 3, data: b64('c') })).toMatchObject({ ok: false, error: 'gap', expect: 2 });
    expect(await sandbox.handle({ action: 'stdin', n: 2, data: b64('b'), end: true })).toMatchObject({ ok: true });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(stdoutOf((await drain()).events)).toBe('got:ab');
  });

  it('a cancel that arrives while the run is still being prepared stops it from ever starting', async () => {
    packedRepo();
    // A bundle server slow enough that the cancel lands mid-preparation.
    const slow = http.createServer((q, s) => setTimeout(() => { s.writeHead(200); s.end(files.get('/in.bundle')); }, 400));
    await new Promise((r) => slow.listen(0, '127.0.0.1', r));
    try {
      sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
      const marker = path.join(tmp, 'it-ran');
      await sandbox.handle({ action: 'start', runId: 'run-c', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `http://127.0.0.1:${slow.address().port}/in.bundle`, argv: [process.execPath, '-e', `require("fs").writeFileSync(${JSON.stringify(marker)},"x")`], env: {} });
      expect(await sandbox.handle({ action: 'signal', signal: 'SIGTERM' })).toMatchObject({ ok: true, preparing: true });
      await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the cancelled run to settle');
      await new Promise((r) => setTimeout(r, 300));
      expect(fs.existsSync(marker)).toBe(false);
      expect((await drain()).events.find((e) => e.kind === 'exit')).toMatchObject({ cancelled: true });
    } finally {
      slow.closeAllConnections();
      await new Promise((r) => slow.close(r));
    }
  });

  it('a cancel reaches what the command started, not only the command', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), killGraceMs: 500 });
    const pidFile = path.join(tmp, 'grandchild.pid');
    const parent = `const {spawn}=require("child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("fs").writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000)`;
    await sandbox.handle({ action: 'start', runId: 'run-g', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', parent], env: {} });
    await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'), 'the grandchild to start');
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
    await sandbox.handle({ action: 'signal', signal: 'SIGTERM' });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    await until(() => { try { process.kill(grandchild, 0); return false; } catch { return true; } }, 'the grandchild to be gone', 5000);
  });

  it('pages events by size, so no poll can outgrow AgentCore\'s response limit', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    await sandbox.handle({ action: 'start', runId: 'run-p', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', 'process.stdout.write("y".repeat(2*1024*1024))'], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    const first = await sandbox.handle({ action: 'events', since: 0, maxBytes: 256 * 1024 });
    expect(JSON.stringify(first.events).length).toBeLessThan(400 * 1024);
    expect(first.more).toBe(true);
    const { events } = await drain(0);
    expect(stdoutOf(events).length).toBe(2 * 1024 * 1024);
  });

  it('a collect asked again after it finished returns the same record instead of an error', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    await sandbox.handle({ action: 'start', runId: 'run-r', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', ''], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    const urls = { action: 'collect', bundleUrl: `${base}/q/out`, changesUrl: `${base}/q/ch`, eventsUrl: `${base}/q/ev`, doneUrl: `${base}/q/done`, bring: [] };
    const first = await sandbox.handle(urls);
    const again = await sandbox.handle(urls);
    expect(first.ok).toBe(true);
    expect(again).toMatchObject({ ...first, already: true });
    expect((await sandbox.handle({ action: 'status' })).manifest).toMatchObject({ runId: 'run-r', ok: true });
  });

  it('stops a command that runs too long and still uploads its work', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), killGraceMs: 200 });
    await sandbox.handle({
      action: 'start', runId: 'run-d', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`,
      argv: [process.execPath, '-e', 'require("fs").writeFileSync("e.txt","x");setInterval(()=>{},1000)'], env: {}, deadlineMs: 500,
      results: { bundleUrl: `${base}/t/out`, changesUrl: `${base}/t/ch`, eventsUrl: `${base}/t/ev`, doneUrl: `${base}/t/done`, bring: [] },
    });
    await until(() => files.has('/t/done'), 'the overdue run to be stopped and saved');
    expect(JSON.parse(files.get('/t/done'))).toMatchObject({ ok: true, uncommitted: true, cancelled: 'SIGTERM' });
  });

  it('says plainly when it holds no run, which is what a session AgentCore restarted looks like', async () => {
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    for (const action of ['events', 'stdin', 'collect', 'signal', 'mcp']) {
      expect(await sandbox.handle({ action, since: 0 })).toMatchObject({ ok: false, error: 'no-run' });
    }
    expect(await sandbox.handle({ action: 'status' })).toMatchObject({ state: 'none' });
  });

  it('refuses a second start for a different run, and treats a repeated start of the same run as already started', async () => {
    packedRepo();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const start = { action: 'start', runId: 'run-8', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', 'setTimeout(()=>{},300)'], env: {} };
    expect((await sandbox.handle(start)).ok).toBe(true);
    expect(await sandbox.handle(start)).toMatchObject({ ok: true, already: true });
    expect(await sandbox.handle({ ...start, runId: 'run-other' })).toMatchObject({ ok: false, error: 'busy' });
  });

  it('reports a bundle it could not fetch as a failed run, not as a hang', async () => {
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    await sandbox.handle({ action: 'start', runId: 'run-9', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/missing.bundle`, argv: [process.execPath, '-e', ''], env: {} });
    await until(async () => (await sandbox.handle({ action: 'status' })).state === 'failed', 'the run to fail');
    const { events } = await drain();
    expect(events.find((e) => e.kind === 'error')?.message).toMatch(/404|fetch/i);
    // A failed run is not collected and not busy: there is nothing to keep alive for.
    expect(sandbox.ping().status).toBe('Healthy');
  });
});
