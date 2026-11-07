// THE TEST TRACKER SIGNS IN, ANSWERS, AND BREAKS ON A SWITCH.
//
// What was missing (2026-10-31): connections could only be proved on a real
// vendor account, which needs a person, and a real vendor cannot be made to
// expire, go down or revoke on demand. Measured by this file: every switch
// changes what an MCP client gets back, on a real socket, with no vendor name
// anywhere.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { startToolsFixture, READ_TOOLS, WRITE_TOOLS, FIXTURE_NAME } from '../cloud/standin/tools-mcp.mjs';

let fx;
beforeEach(async () => { fx = await startToolsFixture(); });
afterEach(async () => { await fx.stop(); });

const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString(), signal: AbortSignal.timeout(5000) });
const json = (o, token) => ({ method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(o), signal: AbortSignal.timeout(5000) });
const rpc = (method, params, token) => fetch(fx.mcpUrl, json({ jsonrpc: '2.0', id: 1, method, params }, token));

async function signIn() {
  const reg = await (await fetch(`${fx.url}/register`, json({ redirect_uris: ['http://127.0.0.1:9/cb'], client_name: 't' }))).json();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:9/cb', code_challenge: challenge, code_challenge_method: 'S256', state: 's1' });
  const screen = await fetch(`${fx.url}/authorize?${q}`, { signal: AbortSignal.timeout(5000) });
  expect(await screen.text()).toContain(FIXTURE_NAME);
  const allowed = await fetch(`${fx.url}/authorize?${q}`, { ...form({ allow: '1' }), redirect: 'manual' });
  const back = new URL(allowed.headers.get('location'));
  expect(back.searchParams.get('state')).toBe('s1');
  const res = await fetch(`${fx.url}/token`, form({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: verifier, client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:9/cb' }));
  return { ...(await res.json()), clientId: reg.client_id };
}

describe('signing in', () => {
  it('names where to sign in, on the address and on the 401', async () => {
    const meta = await (await fetch(`${fx.url}/.well-known/oauth-protected-resource`, { signal: AbortSignal.timeout(5000) })).json();
    expect(meta.authorization_servers).toEqual([fx.url]);
    const as = await (await fetch(`${fx.url}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5000) })).json();
    expect(as.registration_endpoint).toBe(`${fx.url}/register`);
    expect(as.code_challenge_methods_supported).toContain('S256');
    const refused = await rpc('tools/list', {});
    expect(refused.status).toBe(401);
    expect(refused.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('refuses a code with the wrong verifier, and takes it once with the right one', async () => {
    const reg = await (await fetch(`${fx.url}/register`, json({ redirect_uris: ['http://127.0.0.1:9/cb'] }))).json();
    const verifier = 'v'.repeat(50);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:9/cb', code_challenge: challenge, code_challenge_method: 'S256', state: 'x' });
    const aCode = async () => new URL((await fetch(`${fx.url}/authorize?${q}`, { ...form({ allow: '1' }), redirect: 'manual' })).headers.get('location')).searchParams.get('code');
    const base = { grant_type: 'authorization_code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:9/cb' };
    expect((await fetch(`${fx.url}/token`, form({ ...base, code: await aCode(), code_verifier: 'w'.repeat(50) }))).status).toBe(400);
    const body = { ...base, code: await aCode() };
    expect((await fetch(`${fx.url}/token`, form({ ...body, code_verifier: verifier }))).status).toBe(200);
    expect((await fetch(`${fx.url}/token`, form({ ...body, code_verifier: verifier }))).status).toBe(400);
  });

  it('does not issue a code for a redirect the client did not register', async () => {
    const reg = await (await fetch(`${fx.url}/register`, json({ redirect_uris: ['http://127.0.0.1:9/cb'] }))).json();
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:9/other', code_challenge: 'c', code_challenge_method: 'S256' });
    expect((await fetch(`${fx.url}/authorize?${q}`, { ...form({ allow: '1' }), redirect: 'manual' })).status).toBe(400);
  });
});

describe('answering', () => {
  it('lists its reads, its write and a tool no list names', async () => {
    const { access_token: t } = await signIn();
    const list = (await (await rpc('tools/list', {}, t)).json()).result.tools.map((x) => x.name);
    for (const n of [...READ_TOOLS, ...WRITE_TOOLS]) expect(list).toContain(n);
    expect(list).toContain('export_workspace');
  });

  it('reads Lumen\'s issues and pages, and a write is counted', async () => {
    const { access_token: t } = await signIn();
    const out = (await (await rpc('tools/call', { name: 'list_issues', arguments: {} }, t)).json()).result;
    expect(out.content[0].text).toContain('Group bookings');
    const pages = (await (await rpc('tools/call', { name: 'search_pages', arguments: { query: 'onboarding' } }, t)).json()).result;
    expect(pages.content[0].text).toMatch(/onboarding/i);
    expect(fx.writes).toEqual([]);
    await rpc('tools/call', { name: 'create_issue', arguments: { title: 'New' } }, t);
    expect(fx.writes.map((w) => w.title)).toEqual(['New']);
  });

  it('rotates the refresh token, and an old one no longer works', async () => {
    const first = await signIn();
    const res = await fetch(`${fx.url}/token`, form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }));
    const next = await res.json();
    expect(next.refresh_token).not.toBe(first.refresh_token);
    expect((await fetch(`${fx.url}/token`, form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }))).status).toBe(400);
    expect((await rpc('tools/list', {}, next.access_token)).status).toBe(200);
  });
});

describe('the switches', () => {
  it('expired: the access token is refused, the refresh token still works', async () => {
    const first = await signIn();
    fx.switches.expired = true;
    expect((await rpc('tools/list', {}, first.access_token)).status).toBe(401);
    const next = await (await fetch(`${fx.url}/token`, form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }))).json();
    expect((await rpc('tools/list', {}, next.access_token)).status).toBe(200);
  });

  it('revoked: both tokens are refused', async () => {
    const first = await signIn();
    fx.switches.revoked = true;
    expect((await rpc('tools/list', {}, first.access_token)).status).toBe(401);
    expect((await fetch(`${fx.url}/token`, form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }))).status).toBe(400);
  });

  it('errors, forbidden and down each answer their own way, and off is back to normal', async () => {
    const { access_token: t } = await signIn();
    fx.switches.errors = true;
    expect((await rpc('tools/list', {}, t)).status).toBe(500);
    fx.switches.errors = false;
    fx.switches.forbidden = true;
    expect((await rpc('tools/list', {}, t)).status).toBe(403);
    fx.switches.forbidden = false;
    fx.switches.down = true;
    await expect(rpc('tools/list', {}, t)).rejects.toThrow();
    fx.switches.down = false;
    expect((await rpc('tools/list', {}, t)).status).toBe(200);
  });

  it('slow holds an answer that long, empty has nothing to read, changed alters the list', async () => {
    const { access_token: t } = await signIn();
    fx.switches.slowMs = 150;
    const began = Date.now();
    await rpc('tools/list', {}, t);
    expect(Date.now() - began).toBeGreaterThanOrEqual(140);
    fx.switches.slowMs = 0;
    fx.switches.empty = true;
    const out = (await (await rpc('tools/call', { name: 'list_issues', arguments: {} }, t)).json()).result;
    expect(JSON.parse(out.content[0].text)).toEqual([]);
    fx.switches.empty = false;
    const before = (await (await rpc('tools/list', {}, t)).json()).result.tools.map((x) => x.name);
    fx.switches.changed = true;
    const after = (await (await rpc('tools/list', {}, t)).json()).result.tools.map((x) => x.name);
    expect(after).toContain('list_everything');
    expect(before).not.toContain('list_everything');
  });

  it('can be flipped from outside, by the door a person uses from a terminal', async () => {
    const { access_token: t } = await signIn();
    await fetch(`${fx.url}/__switches`, json({ errors: true }));
    expect((await rpc('tools/list', {}, t)).status).toBe(500);
    await fetch(`${fx.url}/__switches`, json({ errors: false }));
    expect((await rpc('tools/list', {}, t)).status).toBe(200);
  });
});
