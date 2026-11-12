// A CLOUD SIGN-IN IS KEPT FOR EVERY LATER CLOUD THREAD.
//
// What broke: a person signed in to Supabase through its browser login on one
// cloud thread, and the next cloud thread was not signed in. Keeping a login
// for later runs was left to the agent remembering sign_in's `keep`, and the
// answer it got when the person finished ("check the login finished and carry
// on") never mentioned it. Nor could it have found the token: on a cloud
// machine `supabase login` writes no file, it puts the token in the Linux
// kernel keyring, which goes with the machine (measured with Supabase CLI 3.1.0
// and keyctl on a cloud machine: nothing new under the home folder, the token
// at `user: keyring:supabase@Supabase CLI`). Measured here by driving sign_in
// with and without a cloud behind it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LINK = 'https://supabase.com/dashboard/cli/login?session_id=x';

let work; let disk; let product; let built = [];
beforeEach(async () => {
  const home = (await import('../main/store/home.mts')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-keep-sign-in';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-keep-sign-in'), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  product = (await import('../mcp/core/products.mts')).createProduct(`Keep ${Math.random().toString(36).slice(2, 8)}`);
  product.dir = path.join(home, 'accounts', 'acct-keep-sign-in', product.id);
  work = await import('../mcp/core/work.mts');
  disk = await import('../main/store/work-items.mts');
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
  delete process.env.ZERO_ITEM;
  delete process.env.ZERO_PRODUCT;
});

const kept = [];
const tools = async (ownItem, cloud) => {
  const b = (await import('../mcp/tools.mts')).buildTools({
    holder: `t-${Math.random()}`, ownItem, ownProduct: product.id,
    ...(cloud ? { keepCloudKey: async (name, value) => { kept.push([name, value]); } } : {}),
  });
  built.push(b);
  return b.tools;
};
const call = async (ts, args) => JSON.parse((await ts.find((t) => t.name === 'sign_in').run(args)).content[0].text);

const answer = (t, id, said, extra = {}) => disk.updateWorkItem(product.dir, t.id, { signInAnswer: { id, said, at: Date.now(), ...extra } }, { source: 'founder' });

async function signedIn(service, { cloud = true, said = 'signed-in', extra = {} } = {}) {
  const { askToSignIn } = await import('../mcp/core/sign-in.mts');
  const t = work.createItem(product.id, { title: 'Switch on saving feedback', labels: ['founder'] }, { source: 'system' });
  process.env.ZERO_ITEM = t.id;
  process.env.ZERO_PRODUCT = product.id;
  const ask = askToSignIn(t.id, { service, url: LINK }, { product: product.id });
  answer(t, ask.id, said, extra);
  const ts = await tools(t.id, cloud);
  return { t, ts, ask: ask.id, out: await call(ts, { ask: ask.id }) };
}

describe('a cloud sign-in that worked', () => {
  it('tells the agent to keep Supabase\'s token, and where Supabase\'s login put it', async () => {
    const { out } = await signedIn('Supabase');
    expect(out.status).toBe('signed_in');
    expect(out.keep.name).toBe('SUPABASE_ACCESS_TOKEN');
    expect(out.keep.read).toMatch(/keyctl pipe/);
    expect(out.keep.read).toMatch(/Supabase CLI/);
    expect(out.message).toMatch(/keep/);
    expect(out.message).toMatch(/every later cloud/);
  });

  it('knows a service however its name was written', async () => {
    expect((await signedIn('supabase')).out.keep?.name).toBe('SUPABASE_ACCESS_TOKEN');
    expect((await signedIn('GitHub')).out.keep).toEqual({ name: 'GH_TOKEN', read: 'gh auth token' });
    expect((await signedIn('Vercel')).out.keep).toEqual({ name: 'VERCEL_TOKEN' });
  });

  it('still says to keep it for a service not on the list, without naming a variable', async () => {
    const { out } = await signedIn('Acme');
    expect(out.keep).toBeUndefined();
    expect(out.message).toMatch(/keep/);
  });

  it('says to keep it once a login that landed elsewhere finishes', async () => {
    const { out } = await signedIn('Supabase', { said: 'landed', extra: { url: 'http://localhost:54321/callback?code=1' } });
    expect(out.status).toBe('landed');
    expect(out.keep?.name).toBe('SUPABASE_ACCESS_TOKEN');
  });

  it('says to keep it when the login finished by itself', async () => {
    const { askToSignIn } = await import('../mcp/core/sign-in.mts');
    const t = work.createItem(product.id, { title: 'Deploy', labels: ['founder'] }, { source: 'system' });
    process.env.ZERO_ITEM = t.id;
    process.env.ZERO_PRODUCT = product.id;
    const ask = askToSignIn(t.id, { service: 'Supabase', url: LINK }, { product: product.id });
    const out = await call(await tools(t.id, true), { ask: ask.id, finished: true });
    expect(out.status).toBe('closed');
    expect(out.keep?.name).toBe('SUPABASE_ACCESS_TOKEN');
  });

  it('keeps what the agent hands back', async () => {
    const { ts, ask } = await signedIn('Supabase');
    kept.length = 0;
    expect((await call(ts, { ask, keep: { name: 'SUPABASE_ACCESS_TOKEN', value: 'sbp_x' } })).status).toBe('kept');
    expect(kept).toEqual([['SUPABASE_ACCESS_TOKEN', 'sbp_x']]);
  });
});

describe('where there is nothing to keep', () => {
  it('says nothing about keeping on the person\'s own computer', async () => {
    const { out } = await signedIn('Supabase', { cloud: false });
    expect(out.status).toBe('signed_in');
    expect(out.keep).toBeUndefined();
    expect(out.message).not.toMatch(/every later cloud/);
  });

  it('says nothing about keeping when they skipped it', async () => {
    const { out } = await signedIn('Supabase', { said: 'skipped' });
    expect(out.status).toBe('skipped');
    expect(out.keep).toBeUndefined();
    expect(out.message).not.toMatch(/every later cloud/);
  });
});
