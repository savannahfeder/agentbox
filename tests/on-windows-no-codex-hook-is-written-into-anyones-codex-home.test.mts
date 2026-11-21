// ON WINDOWS NO CODEX HOOK IS WRITTEN INTO ANYONE'S CODEX HOME.
//
// With the memory check on (the default), every app start and every Codex
// app-server start merged our PreToolUse/PostToolUse hook into `hooks.json` in
// the Codex home, which is the person's own `~/.codex` unless they set another.
// On Windows that hook cannot run: its command is a single-quoted path to
// scripts/memory-gate-hook.sh, which neither cmd nor PowerShell runs, and the
// coordinator it asks cannot listen on a socket file there (measured on
// Windows 11, Node 24: `listen EACCES` for a path in the temp folder). So the
// app wrote a broken hook into a file the person's own Codex reads too.
//
// Measured by calling syncCodexMemoryGate on a temp home with platform win32:
// before this change it wrote hooks.json; now it reads and writes nothing,
// whether the switch is on or off. Mac and Linux still write it.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCodexMemoryGate, codexHookRunsOn, hookIsOurs } from '../main/codex-memory-gate.mts';
import { Supervisor } from '../main/supervisor.mts';

const SCRIPT = 'C:\\Program Files\\Agentbox\\resources\\app.asar.unpacked\\scripts\\memory-gate-hook.sh';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const dirs: string[] = [];
function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-win-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const theirs = {
  description: 'my own hooks',
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-check.cmd', timeout: 5 }] }] },
};

describe('on Windows', () => {
  it('turning the check on creates no hooks.json', async () => {
    const dir = home();
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, platform: 'win32' });
    expect(out.wrote).toBe(false);
    expect(out.error).toMatch(/Windows/);
    expect(fs.existsSync(path.join(dir, 'hooks.json'))).toBe(false);
  });

  it('leaves the person\'s own hooks.json byte for byte, on or off', async () => {
    const dir = home();
    const file = path.join(dir, 'hooks.json');
    const before = JSON.stringify(theirs, null, 2);
    fs.writeFileSync(file, before);
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, platform: 'win32' });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: false, platform: 'win32' });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('asks the app-server nothing, so no hook is trusted in config.toml', async () => {
    const calls: string[] = [];
    const request = async (method: string) => { calls.push(method); return { data: [] }; };
    await syncCodexMemoryGate({ home: home(), scriptPath: SCRIPT, on: true, request, platform: 'win32' });
    expect(calls).toEqual([]);
  });

  it('does not even read the file', async () => {
    const touched: string[] = [];
    const fake = {
      readFileSync: () => { touched.push('read'); return ''; },
      mkdirSync: () => { touched.push('mkdir'); return undefined; },
      writeFileSync: () => { touched.push('write'); },
      renameSync: () => { touched.push('rename'); },
    } as unknown as Parameters<typeof syncCodexMemoryGate>[0]['fs'];
    await syncCodexMemoryGate({ home: home(), scriptPath: SCRIPT, on: true, fs: fake, platform: 'win32' });
    expect(touched).toEqual([]);
  });
});

describe('on a Mac and on Linux, unchanged', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform} still merges our hook in beside theirs`, async () => {
      const dir = home();
      fs.writeFileSync(path.join(dir, 'hooks.json'), JSON.stringify(theirs, null, 2));
      const out = await syncCodexMemoryGate({ home: dir, scriptPath: '/opt/agentbox/scripts/memory-gate-hook.sh', on: true, platform });
      expect(out.wrote).toBe(true);
      const file = JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8'));
      expect(file.hooks.PreToolUse[0].hooks[0].command).toBe('my-check.cmd');
      expect(hookIsOurs(file.hooks.PreToolUse[1].hooks[0].command)).toBe(true);
    });
  }

  it('only Windows is left out', () => {
    expect(codexHookRunsOn('win32')).toBe(false);
    expect(codexHookRunsOn('darwin')).toBe(true);
    expect(codexHookRunsOn('linux')).toBe(true);
  });
});

describe('the app itself, on a real Windows machine', () => {
  it.runIf(process.platform === 'win32')('setCodexMemoryGate writes nothing into the Codex home', async () => {
    const tmp = home();
    const codexHome = path.join(tmp, '.codex');
    fs.mkdirSync(codexHome);
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, codexHome, memoryGate: true, memoryGateSocket: path.join(tmp, 'g.sock'), memoryGateLockPort: 0 }, store, root, tmp, tmp);
    const out = await sup.setCodexMemoryGate(true, codexHome);
    expect(out.wrote).toBe(false);
    expect(fs.readdirSync(codexHome)).toEqual([]);
  });
});
