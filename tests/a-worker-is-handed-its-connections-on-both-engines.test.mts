// A WORKER IS HANDED ITS CONNECTIONS ON BOTH ENGINES.
//
// What was missing (2026-10-31): the broker only helps if each engine's start
// actually names its server. Claude Code reads a config file per spawn; Codex
// reads thread params, and a resumed thread calls tools by the name it used last
// time, so a name with a run in it would strand a thread at its first reply. A
// cloud run swaps every server for a stub and runs the real one on this Mac, so
// it was read and driven here too. Codex's approval layer would otherwise put a
// card in front of every read.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { mcpIsolation, resumeThreadParams, workerThreadParams } from '../main/codex-session.mts';
import { createCodexApprovals } from '../main/codex-approvals.mjs';
import { codexLineForTheCloud, KEPT_WHILE_AWAY, mcpConfigForTheCloud, servedHere, toolEnv } from '../main/cloud/run.mts';
import { connectionServerName } from '../shared/connections-catalog.mjs';
import { listPending } from '../main/approvals.mjs';

const NAME = connectionServerName('test-tracker');
const SERVER = { command: '/app/node', args: ['/app/mcp/connection-proxy.mjs'], env: { ELECTRON_RUN_AS_NODE: '1', AGENTBOX_CONNECTION_RUN: 'run-key', AGENTBOX_CONNECTION: 'test-tracker', AGENTBOX_CONNECTIONS_SOCK: '/tmp/x.sock' } };
const SERVERS = { [NAME]: SERVER };

const fakeSupervisor = (over = {}) => Object.assign(Object.create(Supervisor.prototype), {
  appDir: path.resolve(import.meta.dirname, '..'), config: { storeRoot: '/tmp/store', accountId: 'a' }, storeMcpCommand: () => null, writeWorkerSettings: () => null, ...over,
});
const made = [];
afterEach(() => { for (const f of made.splice(0)) fs.rmSync(f, { force: true, recursive: true }); });

describe('Claude Code', () => {
  it('finds the server in the config beside the approvals channel', () => {
    const servers = fakeSupervisor().mcpServers(SERVERS);
    expect(servers['zero-approvals']).toBeTruthy();
    expect(servers[NAME]).toEqual(SERVER);
  });

  it('with no connections the list is what it always was', () => {
    const servers = fakeSupervisor().mcpServers();
    expect(Object.keys(servers)).toEqual(['zero-approvals']);
    expect(Object.keys(fakeSupervisor().mcpServers({}))).toEqual(['zero-approvals']);
  });

  it('is granted the server, or every read would raise a card', () => {
    const plan = { args: [], connectionServers: SERVERS };
    const files = [];
    fakeSupervisor().prepareClaudePermissions(plan, {}, 'run-grant', files);
    made.push(...files);
    const at = plan.args.indexOf(`mcp__${NAME}`);
    expect(at).toBeGreaterThan(0);
    expect(plan.args[at - 1]).toBe('--allowedTools');
    const config = JSON.parse(fs.readFileSync(plan.args[plan.args.indexOf('--mcp-config') + 1], 'utf8'));
    expect(config.mcpServers[NAME].env.AGENTBOX_CONNECTION_RUN).toBe('run-key');
  });

  it('with no connections it is granted nothing new', () => {
    const plan = { args: [] };
    const files = [];
    fakeSupervisor().prepareClaudePermissions(plan, {}, 'run-none', files);
    made.push(...files);
    expect(plan.args).not.toContain('--allowedTools');
  });
});

