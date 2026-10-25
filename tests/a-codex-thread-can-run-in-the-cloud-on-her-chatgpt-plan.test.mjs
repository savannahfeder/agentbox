// A CODEX THREAD CAN RUN IN THE CLOUD, ON HER CHATGPT PLAN, WITHOUT EVER
// SIGNING HER MAC OUT.
//
// Her words, 2026-10-13: "It should work with my Codex plan and my Claude Code
// plan ... that's sort of a fundamental requirement." The first build ran only
// Claude Code in the cloud. This is the Codex half (docs/cloud/PLAN.md, "Codex
// in the cloud"), and each piece here guards a way it was found to go wrong:
//
//   - the sign-in, which since 2026-10-14 is made in the cloud and never
//     leaves it (tests/a-cloud-sign-in-happens-in-the-cloud-and-never-
//     reaches-the-mac). The Mac's own login no longer goes up at all.
//   - the app's tools, which Codex is told about inside `thread/start`, not on
//     a command line, so the proxy swaps them in the stream.
//   - pictures, which ride in a turn as `localImage` paths on the Mac.
//   - the ending, which must wait until the work is home (Codex's review).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { codexLineForTheCloud, codexConfigForTheCloud } from '../main/cloud/run.mjs';
import { holdUntilHome } from '../main/cloud/codex-cloud.mjs';
import { TURN_CLOSED } from '../main/claude-input.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cloud-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('a line from the app to a cloud Codex', () => {
  const keep = () => ({});

  it('swaps the store server in thread/start for the sandbox stub and keeps the original to run on the Mac', () => {
    const k = keep();
    const line = JSON.stringify({ id: 3, method: 'thread/start', params: { cwd: '/Users/x/repo', config: { mcp_servers: { agentbox: { command: '/app/mcp/agentbox-mcp.sh', env: { ZERO_ITEM: 'w-1' } }, hers: { enabled: false } } } } }) + '\n';
    const out = codexLineForTheCloud(line, { stubPath: '/opt/stub.mjs', codexHome: '/h', keep: k });
    const msg = JSON.parse(out.line);
    // Codex starts a tool with a bare environment, so the stub is told where
    // the bridge is in its own entry, and given nothing else of the original's.
    expect(msg.params.config.mcp_servers.agentbox).toMatchObject({ command: '/usr/local/bin/node', args: ['/opt/stub.mjs', 'agentbox'], env: { AGENTBOX_BRIDGE_SOCK: '/tmp/agentbox-bridge.sock' } });
    expect(JSON.stringify(msg.params.config.mcp_servers.agentbox)).not.toContain('ZERO_ITEM');
    expect(msg.params.config.mcp_servers.hers).toEqual({ enabled: false });
    expect(k.agentbox).toEqual({ command: '/app/mcp/agentbox-mcp.sh', args: [], env: { ZERO_ITEM: 'w-1' } });
    expect(msg.params.cwd).toBe('/Users/x/repo');
    expect(out.line.endsWith('\n')).toBe(true);
  });

  // HER DECISION, 2026-10-13: "Yes, let the cloud machine be Codex's sandbox."
  // Measured that day: Codex's own command sandbox (bubblewrap) cannot nest in
  // an AgentCore microVM ("bwrap: Can't mkdir parents ... Permission denied"),
  // so every write and every command was refused. OpenAI's docs say to use
  // full access inside a container or VM, which is then the boundary.
  it('lets the cloud machine be the sandbox for a workspace run, and nothing else changes', () => {
    const start = (sandbox) => JSON.parse(codexLineForTheCloud(JSON.stringify({ id: 1, method: 'thread/start', params: { cwd: '/w', sandbox, approvalPolicy: 'on-request' } }), { keep: keep() }).line).params;
    expect(start('workspace-write')).toEqual({ cwd: '/w', sandbox: 'danger-full-access', approvalPolicy: 'on-request' });
    // A run she set to read-only stays read-only.
    expect(start('read-only').sandbox).toBe('read-only');
    const resumed = JSON.parse(codexLineForTheCloud(JSON.stringify({ id: 2, method: 'thread/resume', params: { threadId: 't', sandbox: 'workspace-write' } }), { keep: keep(), findRollout: () => null }).line);
    expect(resumed.params.sandbox).toBe('danger-full-access');
  });

  it('sends a resumed thread\'s rollout up first', () => {
    const out = codexLineForTheCloud(JSON.stringify({ id: 4, method: 'thread/resume', params: { threadId: 't-1' } }), { codexHome: '/h', keep: keep(), findRollout: (id, { home }) => `${home}/sessions/2026/10/13/rollout-x-${id}.jsonl` });
    expect(out.files).toEqual(['/h/sessions/2026/10/13/rollout-x-t-1.jsonl']);
  });

  it('sends a picture a turn carries, and nothing for plain text', () => {
    const turn = { id: 5, method: 'turn/start', params: { threadId: 't', input: [{ type: 'text', text: 'look' }, { type: 'localImage', path: '/Users/x/store/a.png' }, { type: 'localImage', path: 'relative.png' }] } };
    expect(codexLineForTheCloud(JSON.stringify(turn), { keep: keep() }).files).toEqual(['/Users/x/store/a.png']);
    expect(codexLineForTheCloud(JSON.stringify({ id: 6, method: 'turn/start', params: { input: [{ type: 'text', text: '/Users/x/secret' }] } }), { keep: keep() }).files).toEqual([]);
  });

  it('passes every other line exactly as it came', () => {
    for (const line of ['{"id":1,"method":"initialize","params":{}}\n', 'not json\n', '{"id":2,"result":{}}\n']) {
      expect(codexLineForTheCloud(line, { keep: keep() })).toEqual({ line, files: [] });
    }
  });
});

