// A CONNECTION STAYS SIGNED IN, AND ITS CARD SHOWS EVERY FAILED USE.
//
// What broke (2026-10-31): two people's tracker sign-in "lapsed" at
// 17:41 and 17:49 and killed two agent jobs; the card said "Works 8 min ago" while
// agents were failing, did not move after use, and lit a person's initials beside
// "Not signed in". Measured: the stand-in restarted at 17:40:11 with its tokens in
// memory, so the first use after that was refused (a harness fault, now fixed by
// its state file). The app's own faults are held here: no renewal ahead of time, no
// warning, a 401 on a write never refreshed, and no failure kept anywhere.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createBroker } from '../main/connections/broker.mts';
import { createConnections } from '../main/connections/index.mts';
import { closeSignInRows } from '../main/connections/start.mts';
import { catalogFor, connectionLine, STATES } from '../shared/connections-catalog.mts';
import { failureLine, peopleOnCard, stateLine, whenLine } from '../renderer/src/connections/connections-shown';

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
const ID = 'test-tracker';

let fx; let dir; let conn; let broker; let clock; let rows; let told;
const make = (more = {}) => createConnections({
  vaultFile: path.join(dir, 'connections.enc'), cipher, openExternal: browser, checkMs: 1500, callMs: 1500,
  catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }),
  now: () => clock, onNeedsYou: (row) => rows.push(row), onWhoChanged: () => { told += 1; }, ...more,
});
beforeEach(async () => {
  fx = await startToolsFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alive-'));
  clock = Date.now(); rows = []; told = 0;
  conn = make();
  broker = createBroker({ connections: conn, storeRoot: dir, socketPath: path.join(dir, 'b.sock'), proxyFile: '/nowhere' });
});
afterEach(async () => { await conn.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

const tile = async () => (await conn.list()).tiles.find((t) => t.id === ID);
const call = async (name, args = {}) => {
  const run = broker.openRun({ runId: 'r', item: { id: 'i', product: 'p' } });
  const out = await broker._answer({ run: run.servers[`connection-${ID}`].env.AGENTBOX_CONNECTION_RUN, connection: ID, method: 'tools/call', params: { name, arguments: args } }, new AbortController().signal);
  run.close();
  return out.result;
};

describe('a sign-in is kept alive where the tool allows', () => {
  it('renews before it runs out, with no failed job first', async () => {
    await conn.connect(ID);
    const before = fx.tokensEverIssued.length;
    clock += 50 * 60_000; // of 60: inside the window
    await conn.keepAlive();
    expect(fx.tokensEverIssued.length).toBeGreaterThan(before);
    expect((await tile()).state).toBe(STATES.WORKS);
    expect(rows).toEqual([]);
  });

  it('does not renew while there is plenty of time', async () => {
    await conn.connect(ID);
    const before = fx.tokensEverIssued.length;
    clock += 10 * 60_000;
    await conn.keepAlive();
    expect(fx.tokensEverIssued.length).toBe(before);
  });

  it('a renewal refused says so in Needs you once, before any job meets it', async () => {
    await conn.connect(ID);
    fx.switches.revoked = true;
    clock += 50 * 60_000;
    await conn.keepAlive();
    expect((await tile()).state).toBe(STATES.NOT_SIGNED_IN);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Sign in to Test tracker again');
    await conn.keepAlive();
    await conn.check(ID);
    expect(rows).toHaveLength(1);
  });

  it('a renewal that could not get through is not a lost sign-in', async () => {
    await conn.connect(ID);
    fx.switches.down = true;
    clock += 50 * 60_000;
    await conn.keepAlive();
    expect((await tile()).state).toBe(STATES.WORKS);
    expect(rows).toEqual([]);
  });

  it('gives up on a token long past its end, so a closed Mac does not retry for ever', async () => {
    await conn.connect(ID);
    fx.switches.down = true;
    clock += 5 * 3600_000;
    const before = fx.calls.length;
    await conn.keepAlive();
    expect(fx.calls.length).toBe(before);
  });

  it('a tool with no way to renew warns half an hour ahead, once, and the agent is told', async () => {
    const onlyAccess = await startToolsFixture({ play: { name: 'Short', noRefresh: true, tools: [{ name: 'list_issues', description: 'x', inputSchema: { type: 'object', properties: {} } }], call: (_n, _a, { text }) => text({ issues: [{ id: 'A-1', title: 'One' }] }) } });
    const c = make({ catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: onlyAccess.mcpUrl }, packaged: false }), vaultFile: path.join(dir, 'short.enc') });
    try {
      await c.connect(ID);
      await c.keepAlive();
      expect(rows).toEqual([]);
      clock += 40 * 60_000;
      await c.keepAlive();
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Test tracker signs out soon');
      await c.keepAlive();
      expect(rows).toHaveLength(1);
      const t = (await c.list()).tiles.find((x) => x.id === ID);
      expect(t.endsAt).toBeGreaterThan(clock);
      const said = connectionLine(c.statusNow().find((x) => x.id === ID), clock);
      expect(said).toMatch(/sign-in ends at/);
    } finally { await c.stop(); await onlyAccess.stop(); }
  });

  it('a write that met an expired token is refreshed and goes once, because a 401 did nothing', async () => {
    await conn.connect(ID);
    // Stops the token between the handshake and the call, as a card waiting an hour does.
    const real = fx.switches;
    let calls = 0;
    const wrapped = await conn._withTool(conn._entryOf(ID), async (client) => {
      calls += 1;
      if (calls === 1) real.expired = true;
      return client.callTool({ name: 'create_issue', arguments: { title: 'Once' } }, undefined, { timeout: 1500 });
    }, { ms: 1500, again: false });
    expect(wrapped.isError).toBeFalsy();
    expect(fx.writes.map((w) => w.title)).toEqual(['Once']);
  });
});

