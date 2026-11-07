// A TOOL CONNECTS, IS CHECKED, SERVES AN AGENT, EXPIRES AND COMES BACK, WITH NO ACCOUNT.
//
// What was missing (2026-10-31): nothing proved a connection end to end beyond one
// made-up tracker, and "certainty it works" was the owner's ask. Measured here on
// real sockets against Notion, Linear, Slack and HubSpot stand-ins, through the
// same catalogue entry, check and broker the real tool uses, including the two
// sign-ins vendors really differ on. Also the paths that must not happen: a client
// without its secret, a key that is wrong, "Works" before a read, a token on disk.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { standInClient, STANDIN_KINDS, startStandin } from '../scripts/standin-tools.mjs';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createBroker } from '../main/connections/broker.mjs';
import { createConnections } from '../main/connections/index.mjs';
import { catalogFor, STATES } from '../shared/connections-catalog.mjs';

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
const OWN_PORT = 33800 + Math.floor(Math.random() * 1000);
const OWN = `http://localhost:${OWN_PORT}/callback`;

let dir; let running; let conn; let broker;
const servers = () => Object.fromEntries(Object.entries(running).map(([k, s]) => [k, s.mcpUrl]));
const open = (more = {}) => createConnections({
  vaultFile: path.join(dir, 'connections.enc'), cipher,
  catalog: catalogFor({ env: { AGENTBOX_TOOLS_STANDINS: JSON.stringify(servers()) }, packaged: false }),
  openExternal: browser, ownClientPort: OWN_PORT, checkMs: 1500, callMs: 1500, allowLoopback: true, ...more,
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
  running = Object.fromEntries(await Promise.all(STANDIN_KINDS.map(async (k) => [k, await startStandin(k, { redirects: [OWN] })])));
  conn = open();
  broker = createBroker({ connections: conn, storeRoot: dir, socketPath: path.join(dir, 'b.sock'), proxyFile: '/nowhere' });
});
afterEach(async () => {
  await conn.stop();
  await Promise.all(Object.values(running).map((s) => s.stop()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const credsFor = (kind) => { const c = standInClient(kind); return c ? { clientId: c.clientId, clientSecret: c.clientSecret } : {}; };
const tile = async (id) => (await conn.list()).tiles.find((t) => t.id === id);
const asAgent = (id, name, args = {}) => {
  const run = broker.openRun({ runId: `r-${Math.random()}`, item: { id: 'i', product: 'p' } });
  const req = { run: Object.keys(run.servers).length ? run.servers[`connection-${id}`]?.env.AGENTBOX_CONNECTION_RUN : 'none', connection: id, method: 'tools/call', params: { name, arguments: args } };
  return broker._answer(req, new AbortController().signal).then((o) => { run.close(); return o.result; });
};
const textOf = (r) => r.content.map((c) => c.text).join('\n');

const READS = {
  notion: ['notion-search', { query: 'launch' }, /Launch plan for group bookings/],
  linear: ['get_issue', { id: 'LUM-41' }, /block of six/],
  slack: ['slack_read_channel', { channel_id: 'C07LAUNCH' }, /waitlist a date/],
  hubspot: ['search_crm_objects', { objectType: 'deals' }, /Northside Clinic/],
};
const DENIED = { notion: 'notion-delete-pages', linear: 'delete_issue', slack: 'slack_delete_channel', hubspot: 'export_everything' };

describe.each(STANDIN_KINDS)('%s, the whole way', (kind) => {
  const [readTool, readArgs, readFinds] = READS[kind];

  it('connects, is checked by a real read, and an agent reads through the app', async () => {
    expect((await tile(kind)).state).toBe(STATES.NOT_CONNECTED);
    const out = await conn.connect(kind, credsFor(kind));
    expect(out).toMatchObject({ ok: true, tile: { state: STATES.WORKS } });
    expect(out.tile.read).toBeTruthy();
    expect(running[kind].calls.length).toBeGreaterThan(0);
    const r = await asAgent(kind, readTool, readArgs);
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toMatch(readFinds);
  });

  it('a tool on neither list never reaches it', async () => {
    await conn.connect(kind, credsFor(kind));
    const before = running[kind].calls.length;
    const r = await asAgent(kind, DENIED[kind]);
    expect(r.isError).toBe(true);
    expect(running[kind].calls.length).toBe(before);
  });

  it('an expired token is refreshed without anybody noticing', async () => {
    await conn.connect(kind, credsFor(kind));
    running[kind].switches.expired = true;
    const r = await asAgent(kind, readTool, readArgs);
    expect(r.isError).toBeFalsy();
    expect((await tile(kind)).state).toBe(STATES.WORKS);
  });

  it('a sign-in that is gone says so to the person and the agent, and comes back on signing in again', async () => {
    await conn.connect(kind, credsFor(kind));
    running[kind].switches.revoked = true;
    const told = await asAgent(kind, readTool, readArgs);
    expect(told.isError).toBe(true);
    expect(textOf(told)).toMatch(/sign in again/i);
    expect((await tile(kind)).state).toBe(STATES.NOT_SIGNED_IN);
    expect(conn.workingNow().map((e) => e.id)).not.toContain(kind);

    running[kind].switches.revoked = false;
    // A client made in the vendor's console is kept: signing in again asks nothing new.
    const back = await conn.connect(kind);
    expect(back).toMatchObject({ ok: true, tile: { state: STATES.WORKS } });
    expect(conn.workingNow().map((e) => e.id)).toContain(kind);
    expect(textOf(await asAgent(kind, readTool, readArgs))).toMatch(readFinds);
  });

  it('an outage is Temporarily down, keeps the sign-in, and a check after it says Works', async () => {
    await conn.connect(kind, credsFor(kind));
    running[kind].switches.down = true;
    expect((await conn.check(kind)).state).toBe(STATES.DOWN);
    expect((await asAgent(kind, readTool, readArgs)).isError).toBe(true);
    running[kind].switches.down = false;
    expect((await conn.check(kind)).state).toBe(STATES.WORKS);
  });

  it('nothing to read is not Works', async () => {
    running[kind].switches.empty = true;
    const { tile: t } = await conn.connect(kind, credsFor(kind));
    if (kind === 'notion' || kind === 'linear') expect(t.state).toBe(STATES.NOTHING_TO_READ);
    // Slack and HubSpot prove a read on who is signed in, which is never empty.
    else expect(t.state).toBe(STATES.WORKS);
    if (t.state !== STATES.WORKS) expect(conn.workingNow().map((e) => e.id)).not.toContain(kind);
  });

  it('no token or secret reaches a file in the clear, the tile, or a log', async () => {
    const logged = [];
    const spies = ['log', 'warn', 'error', 'info'].map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logged.push(a.join(' ')); }));
    try {
      const out = await conn.connect(kind, credsFor(kind));
      await asAgent(kind, readTool, readArgs);
      running[kind].switches.expired = true;
      await asAgent(kind, readTool, readArgs);
      const secrets = [...running[kind].tokensEverIssued, ...(standInClient(kind) ? [standInClient(kind).clientSecret] : [])];
      expect(secrets.length).toBeGreaterThan(0);
      const onDisk = fs.readdirSync(dir).filter((f) => !f.endsWith('.sock')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      const seen = `${onDisk}\n${JSON.stringify(out)}\n${JSON.stringify(await conn.list())}\n${logged.join('\n')}`;
      for (const s of secrets) expect(seen).not.toContain(s);
    } finally { for (const s of spies) s.mockRestore(); }
  });
});

describe('a tool that takes only a client made in its console', () => {
  it('asks for it, and connects nothing without it', async () => {
    const out = await conn.connect('slack');
    expect(out.ok).toBe(false);
    expect(out.needsClient).toBe(true);
    expect((await tile('slack')).connected).toBe(false);
  });

  it('a wrong secret connects nothing and says so', async () => {
    const out = await conn.connect('hubspot', { clientId: standInClient('hubspot').clientId, clientSecret: 'wrong' });
    expect(out.ok).toBe(false);
    expect((await tile('hubspot')).connected).toBe(false);
  });

  it('a port already taken says so rather than hanging', async () => {
    const net = await import('node:net');
    const holder = net.createServer();
    await new Promise((r) => holder.listen(OWN_PORT, '127.0.0.1', r));
    try {
      const out = await conn.connect('slack', credsFor('slack'));
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/another sign-in|in use/i);
    } finally { await new Promise((r) => holder.close(r)); }
  });
});

describe('a tool that says Figma has to approve us', () => {
  it('will not even try', async () => {
    const calls = [];
    const c = open({ openExternal: async (u) => calls.push(u) });
    const out = await c.connect('figma');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Figma/);
    expect(calls).toEqual([]);
    await c.stop();
  });
});

