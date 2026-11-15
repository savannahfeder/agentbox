// AN AGENT MOVES A PROJECT'S CODE FOLDER ONLY ON YOUR WORDS.
//
// What was wrong (2026-11-14, daily security review): update_product took a
// new repoPath from any agent, a cloud one steered by a page included, so one
// injected agent could point a project at another project's checkout and every
// later Mac agent there made its task folders in that repository. Measured on a
// stand-in store: update_product set repoPath to an arbitrary existing folder.
// The person chose (2026-11-15): only on their quoted words, as with rules.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';

describe('a project\'s code folder', () => {
  let product: { id: string }; let dir: string; let code: string; let elsewhere: string;
  let products: typeof import('../mcp/core/products.mts');
  let work: typeof import('../main/store/work-items.mts');

  beforeEach(async () => {
    const home = appHome();
    const acct = `acct-code-${Math.random().toString(36).slice(2, 8)}`;
    process.env.STORE_ACCOUNT_ID = acct;
    fs.mkdirSync(path.join(home, 'accounts', acct), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    products = await import('../mcp/core/products.mts');
    work = await import('../main/store/work-items.mts');
    code = fs.mkdtempSync(path.join(os.tmpdir(), 'code-'));
    elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'other-code-'));
    product = products.createProduct(`Code ${Math.random().toString(36).slice(2, 8)}`, { repoPath: code });
    dir = path.join(home, 'accounts', acct, product.id);
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const onAThread = (answer: string | null, source: 'founder' | 'agent' = 'founder') => {
    const t = work.createWorkItem(dir, { title: 'Link the code', body: 'Which folder is it in?', labels: ['founder'] }, { source });
    if (answer) work.updateWorkItem(dir, t.id, { answer }, { source: 'founder' });
    return { env: { ZERO_ITEM: t.id, ZERO_PRODUCT: product.id } };
  };
  const repo = () => products.getProduct(product.id).repoPath;

  it('moves on the person\'s own words there', () => {
    const run = onAThread(`It is in ${elsewhere}`);
    products.updateProduct(product.id, { repoPath: elsewhere }, `It is in ${elsewhere}`, run);
    expect(repo()).toBe(elsewhere);
  });

  it('is refused without their words, with words they never wrote, or on a thread an agent filed', () => {
    const run = onAThread('Looks fine');
    expect(() => products.updateProduct(product.id, { repoPath: elsewhere }, undefined, run)).toThrow(/own words on this thread/);
    expect(() => products.updateProduct(product.id, { repoPath: elsewhere }, 'Use the other folder', run)).toThrow(/own words on this thread/);
    expect(() => products.updateProduct(product.id, { repoPath: elsewhere }, 'Use the other folder', onAThread(null, 'agent'))).toThrow(/own words on this thread/);
    expect(repo()).toBe(code);
  });

  it('while a new one-liner needs no quote, nor setting the folder it already has', () => {
    const run = onAThread('Looks fine');
    products.updateProduct(product.id, { oneLiner: 'An inbox for agents' }, undefined, run);
    products.updateProduct(product.id, { repoPath: code }, undefined, run);
    expect(products.getProduct(product.id)).toMatchObject({ oneLiner: 'An inbox for agents', repoPath: code });
  });
});