describe('the card shows what really happened', () => {
  it('moves when an agent uses the tool', async () => {
    await conn.connect(ID);
    clock += 20 * 60_000;
    expect(stateLine(await tile(), clock)).toBe('Works 20 min ago');
    await call('list_issues');
    const t = await tile();
    expect(t.lastUsedAt).toBe(clock);
    expect(stateLine(t, clock + 60_000)).toBe('Works, used 1 min ago');
  });

  it('a failed read shows at once with its time, in place of Works', async () => {
    await conn.connect(ID);
    clock += 60_000;
    fx.switches.down = true;
    expect((await call('get_issue', { id: 'LUM-41' })).isError).toBe(true);
    const t = await tile();
    expect(t.failures[0]).toMatchObject({ tool: 'get_issue', wrote: false, at: clock });
    expect(failureLine(t.failures[0], clock)).toMatch(/get_issue|Read an issue/);
    // It reads as down here; a failure that does not change the state still takes Works' place.
    expect(stateLine(t, clock)).toMatch(/^Down since/);
    expect(stateLine({ ...t, state: 'works', word: 'Works', at: clock - 1000 }, clock)).toMatch(/read failed at/i);
  });

  it('a read the tool itself refused counts as failed, though the call came back', async () => {
    await conn.connect(ID);
    await call('get_issue', { id: 'NOPE' });
    expect((await tile()).failures[0]).toMatchObject({ tool: 'get_issue', wrote: false });
  });

  it('a failed write is kept too, marked as a write, and asks no second send', async () => {
    await conn.connect(ID);
    await conn._noteUse(ID, { tool: 'create_issue', wrote: true, ok: false, why: 'it did not answer' });
    expect((await tile()).failures[0]).toMatchObject({ tool: 'create_issue', wrote: true, why: 'it did not answer' });
  });

  it('a later good check puts Works back, and the failure stays listed', async () => {
    await conn.connect(ID);
    clock += 1000;
    fx.switches.down = true;
    await call('list_issues');
    fx.switches.down = false;
    clock += 1000;
    await conn.check(ID);
    const t = await tile();
    expect(stateLine(t, clock)).toMatch(/^Works/);
    expect(t.failures).toHaveLength(1);
  });

  it('a lost sign-in says when, and a good one says nothing of the kind', async () => {
    await conn.connect(ID);
    expect(whenLine(await tile(), clock)).toBeNull();
    fx.switches.revoked = true;
    clock += 1000;
    await conn.check(ID);
    expect(whenLine(await tile(), clock)).toMatch(/^It stopped working at \d/);
  });

  it('keeps a bounded list, newest first, and never what the call asked for', async () => {
    await conn.connect(ID);
    for (let i = 0; i < 80; i += 1) await conn._noteUse(ID, { tool: `t${i}`, wrote: false, ok: false, why: 'x', args: { secret: 'private words' } });
    const t = await tile();
    expect(t.failures.length).toBeLessThanOrEqual(50);
    expect(t.failures[0].tool).toBe('t79');
    expect(JSON.stringify(t)).not.toContain('private words');
  });
});

