// THE CODEX HOOK IS INSTALLED WITHOUT TOUCHING ANYONE ELSE'S — w-e5225b62ba.
//
// The Codex home is shared ground. It is the user's own `~/.codex` unless they
// gave the app a home of its own, so their hooks.json may already hold hooks
// they wrote and their config.toml holds every Codex setting they have. Two
// things had to be true before this could ship:
//
//   WE ADD AND REMOVE OUR OWN LINE AND NOTHING ELSE. Their hooks stay, their
//   `description` stays, their other events stay, and turning the switch off
//   leaves the file as if we had never been in it.
//
//   WE NEVER REWRITE config.toml. Trust goes through the app-server's own
//   `config/batchWrite`, the call the Codex TUI uses, so Codex edits its file
//   and every other hook's trust and every unrelated table survives. Measured
//   live on this Mac 2026-10-04 (see main/codex-memory-gate.mjs).
//
// And one that is about not making things worse: every failure here leaves Codex
// workers ungated, which is exactly where w-3958c3753d left them. None of it may
// stop the app starting.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncCodexMemoryGate, hookIsOurs } from '../main/codex-memory-gate.mjs';

const SCRIPT = '/Applications/Agentbox.app/Contents/scripts/memory-gate-hook.sh';

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-test-'));
}
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8'));
const write = (dir, body) => fs.writeFileSync(path.join(dir, 'hooks.json'), JSON.stringify(body, null, 2));

/** An app-server that records what it was asked, and answers like the real one. */
function server(hooks = []) {
  const calls = [];
  return {
    calls,
    request: async (method, params) => {
      calls.push([method, params]);
      if (method === 'hooks/list') return { data: [{ cwd: '/app', hooks, warnings: [], errors: [] }] };
      return { status: 'ok' };
    },
  };
}
/** A hooks/list entry, shaped as the real one is. */
const listed = (command, over = {}) => ({
  key: `/home/.codex/hooks.json:pre_tool_use:0:0`,
  command, currentHash: 'sha256:aaaa', trustStatus: 'untrusted', enabled: true, ...over,
});

describe('turning it on', () => {
  it('writes a hooks.json when the home had none', async () => {
    const dir = home();
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    expect(out.wrote).toBe(true);
    expect(out.error).toBe(null);
    const file = read(dir);
    expect(file.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(hookIsOurs(file.hooks.PreToolUse[0].hooks[0].command)).toBe(true);
    expect(hookIsOurs(file.hooks.PostToolUse[0].hooks[0].command)).toBe(true);
  });

  it('keeps every hook and every key the user already had', async () => {
    const dir = home();
    write(dir, {
      description: 'mine',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/me/lint.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: '/me/hello.sh' }] }],
      },
    });
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    const file = read(dir);
    expect(file.description).toBe('mine');
    expect(file.hooks.SessionStart[0].hooks[0].command).toBe('/me/hello.sh');
    expect(file.hooks.PreToolUse[0].hooks[0].command).toBe('/me/lint.sh');
    expect(file.hooks.PreToolUse).toHaveLength(2);
  });

  it('writes nothing the second time, so a restart is not a change', async () => {
    const dir = home();
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    const again = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    expect(again.wrote).toBe(false);
  });

  it('replaces our entry from an older app path rather than keeping both', async () => {
    const dir = home();
    await syncCodexMemoryGate({ home: dir, scriptPath: '/old/Agentbox.app/scripts/memory-gate-hook.sh', on: true });
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    expect(out.wrote).toBe(true);
    expect(read(dir).hooks.PreToolUse).toHaveLength(1);
    expect(read(dir).hooks.PreToolUse[0].hooks[0].command).toContain('/Applications/Agentbox.app');
  });

  it('leaves a hooks.json it cannot parse completely alone', async () => {
    const dir = home();
    fs.writeFileSync(path.join(dir, 'hooks.json'), '{ this is not json');
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    expect(out.wrote).toBe(false);
    expect(out.error).toMatch(/not readable JSON/);
    expect(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8')).toBe('{ this is not json');
  });

  it('says so and carries on when the home cannot be written', async () => {
    const out = await syncCodexMemoryGate({
      home: '/this/does/not/exist/and/cannot/be/made', scriptPath: SCRIPT, on: true,
      fs: {
        readFileSync: () => { throw new Error('ENOENT'); },
        mkdirSync: () => { throw new Error('EROFS: read-only file system'); },
      },
    });
    expect(out.wrote).toBe(false);
    expect(out.error).toMatch(/read-only/);
  });
});

