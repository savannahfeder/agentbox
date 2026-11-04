// A DOCUMENT AN AGENT WRITES IS IN FILES AT ONCE.
//
// On a team, the investor-update agent ran write_document for
// updates/october-investor-update.md and told her it was "in the Company docs
// under updates/"; the Pricing researcher said "the Competitor pricing
// document". Neither was in Files until she asked the agent to save it again.
// Measured here: Files (main/files-place.mjs) and a shared thread's copy
// (main/team/thread-share.mjs) list only the files a thread's words name, and
// write_document put nothing on the thread, so a document the agent wrote but
// called by its title was in no list. The launch posts landed because that
// agent happened to write the file's name in its answer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { filesOf } from '../main/files-place.mjs';

let tools; let product; let dir; let work; let store; let row;

const build = async (ownItem) => {
  ({ tools } = (await import('../mcp/tools.mjs')).buildTools({ holder: 'test-worker', ownItem }));
};
const write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
const said = (r) => JSON.parse(r.content[0].text);
const lines = () => store.readItemHistory(dir, row.id, { max: 1000 });
const inFiles = () => filesOf([{ ref: { kind: 'thread', product: product.id, id: row.id }, title: 'October investor update', project: product.name, lines: lines() }]).map((f) => f.name);

beforeEach(async () => {
  process.env.STORE_ACCOUNT_ID = 'acct-docs-in-files';
  fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-docs-in-files'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mjs');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mjs');
  product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', 'acct-docs-in-files', product.id);
  work = await import('../mcp/core/work.mjs');
  store = await import('../main/store/work-items.mjs');
  row = work.createItem(product.id, { title: 'Draft our October investor update', labels: ['founder'] }, { source: 'founder' });
  process.env.ZERO_PRODUCT = product.id;
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; });

describe('a document the thread\'s agent writes', () => {
  it('is in Files as soon as it is written, though the agent only said its title', async () => {
    await build(row.id);
    const r = said(await write({ path: 'updates/october-investor-update.md', title: 'October investor update', content: '# October\n' }));
    expect(inFiles()).toEqual(['october-investor-update.md']);
    expect(r.onThread).toBe(true);
  });

  it('is named on the thread once, however often it is written again', async () => {
    await build(row.id);
    await write({ path: 'competitor-pricing.md', title: 'Competitor pricing', content: '| a |\n' });
    await write({ path: 'competitor-pricing.md', content: '| a | b |\n' });
    await write({ path: 'competitor-pricing.md', title: 'Competitor pricing table' });
    const named = lines().filter((l) => String(l.patch?.note ?? '').includes('competitor-pricing.md'));
    expect(named).toHaveLength(1);
  });

  it('is not named again when the thread already names it', async () => {
    await build(row.id);
    store.updateWorkItem(dir, row.id, { note: 'Starting on [the posts](launch-posts.md)' }, { source: 'agent' });
    await write({ path: 'launch-posts.md', title: 'Launch posts', content: '# Posts\n' });
    expect(lines().filter((l) => String(l.patch?.note ?? '').includes('launch-posts.md'))).toHaveLength(1);
    expect(inFiles()).toEqual(['launch-posts.md']);
  });
});

describe('what puts nothing on a thread', () => {
  it('a session that is no thread\'s, which is told the document is in no thread', async () => {
    await build(null);
    const r = said(await write({ path: 'notes/plain.md', title: 'Plain', content: 'x' }));
    expect(r.onThread).toBe(false);
    expect(r.say).toMatch(/plain\.md/);
    expect(lines().some((l) => l.patch?.note)).toBe(false);
  });

  it('a change of title only', async () => {
    await build(null);
    await write({ path: 'report.md', title: 'Report', content: 'x' });
    await build(row.id);
    await write({ path: 'report.md', title: 'Report, renamed' });
    expect(lines().some((l) => l.patch?.note)).toBe(false);
  });
});
