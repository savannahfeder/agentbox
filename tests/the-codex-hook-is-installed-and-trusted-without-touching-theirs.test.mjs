// THE CODEX HOOK IS INSTALLED AND TRUSTED WITHOUT TOUCHING THEIRS — w-e5225b62ba.
//
// The Codex home may be the user's own `~/.codex`, holding their hooks and their
// settings, so every write here is a merge and the trust is satisfied for one key
// rather than switched off for everybody.
//
// WHY THE TRUST GOES THROUGH THE APP-SERVER AND NOT THROUGH US. The hash Codex
// compares against is not a hash of the command text — tried eight preimages
// against two real hashes on this Mac and matched none — so the only way to know
// it is to ask `hooks/list`. And `config/batchWrite` is the call Codex's own TUI
// uses for exactly this, so Codex edits config.toml and nothing of theirs is
// rewritten by us. Measured: an unrelated `[projects."..."]` table survived and a
// second hook in the same file stayed untrusted.
//
// AND IT RUNS AT EVERY START. The key carries the script's absolute path, so a
// new app version is a new hash, which Codex reports as "modified" and refuses to
// run until it is trusted again. Installing once would work until the first
// update and then go quiet, which is the failure this file exists to prevent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncCodexMemoryGate, HOOKS_FILE } from '../main/codex-memory-gate.mjs';

const SCRIPT = '/Applications/Agentbox.app/Contents/Resources/scripts/memory-gate-hook.sh';
let home;

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const hooksFile = () => path.join(home, HOOKS_FILE);
const read = () => JSON.parse(fs.readFileSync(hooksFile(), 'utf8'));
const write = (obj) => fs.writeFileSync(hooksFile(), JSON.stringify(obj, null, 2));

/** A fake app-server that reports our hook as Codex really reports it. */
const serverWith = (hooks, { failOn = null } = {}) => {
  const calls = [];
  return {
    calls,
    request: async (method, params) => {
      calls.push([method, params]);
      if (failOn === method) throw new Error('refused');
      if (method === 'hooks/list') return { data: [{ cwd: '/app', hooks, warnings: [], errors: [] }] };
      return { status: 'ok' };
    },
  };
};

const listedOurs = (over = {}) => ({
  key: `${path.join(home, HOOKS_FILE)}:pre_tool_use:0:0`,
  command: `'${SCRIPT}' pre`,
  currentHash: 'sha256:abcd',
  trustStatus: 'untrusted',
  enabled: true,
  ...over,
});

describe('turning it on', () => {
  it('writes a hooks.json where there was none, and trusts what it wrote', async () => {
    const server = serverWith([listedOurs()]);
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: server.request });
    expect(out.wrote).toBe(true);
    expect(out.trusted).toBe(1);
    expect(out.error).toBe(null);
    expect(read().hooks.PreToolUse[0].matcher).toBe('Bash');
    const [, trust] = server.calls.find(([m]) => m === 'config/batchWrite');
    expect(trust.edits[0].value).toBe('sha256:abcd');
    expect(trust.edits[0].keyPath).toContain('trusted_hash');
    expect(trust.reloadUserConfig).toBe(true);
  });

  it('keeps every hook of theirs that was already in the file', async () => {
    write({ description: 'mine', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '/me/hi.sh' }] }] } });
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([listedOurs()]).request });
    const after = read();
    expect(after.description).toBe('mine');
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe('/me/hi.sh');
    expect(after.hooks.PreToolUse).toHaveLength(1);
  });

  it('asks to trust ours and never theirs, however untrusted theirs is', async () => {
    const server = serverWith([
      listedOurs(),
      { key: 'k2', command: '/me/lint.sh', currentHash: 'sha256:zzzz', trustStatus: 'untrusted' },
    ]);
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: server.request });
    const [, trust] = server.calls.find(([m]) => m === 'config/batchWrite');
    expect(trust.edits).toHaveLength(1);
    expect(trust.edits[0].keyPath).not.toContain('k2');
  });

  it('writes no config at all when ours is already trusted', async () => {
    const server = serverWith([listedOurs({ trustStatus: 'trusted' })]);
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: server.request });
    expect(out.trusted).toBe(0);
    expect(server.calls.some(([m]) => m === 'config/batchWrite')).toBe(false);
  });

  it('trusts ours again when a new app version made Codex call it modified', async () => {
    const server = serverWith([listedOurs({ trustStatus: 'modified', currentHash: 'sha256:newer' })]);
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: server.request });
    expect(out.trusted).toBe(1);
    const [, trust] = server.calls.find(([m]) => m === 'config/batchWrite');
    expect(trust.edits[0].value).toBe('sha256:newer');
  });

  it('leaves the file alone on a second start, having nothing to change', async () => {
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([listedOurs()]).request });
    const first = fs.statSync(hooksFile()).mtimeMs;
    const body = fs.readFileSync(hooksFile(), 'utf8');
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([listedOurs({ trustStatus: 'trusted' })]).request });
    expect(out.wrote).toBe(false);
    expect(fs.readFileSync(hooksFile(), 'utf8')).toBe(body);
    expect(fs.statSync(hooksFile()).mtimeMs).toBe(first);
  });
});

