// The v0 loop, minus the model: founder composes → item folds open → worker
// claims under an epoch → files a question → founder answers (never fenced) →
// continuation picks it up → done. Runs against a temp store shaped exactly
// like ~/Store, through the same the app modules the app uses in production.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';


let tmp;
let Store;
let disk;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-v0-'));
  const accountRoot = path.join(tmp, 'accounts', 'test-account');
  const productDir = path.join(accountRoot, 'testprod');
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({
    schemaVersion: 1, id: 'testprod', name: 'Test Product',
  }));

  ({ Store } = await import('../main/store.mjs'));
  disk = await import('../main/store/work-items.mjs');

  const config = {
    storeRoot: tmp,
    accountId: 'test-account',
    accountRoot,
    products: [],
  };
  Store._testInstance = await new Store(config).init();
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the v0 loop', () => {
  it('composes, claims, asks, answers, continues, finishes', async () => {
    const store = Store._testInstance;
    const [product] = store.listProducts();
    expect(product.name).toBe('Test Product');

    // Founder composes a directive (C).
    const directive = store.composeItem(product.slug, { title: 'Ship the pricing page', body: 'Detail here' });
    expect(directive.status).toBe('open');

    // Supervisor-side: a worker claims it.
    const claim = await disk.claimWorkItem(product.dir, { id: directive.id, holder: 'worker-1' });
    expect(claim.claimed).toBe(true);

    // A second worker cannot steal it.
    const stolen = await disk.claimWorkItem(product.dir, { id: directive.id, holder: 'worker-2' });
    expect(stolen.claimed).toBe(false);

    // The worker files a question; it appears in the app's cross-product list.
    const question = disk.createWorkItem(product.dir, {
      title: 'Annual toggle default?',
      kind: 'question',
      parent: directive.id,
      body: '## Options\n1. Monthly (recommended)\n2. Annual',
    });
    let items = store.listItems();
    const inboxQuestion = items.find((i) => i.id === question.id);
    expect(inboxQuestion.kind).toBe('question');
    expect(inboxQuestion.product).toBe(product.slug);

    // Founder answers (E on the recommended option). Founder lines outrank and
    // are never fenced.
    store.answerItem(product.slug, question.id, { answer: 'Option 1: Monthly' });
    items = store.listItems();
    expect(items.find((i) => i.id === question.id).answer).toBe('Option 1: Monthly');

    // The continuation trigger the app's supervisor polls for: an answered,
    // still-open question.
    const pending = items.filter((i) => i.kind === 'question' && i.status === 'open' && i.answer);
    expect(pending.map((i) => i.id)).toContain(question.id);

    // Continuation claims the question, acts, closes both.
    const continuation = await disk.claimWorkItem(product.dir, { id: question.id, holder: 'worker-3' });
    expect(continuation.claimed).toBe(true);
    disk.updateWorkItem(product.dir, question.id, { status: 'done', result: 'Shipped monthly default' }, { epoch: continuation.epoch });
    disk.updateWorkItem(product.dir, directive.id, { status: 'done', result: 'Pricing page live' }, { epoch: claim.epoch });

    items = store.listItems();
    expect(items.find((i) => i.id === question.id).status).toBe('done');
    expect(items.find((i) => i.id === directive.id).status).toBe('done');
  });

  it('creates a product, and seeds it with nothing', () => {
    const store = Store._testInstance;
    const { slug } = store.createProduct({ name: 'Cascade' });
    expect(slug).toBe('cascade');
    // There is no seed row since. The loop below starts from a task she writes,
    // which is where every other project of hers starts.
    expect(store.listItems().filter((i) => i.product === 'cascade')).toEqual([]);
    expect(store.listProducts().find((p) => p.slug === 'cascade')).toBeTruthy();
  });
});
