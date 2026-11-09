// CLOSING A CLOUD SANDBOX STOPS THE START IT BEGAN.
//
// A start answers the Mac at once and lays the run's folder out behind it:
// `git init`, then the base bundle downloaded and fetched, then the command.
// `close()` stopped the command and the servers and said nothing to that
// preparation, so after a close git was still writing in a folder its caller
// believed was finished with. On GitHub's macOS runner that read as
// `ENOTEMPTY: directory not empty` from the teardown of
// a-cloud-reply-sends-only-what-the-cloud-does-not-already-have, which took
// main red twice in two hours on 2026-10-21 (runs 39529559291 and
// 39537476342) while every machine here stayed green.
//
// Driven against the real server, with a base download held open so the close
// lands in the middle of the preparation on purpose.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createSandbox } from '../cloud/sandbox/server.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let tmp; let fileServer; let fileUrl; let held; let bundle; let marker; let sandbox;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-close-')));
  marker = path.join(tmp, 'the-command-ran');

  // "The Mac": a repository whose history is the base this run would take.
  const mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  const file = path.join(tmp, 'base.bundle');
  git(mac, 'bundle', 'create', '-q', file, 'main', 'agentbox/w-1');
  bundle = { body: fs.readFileSync(file), sha: git(mac, 'rev-parse', 'main'), head: git(mac, 'rev-parse', 'HEAD') };
  fs.rmSync(file);

  // The bucket, holding the base back until the test lets it go.
  held = null;
  fileServer = http.createServer((req, res) => { held = res; });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  fileUrl = `http://127.0.0.1:${fileServer.address().port}/base.bundle`;
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  held?.destroy();
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const until = async (fn, what, ms = 20_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

// Every path the sandbox wrote, with what is in it, so a write that lands
// after the close shows up as a difference.
const tree = (dir) => {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { out.push(`${p}/`); walk(p); continue; }
      let size = null;
      try { size = fs.statSync(p).size; } catch { /* gone */ }
      out.push(`${p} ${size}`);
    }
  };
  walk(dir);
  return out;
};

const startARun = () => {
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  return sandbox.handle({
    action: 'start',
    runId: 'r1',
    cwd: '/x/y',
    branch: 'agentbox/w-1',
    argv: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'yes')`],
    base: { url: fileUrl, sha: bundle.sha },
    refs: { 'refs/heads/main': bundle.sha, 'refs/heads/agentbox/w-1': bundle.head },
  });
};

describe('a close while a start is still laying out its folder', () => {
  it('ends the preparation, rather than leaving git writing in the folder', async () => {
    expect(await startARun()).toMatchObject({ ok: true });
    await until(() => held, 'the base to be asked for');

    await sandbox.close();
    // The preparation is over by the time the close is: nothing is left to
    // write, so the caller may now delete the folder.
    expect(await sandbox.handle({ action: 'status' })).toMatchObject({ state: 'failed' });

    const after = tree(path.join(tmp, 'vm'));
    held.writeHead(200);
    held.end(bundle.body);
    held = null;
    await new Promise((r) => setTimeout(r, 300));
    expect(tree(path.join(tmp, 'vm'))).toEqual(after);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('does not wait on a download that never answers', async () => {
    expect(await startARun()).toMatchObject({ ok: true });
    await until(() => held, 'the base to be asked for');
    const at = Date.now();
    await sandbox.close();
    expect(Date.now() - at).toBeLessThan(2_000);
    // The folder goes in one call, which is the one that threw on GitHub.
    expect(() => fs.rmSync(path.join(tmp, 'vm'), { recursive: true })).not.toThrow();
  });

  it('is nothing to do when no run was ever started', async () => {
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
    await expect(sandbox.close()).resolves.toBeUndefined();
  });
});
