// A ROW AN AGENT FILES UNDER A THREAD RUNS ON THAT THREAD'S ENGINE (w-4465054f04, 2026-10-22).
//
// In the cloud power test a tester sent a refund-tests task on Codex. Its
// worker filed a question under it and blocked on it, and the question was
// answered on Claude Code, Opus: the tester logged "one on Opus though I chose
// Codex". A filed row copied its parent's privacy and nothing else, so with no
// engine of its own it ran on the default. It now takes the parent's engine,
// model and thinking level unless the filing names its own.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let work;
let product;

beforeEach(async () => {
  const home = (await import('../main/store/home.mjs')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-filed-engine';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-filed-engine'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mjs');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mjs');
  product = createProduct(`Filed ${Math.random().toString(36).slice(2, 8)}`);
  work = await import('../mcp/core/work.mjs');
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

const thread = (fields) => work.createItem(product.id, { title: 'Write the refund tests', labels: ['founder'], ...fields }, { source: 'founder' });

it('takes the engine, model and level of the thread it is filed under', () => {
  const parent = thread({ engine: 'codex', model: 'gpt-6-luna', effort: 'high' });
  const filed = work.createItem(product.id, { title: 'Which refund rule applies?', kind: 'question', parent: parent.id });
  expect(filed).toMatchObject({ engine: 'codex', model: 'gpt-6-luna', effort: 'high' });
});

it('keeps an engine the filing names itself', () => {
  const parent = thread({ engine: 'codex', model: 'gpt-6-luna' });
  const filed = work.createItem(product.id, { title: 'Draft the copy', parent: parent.id, engine: 'claude', model: 'opus' });
  expect(filed).toMatchObject({ engine: 'claude', model: 'opus' });
});

it('takes nothing from a thread that chose nothing', () => {
  const parent = thread({});
  const filed = work.createItem(product.id, { title: 'A question', kind: 'question', parent: parent.id });
  expect(filed.engine).toBeUndefined();
  expect(filed.model).toBeUndefined();
});

it('takes nothing when filed under no thread', () => {
  thread({ engine: 'codex' });
  const filed = work.createItem(product.id, { title: 'A loose question', kind: 'question' });
  expect(filed.engine).toBeUndefined();
});
