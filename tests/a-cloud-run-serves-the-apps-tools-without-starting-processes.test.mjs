// A CLOUD RUN SERVES THE APP'S TOOLS WITHOUT STARTING A PROCESS FOR EACH.
//
// What broke: she wants 50 to 100 agents at once in the cloud (2026-10-17).
// Measured on her Mac that day, each cloud run kept three processes on it, its
// relay and its own copies of the approvals and store servers, each a whole
// runtime (the approvals server alone 46 MB), so 100 runs would need about
// 12 GB of a 16 GB Mac.
//
// Now the relay serves the app's own two servers in its own process, one
// channel per connection: the approvals for that worker's row, the store with
// its own claims. Any other server is still started as configured.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servedHere } from '../main/cloud/run.mjs';

let tmp;
const ACCOUNT = 'acct-test';
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-here-'));
  fs.mkdirSync(path.join(tmp, 'store', 'accounts', ACCOUNT), { recursive: true });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Lines in, answers out, as a stub would carry them.
function talk(proc, lines) {
  return new Promise((resolve) => {
    const got = [];
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); if (got.length === lines.length) resolve(got); }
    });
    for (const l of lines) proc.stdin.write(JSON.stringify(l) + '\n');
  });
}
const hello = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };
const list = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

describe('the approvals channel', () => {
  it('answers in this process, for this worker', async () => {
    const proc = servedHere({ command: '/nowhere/scripts/approval-server.sh' }, { ZERO_APPROVALS_DIR: path.join(tmp, 'spool'), ZERO_ITEM: 'w-1' }, 'r-c1');
    expect(proc).toBeTruthy();
    expect(proc.pid).toBeUndefined();
    const [init, tools] = await talk(proc, [hello, list]);
    expect(init.result.serverInfo.name).toBe('zero-approvals');
    expect(tools.result.tools.map((t) => t.name)).toEqual(['approval_prompt']);
    // With no key it refuses at once rather than waiting for a card.
    const [call] = await talk(proc, [{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'ls' } } } }]);
    expect(JSON.parse(call.result.content[0].text)).toMatchObject({ behavior: 'deny' });
    const closed = new Promise((r) => proc.on('close', r));
    proc.stdin.end();
    await closed;
  });

  // Closing only stopped reading: a question already asked went on polling
  // for fifteen minutes after its run had gone, and took an answer given then.
  it('stops waiting on a question once its run has gone, and takes the card down', async () => {
    const spool = path.join(tmp, 'spool-gone');
    const proc = servedHere({ command: '/nowhere/scripts/approval-server.sh' }, { ZERO_APPROVALS_DIR: spool, ZERO_APPROVALS_PUBKEY: 'k', ZERO_ITEM: 'w-1' }, 'r-c2');
    await talk(proc, [hello]);
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'ls' } } } }) + '\n');
    const cards = () => (fs.existsSync(spool) ? fs.readdirSync(spool).filter((f) => f.endsWith('.request.json')) : []);
    for (let i = 0; i < 100 && cards().length === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
    expect(cards()).toHaveLength(1);
    const closed = new Promise((r) => proc.on('close', r));
    const at = Date.now();
    proc.stdin.end();
    await closed;
    expect(Date.now() - at).toBeLessThan(1500);
    expect(cards()).toEqual([]);
  });
});

describe('the store', () => {
  it('offers the resource tool only when this cloud run supplied its own resolver', async () => {
    const env = { STORE_ACCOUNT_ID: ACCOUNT, AGENTBOX_HOME: path.join(tmp, 'store') };
    const calls = [];
    const a = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'resource-a', { requestCloudResource: async (args) => { calls.push(args); return { status: 'delivered', path: '/tmp/resource-a/file' }; } });
    const b = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'resource-b');
    const [[, toolsA], [, toolsB]] = await Promise.all([talk(a, [hello, list]), talk(b, [hello, list])]);
    expect(toolsA.result.tools.map((t) => t.name)).toContain('request_cloud_resource');
    expect(toolsB.result.tools.map((t) => t.name)).not.toContain('request_cloud_resource');
    const [answer] = await talk(a, [{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'request_cloud_resource', arguments: { kind: 'file', scope: 'documents', path: 'plan.md' } } }]);
    expect(JSON.parse(answer.result.content[0].text)).toEqual({ status: 'delivered', path: '/tmp/resource-a/file' });
    expect(calls).toEqual([{ kind: 'file', scope: 'documents', path: 'plan.md' }]);
    for (const p of [a, b]) { const closed = new Promise((r) => p.on('close', r)); p.stdin.end(); await closed; }
  });

  it('answers in this process, each connection with its own claims', async () => {
    const env = { STORE_ACCOUNT_ID: ACCOUNT, AGENTBOX_HOME: path.join(tmp, 'store') };
    const a = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'r-c1');
    const b = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'r-c2');
    const [[, toolsA], [, toolsB]] = await Promise.all([talk(a, [hello, list]), talk(b, [hello, list])]);
    expect(toolsA.result.tools.map((t) => t.name)).toContain('claim_work_item');
    expect(toolsB.result.tools.length).toBe(toolsA.result.tools.length);
    for (const p of [a, b]) { const closed = new Promise((r) => p.on('close', r)); p.stdin.end(); await closed; }
  });

  // The store reads whose lines it writes from its process's environment, and
  // one process serves every run, so a person id set for one run stayed for
  // the next, after a sign-out too.
  it('writes as the person each run was started for, and as nobody when none', async () => {
    const env = { STORE_ACCOUNT_ID: ACCOUNT, AGENTBOX_HOME: path.join(tmp, 'store') };
    const was = process.env.AGENTBOX_PERSON_ID;
    try {
      const a = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, { ...env, AGENTBOX_PERSON_ID: 'p-1' }, 'r-c4');
      expect(process.env.AGENTBOX_PERSON_ID).toBe('p-1');
      const b = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'r-c5');
      expect(process.env.AGENTBOX_PERSON_ID).toBeUndefined();
      for (const p of [a, b]) { const closed = new Promise((r) => p.on('close', r)); p.stdout.resume(); p.stdin.end(); await closed; }
    } finally {
      if (was === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = was;
    }
  });
});

// One process serves every run, so a bare claim must take the row of the run
// that asked, not of whichever run set ZERO_ITEM last
// (tests/a-worker-that-claims-without-an-id-gets-its-own-thread).
it('a bare claim on each connection asks for that run\'s own row', async () => {
  const env = { STORE_ACCOUNT_ID: ACCOUNT, AGENTBOX_HOME: path.join(tmp, 'store') };
  const a = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env: { ...env, ZERO_ITEM: 'w-run-a' } }, env, 'r-c6');
  const b = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env: { ...env, ZERO_ITEM: 'w-run-b' } }, env, 'r-c7');
  const claim = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'claim_work_item', arguments: {} } };
  const [[, , outA], [, , outB]] = await Promise.all([talk(a, [hello, list, claim]), talk(b, [hello, list, claim])]);
  expect(JSON.stringify(outA.result)).toContain('w-run-a');
  expect(JSON.stringify(outB.result)).toContain('w-run-b');
  for (const p of [a, b]) { const closed = new Promise((r) => p.on('close', r)); p.stdin.end(); await closed; }
});

describe('any other server', () => {
  it('is started as configured', () => {
    expect(servedHere({ command: '/usr/local/bin/some-mcp' }, {}, 'r-c3')).toBe(null);
  });
});