describe('trusting it afterwards', () => {
  it('asks hooks/list, then writes trust for our key only', async () => {
    const dir = home();
    const s = server([listed(`'${SCRIPT}' pre`), listed('/me/lint.sh', { key: 'k2' })]);
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, request: s.request, cwds: ['/app'] });
    expect(out.trusted).toBe(1);
    expect(s.calls.map(([m]) => m)).toEqual(['hooks/list', 'config/batchWrite']);
    const [, params] = s.calls[1];
    expect(params.edits).toHaveLength(1);
    expect(params.edits[0].keyPath).toContain('hooks.state.');
    expect(params.edits[0].keyPath).toContain('trusted_hash');
    expect(params.reloadUserConfig).toBe(true);
  });

  it('writes no config at all when ours is already trusted', async () => {
    const dir = home();
    const s = server([listed(`'${SCRIPT}' pre`, { trustStatus: 'trusted' })]);
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, request: s.request });
    expect(out.trusted).toBe(0);
    expect(s.calls.map(([m]) => m)).toEqual(['hooks/list']);
  });

  it('re-trusts ours after the app moved, which Codex calls modified', async () => {
    const dir = home();
    const s = server([listed(`'${SCRIPT}' pre`, { trustStatus: 'modified', currentHash: 'sha256:new' })]);
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, request: s.request });
    expect(out.trusted).toBe(1);
    expect(s.calls[1][1].edits[0].value).toBe('sha256:new');
  });

  it('still installs the hook when the app-server will not answer', async () => {
    const dir = home();
    const out = await syncCodexMemoryGate({
      home: dir, scriptPath: SCRIPT, on: true,
      request: async () => { throw new Error('the app-server is closed'); },
    });
    expect(out.wrote).toBe(true);
    expect(out.trusted).toBe(0);
    expect(out.error).toMatch(/could not trust/);
    expect(read(dir).hooks.PreToolUse).toHaveLength(1);
  });

  it('does not try to trust anything when there is no app-server to ask', async () => {
    const dir = home();
    const out = await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    expect(out.wrote).toBe(true);
    expect(out.trusted).toBe(0);
    expect(out.error).toBe(null);
  });
});

describe('turning it off', () => {
  it('takes ours out and leaves theirs', async () => {
    const dir = home();
    write(dir, { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/me/lint.sh' }] }] } });
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    const out = await syncCodexMemoryGate({ home: dir, on: false });
    expect(out.wrote).toBe(true);
    const file = read(dir);
    expect(file.hooks.PreToolUse).toHaveLength(1);
    expect(file.hooks.PreToolUse[0].hooks[0].command).toBe('/me/lint.sh');
    expect(file.hooks.PostToolUse).toBeUndefined();
  });

  it('leaves a file with no hooks left in it rather than empty lists', async () => {
    const dir = home();
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true });
    await syncCodexMemoryGate({ home: dir, on: false });
    expect(read(dir).hooks).toEqual({});
  });

  it('creates nothing when the switch goes off in a home we were never in', async () => {
    const dir = home();
    const out = await syncCodexMemoryGate({ home: dir, on: false });
    expect(out.wrote).toBe(false);
    expect(fs.existsSync(path.join(dir, 'hooks.json'))).toBe(false);
  });

  it('never writes config.toml, on or off', async () => {
    const dir = home();
    const s = server([listed(`'${SCRIPT}' pre`)]);
    await syncCodexMemoryGate({ home: dir, scriptPath: SCRIPT, on: true, request: s.request });
    await syncCodexMemoryGate({ home: dir, on: false, request: s.request });
    expect(fs.existsSync(path.join(dir, 'config.toml'))).toBe(false);
  });
});

describe('a home that was never named', () => {
  it('is a refusal to guess, not a write somewhere else', async () => {
    const out = await syncCodexMemoryGate({ home: '', scriptPath: SCRIPT, on: true });
    expect(out.wrote).toBe(false);
    expect(out.error).toBeTruthy();
  });
});
