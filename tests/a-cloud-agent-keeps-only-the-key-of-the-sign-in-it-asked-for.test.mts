// Weekly security audit, 2026-11-16. sign_in's keep saves a key for every later
// cloud run, and needed only an ask the agent had opened itself. Measured with
// the real tools on a dummy store and bucket: after one sign-in ask for Acme,
// keep saved DATABASE_URL and ALL_PROXY under names of the agent's choosing,
// still kept GH_TOKEN after the person pressed Skip, and replaced a
// SUPABASE_ACCESS_TOKEN the person had approved on a card, deleting the old one.
// ALL_PROXY, OPENSSL_CONF, LUA_INIT, GCONV_PATH and AWS_CA_BUNDLE passed the
// name check on the Mac and on the cloud machine.
//
// Daily security review, 2026-11-17: a service not on the list still had no
// name rule, and nobody had to answer the card. One ask for "Acme" and three
// keeps with no answer saved COREPACK_NPM_REGISTRY, PLAYWRIGHT_DOWNLOAD_HOST and
// ELECTRON_MIRROR for every later cloud run, names that point its downloads at
// any server. A blocklist of names keeps missing some, so a service off the
// list keeps nothing; its key goes on a card the person answers.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keyNameRefused } from '../shared/cloud-key-names.mts';
import { keyNameRefused as sandboxRefused } from '../cloud/sandbox/key-names.mjs';
import { saveCloudKey } from '../main/cloud/keys.mts';

const LINK = 'https://supabase.com/dashboard/cli/login?session_id=x';
type Tool = { name: string; run: (a: object) => Promise<{ content: { text: string }[] }> };
let work: typeof import('../mcp/core/work.mts');
let disk: typeof import('../main/store/work-items.mts');
let product: { id: string; dir: string };
let built: { claims: { _stop: () => void } }[] = [];
const kept: [string, string][] = [];

beforeEach(async () => {
  const home = (await import('../main/store/home.mts')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-keep-only';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-keep-only'), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  product = (await import('../mcp/core/products.mts')).createProduct(`Keep only ${Math.random().toString(36).slice(2, 8)}`) as { id: string; dir: string };
  product.dir = path.join(home, 'accounts', 'acct-keep-only', product.id);
  work = await import('../mcp/core/work.mts');
  disk = await import('../main/store/work-items.mts');
  kept.length = 0;
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT;
});

async function asked(service: string, said?: string) {
  const { askToSignIn } = await import('../mcp/core/sign-in.mts');
  const t = work.createItem(product.id, { title: 'Deploy', labels: ['founder'] }, { source: 'system' });
  process.env.ZERO_ITEM = t.id; process.env.ZERO_PRODUCT = product.id;
  const ask = askToSignIn(t.id, { service, url: LINK }, { product: product.id });
  if (said) disk.updateWorkItem(product.dir, t.id, { signInAnswer: { id: ask.id, said, at: Date.now() } }, { source: 'founder' });
  const b = (await import('../mcp/tools.mts')).buildTools({
    holder: `t-${Math.random()}`, ownItem: t.id, ownProduct: product.id,
    keepCloudKey: async (name: string, value: string) => { kept.push([name, value]); },
  }) as unknown as { tools: Tool[]; claims: { _stop: () => void } };
  built.push(b);
  const keep = async (name: string) => JSON.parse((await b.tools.find((x) => x.name === 'sign_in')!.run({ ask: ask.id, keep: { name, value: 'v-123' } })).content[0].text);
  return { keep };
}

describe('a cloud agent keeps only the key of the sign-in it asked for', () => {
  it("keeps a known service's own key, and no other name under its ask", async () => {
    const { keep } = await asked('Supabase', 'signed-in');
    expect((await keep('DATABASE_URL')).status).toBe('denied');
    expect((await keep('SUPABASE_ACCESS_TOKEN')).status).toBe('kept');
    expect(kept).toEqual([['SUPABASE_ACCESS_TOKEN', 'v-123']]);
  });

  it('keeps nothing for a service not on the list, whatever the name and even after the person signed in', async () => {
    const acme = await asked('Acme');
    for (const name of ['ACME_TOKEN', 'COREPACK_NPM_REGISTRY', 'PLAYWRIGHT_DOWNLOAD_HOST', 'RUSTC_WRAPPER']) {
      const out = await acme.keep(name);
      expect(out.status).toBe('denied');
      expect(out.message).toMatch(/AGENTBOX-NEEDS: key/);
    }
    expect((await (await asked('Acme', 'signed-in')).keep('ACME_TOKEN')).status).toBe('denied');
    expect(kept).toEqual([]);
  });

  it("still keeps a known service's key for a login that finished by itself", async () => {
    expect((await (await asked('GitHub')).keep('GH_TOKEN')).status).toBe('kept');
    expect(kept).toEqual([['GH_TOKEN', 'v-123']]);
  });

  it('keeps nothing once the person skipped the sign-in or replied instead', async () => {
    expect((await (await asked('GitHub', 'skipped')).keep('GH_TOKEN')).status).toBe('denied');
    expect((await (await asked('Vercel', 'replied')).keep('VERCEL_TOKEN')).status).toBe('denied');
    expect(kept).toEqual([]);
  });
});

describe('a kept key never replaces one already saved', () => {
  let home: string;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-replace-')); });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  it('refuses the same name, and a first save or a card replacement still lands', async () => {
    const objects = new Map<string, string>();
    const storage = { put: async (k: string, v: string) => { objects.set(k, v); }, del: async (k: string) => { objects.delete(k); } };
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', 'approved-1', { storage, home });
    await expect(saveCloudKey('SUPABASE_ACCESS_TOKEN', 'planted-2', { storage, home, replace: false })).rejects.toThrow(/already/);
    expect([...objects.values()].join()).toContain('approved-1');
    await saveCloudKey('VERCEL_TOKEN', 'first', { storage, home, replace: false });
    await saveCloudKey('SUPABASE_ACCESS_TOKEN', 'approved-3', { storage, home });
    expect([...objects.values()].join()).not.toContain('approved-1');
  });
});

describe('a key cannot take a name that changes where a program connects or what it loads', () => {
  it.each(['ALL_PROXY', 'OPENSSL_CONF', 'OPENSSL_ENGINES', 'OPENSSL_MODULES', 'LUA_INIT', 'LUA_INIT_5_4', 'GCONV_PATH', 'AWS_CA_BUNDLE', 'LOCALDOMAIN', 'RES_OPTIONS', 'HOSTALIASES'])('refuses %s on the Mac and on the cloud machine', (name) => {
    expect(keyNameRefused(name)).toBeTruthy();
    expect(sandboxRefused(name)).toBeTruthy();
  });
});
