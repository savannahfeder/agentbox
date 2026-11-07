// A CONNECTION SIGNS IN, KEEPS ITS TOKEN SEALED, AND SAYS WHAT A CHECK FOUND.
//
// What was missing (2026-10-31): nothing in the app could sign in to a tool's
// MCP server, and agents reaching a tool on their own had no way to tell "not
// signed in" from "down". Measured here against the fixture on a real socket:
// each state word comes from a real answer, the token on disk is unreadable, and
// a run of bad checks leaves the sign-in where it was.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { connectionVault } from '../main/connections/vault.mjs';
import { createConnections } from '../main/connections/index.mjs';
import { catalogFor, LINEAR, stateWords, STATES } from '../shared/connections-catalog.mjs';

let fx; let dir; let conn; let opened;
const key = crypto.randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const out = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); },
  decrypt: (b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};

// The person's browser, pressing Allow on the screen it was sent to.
const browser = async (url) => {
  opened = url;
  const allowed = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  await fetch(allowed.headers.get('location'), { signal: AbortSignal.timeout(5000) });
};

beforeEach(async () => {
  fx = await startToolsFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-'));
  conn = createConnections({
    vaultFile: path.join(dir, 'connections.enc'), cipher,
    catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }),
    openExternal: browser,
  });
});
afterEach(async () => { await conn.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

const tile = async (id = 'test-tracker') => (await conn.list()).tiles.find((t) => t.id === id);
const tokensNow = async () => (await connectionVault({ file: path.join(dir, 'connections.enc'), cipher }).read()).connections?.['test-tracker']?.tokens ?? null;

describe('the catalog', () => {
  it('has Linear on its real address, with an explicit read list and write list', () => {
    expect(LINEAR.address).toBe('https://mcp.linear.app/mcp');
    expect(LINEAR.auth).toBe('oauth');
    expect(LINEAR.redirect).toBe('loopback');
    expect(LINEAR.registration).toBe('dynamic');
    expect(LINEAR.reads).toContain('list_issues');
    expect(LINEAR.writes).toContain('create_issue');
    expect(LINEAR.reads.filter((n) => LINEAR.writes.includes(n))).toEqual([]);
    expect(LINEAR.check.tool).toBe('list_issues');
    expect(LINEAR.reads).toContain(LINEAR.check.tool);
  });

  it('shows the Test tracker only under the flag, on loopback, and never in an installed build', () => {
    const ids = (c) => c.map((e) => e.id);
    expect(ids(catalogFor({ env: {}, packaged: false }))).not.toContain('test-tracker');
    expect(ids(catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: 'http://127.0.0.1:9/mcp' }, packaged: false }))).toContain('test-tracker');
    expect(ids(catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: 'http://127.0.0.1:9/mcp' }, packaged: true }))).not.toContain('test-tracker');
    expect(ids(catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: 'https://evil.example/mcp' }, packaged: false }))).not.toContain('test-tracker');
    expect(ids(catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: 'http://127.0.0.1.evil.example/mcp' }, packaged: false }))).not.toContain('test-tracker');
  });
});