describe('Codex', () => {
  it('finds the server in the thread params, with room for her card to wait', () => {
    const params = workerThreadParams({ cwd: '/w', connectionServers: SERVERS });
    const entry = params.config.mcp_servers[NAME];
    expect(entry.command).toBe(SERVER.command);
    expect(entry.args).toEqual(SERVER.args);
    expect(entry.env).toEqual(SERVER.env);
    expect(entry.tool_timeout_sec).toBeGreaterThan(3600);
  });

  it('a resumed thread carries it under the same name, whatever the run', () => {
    const first = workerThreadParams({ cwd: '/w', connectionServers: SERVERS });
    const later = { [NAME]: { ...SERVER, env: { ...SERVER.env, AGENTBOX_CONNECTION_RUN: 'a-later-key' } } };
    const resumed = resumeThreadParams('T-1', workerThreadParams({ cwd: '/w', connectionServers: later }));
    expect(Object.keys(resumed.config.mcp_servers)).toEqual(Object.keys(first.config.mcp_servers));
    expect(resumed.config.mcp_servers[NAME].env.AGENTBOX_CONNECTION_RUN).toBe('a-later-key');
    expect(NAME).not.toMatch(/run|[0-9a-f]{8}-/);
  });

  it('wins over a server of hers with the same name, which isolation would switch off', () => {
    const table = mcpIsolation([NAME, 'hers'], null, SERVERS);
    expect(table[NAME].command).toBe(SERVER.command);
    expect(table.hers).toEqual({ enabled: false });
  });

  it('with no connections the table is what it always was', () => {
    expect(Object.keys(mcpIsolation(['hers'], null))).toEqual(['hers']);
  });

  it('codexThreadParamsFor is the one place that reads them off the plan', () => {
    const sup = fakeSupervisor({ _codexModelWord: () => null, codexModelRefusal: () => null, codexEffortRefusal: () => null, effectiveCodexMode: () => null });
    const params = sup.codexThreadParamsFor({ connectionServers: SERVERS }, '/w', [], null, '/h');
    expect(params.config.mcp_servers[NAME].command).toBe(SERVER.command);
    expect(Object.keys(sup.codexThreadParamsFor({}, '/w', [], null, '/h').config.mcp_servers)).toEqual([]);
  });

  const askToCall = (serverName, tool = 'list_issues') => ({
    threadId: 'T-1', turnId: 'TURN-1', serverName, mode: 'form', message: `Allow the ${serverName} MCP server to run tool "${tool}"?`,
    requestedSchema: { type: 'object', properties: {} }, _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session'], tool_params: {} },
  });

  it('does not draw a card for a connection, because the app has its own', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-cdx-'));
    made.push(root);
    const cards = createCodexApprovals({ storeRoot: root, pollMs: 5 });
    const scope = cards.scope({ product: 'p', item: 'w', connectionServers: [NAME] });
    const out = await scope.handle('mcpServer/elicitation/request', askToCall(NAME));
    expect(out).toBe('accept');
    expect(listPending(root)).toEqual([]);
  });

  it('still draws one for a server that is not a connection of this run', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-cdx-'));
    made.push(root);
    const cards = createCodexApprovals({ storeRoot: root, pollMs: 5 });
    const scope = cards.scope({ product: 'p', item: 'w', connectionServers: [NAME] });
    const asked = scope.handle('mcpServer/elicitation/request', askToCall('connection-somebody-elses'));
    await new Promise((r) => setTimeout(r, 30));
    expect(listPending(root).length).toBe(1);
    scope.close();
    await asked;
  });
});

