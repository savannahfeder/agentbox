// THE APPROVALS SERVER STARTS AS PLAIN JAVASCRIPT.
//
// What it cost: every Claude Code agent starts its own approvals server, and
// Claude Code waits for it before the agent's first request. The server is
// .mts, so each one loaded Node's type-stripping compiler first.
//
// Measured 2026-11-13 on the ADEMark "first word" path (ademark.dev), Linux,
// Node 22.23, with a stand-in model server: in steady state an Agentbox thread
// went from filed to its first model request in about 970 ms against 530 ms for
// a bare `claude -p`, and Claude Code's own debug log showed the approvals
// server connecting last, 280 to 360 ms in. Started alone, the server answered
// `initialize` in 140 ms and held 33.5 MB of its own memory; the same four
// files stripped to plain JavaScript answered in 39 ms and held 8.5 MB.
//
// So the app writes a plain copy into its own folder, checks it before every
// agent and rewrites it when a file differs, and the launcher runs that copy.
// Without a copy the launcher runs the .mts as before.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

import { plainCopy } from '../main/plain-copy.mts';
import { Supervisor } from '../main/supervisor.mts';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(repo, 'main', 'approval-prompt-server.mts');
const launcher = path.join(repo, 'scripts', 'approval-server.sh');

const temps: string[] = [];
const tmpdir = (tag: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `plain-${tag}-`));
  temps.push(d);
  return d;
};
afterEach(() => { while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true }); });

const filesUnder = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** Starts a server, sends initialize and tools/list, resolves with the tool names. */
const toolsOf = (command: string, args: string[], env: NodeJS.ProcessEnv) => new Promise<string[]>((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`no answer: ${err}`)); }, 15_000);
  child.stderr.on('data', (d) => { err += d; });
  child.stdout.on('data', (d) => {
    out += d;
    for (const line of out.split('\n')) {
      let msg: { id?: number; result?: { tools?: { name: string }[] } };
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === 2) { clearTimeout(timer); child.kill(); resolve((msg.result?.tools ?? []).map((t) => t.name)); }
    }
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
});

const serverEnv = (dir: string) => ({ PATH: process.env.PATH, ZERO_APPROVALS_DIR: path.join(dir, 'approvals') });