describe('a tool that takes a key', () => {
  let fx; let c;
  beforeEach(async () => {
    fx = await startToolsFixture({ play: { name: 'Key tool', keys: ['pasted-key-value'], tools: [{ name: 'get_me', description: 'Who', inputSchema: { type: 'object', properties: {} } }], call: (_n, _a, { text }) => text({ login: 'lumen-dev' }) } });
    c = createConnections({
      vaultFile: path.join(dir, 'k.enc'), cipher, openExternal: browser, checkMs: 1500, callMs: 1500,
      catalog: [{ ...catalogFor({ env: {}, packaged: false }).find((e) => e.id === 'github'), address: fx.mcpUrl }],
    });
  });
  afterEach(async () => { await c.stop(); await fx.stop(); });

  it('a good key connects after a real read, and is kept sealed', async () => {
    const out = await c.connect('github', { key: 'pasted-key-value' });
    expect(out).toMatchObject({ ok: true, tile: { state: STATES.WORKS } });
    expect(fs.readFileSync(path.join(dir, 'k.enc')).includes('pasted-key-value')).toBe(false);
  });

  it('a wrong key says Not signed in and is never Works', async () => {
    const out = await c.connect('github', { key: 'nope' });
    expect(out.tile.state).toBe(STATES.NOT_SIGNED_IN);
    expect(c.workingNow()).toEqual([]);
  });

  it('no key is asked for, not sent', async () => {
    expect(await c.connect('github')).toMatchObject({ ok: false, needsKey: true });
    expect(fx.calls).toEqual([]);
  });
});

