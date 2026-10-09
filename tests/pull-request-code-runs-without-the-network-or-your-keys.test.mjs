// A STRANGER'S CODE RUNS WITHOUT THE NETWORK OR ANYTHING IN THE HOME FOLDER.
//
// w-bde446f1aa, 2026-10-07. Running a pull request's tests means running code
// somebody outside wrote, as the person who owns this Mac: an ordinary test
// file can read ~/.ssh, the `gh` token or the whole store and post it anywhere.
// The pull request loop's run-untrusted.sh (.claude/skills/review-pull-requests)
// wraps every such command in macOS's own sandbox.
// Measured by hand the same day: under the profile, `cat` of a denied file
// exits 1 with "Operation not permitted" and a `fetch` to example.com fails
// with EPERM, while the same fetch outside it returns 200.
//
// The home folder here is a stand-in (AGENTBOX_SANDBOX_HOME), so the test can
// plant a secret in it without touching the real one.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(root, '.claude', 'skills', 'review-pull-requests', 'run-untrusted.sh');
const canSandbox = process.platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec');

let home, work, outside;
beforeAll(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-home-')));
  fs.mkdirSync(path.join(home, '.ssh'));
  fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'the secret');
  work = path.join(home, 'scratch');
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, 'own.txt'), 'its own file');
  outside = path.join(home, 'Zero');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'ledger.jsonl'), 'the store');
});
afterAll(() => { fs.rmSync(home, { recursive: true, force: true }); });

const inside = (args, env = {}) => spawnSync(wrapper, [work, '--', ...args], {
  encoding: 'utf8',
  env: { ...process.env, AGENTBOX_SANDBOX_HOME: home, ...env },
});

describe.skipIf(!canSandbox)('running pull request code in the sandbox', () => {
  it('reads and writes its own folder', () => {
    const r = inside(['/bin/sh', '-c', 'cat own.txt && echo made > made.txt && cat made.txt']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('its own filemade\n');
  });

  it('cannot read a key in the home folder', () => {
    const r = inside(['/bin/cat', path.join(home, '.ssh', 'id_ed25519')]);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('the secret');
  });

  it('cannot read the store or anything else in the home folder', () => {
    const r = inside(['/bin/cat', path.join(outside, 'ledger.jsonl')]);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('the store');
  });

  it('cannot write outside its own folder', () => {
    const r = inside(['/bin/sh', '-c', `echo x > ${path.join(outside, 'planted')}`]);
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(outside, 'planted'))).toBe(false);
  });

  // The policy refuses before any packet leaves, so this holds offline too:
  // the error is the sandbox's EPERM, not a timeout or a missing route.
  it('cannot open a connection to the internet', () => {
    const script = "require('net').connect(443,'1.1.1.1').on('error',e=>{console.log(e.code);process.exit(3)}).on('connect',()=>{console.log('connected');process.exit(0)})";
    const r = inside([process.execPath, '-e', script]);
    expect(r.stdout.trim()).toBe('EPERM');
    expect(r.status).toBe(3);
  });

  it('does not inherit tokens from the environment', () => {
    const r = inside(['/bin/sh', '-c', 'echo "[$GH_TOKEN][$ANTHROPIC_API_KEY]"'], { GH_TOKEN: 'gho_secret', ANTHROPIC_API_KEY: 'sk-secret' });
    expect(r.stdout.trim()).toBe('[][]');
  });

  it('passes the command\'s own exit code back', () => {
    expect(inside(['/bin/sh', '-c', 'exit 7']).status).toBe(7);
  });
});

describe('using it wrongly', () => {
  it('is a file that can be run', () => {
    expect(fs.statSync(wrapper).mode & 0o111).not.toBe(0);
  });

  it('refuses without a folder and a command', () => {
    const r = spawnSync(wrapper, [], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/i);
  });

  // The whole home folder as the "scratch" folder would grant everything.
  it.skipIf(!canSandbox)('refuses the home folder itself as the folder', () => {
    const r = spawnSync(wrapper, [home, '--', '/usr/bin/true'], { encoding: 'utf8', env: { ...process.env, AGENTBOX_SANDBOX_HOME: home } });
    expect(r.status).toBe(2);
  });
});