describe('turning it off', () => {
  it('takes ours out and leaves theirs', async () => {
    write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/me/lint.sh' }] }] } });
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([listedOurs()]).request });
    expect(read().hooks.PreToolUse).toHaveLength(2);
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: false });
    const after = read();
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe('/me/lint.sh');
    expect(after.hooks.PostToolUse).toBeUndefined();
  });

  it('creates no file in a Codex home that never had one', async () => {
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: false });
    expect(out.wrote).toBe(false);
    expect(fs.existsSync(hooksFile())).toBe(false);
  });

  it('starts no app-server, because taking the hook out is the whole of off', async () => {
    const server = serverWith([listedOurs()]);
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: server.request });
    const before = server.calls.length;
    await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: false, request: server.request });
    expect(server.calls.length).toBe(before);
  });
});

describe('what it refuses to break', () => {
  it('leaves a hooks.json that is not JSON exactly where it is', async () => {
    fs.writeFileSync(hooksFile(), '{ this is not json');
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([]).request });
    expect(out.wrote).toBe(false);
    expect(out.error).toMatch(/not readable JSON/);
    expect(fs.readFileSync(hooksFile(), 'utf8')).toBe('{ this is not json');
  });

  it('treats an empty hooks.json as a file it may write', async () => {
    fs.writeFileSync(hooksFile(), '   \n');
    const out = await syncCodexMemoryGate({ home, scriptPath: SCRIPT, on: true, request: serverWith([listedOurs()]).request });
    expect(out.wrote).toBe(true);
    expect(read().hooks.PreToolUse).toHaveLength(1);
  });

  it('still installs the hook when the app-server will not answer', async () => {
    const out = await syncCodexMemoryGate({
      home, scriptPath: SCRIPT, on: true,
      request: async () => { throw new Error('app-server is gone'); },
    });
    expect(out.wrote).toBe(true);
    expect(out.trusted).toBe(0);
    expect(out.error).toMatch(/could not trust/);
    expect(read().hooks.PreToolUse).toHaveLength(1);
  });

  it('survives a config write the app-server refuses', async () => {
    const out = await syncCodexMemoryGate({
      home, scriptPath: SCRIPT, on: true,
      request: serverWith([listedOurs()], { failOn: 'config/batchWrite' }).request,
    });
    expect(out.wrote).toBe(true);
    expect(out.trusted).toBe(0);
    expect(out.error).toMatch(/could not trust/);
  });

  it('reports rather than throws when the home cannot be written', async () => {
    const out = await syncCodexMemoryGate({
      home, scriptPath: SCRIPT, on: true,
      fs: { readFileSync: () => { throw new Error('nope'); }, existsSync: () => false, mkdirSync: () => {}, writeFileSync: () => { throw new Error('read-only'); }, renameSync: () => {} },
      request: serverWith([listedOurs()]).request,
    });
    expect(out.wrote).toBe(false);
    expect(out.error).toMatch(/could not write/);
  });

  it('writes nothing anywhere without a home', async () => {
    const out = await syncCodexMemoryGate({ home: '', scriptPath: SCRIPT, on: true });
    expect(out.error).toBe('no codex home');
    expect(out.wrote).toBe(false);
  });
});