describe('any tool, by its address', () => {
  let fx;
  const free = { name: 'Acme', tools: [
    { name: 'list_things', description: 'List things.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_thing', description: 'Read a thing.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'burn_things', description: 'Delete everything.', inputSchema: { type: 'object', properties: {} } },
  ], call: (n, _a, { text }) => (n === 'list_things' ? text({ things: [{ id: 'a', title: 'First thing' }] }) : n === 'get_thing' ? text({ id: 'a' }) : text('burned')) };
  beforeEach(async () => { fx = await startToolsFixture({ play: free }); });
  afterEach(async () => { await fx.stop(); });

  it('refuses plain http off this machine and anything that is not an address', async () => {
    for (const bad of ['http://example.com/mcp', 'file:///etc/passwd', 'not an address', '']) {
      const out = await conn.addByAddress({ address: bad });
      expect(out.ok, bad).toBe(false);
    }
    expect((await conn.list()).tiles.some((t) => t.custom)).toBe(false);
  });

  it('points at the tile when the address is one we already list', async () => {
    const out = await conn.addByAddress({ address: `${running.linear.mcpUrl}` });
    expect(out).toMatchObject({ ok: false, existing: 'linear' });
  });

  it('never says Works until the person ticked a read and that read came back', async () => {
    const out = await conn.addByAddress({ address: fx.mcpUrl });
    expect(out.ok).toBe(true);
    const id = out.tile.id;
    expect(out.tile).toMatchObject({ state: STATES.CHOOSE_READS, custom: true, name: 'Acme' });
    expect(out.tile.offered.map((t) => t.name)).toEqual(['list_things', 'get_thing', 'burn_things']);
    expect(conn.workingNow().map((e) => e.id)).not.toContain(id);
    expect(fx.calls).toEqual([]);

    const none = await conn.chooseReads(id, ['get_thing']);
    expect(none.state).toBe(STATES.CHOOSE_READS);
    expect(fx.calls).toEqual([]);

    const chosen = await conn.chooseReads(id, ['list_things', 'get_thing', 'made_up']);
    expect(chosen.state).toBe(STATES.WORKS);
    expect(chosen.reads).toEqual(['list_things', 'get_thing']);
    expect(conn.workingNow().map((e) => e.id)).toContain(id);
  });

  it('an unticked tool never reaches it, whatever it is called', async () => {
    const { tile: t } = await conn.addByAddress({ address: fx.mcpUrl });
    await conn.chooseReads(t.id, ['list_things']);
    const before = fx.calls.length;
    const r = await asAgent(t.id, 'burn_things');
    expect(r.isError).toBe(true);
    expect(fx.calls.length).toBe(before);
    expect(textOf(await asAgent(t.id, 'list_things'))).toMatch(/First thing/);
  });

  it('survives the app starting again, and goes when disconnected', async () => {
    const { tile: t } = await conn.addByAddress({ address: fx.mcpUrl });
    await conn.chooseReads(t.id, ['list_things']);
    const again = open();
    expect((await again.list()).tiles.find((x) => x.id === t.id)).toMatchObject({ state: STATES.WORKS, name: 'Acme' });
    await again.disconnect(t.id);
    expect((await again.list()).tiles.find((x) => x.id === t.id)).toBeUndefined();
    await again.stop();
  });

  it('a tool with no self-registration asks for a key instead of failing dumbly', async () => {
    const noReg = await startToolsFixture({ play: { ...free, name: 'Closed', registered: { clientId: 'x', clientSecret: 'y', redirects: [] }, keys: ['k-1'] } });
    try {
      const asked = await conn.addByAddress({ address: noReg.mcpUrl });
      expect(asked).toMatchObject({ ok: false, needsKey: true });
      expect((await conn.list()).tiles.some((x) => x.custom)).toBe(false);
      const given = await conn.addByAddress({ address: noReg.mcpUrl, key: 'k-1' });
      expect(given.ok).toBe(true);
      expect(given.tile.state).toBe(STATES.CHOOSE_READS);
    } finally { await noReg.stop(); }
  });
});

describe('a tool in the catalogue with no written list', () => {
  it('stays Choose until a person ticks, and offers nothing to an agent before that', async () => {
    const fx = await startToolsFixture({ play: { name: 'Sentry', tools: [{ name: 'whoami', description: 'Who', inputSchema: { type: 'object', properties: {} } }], call: (_n, _a, { text }) => text({ name: 'x' }) } });
    const c = createConnections({
      vaultFile: path.join(dir, 's.enc'), cipher, openExternal: browser, checkMs: 1500, callMs: 1500,
      catalog: [{ ...catalogFor({ env: {}, packaged: false }).find((e) => e.id === 'sentry'), address: fx.mcpUrl }],
    });
    try {
      const out = await c.connect('sentry');
      expect(out.tile.state).toBe(STATES.CHOOSE_READS);
      expect(c.workingNow()).toEqual([]);
      expect(fx.calls).toEqual([]);
      expect((await c.chooseReads('sentry', ['whoami'])).state).toBe(STATES.WORKS);
    } finally { await c.stop(); await fx.stop(); }
  });
});