describe('initials mean it works', () => {
  const me = { id: 'me' }; const dev = { id: 'dev', connections: [ID] };
  const mine = { ...me, connections: [ID] };

  it('my own initials go out with the sign-in', () => {
    expect(peopleOnCard({ id: ID, state: 'not_signed_in' }, [mine, dev], 'me').map((p) => p.id)).toEqual(['dev']);
    expect(peopleOnCard({ id: ID, state: 'not_allowed' }, [mine], 'me')).toEqual([]);
  });

  it('stay while it works or is only down, since a teammate can still ask me', () => {
    expect(peopleOnCard({ id: ID, state: 'works' }, [mine, dev], 'me').map((p) => p.id)).toEqual(['me', 'dev']);
    expect(peopleOnCard({ id: ID, state: 'down' }, [mine], 'me').map((p) => p.id)).toEqual(['me']);
  });

  it('the team is told when a sign-in goes, and is no longer told I have it', async () => {
    await conn.connect(ID);
    expect(await conn.connectedIds()).toEqual([ID]);
    const before = told;
    fx.switches.revoked = true;
    await conn.check(ID);
    expect(told).toBeGreaterThan(before);
    expect(await conn.connectedIds()).toEqual([]);
  });

  it('an outage does not take it from the team list', async () => {
    await conn.connect(ID);
    fx.switches.down = true;
    await conn.check(ID);
    expect(await conn.connectedIds()).toEqual([ID]);
  });
});

describe('the row that asked for a sign-in', () => {
  const item = (id, title, status = 'review', product = 'p') => ({ id, title, status, product });
  const storeWith = (items) => {
    const closed = [];
    return { closed, listAllWorkItems: () => items, productDir: (s) => s, modules: { workItemsDisk: { updateWorkItem: (_d, id, patch) => closed.push([id, patch.status]) } } };
  };

  it('closes when the sign-in is back, and says so to nobody', () => {
    const s = storeWith([item('a', 'Sign in to Linear again'), item('b', 'Linear signs out soon')]);
    closeSignInRows(s, 'Linear');
    expect(s.closed).toEqual([['a', 'done'], ['b', 'done']]);
  });

  it('leaves another tool\'s row, a person\'s own thread, and one already closed', () => {
    const s = storeWith([item('a', 'Sign in to Notion again'), item('b', 'Sign in to Linear again please, says Dev'), item('c', 'Sign in to Linear again', 'done')]);
    closeSignInRows(s, 'Linear');
    expect(s.closed).toEqual([]);
  });

  it('is told once for a sign-in that worked, and not for one that failed', async () => {
    const back = [];
    const c = make({ onSignedIn: (e) => back.push(e.id), vaultFile: path.join(dir, 'b.enc') });
    fx.switches.errors = false;
    await c.connect(ID);
    expect(back).toEqual([ID]);
    fx.switches.revoked = true;
    await c.connect(ID);
    expect(back).toEqual([ID]);
    await c.stop();
  });
});

describe('the stand-in remembers its sign-ins', () => {
  it('a restart with a state file does not read as a lost sign-in', async () => {
    const state = path.join(dir, 'tools-state.json');
    const a = await startToolsFixture({ stateFile: state });
    const c = make({ catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: a.mcpUrl }, packaged: false }), vaultFile: path.join(dir, 'r.enc') });
    await c.connect(ID);
    const { port } = a;
    await a.stop();
    const b = await startToolsFixture({ port, stateFile: state });
    try {
      // The first call may land on a socket that closed with the old server.
      expect((await c.check(ID)).state).not.toBe(STATES.NOT_SIGNED_IN);
      expect((await c.check(ID)).state).toBe(STATES.WORKS);
    } finally { await c.stop(); await b.stop(); }
  });
});
