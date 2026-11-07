// THE CLOUD AGENT CAN INSTALL WHAT IT NEEDS.
//
// What broke (measured on her real AgentCore runtime, 2026-10-17): the image
// gave the agent passwordless sudo, and every `sudo` said "The no new
// privileges flag is set, which prevents sudo from running as root."
// AgentCore starts its containers with no_new_privs, so no setuid program can
// raise anything, and a project's setup could install nothing.
//
// Now `sudo` in the image is a small stand-in (cloud/sandbox/sudo.mjs) that
// hands the command to the sandbox server, which already runs as root, over a
// socket only processes on the machine can reach, and passes its input,
// output and exit code straight through. Driven here with the real stand-in
// against the real server, on this machine (as whoever runs the tests).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';

const SUDO = fileURLToPath(new URL('../cloud/sandbox/sudo.mjs', import.meta.url));
let tmp; let sandbox;
afterEach(async () => { await sandbox?.close(); sandbox = null; if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

async function start() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-sudo-'));
  const sock = path.join(tmp, 'root.sock');
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'), rootSocket: sock });
  for (let i = 0; i < 100 && !fs.existsSync(sock); i += 1) await new Promise((r) => setTimeout(r, 20));
  return { AGENTBOX_ROOT_SOCK: sock };
}
// Not spawnSync: the server runs in this same process and must be free to answer.
const sudo = (env, args, { input } = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [SUDO, ...args], { env: { ...process.env, ...env } });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (status) => resolve({ stdout, stderr, status }));
  child.stdin.end(input);
});

describe('sudo on the cloud machine', () => {
  it('runs the command for the agent and passes its output and exit code back', async () => {
    const env = await start();
    const ok = await sudo(env, ['sh', '-c', 'echo out; echo err >&2; exit 4']);
    expect(ok.stdout).toBe('out\n');
    expect(ok.stderr).toBe('err\n');
    expect(ok.status).toBe(4);
  });

  it('takes what is piped into it, as `sudo tee` needs', async () => {
    const env = await start();
    const file = path.join(tmp, 'teed');
    const r = await sudo(env, ['tee', file], { input: 'hello\n' });
    expect(r.status).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('hello\n');
  });

  it('understands the usual forms: flags, VAR=value, a shell', async () => {
    const env = await start();
    expect((await sudo(env, ['-E', '-n', '--', 'sh', '-c', 'echo $GREETING'])).stdout).toBe('\n');
    expect((await sudo(env, ['GREETING=hi', 'sh', '-c', 'echo $GREETING'])).stdout).toBe('hi\n');
    expect((await sudo(env, ['DEBIAN_FRONTEND=x', 'sh', '-c', 'echo $DEBIAN_FRONTEND'])).stdout).toBe('x\n');
    expect((await sudo(env, ['sh', '-c', 'echo $DEBIAN_FRONTEND'])).stdout).toBe('noninteractive\n');
    expect((await sudo(env, ['-u', 'agent', 'true'])).status).not.toBe(0);
  });

  it('says plainly when there is nothing to hand the command to', async () => {
    const r = await sudo({ AGENTBOX_ROOT_SOCK: path.join(os.tmpdir(), 'no-such.sock') }, ['true']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sudo: the cloud machine's helper is not running/);
  });

  it('a command that runs long keeps streaming, and a stopped one is stopped', async () => {
    const env = await start();
    const child = spawn(process.execPath, [SUDO, 'sh', '-c', 'echo first; sleep 30; echo never'], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    for (let i = 0; i < 100 && !out.includes('first'); i += 1) await new Promise((r) => setTimeout(r, 20));
    expect(out).toBe('first\n');
    child.kill('SIGTERM');
    const code = await new Promise((r) => child.on('exit', (c, s) => r(c ?? s)));
    expect(code).not.toBe(0);
    expect(out).not.toContain('never');
  });
});

describe('the image', () => {
  it('puts the stand-in where sudo is, ships it in the build, and installs no real sudo', () => {
    const docker = fs.readFileSync(new URL('../cloud/sandbox/Dockerfile', import.meta.url), 'utf8');
    expect(docker).toMatch(/sudo\.mjs \/usr\/local\/bin\/sudo/);
    expect(docker).not.toMatch(/install[^\n]*\bsudo\b[^\n]*rm -rf/);
    expect(docker).not.toMatch(/sudoers/);
    const setup = fs.readFileSync(new URL('../scripts/cloud-setup.mjs', import.meta.url), 'utf8');
    expect(setup).toMatch(/IMAGE_FILES = \[[^\]]*'sudo\.mjs'/);
  });
});
