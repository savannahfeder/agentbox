// A CLOUD RUN'S DEADLINE COUNTS THE TIME ITS MACHINE SPENT GETTING READY.
//
// What broke (w-f26a8decb4, 2026-11-11): a cloud run's machine was reclaimed
// 8 hours 1 minute after the run started, and the thread was told none of its
// work had been saved. The sandbox stops the agent 7 hours 45 minutes in so
// there is a quarter hour to send the work home, but it started that clock
// when the agent started, after the clone, the downloads and the project's
// own setup script (which may take 15 minutes by itself). AgentCore's 8 hours
// count from the machine's start, so every minute of getting ready came out
// of the quarter hour meant for saving.
//
// Measured here before the fix: with a setup script that took 1.5 seconds and
// a 2-second deadline, the agent was stopped about 3.5 seconds after the
// machine started.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createSandbox } from '../cloud/sandbox/server.mjs';

let tmp; let sandbox; let fileServer; let base; let files;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-'));
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
  await new Promise<void>((r) => fileServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${fileServer.address().port}`;
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* best effort */ }
});

function packedRepo({ setup = null }: { setup?: string | null } = {}) {
  const repo = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@example.com');
  git(repo, 'config', 'user.name', 'A');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  if (setup) {
    fs.mkdirSync(path.join(repo, '.agentbox'));
    fs.writeFileSync(path.join(repo, '.agentbox', 'cloud-setup.sh'), setup);
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  const bundle = path.join(tmp, 'in.bundle');
  git(repo, 'bundle', 'create', bundle, 'agentbox/w-1', 'main');
  files.set('/in.bundle', fs.readFileSync(bundle));
}

async function until(fn: () => boolean, what: string, ms = 20_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Starts a run that never ends by itself and answers how long after the
// machine came up its work reached home.
async function savedAfter({ deadlineMs, setup = null }: { deadlineMs: number; setup?: string | null }) {
  packedRepo({ setup });
  const machineUp = Date.now();
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), killGraceMs: 100, setupLog: path.join(tmp, 'setup.log') });
  const started = await sandbox.handle({
    action: 'start', runId: 'run-d', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`,
    argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], env: {}, deadlineMs,
    results: { bundleUrl: `${base}/t/out`, changesUrl: `${base}/t/ch`, eventsUrl: `${base}/t/ev`, doneUrl: `${base}/t/done`, bring: [] },
  });
  expect(started.ok).toBe(true);
  await until(() => files.has('/t/done'), 'the run to be stopped and saved');
  expect(JSON.parse(files.get('/t/done').toString())).toMatchObject({ ok: true, cancelled: 'SIGTERM' });
  return Date.now() - machineUp;
}

describe('a cloud run stopped at its deadline', () => {
  it('is stopped on time counted from the machine coming up, however long its setup took', async () => {
    const took = await savedAfter({ deadlineMs: 2000, setup: 'sleep 1.5\n' });
    expect(took).toBeGreaterThanOrEqual(2000);
    expect(took).toBeLessThan(3000);
  });

  it('still gets its whole deadline when it was ready at once', async () => {
    const took = await savedAfter({ deadlineMs: 1500 });
    expect(took).toBeGreaterThanOrEqual(1500);
  });

  it('is stopped straight away when getting ready took longer than the deadline', async () => {
    const took = await savedAfter({ deadlineMs: 1500, setup: 'sleep 2\n' });
    expect(took).toBeGreaterThanOrEqual(2000);
    expect(took).toBeLessThan(2800);
  });
});
