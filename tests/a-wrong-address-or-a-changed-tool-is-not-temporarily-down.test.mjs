// A WRONG ADDRESS OR A CHANGED TOOL IS NOT "TEMPORARILY DOWN".
//
// What broke (2026-10-31): the tracker was given its address without
// `/mcp`. Sign-in still worked, because sign-in reads the server's root, but
// every check POSTed to a page that answered 404, and the app called that
// "Temporarily down. Check again in a while" for three hours. Waiting could
// never fix it. Measured here against the fixture: the address without `/mcp`
// (the exact slip) and a server that answers a web page instead of
// MCP each read as their own state, while a 500 and a server that is not
// there still read as down.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createConnections } from '../main/connections/index.mjs';
import { stateOfError } from '../main/connections/talk.mjs';
import { catalogFor, stateWords, STATES } from '../shared/connections-catalog.mjs';

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

let fx; let dir;
const made = [];
const service = (address) => {
  const c = createConnections({ vaultFile: path.join(dir, `${made.length}.enc`), cipher, catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: address }, packaged: false }), openExternal: browser });
  made.push(c);
  return c;
};
beforeEach(async () => { fx = await startToolsFixture(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-wrong-')); });
afterEach(async () => { for (const c of made.splice(0)) await c.stop(); await fx.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('an address that is not an MCP server', () => {
  it('the address without /mcp: signs in, then says it could not reach its tools, not down', async () => {
    const conn = service(fx.url);
    const out = await conn.connect('test-tracker');
    expect(out.ok).toBe(true);
    expect(out.tile.state).toBe(STATES.UNREACHABLE);
    expect(out.tile.word).toBe('Could not reach its tools');
    expect(out.tile.todo).toMatch(/waiting will not fix/i);
    expect(out.tile.todo).toMatch(/disconnect/i);
  });

  it('a server that answers a web page where MCP should be is the same state', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    fx.switches.notMcp = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.UNREACHABLE);
  });

  it('a tool list without the read the check needs is a changed tool, not an empty account', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    fx.switches.noListIssues = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.UNREACHABLE);
  });

  it('is not handed to a run, since a run cannot get past it either', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    expect(conn.workingNow().map((e) => e.id)).toEqual(['test-tracker']);
    fx.switches.notMcp = true;
    await conn.check('test-tracker');
    expect(conn.workingNow()).toEqual([]);
    expect(conn.workingNow({ includeLapsed: true }).map((e) => e.id)).toEqual(['test-tracker']);
  });

  it('is put right by a check that works', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    fx.switches.notMcp = true;
    await conn.check('test-tracker');
    fx.switches.notMcp = false;
    expect((await conn.check('test-tracker')).state).toBe(STATES.WORKS);
  });
});

describe('what is still down', () => {
  it('a 500, and a server that hangs up, each', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
    fx.switches.errors = false;
    fx.switches.down = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
  });

  it('nothing listening at all', async () => {
    const conn = service(fx.mcpUrl);
    await conn.connect('test-tracker');
    await fx.stop();
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
    fx = await startToolsFixture();
  });

  it('errors sorted by what they say, and anything unknown stays down', () => {
    expect(stateOfError(Object.assign(new Error('Error POSTing to endpoint: not found'), { code: 404 }))).toBe(STATES.UNREACHABLE);
    expect(stateOfError(Object.assign(new Error('Unexpected content type: text/html'), { code: -1 }))).toBe(STATES.UNREACHABLE);
    expect(stateOfError(Object.assign(new Error('x'), { code: 502 }))).toBe(STATES.DOWN);
    expect(stateOfError(new TypeError('fetch failed'))).toBe(STATES.DOWN);
    expect(stateOfError(new Error('the tool did not answer in time'))).toBe(STATES.DOWN);
    expect(stateOfError({ status: 401 })).toBe(STATES.NOT_SIGNED_IN);
  });
});

describe('the words', () => {
  it('say what to do, and that waiting is not it', () => {
    const w = stateWords(STATES.UNREACHABLE);
    expect(w.word).toBe('Could not reach its tools');
    expect(w.todo).not.toMatch(/again in a while/i);
  });
});
