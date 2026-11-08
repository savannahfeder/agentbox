// AN AGENT PUTS A SERVICE'S OWN SIGN-IN IN FRONT OF THE PERSON.
//
// What broke: agents that needed GitHub, Vercel or any other service could
// only say so in words or ask for a pasted key, while in Claude Code or Codex
// the same person signs in by clicking the link the login prints. Claude
// Code's MCP sign-in hands back a link and takes the address the browser lands
// on (`authenticate`, `complete_authentication`); Codex's does the same
// (`codex mcp login --no-browser`), and so do command-line logins. Measured by
// driving the new sign_in tool against a real store: the link reaches the
// thread, the person's answer reaches the waiting agent, a wait ends inside
// Codex's 60 second limit, and a cloud thread's return to localhost is caught
// on this computer by a real listener.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { answerTo, cleanSignIn, cleanSignInAnswer, comesBackTo, openSignIn } from '../shared/sign-in-ask.mjs';
import { SignInReturns } from '../main/sign-in-returns.mts';
import { liveLine } from '../renderer/src/live-line.ts';

const { SignInCard } = await import('../renderer/src/components/SignInCard.tsx');

const LINK = 'https://github.com/login/device';
const MCP_LINK = (port) => `https://mcp.example.com/authorize?client_id=x&redirect_uri=${encodeURIComponent(`http://localhost:${port}/callback`)}&state=s1`;

describe('what a sign-in ask may carry', () => {
  it('a service, its http or https link, and a code', () => {
    expect(cleanSignIn({ id: 's-abcdef12', service: 'GitHub', url: LINK, code: 'ABCD-1234', why: 'to push', at: 1 }))
      .toEqual({ id: 's-abcdef12', service: 'GitHub', url: LINK, code: 'ABCD-1234', why: 'to push', at: 1 });
  });
  it('never a link that is not a web address, nor one with no service', () => {
    expect(cleanSignIn({ id: 's-abcdef12', service: 'GitHub', url: 'javascript:alert(1)' })).toBeUndefined();
    expect(cleanSignIn({ id: 's-abcdef12', service: 'GitHub', url: 'file:///etc/passwd' })).toBeUndefined();
    expect(cleanSignIn({ id: 's-abcdef12', url: LINK })).toBeUndefined();
  });
  it('an answer that landed carries a web address; the others carry none', () => {
    expect(cleanSignInAnswer({ id: 's-abcdef12', said: 'landed', url: 'http://localhost:1/callback?code=1' })?.url).toBe('http://localhost:1/callback?code=1');
    expect(cleanSignInAnswer({ id: 's-abcdef12', said: 'landed', url: 'not a url' })).toBeUndefined();
    expect(cleanSignInAnswer({ id: 's-abcdef12', said: 'maybe' })).toBeUndefined();
  });
  it('knows a link that sends the browser back to localhost, and one that does not', () => {
    expect(comesBackTo(MCP_LINK(33418))).toEqual({ port: 33418, path: '/callback' });
    expect(comesBackTo(LINK)).toBeNull();
    expect(comesBackTo('https://x.test/a?redirect_uri=https%3A%2F%2Fx.test%2Fback')).toBeNull();
  });
});

let work; let disk; let product; let built = [];
beforeEach(async () => {
  const home = (await import('../main/store/home.mjs')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-sign-in';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-sign-in'), { recursive: true });
  (await import('../mcp/core/account.mjs')).resolveAccount();
  product = (await import('../mcp/core/products.mjs')).createProduct(`Sign in ${Math.random().toString(36).slice(2, 8)}`);
  product.dir = path.join(home, 'accounts', 'acct-sign-in', product.id);
  work = await import('../mcp/core/work.mjs');
  disk = await import('../main/store/work-items.mjs');
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
});

const thread = () => work.createItem(product.id, { title: 'Deploy the site', labels: ['founder'] }, { source: 'system' });
const tools = async (ownItem, more = {}) => {
  const b = (await import('../mcp/tools.mjs')).buildTools({ holder: `t-${Math.random()}`, ownItem, ownProduct: product.id, ...more });
  built.push(b);
  return b.tools;
};
const call = async (ts, args) => JSON.parse((await ts.find((t) => t.name === 'sign_in').run(args)).content[0].text);
const answer = (id, a, source = 'founder') => disk.updateWorkItem(product.dir, id, { signInAnswer: { ...a, at: Date.now() } }, { source });