describe('a cloud run', () => {
  it('sends the sandbox a stub, with no key and no socket in it', () => {
    const out = mcpConfigForTheCloud({ mcpServers: SERVERS }, '/opt/stub.mjs');
    expect(out.mcpServers[NAME].args).toEqual(['/opt/stub.mjs', NAME]);
    expect(JSON.stringify(out)).not.toMatch(/run-key|x\.sock/);
  });

  it('a Codex thread\'s line does the same, and keeps the original to run on this Mac', () => {
    const keep = {};
    const line = JSON.stringify({ method: 'thread/resume', id: 2, params: { threadId: 'T', config: { mcp_servers: { [NAME]: { ...SERVER, tool_timeout_sec: 28800 } } } } });
    const out = codexLineForTheCloud(line, { stubPath: '/opt/stub.mjs', codexHome: '/nowhere', keep, findRollout: () => null });
    expect(out.line).not.toMatch(/run-key|x\.sock/);
    expect(JSON.parse(out.line).params.config.mcp_servers[NAME].tool_timeout_sec).toBe(28800);
    expect(keep[NAME].env.AGENTBOX_CONNECTION_RUN).toBe('run-key');
  });

  it('is started on this Mac as a child, not served inside the relay', () => {
    expect(servedHere(SERVER, {}, 'h')).toBeNull();
  });

  it('keeps the proxy\'s variables through the relay\'s scrub', () => {
    const env = toolEnv({ ...SERVER.env, AWS_SESSION_TOKEN: 'no' });
    expect(env.AGENTBOX_CONNECTION_RUN).toBe('run-key');
    expect(env.AWS_SESSION_TOKEN).toBeUndefined();
  });

  it('never keeps a connection\'s write for later, so nothing replays when the Mac wakes', () => {
    expect(Object.keys(KEPT_WHILE_AWAY).filter((s) => s.startsWith('connection-'))).toEqual([]);
    const run = fs.readFileSync(path.resolve(import.meta.dirname, '../main/cloud/run.mts'), 'utf8');
    expect(run).toMatch(/hold: \[APPROVALS_SERVER\]/);
  });

  it('a proxy started the way the relay starts one, with its app gone, says so', async () => {
    const entry = { command: process.execPath, args: [path.resolve(import.meta.dirname, '../mcp/connection-proxy.mjs')], env: { ...SERVER.env, AGENTBOX_CONNECTION_NAME: 'Test tracker', AGENTBOX_CONNECTIONS_SOCK: path.join(os.tmpdir(), 'nobody-here.sock') } };
    const child = spawn(entry.command, entry.args, { env: toolEnv({ PATH: process.env.PATH, ...entry.env }), stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    const answered = new Promise((resolve) => child.stdout.on('data', (d) => { out += d; if (out.includes('\n')) resolve(JSON.parse(out.split('\n')[0])); }));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_issues', arguments: {} } })}\n`);
    const m = await answered;
    child.kill();
    expect(m.result.isError).toBe(true);
    expect(m.result.content[0].text).toMatch(/owner's app is offline/i);
  });
});

describe('a run\'s key', () => {
  it('ends with the run, on the same path the run\'s files go', () => {
    let closed = 0;
    const sup = fakeSupervisor({ connections: { openRun: () => ({ servers: SERVERS, close: () => { closed += 1; } }) } });
    const spawnFiles = [];
    const plan = {};
    sup._giveConnections(plan, { id: 'w', product: 'p' }, 'r', spawnFiles);
    expect(plan.connectionServers).toEqual(SERVERS);
    expect(closed).toBe(0);
    const session = { spawnFiles };
    sup.removeSpawnFiles(session);
    expect(closed).toBe(1);
    sup.removeSpawnFiles(session);
    expect(closed).toBe(1);
  });

  it('a Mac with no connections service starts workers as it always did', () => {
    const plan = {};
    const spawnFiles = [];
    fakeSupervisor()._giveConnections(plan, { id: 'w', product: 'p' }, 'r', spawnFiles);
    expect(plan.connectionServers).toBeUndefined();
    expect(spawnFiles).toEqual([]);
  });

  it('a connections service that throws does not stop the worker', () => {
    const plan = {};
    fakeSupervisor({ connections: { openRun: () => { throw new Error('keychain said no'); } } })._giveConnections(plan, { id: 'w', product: 'p' }, 'r', []);
    expect(plan.connectionServers).toBeUndefined();
  });
});

describe('what a worker is told', () => {
  const brief = (working = [], catalog = [{ id: 'linear', name: 'Linear' }, { id: 'test-tracker', name: 'Test tracker' }]) =>
    fakeSupervisor({ connections: { catalog, workingNow: () => working } })._connectionsBrief();

  it('how to ask for one nobody has connected, with the one-press link', () => {
    const b = brief();
    expect(b).toContain('[Connect Linear](agentbox://connections/linear)');
    expect(b).toContain('agentbox://connections');
    expect(b).toMatch(/not connected/i);
  });

  it('that one it has needs the owner\'s app online', () => {
    const b = brief([{ id: 'test-tracker', name: 'Test tracker' }]);
    expect(b).toContain('mcp__connection-test-tracker');
    expect(b).toMatch(/owner's app/i);
    expect(b).not.toContain('agentbox://connections/test-tracker');
  });

  it('nothing at all with no service', () => {
    expect(fakeSupervisor()._connectionsBrief()).toBeNull();
  });
});
