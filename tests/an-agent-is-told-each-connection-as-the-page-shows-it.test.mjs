// AN AGENT IS TOLD EACH CONNECTION AS THE PAGE SHOWS IT.
//
// What broke (2026-10-31): the Connections page said the tracker was
// connected and Temporarily down, while every agent was told "Not connected"
// and offered a Connect link, four times to one person. The brief knew only
// "has a tool" or "not connected", and a tracker that had never answered got no
// tool, so it fell in the second. Measured here on the words a worker is given,
// built from a real connections service on the fixture, and on what a run's
// tool answers while the tracker is down.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createConnections } from '../main/connections/index.mjs';
import { createBroker } from '../main/connections/broker.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { catalogFor, clockAt } from '../shared/connections-catalog.mjs';

const key = crypto.randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const out = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); },
  decrypt: (b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};
const browser = async (url) => {
  const allowed = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  await fetch(allowed.headers.get('location'), { signal: AbortSignal.timeout(5000) });
};
const MIN = 60_000;

let fx; let dir; let conn; let clock;
beforeEach(async () => {
  fx = await startToolsFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-told-'));
  clock = Date.now();
  conn = createConnections({ vaultFile: path.join(dir, 'c.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser, now: () => clock });
});
afterEach(async () => { await conn.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

const supervisorWith = (connections) => Object.assign(Object.create(Supervisor.prototype), { connections });
const brief = () => supervisorWith({ catalog: conn.catalog, workingNow: conn.workingNow, statusNow: conn.statusNow })._connectionsBrief();
const lineFor = (b, name) => b.split('\n').find((l) => l.startsWith(name)) ?? '';

describe('a tracker that is down', () => {
  it('that had worked: connected but down since, last tried, and its tool is kept so the run can find it back', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    await conn.check('test-tracker');
    const wentDown = clock;
    clock += 3 * 60 * MIN;
    await conn.check('test-tracker');
    const line = lineFor(brief(), 'Test tracker');
    // The brief words its times against the real clock, so an evening run crosses midnight.
    expect(line).toContain(`Test tracker is connected but down since ${clockAt(wentDown)}, last tried ${clockAt(clock)}.`);
    expect(line).toContain('mcp__connection-test-tracker');
    expect(brief()).not.toContain('[Connect Test tracker]');
    expect(brief()).not.toMatch(/Not connected: .*Test tracker/);
  });

  it('that had never worked: the same words, no tool, and still no Connect link', async () => {
    await conn.connect('test-tracker');
    // As if its first check had failed: signed in, never read.
    await conn._saveStatus('test-tracker', { state: 'down', workedAt: null });
    const line = lineFor(brief(), 'Test tracker');
    expect(line).toMatch(/^Test tracker is connected but down since \d/);
    expect(line).not.toContain('mcp__connection-test-tracker');
    expect(line).toMatch(/no tool for it/i);
    expect(line).toMatch(/do not offer to connect it/i);
    expect(brief()).not.toContain('[Connect Test tracker]');
  });

  it('a wrong address: could not reach its tools, waiting will not fix it, and the page link is not Connect', async () => {
    const wrong = createConnections({ vaultFile: path.join(dir, 'w.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.url }, packaged: false }), openExternal: browser });
    await wrong.connect('test-tracker');
    const b = supervisorWith({ catalog: wrong.catalog, workingNow: wrong.workingNow, statusNow: wrong.statusNow })._connectionsBrief();
    const line = lineFor(b, 'Test tracker');
    expect(line).toMatch(/^Test tracker is connected, but its tools could not be reached/);
    expect(line).toMatch(/waiting will not fix it/i);
    expect(line).toContain('agentbox://connections/test-tracker');
    expect(b).not.toContain('[Connect Test tracker]');
    await wrong.stop();
  });

  it('a lost sign-in says sign in again, not connect', async () => {
    await conn.connect('test-tracker');
    fx.switches.revoked = true;
    await conn.check('test-tracker');
    const line = lineFor(brief(), 'Test tracker');
    expect(line).toMatch(/sign-in stopped working/i);
    expect(line).toContain('[Sign in to Test tracker again](agentbox://connections/test-tracker)');
    expect(brief()).not.toContain('[Connect Test tracker]');
  });
});

describe('the cases either side', () => {
  it('one that works: its tools, and no link at all', async () => {
    await conn.connect('test-tracker');
    const line = lineFor(brief(), 'Test tracker');
    expect(line).toMatch(/^Test tracker is connected and works/);
    expect(line).toContain('mcp__connection-test-tracker');
    expect(line).not.toContain('agentbox://');
  });

  it('one nobody connected is still offered with Connect', () => {
    const b = brief();
    expect(b).toContain('[Connect Test tracker](agentbox://connections/test-tracker)');
    expect(b).toContain('[Connect Linear](agentbox://connections/linear)');
  });

  it('says to tell the owner the same thing the page says', async () => {
    expect(brief()).toMatch(/never tell the owner to connect a tool that is connected/i);
  });
});

describe('what the run\'s tool answers while it is down', () => {
  it('connected but down since, last tried, in the tool\'s own answer', async () => {
    await conn.connect('test-tracker');
    const broker = createBroker({ connections: conn, storeRoot: dir, socketPath: path.join(dir, 'b.sock'), proxyFile: '/nowhere' });
    const run = broker.openRun({ runId: 'r', item: { id: 'w', product: 'p' } });
    expect(run.names).toEqual(['connection-test-tracker']);
    fx.switches.errors = true;
    await conn.check('test-tracker');
    const wentDown = clock;
    clock += 20 * MIN;
    const out = await broker._answer({ run: run.servers['connection-test-tracker'].env.AGENTBOX_CONNECTION_RUN, connection: 'test-tracker', method: 'tools/call', params: { name: 'list_issues', arguments: {} } }, new AbortController().signal);
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain(`Test tracker is connected but down since ${clockAt(wentDown, clock)}, last tried ${clockAt(clock, clock)}`);
    expect(out.result.content[0].text).toMatch(/tries it again by itself/i);
    run.close();
    await broker.stop();
  });
});