describe('the sign_in tool', () => {
  it('is offered only to a run on a thread', async () => {
    expect((await tools(null)).some((t) => t.name === 'sign_in')).toBe(false);
    expect((await tools(thread().id)).some((t) => t.name === 'sign_in')).toBe(true);
  });

  it('puts the link on the thread and hands back what the person did', async () => {
    const t = thread();
    const ts = await tools(t.id);
    const waiting = call(ts, { service: 'GitHub', url: LINK, code: 'ABCD-1234', why: 'to push the branch' });
    await new Promise((r) => setTimeout(r, 300));
    const ask = openSignIn(disk.readWorkItem(product.dir, t.id));
    expect(ask).toMatchObject({ service: 'GitHub', url: LINK, code: 'ABCD-1234' });
    answer(t.id, { id: ask.id, said: 'signed-in' });
    expect((await waiting).status).toBe('signed_in');
    expect(openSignIn(disk.readWorkItem(product.dir, t.id))).toBeNull();
  });

  it('hands back the address the browser landed on', async () => {
    const t = thread();
    const ts = await tools(t.id);
    const waiting = call(ts, { service: 'Linear', url: MCP_LINK(4000) });
    await new Promise((r) => setTimeout(r, 300));
    const ask = openSignIn(disk.readWorkItem(product.dir, t.id));
    answer(t.id, { id: ask.id, said: 'landed', url: 'http://localhost:4000/callback?code=c&state=s1' }, 'system');
    expect(await waiting).toMatchObject({ status: 'landed', url: 'http://localhost:4000/callback?code=c&state=s1' });
  });

  it('waits less than Codex\'s minute, and keeps waiting on the same ask', async () => {
    const { WAIT_MS, askToSignIn, waitForSignIn } = await import('../mcp/core/sign-in.mjs');
    expect(WAIT_MS).toBeLessThan(60_000);
    const t = thread();
    const ask = askToSignIn(t.id, { service: 'Vercel', url: 'https://vercel.com/oauth/device?user_code=XYZ' }, { product: product.id });
    expect((await waitForSignIn(t.id, ask.id, { product: product.id, waitMs: 200 }))).toMatchObject({ status: 'waiting', ask: ask.id });
    answer(t.id, { id: ask.id, said: 'skipped' });
    expect((await waitForSignIn(t.id, ask.id, { product: product.id, waitMs: 200 })).status).toBe('skipped');
  });

  it('takes the card away when the login finished by itself', async () => {
    const t = thread();
    const { askToSignIn } = await import('../mcp/core/sign-in.mjs');
    const ask = askToSignIn(t.id, { service: 'Supabase', url: 'https://supabase.com/dashboard/cli/login?session_id=1' }, { product: product.id });
    expect((await call(await tools(t.id), { ask: ask.id, finished: true })).status).toBe('closed');
    expect(openSignIn(disk.readWorkItem(product.dir, t.id))).toBeNull();
  });

  it('asks again after an answer, the person\'s answer notwithstanding', async () => {
    const t = thread();
    const { askToSignIn } = await import('../mcp/core/sign-in.mjs');
    const first = askToSignIn(t.id, { service: 'GitHub', url: LINK }, { product: product.id });
    answer(t.id, { id: first.id, said: 'signed-in' });
    const second = askToSignIn(t.id, { service: 'GitHub', url: LINK }, { product: product.id });
    expect(openSignIn(disk.readWorkItem(product.dir, t.id))?.id).toBe(second.id);
    expect(answerTo(disk.readWorkItem(product.dir, t.id), second.id)).toBeNull();
  });

  it('keeps a cloud login\'s token for later cloud runs, and only where there is a cloud', async () => {
    const t = thread();
    const { askToSignIn } = await import('../mcp/core/sign-in.mjs');
    const ask = askToSignIn(t.id, { service: 'GitHub', url: LINK }, { product: product.id });
    const kept = [];
    const inCloud = await tools(t.id, { keepCloudKey: async (name, value) => { kept.push([name, value]); } });
    expect((await call(inCloud, { ask: ask.id, finished: true, keep: { name: 'GH_TOKEN', value: 'gho_x' } })).status).toBe('kept');
    expect(kept).toEqual([['GH_TOKEN', 'gho_x']]);
    expect((await call(await tools(t.id), { ask: ask.id, keep: { name: 'GH_TOKEN', value: 'gho_x' } })).status).toBe('kept_here');
  });
});