describe('the vault', () => {
  it('holds nothing readable on disk', async () => {
    const v = connectionVault({ file: path.join(dir, 'v'), cipher });
    await v.update((d) => { d.tokens = { x: 'sekret-token' }; });
    expect(fs.readFileSync(path.join(dir, 'v')).toString('latin1')).not.toContain('sekret-token');
    expect((await v.read()).tokens.x).toBe('sekret-token');
    expect(fs.statSync(path.join(dir, 'v')).mode & 0o777).toBe(0o600);
  });

  it('refuses when encryption is unavailable, and writes no plain file', async () => {
    const v = connectionVault({ file: path.join(dir, 'v'), cipher: { available: () => false } });
    await expect(v.update((d) => { d.tokens = { x: 'sekret-token' }; })).rejects.toThrow(/encrypt/i);
    expect(fs.existsSync(path.join(dir, 'v'))).toBe(false);
  });

  it('refuses a missing cipher the same way', async () => {
    const v = connectionVault({ file: path.join(dir, 'v'), cipher: null });
    await expect(v.update(() => {})).rejects.toThrow(/encrypt/i);
  });

  // The app's own cipher has no `available`: on a Mac, asking whether it can
  // seal puts a keychain password prompt up, so opening the Connections page
  // must not ask, and pressing Connect must, before any browser opens.
  it('with the app\'s own cipher, asks the keychain only to keep or read a sign-in', async () => {
    let asked = 0;
    let works = false;
    const keychain = {
      encrypt: (text) => { asked += 1; return works ? cipher.encrypt(text) : null; },
      decrypt: (buf) => { asked += 1; return works ? cipher.decrypt(buf) : null; },
    };
    const c = createConnections({ vaultFile: path.join(dir, 'mac.enc'), cipher: keychain, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser });
    expect((await c.list()).canEncrypt).toBe(true);
    expect(c.workingNow()).toEqual([]);
    expect(asked).toBe(0);

    opened = null;
    const refused = await c.connect('test-tracker');
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/encrypt/i) });
    expect(opened).toBeNull();
    expect(asked).toBe(1);
    expect(fs.existsSync(path.join(dir, 'mac.enc'))).toBe(false);

    works = true;
    expect((await c.connect('test-tracker')).ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'mac.enc')).toString('latin1')).not.toContain('access_token');
    works = false;
    expect(c.workingNow()).toEqual([]);
  });

  it('keeps two writes at once from losing one', async () => {
    const v = connectionVault({ file: path.join(dir, 'v'), cipher });
    await Promise.all(['a', 'b', 'c'].map((k) => v.update((d) => { d[k] = 1; })));
    expect(Object.keys(await v.read()).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('signing in', () => {
  it('starts as Not connected, then connects through the screen in the browser and checks', async () => {
    expect((await tile()).state).toBe(STATES.NOT_CONNECTED);
    const out = await conn.connect('test-tracker');
    expect(out.ok).toBe(true);
    expect(opened).toContain('/authorize');
    expect(opened).toContain('code_challenge=');
    expect(opened).toMatch(/redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A\d+/);
    const t = await tile();
    expect(t.state).toBe(STATES.WORKS);
    expect(t.toolCount).toBe(6);
    expect(t.read).toContain('Group bookings');
  });

  it('says so and stores nothing when encryption is unavailable, before any browser opens', async () => {
    const c = createConnections({ vaultFile: path.join(dir, 'none.enc'), cipher: { available: () => false }, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser });
    opened = null;
    const out = await c.connect('test-tracker');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/encrypt/i);
    expect(opened).toBeNull();
    expect(fs.existsSync(path.join(dir, 'none.enc'))).toBe(false);
    expect((await c.list()).canEncrypt).toBe(false);
  });

  it('gives up on a browser nobody finishes, with a plain word', async () => {
    const c = createConnections({ vaultFile: path.join(dir, 'slow.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: async () => {}, signInMs: 150 });
    const out = await c.connect('test-tracker');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/did not finish/i);
    await c.stop();
  });

  it('refuses a callback whose state is not the one it sent', async () => {
    const c = createConnections({
      vaultFile: path.join(dir, 'forged.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), signInMs: 400,
      openExternal: async (url) => {
        const back = new URL(url).searchParams.get('redirect_uri');
        await fetch(`${back}?code=forged&state=wrong`, { signal: AbortSignal.timeout(2000) }).catch(() => {});
      },
    });
    const out = await c.connect('test-tracker');
    expect(out.ok).toBe(false);
    expect((await c.list()).tiles.find((t) => t.id === 'test-tracker').state).toBe(STATES.NOT_CONNECTED);
    await c.stop();
  });

  it('disconnect forgets the token, and the tile is Not connected again', async () => {
    await conn.connect('test-tracker');
    await conn.disconnect('test-tracker');
    expect((await tile()).state).toBe(STATES.NOT_CONNECTED);
    expect(await tokensNow()).toBeNull();
  });
});

describe('a check', () => {
  beforeEach(async () => { await conn.connect('test-tracker'); });

  it('Works on a real read, with the tool count and one line', async () => {
    const t = await conn.check('test-tracker');
    expect(t.state).toBe(STATES.WORKS);
    expect(t.read).toMatch(/^LUM-41 Group bookings/);
    expect(t.read.split('\n')).toHaveLength(1);
    expect(t.at).toBeGreaterThan(0);
  });

  it('expired: refreshes in place, and rotation is kept', async () => {
    const before = await tokensNow();
    fx.switches.expired = true;
    const t = await conn.check('test-tracker');
    expect(t.state).toBe(STATES.WORKS);
    const after = await tokensNow();
    expect(after.refresh_token).not.toBe(before.refresh_token);
    fx.switches.expired = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.WORKS);
  });

  it('revoked: Not signed in, with what to do', async () => {
    fx.switches.revoked = true;
    const t = await conn.check('test-tracker');
    expect(t.state).toBe(STATES.NOT_SIGNED_IN);
    expect(t.todo).toMatch(/sign in/i);
  });

  it('forbidden: Not allowed, with what to do', async () => {
    fx.switches.forbidden = true;
    const t = await conn.check('test-tracker');
    expect(t.state).toBe(STATES.NOT_ALLOWED);
    expect(t.todo).toMatch(/access/i);
  });

  it('empty: Nothing to read, which is not a failure of the sign-in', async () => {
    fx.switches.empty = true;
    const t = await conn.check('test-tracker');
    expect(t.state).toBe(STATES.NOTHING_TO_READ);
    expect(t.todo).toBeTruthy();
  });

  it('500s, down, and too slow: Temporarily down, each', async () => {
    fx.switches.errors = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
    fx.switches.errors = false;
    fx.switches.down = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
    fx.switches.down = false;
    const c = createConnections({ vaultFile: path.join(dir, 'connections.enc'), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }), openExternal: browser, checkMs: 120 });
    fx.switches.slowMs = 2000;
    const began = Date.now();
    expect((await c.check('test-tracker')).state).toBe(STATES.DOWN);
    expect(Date.now() - began).toBeLessThan(1500);
    fx.switches.slowMs = 0;
  });

  it('a failed check keeps the sign-in, the last read and the connection, and a later check recovers', async () => {
    const good = await conn.check('test-tracker');
    fx.switches.errors = true;
    const bad = await conn.check('test-tracker');
    expect(bad.connected).toBe(true);
    expect(bad.workedAt).toBe(good.at);
    expect(await tokensNow()).not.toBeNull();
    fx.switches.errors = false;
    expect((await conn.check('test-tracker')).state).toBe(STATES.WORKS);
  });

  it('a check over a day old runs when the page asks, and a fresh one does not', async () => {
    let calls = 0;
    const real = conn.check;
    conn.check = async (id) => { calls += 1; return real(id); };
    await conn.checkStale({ now: Date.now() + 60_000 });
    expect(calls).toBe(0);
    await conn.checkStale({ now: Date.now() + 25 * 3600_000 });
    expect(calls).toBe(1);
  });

  it('flags a changed tool list, and clears it when the person has seen it', async () => {
    fx.switches.changed = true;
    const t = await conn.check('test-tracker');
    expect(t.changed).toEqual(['list_everything']);
    expect(t.state).toBe(STATES.WORKS);
    await conn.acceptTools('test-tracker');
    expect((await tile()).changed).toEqual([]);
  });

  it('two checks at once refresh once', async () => {
    fx.switches.expired = true;
    const [a, b] = await Promise.all([conn.check('test-tracker'), conn.check('test-tracker')]);
    expect(a.state).toBe(STATES.WORKS);
    expect(b.state).toBe(STATES.WORKS);
    expect(fx.switches.revoked).toBe(false);
  });
});

describe('the words', () => {
  it('every state has a word and every failing one says what to do', () => {
    for (const s of Object.values(STATES)) expect(stateWords(s).word).toBeTruthy();
    for (const s of [STATES.NOT_SIGNED_IN, STATES.NOT_ALLOWED, STATES.NOTHING_TO_READ, STATES.DOWN]) expect(stateWords(s).todo).toBeTruthy();
    expect(stateWords(STATES.WORKS).todo).toBeFalsy();
  });
});