describe('the plain copy', () => {
  it('holds no TypeScript file, and runs on a node with type stripping switched off', async () => {
    const out = tmpdir('copy');
    const copy = plainCopy(entry, out, { root: repo });
    expect(copy).toMatch(/\.mjs$/);
    expect(filesUnder(out).filter((f) => !f.endsWith('.mjs'))).toEqual([]);
    expect(fs.readFileSync(copy!, 'utf8')).not.toMatch(/\.mts['"]/);
    const tools = await toolsOf(process.execPath, ['--no-experimental-strip-types', copy!], serverEnv(out));
    expect(tools).toContain('approval_prompt');
  });

  it('is written once and found again, at the same path', () => {
    const out = tmpdir('again');
    const first = plainCopy(entry, out, { root: repo });
    const stamp = fs.statSync(first!).mtimeMs;
    expect(plainCopy(entry, out, { root: repo })).toBe(first);
    expect(fs.statSync(first!).mtimeMs).toBe(stamp);
  });

  it('is written again when one of its files was changed', () => {
    const out = tmpdir('changed');
    const copy = plainCopy(entry, out, { root: repo })!;
    const core = path.join(path.dirname(copy), 'approval-prompt-core.mjs');
    const good = fs.readFileSync(core, 'utf8');
    fs.writeFileSync(core, 'export const serveApprovals = () => { /* says yes to everything */ };\n');
    expect(plainCopy(entry, out, { root: repo })).toBe(copy);
    expect(fs.readFileSync(core, 'utf8')).toBe(good);
  });

  it('is written again when one of its files is gone', () => {
    const out = tmpdir('gone');
    const copy = plainCopy(entry, out, { root: repo })!;
    fs.rmSync(path.join(path.dirname(copy), 'approvals.mjs'));
    expect(plainCopy(entry, out, { root: repo })).toBe(copy);
    expect(fs.existsSync(path.join(path.dirname(copy), 'approvals.mjs'))).toBe(true);
  });

  it('takes the place of the copy an older version of the sources made', () => {
    const out = tmpdir('older');
    const copyDir = (copy: string | null) => path.basename(path.dirname(path.dirname(copy!)));
    const older = plainCopy(entry, out, { root: repo, strip: (s) => `// older\n${stripTypeScriptTypes(s)}` });
    const now = plainCopy(entry, out, { root: repo });
    expect(copyDir(older)).not.toBe(copyDir(now));
    expect(fs.readdirSync(out)).toEqual([copyDir(now)]);
  });

  it('is null, not a broken copy, when the types cannot be stripped', () => {
    const out = tmpdir('nostrip');
    expect(plainCopy(entry, out, { root: repo, strip: () => { throw new Error('no stripping here'); } })).toBeNull();
    expect(fs.existsSync(out) ? filesUnder(out) : []).toEqual([]);
  });

  it('is null for a file outside the root it was given', () => {
    const out = tmpdir('outside');
    expect(plainCopy(entry, out, { root: path.join(repo, 'shared') })).toBeNull();
  });
});

describe('the launcher', () => {
  const stub = (file: string, who: string) => {
    fs.writeFileSync(file, `#!/bin/bash\necho "${who} $ELECTRON_RUN_AS_NODE $*"\n`);
    fs.chmodSync(file, 0o755);
    return file;
  };
  const run = (env: NodeJS.ProcessEnv) => execFileSync('bash', [launcher], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', ...env } }).trim();

  it('runs the plain copy it was handed, with no type flags', () => {
    const dir = tmpdir('launch');
    const runtime = stub(path.join(dir, 'Electron'), 'app-binary');
    const copy = path.join(dir, 'approval-prompt-server.mjs');
    fs.writeFileSync(copy, '');
    expect(run({ HOME: dir, ZERO_APPROVALS_RUNTIME: runtime, ZERO_APPROVALS_SERVER: copy })).toBe(`app-binary 1 ${copy}`);
  });

  it('runs the TypeScript server when the copy it was handed is not there', () => {
    const dir = tmpdir('nocopy');
    const runtime = stub(path.join(dir, 'Electron'), 'app-binary');
    const said = run({ HOME: dir, ZERO_APPROVALS_RUNTIME: runtime, ZERO_APPROVALS_SERVER: path.join(dir, 'missing.mjs') });
    expect(said).toBe(`app-binary 1 ${entry}`);
  });

  it('runs a real plain copy that answers as the approvals server', async () => {
    const out = tmpdir('real');
    const copy = plainCopy(entry, out, { root: repo })!;
    const tools = await toolsOf('bash', [launcher], { ...serverEnv(out), HOME: out, ZERO_APPROVALS_RUNTIME: process.execPath, ZERO_APPROVALS_SERVER: copy });
    expect(tools).toContain('approval_prompt');
  });
});

describe('an agent', () => {
  const supervisorIn = (appDir: string, userDir: string) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = userDir;
    s.userDir = userDir;
    s.config = { storeRoot: userDir, accountId: 'nobody', storeMcpCommand: null };
    return s;
  };

  it('is handed the plain copy in its approvals server\'s environment', () => {
    const userDir = tmpdir('user');
    const env = supervisorIn(repo, userDir).mcpServers(null, 'darwin')['zero-approvals'].env;
    expect(env.ZERO_APPROVALS_SERVER).toMatch(/approval-prompt-server\.mjs$/);
    expect(env.ZERO_APPROVALS_SERVER.startsWith(userDir)).toBe(true);
    expect(fs.existsSync(env.ZERO_APPROVALS_SERVER)).toBe(true);
  });

  it('runs the TypeScript server, and writes nothing into the checkout, when the app keeps its data there', () => {
    const app = tmpdir('checkout');
    fs.mkdirSync(path.join(app, 'main'));
    for (const f of ['approval-prompt-server.mts', 'approval-prompt-core.mts', 'approvals.mts']) fs.copyFileSync(path.join(repo, 'main', f), path.join(app, 'main', f));
    fs.mkdirSync(path.join(app, 'shared'));
    fs.copyFileSync(path.join(repo, 'shared', 'approval-card.mts'), path.join(app, 'shared', 'approval-card.mts'));
    fs.mkdirSync(path.join(app, 'scripts'));
    fs.copyFileSync(launcher, path.join(app, 'scripts', 'approval-server.sh'));
    const before = filesUnder(app).sort();
    const env = supervisorIn(app, app).mcpServers(null, 'darwin')['zero-approvals'].env;
    expect(env.ZERO_APPROVALS_SERVER).toBeUndefined();
    expect(filesUnder(app).sort()).toEqual(before);
  });
});