describe('the thread while it waits', () => {
  const item = (over = {}) => ({ id: 'w-1', product: 'p', status: 'claimed', title: 'Deploy', signIn: { id: 's-abcdef12', service: 'Vercel', url: LINK, at: 1 }, ...over });
  it('says what the agent waits for', () => {
    expect(liveLine(item(), { asking: true })?.line).toBe('The agent is waiting for you to sign in to Vercel.');
  });
  it('is no longer waiting once answered or closed', () => {
    expect(openSignIn(item({ signInAnswer: { id: 's-abcdef12', said: 'skipped', at: 2 } }))).toBeNull();
    expect(openSignIn(item({ status: 'done' }))).toBeNull();
  });
});

describe('the card', () => {
  const draw = (ask, cloud = false) => renderToStaticMarkup(h(SignInCard, { ask, cloud, open: () => {}, answer: async () => null, copy: () => {} }));
  it('opens the service, shows its code, and offers Done and Not now', () => {
    const html = draw({ id: 's-abcdef12', service: 'GitHub', url: LINK, code: 'ABCD-1234' });
    expect(html).toContain('Sign in to GitHub');
    expect(html).toContain('Open GitHub');
    expect(html).toContain('ABCD-1234');
    expect(html).toContain('>Done<');
    expect(html).toContain('>Not now<');
  });
  it('offers to take the landed address only for a cloud thread whose sign-in comes back to localhost', () => {
    const ask = { id: 's-abcdef12', service: 'Linear', url: MCP_LINK(4000) };
    expect(draw(ask, true)).toContain('Page did not load after signing in?');
    expect(draw(ask, false)).not.toContain('Page did not load');
    expect(draw({ ...ask, url: LINK }, true)).not.toContain('Page did not load');
  });
});

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
const get = (port, p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); })
    .on('error', () => resolve({ status: 0 }));
});

describe('a cloud sign-in coming back to this computer', () => {
  let returns;
  afterEach(() => returns?.stopAll());

  it('is caught at its address and handed to the agent, once', async () => {
    const port = await freePort();
    const caught = [];
    returns = new SignInReturns({ answer: (r, landed) => caught.push([r.ask, landed]), log: {} });
    returns.sync([{ product: 'p', id: 'w-1', ask: 's-abcdef12', url: MCP_LINK(port) }]);
    await new Promise((r) => setTimeout(r, 100));
    expect((await get(port, '/favicon.ico')).status).toBe(404);
    const page = await get(port, '/callback?code=c1&state=s1');
    expect(page.status).toBe(200);
    expect(page.body).toContain('Signed in');
    expect(caught).toEqual([['s-abcdef12', `http://localhost:${port}/callback?code=c1&state=s1`]]);
    await new Promise((r) => setTimeout(r, 100));
    expect((await get(port, '/callback?code=c2')).status).toBe(0);
    returns.sync([{ product: 'p', id: 'w-1', ask: 's-abcdef12', url: MCP_LINK(port) }]);
    expect(returns.open.size).toBe(0);
  });

  it('stops listening once the ask is no longer open', async () => {
    const port = await freePort();
    returns = new SignInReturns({ answer: () => {}, log: {} });
    returns.sync([{ product: 'p', id: 'w-1', ask: 's-abcdef12', url: MCP_LINK(port) }]);
    await new Promise((r) => setTimeout(r, 100));
    returns.sync([]);
    await new Promise((r) => setTimeout(r, 100));
    expect((await get(port, '/callback?code=c')).status).toBe(0);
  });

  it('leaves a port somebody else is listening on to them', async () => {
    const port = await freePort();
    const theirs = http.createServer((q, s) => s.end('theirs')).listen(port, '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    const caught = [];
    returns = new SignInReturns({ answer: (r, landed) => caught.push(landed), log: {} });
    returns.sync([{ product: 'p', id: 'w-1', ask: 's-abcdef12', url: MCP_LINK(port) }]);
    await new Promise((r) => setTimeout(r, 100));
    expect((await get(port, '/callback?code=c')).body).toBe('theirs');
    expect(caught).toEqual([]);
    theirs.close();
  });

  it('never listens for a link that does not come back to localhost', () => {
    returns = new SignInReturns({ answer: () => {}, log: {} });
    returns.sync([{ product: 'p', id: 'w-1', ask: 's-abcdef12', url: LINK }]);
    expect(returns.open.size).toBe(0);
  });
});
