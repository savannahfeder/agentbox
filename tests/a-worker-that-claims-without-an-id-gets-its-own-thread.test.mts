// A WORKER THAT CLAIMS WITHOUT AN ID GETS ITS OWN THREAD (w-4465054f04, 2026-10-22).
//
// In the cloud power test a Claude Code run started for "Review open pull
// requests in the API" called claim_work_item with no arguments. The tool read
// that as "pull the next available item from any product" and handed it an
// older open row, w-e4f198166b, which it held from 22:56:21 to 22:56:26 while
// the tester's In progress showed two threads for one send. The agent itself
// noticed the id was not its own. With hundreds of open rows, that claim holds
// another thread's row and refuses that thread's own worker.
//
// The store server knows which row its session was started for (ZERO_ITEM).
// A claim with neither an id nor a filter now takes that row; a filter still
// pulls, and a server started for no row still pulls.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let work;
let product;
let built = [];
// A session the app started carries its own row here; the tests set their own.
const inherited = process.env.ZERO_ITEM;

beforeEach(async () => {
  delete process.env.ZERO_ITEM;
  const home = (await import('../main/store/home.mjs')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-own-claim';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-own-claim'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mjs');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mjs');
  product = createProduct(`Claims ${Math.random().toString(36).slice(2, 8)}`);
  work = await import('../mcp/core/work.mjs');
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
  if (inherited === undefined) delete process.env.ZERO_ITEM; else process.env.ZERO_ITEM = inherited;
});

const tools = async (opts) => {
  const b = (await import('../mcp/tools.mjs')).buildTools({ holder: `test-${Math.random()}`, ...opts });
  built.push(b);
  return (args) => b.tools.find((t) => t.name === 'claim_work_item').run(args).then((r) => JSON.parse(r.content[0].text));
};

// An older open row first, so a pull would take it.
const rows = () => {
  const older = work.createItem(product.id, { title: 'Review open pull requests (old copy)', labels: ['founder'], priority: 5 }, { source: 'founder' });
  const own = work.createItem(product.id, { title: 'Review open pull requests in the API', labels: ['founder'] }, { source: 'founder' });
  return { older, own };
};

describe('claim_work_item', () => {
  it('with no id, a session started for a row takes that row', async () => {
    const { own } = rows();
    const claim = await tools({ ownItem: own.id });
    const out = await claim({});
    expect(out.claimed).toBe(true);
    expect(out.item.id).toBe(own.id);
  });

  it('with a filter, it still pulls the next available item', async () => {
    const { older, own } = rows();
    const claim = await tools({ ownItem: own.id });
    const out = await claim({ filter: {} });
    expect(out.item.id).toBe(older.id);
  });

  it('with an id, it takes that id', async () => {
    const { older, own } = rows();
    const claim = await tools({ ownItem: own.id });
    expect((await claim({ id: older.id })).item.id).toBe(older.id);
  });

  it('a server started for no row still pulls', async () => {
    const { older } = rows();
    const claim = await tools({});
    expect((await claim({})).item.id).toBe(older.id);
  });

  it('reads the row it was started for from ZERO_ITEM when it is its own process', async () => {
    const { own } = rows();
    process.env.ZERO_ITEM = own.id;
    try {
      const claim = await tools({});
      expect((await claim({})).item.id).toBe(own.id);
    } finally { delete process.env.ZERO_ITEM; }
  });
});
