// ON WINDOWS A WORKER STARTS THE APP'S TOOL SERVERS WITHOUT A SHELL.
//
// The MCP config every Claude worker gets names `scripts/approval-server.sh`
// as the approvals server, and Windows cannot start a bash script. A real
// `claude -p --mcp-config <config> --permission-prompt-tool
// mcp__zero-approvals__approval_prompt` on Windows 11
// reported the server in its init line as
//
//   .sh launcher                                          "status":"failed"
//   node.exe main\approval-prompt-server.mjs, no shell    "status":"connected"
//
// Claude Code still ran, with no way to ask for an approval. The store server's
// `mcp/<name>-mcp.sh` is a sh script too. Each launcher finds a runtime and runs
// its .mjs, so Windows is now handed the app's own binary with
// ELECTRON_RUN_AS_NODE=1 and the .mjs. A Mac and Linux keep the launchers,
// which the cloud relay recognises by name.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolServerLaunch } from '../main/tool-server-launch.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const w = path.win32;
const APP = 'C:\\Program Files\\Agentbox\\resources\\app';
const RUNTIME = 'C:\\Program Files\\Agentbox\\Agentbox.exe';
const APPROVALS = w.join(APP, 'scripts', 'approval-server.sh');
const STORE = w.join(APP, 'mcp', `${nameSlug}-mcp.sh`);
const onWindows = (command, extra = {}) => toolServerLaunch(command, { appDir: APP, platform: 'win32', runtime: RUNTIME, ...extra });

describe('on Windows', () => {
  it('runs the approvals server on the app\'s own binary', () => {
    expect(onWindows(APPROVALS)).toEqual({
      command: RUNTIME, args: [w.join(APP, 'main', 'approval-prompt-server.mjs')], env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('runs the store server the same way', () => {
    expect(onWindows(STORE)).toEqual({
      command: RUNTIME, args: [w.join(APP, 'mcp', 'stdio.mjs')], env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('knows the launcher whatever the case of its path', () => {
    expect(onWindows(APPROVALS.toUpperCase()).command).toBe(RUNTIME);
  });

  it('knows the launcher a packaged app keeps beside its archive', () => {
    const packed = 'C:\\A\\resources\\app.asar';
    const outside = 'C:\\A\\resources\\app.asar.unpacked\\scripts\\approval-server.sh';
    const launch = toolServerLaunch(outside, {
      appDir: packed, platform: 'win32', runtime: RUNTIME, unpacked: (p) => p.replace('\\app.asar\\', '\\app.asar.unpacked\\'),
    });
    // The server itself is read out of the archive, as the launcher does.
    expect(launch.args).toEqual([w.join(packed, 'main', 'approval-prompt-server.mjs')]);
  });

  it('leaves a store command outside this app alone', () => {
    expect(onWindows('C:\\mine\\store.cmd')).toEqual({ command: 'C:\\mine\\store.cmd' });
    expect(onWindows('C:\\elsewhere\\scripts\\approval-server.sh')).toEqual({ command: 'C:\\elsewhere\\scripts\\approval-server.sh' });
  });
});

describe('on a Mac and on Linux', () => {
  it.each(['darwin', 'linux'])('%s keeps the launcher, which the cloud relay knows by name', (platform) => {
    const app = '/Applications/Agentbox.app/Contents/Resources/app';
    expect(toolServerLaunch(`${app}/scripts/approval-server.sh`, { appDir: app, platform })).toEqual({ command: `${app}/scripts/approval-server.sh` });
  });
});

describe('the config the supervisor hands a worker', () => {
  const servers = (platform) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-servers-'));
    const sup = new Supervisor({ storeRoot: dir }, { listItems: () => [], listProducts: () => [] }, REPO);
    try { return sup.mcpServers(platform); } finally { sup.stop?.(); fs.rmSync(dir, { recursive: true, force: true }); }
  };

  it('starts both servers on Windows without a shell, keeping their own settings', () => {
    const got = servers('win32');
    expect(got['zero-approvals']).toMatchObject({
      command: process.execPath,
      args: [w.join(REPO, 'main', 'approval-prompt-server.mjs')],
      env: { ELECTRON_RUN_AS_NODE: '1', ZERO_APPROVALS_DIR: expect.any(String) },
    });
    expect(got[nameSlug]).toMatchObject({ command: process.execPath, args: [w.join(REPO, 'mcp', 'stdio.mjs')], env: { ELECTRON_RUN_AS_NODE: '1' } });
  });

  it.each(['darwin', 'linux'])('is the launchers on %s, with nothing added', (platform) => {
    const got = servers(platform);
    expect(got['zero-approvals'].command).toBe(path.join(REPO, 'scripts', 'approval-server.sh'));
    expect(got['zero-approvals']).not.toHaveProperty('args');
    expect(got['zero-approvals'].env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
  });
});
