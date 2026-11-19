// write_document's versionOf checked a path for a leading ".." before
// resolving it, so "designs/../../<anywhere>/notes.md" passed. The versions
// beside it were read and merged into a new file in the product, which the
// agent could then read: a cloud agent, whose store calls the Mac answers,
// copied a markdown file from outside the documents (reproduced 2026-11-19
// with notes.md and notes-v2.md in a folder beside the store). read_document
// already refused the same path.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';

let tools; let product; let dir; let row; let outside: string;
const tool = (name) => tools.find((t) => t.name === name);
const write = (fields) => tool('write_document').run({ product: product.id, ...fields });
const put = (file, words) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, words); };
const older = '# Notes\n\nOne.\n\nTwo.\n\nThree.\n';
const newer = '# Notes\n\nOne.\n\nTwo.\n\nThree.\n\nSECRET-LINE\n';

const filesUnder = (root: string): string[] => {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true, recursive: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name));
};
const copiedIn = () => filesUnder(path.join(dir, 'designs')).filter((f) => fs.readFileSync(f, 'utf8').includes('SECRET-LINE'));

beforeEach(async () => {
  process.env.STORE_ACCOUNT_ID = 'acct-version-outside';
  fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-version-outside'), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  product = (await import('../mcp/core/products.mts')).createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', 'acct-version-outside', product.id);
  row = (await import('../mcp/core/work.mts')).createItem(product.id, { title: 'Notes' }, { source: 'agent' });
  process.env.ZERO_PRODUCT = product.id;
  process.env.ZERO_ITEM = row.id;
  ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id }));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-docs-'));
  put(path.join(outside, 'notes.md'), older);
  put(path.join(outside, 'notes-v2.md'), newer);
});
afterEach(() => {
  fs.rmSync(outside, { recursive: true, force: true });
  delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM;
});

const climbing = () => `designs/${path.relative(path.join(dir, 'designs'), path.join(outside, 'notes.md')).split(path.sep).join('/')}`;

describe('versionOf naming a file outside the documents', () => {
  it('copies none of it in when the path climbs out through designs/', async () => {
    const asked = climbing();
    expect(asked.startsWith('designs/../')).toBe(true);
    const r = await write({ versionOf: asked, content: older.replace('One.', 'Uno.') });
    expect(copiedIn()).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(outside);
  });

  it('does not name the file beside it when the merge would conflict', async () => {
    const r = await write({ versionOf: climbing(), content: 'zzz\n' });
    expect(JSON.stringify(r)).not.toContain(path.basename(outside));
    expect(r.isError).toBeFalsy();
  });

  it('copies none of it in given as a whole path', async () => {
    await write({ versionOf: path.join(outside, 'notes.md'), content: older.replace('One.', 'Uno.') });
    expect(copiedIn()).toEqual([]);
  });

  it('still merges a version named by a path inside the documents that climbs and comes back', async () => {
    const other = path.join(dir, 'designs/w-other');
    put(path.join(other, 'notes.md'), older);
    put(path.join(other, 'notes-v2.md'), newer);
    await write({ versionOf: 'designs/w-other/../w-other/notes.md', content: older.replace('One.', 'Uno.') });
    expect(copiedIn().some((f) => f.includes(row.id))).toBe(true);
  });
});
