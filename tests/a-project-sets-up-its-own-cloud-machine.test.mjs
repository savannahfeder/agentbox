// A PROJECT SETS UP ITS OWN CLOUD MACHINE, WITH NO NEW IMAGE.
//
// What she said (2026-10-17), when a missing ffmpeg meant rebuilding the cloud
// image: "for another user who doesn't have the same requirements but has a
// lot of different things, we have to rebuild the image every time ... I
// highly doubt that's how other services work." It was how ours worked: the
// agent ran without sudo and was told to hand the thread back to the Mac for
// any program the image lacked, and test runners failed at 1024 open files.
//
// Now the agent may install what it needs (sudo in its own one-run machine),
// a project's `.agentbox/cloud-setup.sh` runs before the agent on every cloud
// run (as the agent, its output kept in /tmp/agentbox-cloud-setup.log), and the
// agent starts with the open-files limit raised.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createSandbox, SETUP_LOG } from '../cloud/sandbox/server.mjs';
import { CLOUD_NOTE } from '../main/cloud/run.mjs';

let tmp; let sandbox; let fileServer;
afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  if (fileServer) { fileServer.closeAllConnections(); await new Promise((r) => fileServer.close(r)); fileServer = null; }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function runWith(setup, script) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-setup-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', a, { cwd: repo });
  git('init', '-q', '-b', 'main');
  if (setup !== null) {
    fs.mkdirSync(path.join(repo, '.agentbox'));
    fs.writeFileSync(path.join(repo, '.agentbox', 'cloud-setup.sh'), setup);
    git('add', '.');
  }
  git('-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x');
  git('checkout', '-q', '-b', 'agentbox/w-1');
  git('bundle', 'create', path.join(tmp, 'b'), 'agentbox/w-1');
  const body = fs.readFileSync(path.join(tmp, 'b'));
  fileServer = http.createServer((q, s) => { s.writeHead(200); s.end(body); });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'), setupLog: path.join(tmp, 'setup.log') });
  await sandbox.handle({
    action: 'start', runId: 'r', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
    bundleUrl: `http://127.0.0.1:${fileServer.address().port}/b`,
    argv: [process.execPath, '-e', script], env: { MARK: path.join(tmp, 'mark') },
  });
  const end = Date.now() + 20_000;
  for (;;) {
    const { events } = await sandbox.handle({ action: 'events', since: 0 });
    if (events.some((e) => e.kind === 'exit')) return { events, out: events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('') };
    if (Date.now() > end) throw new Error(`the run never ended: ${JSON.stringify(events.map((e) => e.kind))}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
const agent = `const fs = require('fs'); process.stdout.write(JSON.stringify({ mark: fs.existsSync(process.env.MARK) ? fs.readFileSync(process.env.MARK, 'utf8') : null, files: Number(require('child_process').execSync('ulimit -n', { shell: '/bin/sh' }).toString()) }) + '\\n');`;

describe('a project\'s cloud setup', () => {
  it('runs before the agent, in the task folder, and the agent finds what it made', async () => {
    const { out, events } = await runWith('echo "made by setup in $(basename "$PWD")" > "$MARK"\necho installing things\n', agent);
    expect(JSON.parse(out).mark).toBe('made by setup in w\n');
    expect(events.find((e) => e.kind === 'setup' && e.state !== 'running')).toMatchObject({ state: 'done', code: 0 });
    expect(fs.readFileSync(path.join(tmp, 'setup.log'), 'utf8')).toContain('installing things');
  });

  it('that fails is said, and the agent runs all the same', async () => {
    const { out, events } = await runWith('echo nope >&2\nexit 3\n', agent);
    expect(JSON.parse(out).mark).toBe(null);
    expect(events.find((e) => e.kind === 'setup' && e.state !== 'running')).toMatchObject({ state: 'failed', code: 3 });
  });

  it('is nothing when the project has none', async () => {
    const { events } = await runWith(null, agent);
    expect(events.find((e) => e.kind === 'setup')).toBeUndefined();
  });
});

describe('the agent on its cloud machine', () => {
  it('may open more than 1024 files at once', async () => {
    const { out } = await runWith(null, agent);
    expect(JSON.parse(out).files).toBeGreaterThan(1024);
  });

  it('is told it may install what it needs and keep it in the project\'s setup, and to hand back only what only the Mac has', () => {
    expect(SETUP_LOG).toBe('/tmp/agentbox-cloud-setup.log');
    expect(CLOUD_NOTE).toMatch(/sudo apt-get install/);
    expect(CLOUD_NOTE).toMatch(/\.agentbox\/cloud-setup\.sh/);
    expect(CLOUD_NOTE).not.toMatch(/ffmpeg, curl, wget, unzip, sudo/);
    // The ceiling is the cloud's own (measured on AgentCore: 1024 hard, even for root), so the agent is told how to work within it.
    expect(CLOUD_NOTE).toMatch(/Open files are capped at 1024 here/);
  });
});
