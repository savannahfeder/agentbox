// AN AGENT SAVES THE NEXT VERSION OF A DOCUMENT WITH NOBODY TO SEND IT TO.
//
// Maya: asked to make its
// Summary fix the next version of october-investor-update.md, her agent said
// "I couldn't make this version 4 of the same file ... The only tool that does
// that sends the file to a person on the team. This thread has no one on it
// except you, so it refused." versionOf was on team_tell and team_task only,
// and both need somebody to write to. An agent that copied her document into
// its own folder to edit it made a second file of the same name.
//
// What must NOT change: a document with a new name is saved where it was
// asked, and writing the same path again updates it in place.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { filesOf } from '../main/files-place.mts';

let tools; let product; let dir; let work; let store; let row;

const build = async (ownItem) => {
  ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem }));
};
const write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
const said = (r) => JSON.parse(r.content[0].text);
const lines = () => store.readItemHistory(dir, row.id, { max: 1000 });
const inFiles = () => filesOf([{ ref: { kind: 'thread', product: product.id, id: row.id }, title: 'Investor update', project: product.name, lines: lines() }]);

beforeEach(async () => {
  process.env.STORE_ACCOUNT_ID = 'acct-next-version';
  fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-next-version'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', 'acct-next-version', product.id);
  work = await import('../mcp/core/work.mts');
  store = await import('../main/store/work-items.mts');
  row = work.createItem(product.id, { title: 'Fix the Summary of the investor update', labels: ['founder'] }, { source: 'founder' });
  process.env.ZERO_PRODUCT = product.id;
  process.env.ZERO_ITEM = row.id;
  await build(row.id);
  await write({ path: 'updates/october-investor-update.md', title: 'October investor update', content: '# October\n40 more clinics\n' });
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

describe('write_document with versionOf', () => {
  it('saves the next version of the file on a thread with only its owner on it', async () => {
    const r = said(await write({ versionOf: 'october-investor-update.md', content: '# October\n42 clinics\n' }));
    expect(r.path).toBe(`designs/${row.id}/october-investor-update-v2.md`);
    expect(r.onThread).toBe(true);
    expect(fs.readFileSync(path.join(dir, r.path), 'utf8')).toMatch(/42 clinics/);
    expect(fs.readFileSync(path.join(dir, 'updates/october-investor-update.md'), 'utf8')).toMatch(/40 more/);
    const files = inFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'october-investor-update.md', versions: 2 });
  });

  it('counts the versions the thread already has, so v3 is followed by v4', async () => {
    store.updateWorkItem(dir, row.id, { note: '[v2](designs/a/october-investor-update-v2.md) [v3](designs/a/october-investor-update-v3.md)' }, { source: 'agent' });
    const r = said(await write({ versionOf: 'october-investor-update.md', content: 'x' }));
    expect(r.path).toBe(`designs/${row.id}/october-investor-update-v4.md`);
  });
});

describe('write_document without versionOf', () => {
  it('a copy of a file on this thread, saved somewhere else under its name, is its next version', async () => {
    const r = said(await write({ path: 'drafts/october-investor-update.md', title: 'October investor update', content: '# October\n42\n' }));
    expect(r.path).toBe(`designs/${row.id}/october-investor-update-v2.md`);
    expect(r.versionOf).toBe('october-investor-update.md');
    expect(fs.existsSync(path.join(dir, 'drafts/october-investor-update.md'))).toBe(false);
    expect(inFiles()[0].versions).toBe(2);
  });

  it('a document with a new name goes where it was asked', async () => {
    const r = said(await write({ path: 'updates/october-metrics.md', title: 'Metrics', content: 'x' }));
    expect(r.path).toBe('updates/october-metrics.md');
    expect(r.versionOf).toBeUndefined();
  });

  it('the same path written again is updated in place', async () => {
    const r = said(await write({ path: 'updates/october-investor-update.md', content: '# October\n41\n' }));
    expect(r.path).toBe('updates/october-investor-update.md');
    expect(inFiles()[0].versions).toBe(1);
  });
});

describe('what an agent is told', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('write_document offers versionOf, and the rules say a revision is the next version', () => {
    expect(read('mcp/tools.mts')).toMatch(/name: 'write_document'[\s\S]*?versionOf: z\.string\(\)\.optional\(\)[\s\S]*?name: 'list_skills'/);
    expect(read('briefs/message-rules.md')).toMatch(/A CHANGE TO A FILE SOMEONE ALREADY HAS IS ITS NEXT VERSION/);
  });
});
