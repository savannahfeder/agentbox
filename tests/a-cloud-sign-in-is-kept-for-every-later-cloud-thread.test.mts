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

  // sign_in keeps nothing for a service off the list (tests/a-cloud-agent-keeps-only-the-key-of-the-sign-in-it-asked-for).
  it('sends a service not on the list to a key card instead of keep', async () => {
    const { out } = await signedIn('Acme');
    expect(out.keep).toBeUndefined();
    expect(out.message).not.toMatch(/call sign_in/);
    expect(out.message).toMatch(/AGENTBOX-NEEDS: key/);
    // A tool server's own sign-in has no key to ask for, so it goes to Connections, which every thread uses.
    expect(out.message).toMatch(/agentbox:\/\/connections/);
    expect((await signedIn('Supabase')).out.message).not.toMatch(/agentbox:\/\/connections/);
  });

  it('says to keep it once a login that landed elsewhere finishes', async () => {
    const { out } = await signedIn('Supabase', { said: 'landed', extra: { url: 'http://localhost:54321/callback?code=1' } });
    expect(out.status).toBe('landed');
    expect(out.keep?.name).toBe('SUPABASE_ACCESS_TOKEN');
  });

  it('says to keep it once a login waiting for a pasted code finishes', async () => {
    const { out } = await signedIn('Supabase', { said: 'code', extra: { code: 'A1B2C3D4' } });
    expect(out.status).toBe('code');
    expect(out.code).toBe('A1B2C3D4');
    expect(out.keep?.name).toBe('SUPABASE_ACCESS_TOKEN');
    expect(out.message).toMatch(/Once the login finishes, keep/);
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

// The person chooses on the card whether a cloud sign-in is saved. The choice
// sits on the ask itself, so a sign-in that comes back by itself (this
// computer catching the browser at localhost) honours it too.
describe('when they untick "Save this sign-in for every cloud thread"', () => {
  async function unticked(service = 'Supabase') {
    const { askToSignIn } = await import('../mcp/core/sign-in.mts');
    const t = work.createItem(product.id, { title: 'Deploy', labels: ['founder'] }, { source: 'system' });
    process.env.ZERO_ITEM = t.id;
    process.env.ZERO_PRODUCT = product.id;
    const ask = askToSignIn(t.id, { service, url: LINK }, { product: product.id });
    const item = disk.readWorkItem(product.dir, t.id);
    disk.updateWorkItem(product.dir, t.id, { signIn: { ...item.signIn, keep: false } }, { source: 'founder' });
    return { t, ask: ask.id };
  }

  it('the agent is told not to keep it', async () => {
    const { t, ask } = await unticked();
    answer(t, ask, 'signed-in');
    const out = await call(await tools(t.id, true), { ask });
    expect(out.status).toBe('signed_in');
    expect(out.keep).toBeUndefined();
    expect(out.message).toMatch(/not to save/);
    expect(out.message).not.toMatch(/every later cloud/);
  });

  it('nor when the login finished by itself', async () => {
    const { t, ask } = await unticked('GitHub');
    const out = await call(await tools(t.id, true), { ask, finished: true });
    expect(out.keep).toBeUndefined();
    expect(out.message).toMatch(/not to save/);
  });

  it('and keeping it anyway is refused', async () => {
    const { t, ask } = await unticked();
    answer(t, ask, 'signed-in');
    const ts = await tools(t.id, true);
    kept.length = 0;
    const out = await call(ts, { ask, keep: { name: 'SUPABASE_ACCESS_TOKEN', value: 'sbp_x' } });
    expect(out.status).toBe('not_saved');
    expect(kept).toEqual([]);
  });

  it('the choice survives the agent closing the card', async () => {
    const { t, ask } = await unticked();
    await call(await tools(t.id, true), { ask, finished: true });
    expect(disk.readWorkItem(product.dir, t.id).signIn.keep).toBe(false);
  });
});

describe('ticking and unticking the box on this computer', () => {
  const fake = (item) => {
    const wrote = [];
    return { wrote, readItem: () => item, productDir: () => '/p', modules: { workItemsDisk: { updateWorkItem: (_d, _id, patch, o) => { wrote.push([patch, o.source]); } } } };
  };
  const open = { id: 's-abcdef12', service: 'Supabase', url: LINK, at: 1 };
  it('marks the open ask not to be saved, and saved again, as the person', async () => {
    const { Store } = await import('../main/store.mts');
    const off = fake({ id: 'w', status: 'open', signIn: open });
    Store.prototype.chooseSignInKeep.call(off, 'p', 'w', { id: open.id, keep: false });
    expect(off.wrote).toEqual([[{ signIn: { ...open, keep: false } }, 'founder']]);
    const on = fake({ id: 'w', status: 'open', signIn: { ...open, keep: false } });
    Store.prototype.chooseSignInKeep.call(on, 'p', 'w', { id: open.id, keep: true });
    expect(on.wrote).toEqual([[{ signIn: open }, 'founder']]);
  });
  it('refuses an ask that is no longer open', async () => {
    const { Store } = await import('../main/store.mts');
    const s = fake({ id: 'w', status: 'open', signIn: open, signInAnswer: { id: open.id, said: 'signed-in', at: 2 } });
    expect(() => Store.prototype.chooseSignInKeep.call(s, 'p', 'w', { id: open.id, keep: false })).toThrow(/no longer open/);
    expect(() => Store.prototype.chooseSignInKeep.call(fake({ id: 'w', status: 'open', signIn: open }), 'p', 'w', { id: 's-other123', keep: false })).toThrow(/no longer open/);
  });
});

describe('what the ask keeps of the choice', () => {
  it('keeps "not saved" and nothing else', async () => {
    const { cleanSignIn } = await import('../shared/sign-in-ask.mts');
    const base = { id: 's-abcdef12', service: 'Supabase', url: LINK, at: 1 };
    expect(cleanSignIn({ ...base, keep: false })?.keep).toBe(false);
    expect(cleanSignIn({ ...base, keep: true })).not.toHaveProperty('keep');
    expect(cleanSignIn({ ...base, keep: 'no' })).not.toHaveProperty('keep');
  });
});

describe('the checkbox on the card', () => {
  const ask = { id: 's-abcdef12', service: 'Supabase', url: LINK };
  const draw = async (props) => {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SignInCard } = await import('../renderer/src/components/SignInCard.tsx');
    return renderToStaticMarkup(h(SignInCard, { ask, cloud: true, open: () => {}, answer: async () => null, copy: () => {}, choose: async () => null, ...props }));
  };
  it('is ticked on a cloud thread', async () => {
    const html = await draw({});
    expect(html).toContain('Save this sign-in for every cloud thread');
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });
  it('is unticked once they said not to save it', async () => {
    expect(await draw({ ask: { ...ask, keep: false } })).not.toMatch(/type="checkbox"[^>]*checked/);
  });
  it('is not there on this computer, where nothing is saved', async () => {
    expect(await draw({ cloud: false })).not.toContain('Save this sign-in');
  });
});