describe('the Codex settings a cloud run takes', () => {
  it('takes only her model, effort and tier, and nothing in a section', () => {
    const toml = [
      'model = "gpt-6-astra"', 'model_reasoning_effort = "medium"', 'service_tier = "priority"',
      'notify = ["/Applications/X.app/notify"]', 'approvals_reviewer = "auto_review"',
      '', '[mcp_servers.hers]', 'command = "/usr/local/bin/hers"', 'model = "not-this"',
    ].join('\n');
    expect(codexConfigForTheCloud(toml)).toBe('model = "gpt-6-astra"\nmodel_reasoning_effort = "medium"\nservice_tier = "priority"\n');
    expect(codexConfigForTheCloud('')).toBe('');
  });
});

describe('a cloud Codex worker\'s ending', () => {
  const setup = () => {
    const worker = new EventEmitter();
    worker.steer = async () => 'steered';
    const client = { closed: null, close(n) { this.closed = n; } };
    let finish;
    const procExit = new Promise((r) => { finish = r; });
    const turnEnds = [];
    holdUntilHome({ worker, client, procExit, onTurnEnd: () => turnEnds.push(1) });
    const exits = [];
    worker.on('exit', (...a) => exits.push(a));
    return { worker, client, finish, exits, turnEnds };
  };

  it('waits for the work to come home, and closes the connection to start that', async () => {
    const { worker, client, finish, exits, turnEnds } = setup();
    worker.emit('exit', 0, null, null);
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([]);
    expect(client.closed).toBeTruthy();
    expect(turnEnds).toEqual([1]);
    finish({ code: 0 });
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([[0, null, null]]);
  });

  it('turns a reply sent while the work comes home into an ordinary queued reply', async () => {
    const { worker } = setup();
    expect(await worker.steer('before')).toBe('steered');
    worker.emit('exit', 0, null, null);
    await expect(worker.steer('during')).rejects.toMatchObject({ code: TURN_CLOSED });
  });

  it('reports work that could not come home as a transport fault, whatever the turn said', async () => {
    const { worker, finish, exits } = setup();
    worker.emit('exit', 0, null, null);
    finish({ code: 75 });
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([[75, null, { transportFault: true }]]);
  });

  it('treats a proxy killed before it could finish bringing the work home as work not home (Codex\'s review)', async () => {
    for (const out of [{ code: null, signal: 'SIGKILL' }, { code: null, signal: null }, undefined]) {
      const { worker, finish, exits } = setup();
      worker.emit('exit', 0, null, null);
      finish(out);
      await new Promise((r) => setTimeout(r, 20));
      expect(exits, JSON.stringify(out)).toEqual([[75, null, { transportFault: true }]]);
    }
    // A proxy that finished and reports the remote command's own code (143,
    // a stopped command) is a real ending, not a lost one.
    const { worker, finish, exits } = setup();
    worker.emit('exit', 0, null, null);
    finish({ code: 143, signal: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([[0, null, null]]);
  });

  it('keeps a failed or stopped turn\'s own ending once the work is home', async () => {
    const { worker, finish, exits } = setup();
    worker.emit('exit', 1, 'SIGTERM', { how: 'killed' });
    worker.emit('exit', 0, null, null);
    finish({ code: 143 });
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([[1, 'SIGTERM', { how: 'killed' }]]);
  });
});
