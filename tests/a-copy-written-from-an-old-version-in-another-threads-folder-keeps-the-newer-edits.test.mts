// A COPY WRITTEN FROM AN OLD VERSION IN ANOTHER THREAD'S FOLDER KEEPS THE NEWER EDITS.
//
// What broke (w-5f87b9f03c, the multiplayer Loom script): an agent wrote v46 in
// designs/<loom thread>/, and the person edited it in the app into v47 to v52 in
// that same folder. A second thread was briefed with v46's path. read_document
// gave v46 back with replacedBy null, and write_document with versionOf v46
// saved designs/<tweet thread>/...-v47.md: a second v47, built on v46, with the
// person's six edits gone. The guard that merges against the newest version
// only knew the versions named on the writing thread and in Files, and none of
// the Loom thread's versions are either.
//
// Measured on the store: designs/w-0a9a000e0c76 held v46 to v52, and the copy
// written from v46 was numbered v47 and carried none of v47 to v52.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';

let tools; let product; let dir; let row;
const OTHER = 'designs/w-loomthread';
const NAME = (n) => `2026-11-19-loom-script-v${n}.md`;

const script = ({ opener = 'Hey, quick one.', cast = 'Alice and Bob', close = 'Thanks for watching.' } = {}) => [
  '# Loom script', '', opener, '', `Today ${cast} run agents together.`, '', 'The middle stays the same.', '', close, '',
].join('\n');

const tool = (name) => tools.find((t) => t.name === name);
const write = (fields) => tool('write_document').run({ product: product.id, ...fields });
const said = (r) => JSON.parse(r.content[0].text);
const text = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const put = (rel, words) => { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), words); };

beforeEach(async () => {
  process.env.STORE_ACCOUNT_ID = 'acct-old-version-elsewhere';
  fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-old-version-elsewhere'), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  product = (await import('../mcp/core/products.mts')).createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', 'acct-old-version-elsewhere', product.id);
  row = (await import('../mcp/core/work.mts')).createItem(product.id, { title: 'Multiplayer tweet' }, { source: 'agent' });
  process.env.ZERO_PRODUCT = product.id;
  process.env.ZERO_ITEM = row.id;
  ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id }));
  put(`${OTHER}/${NAME(46)}`, script());
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

/** The person's six saves in the app after v46, ending on a new cast. */
const personEdits = () => {
  for (let n = 47; n <= 51; n += 1) put(`${OTHER}/${NAME(n)}`, script({ cast: `Alice and Bob (${n})` }));
  put(`${OTHER}/${NAME(52)}`, script({ cast: 'Alice, Jensen and Lori' }));
};

describe('the reported case: written from v46 while v52 is newest', () => {
  it('merges the person\'s v52 into the copy and numbers it past v52', async () => {
    personEdits();
    const r = said(await write({ versionOf: NAME(46), content: script({ opener: 'Here\'s how it works.' }) }));
    expect(r.path).toBe(`designs/${row.id}/${NAME(53)}`);
    expect(text(r.path)).toBe(script({ opener: 'Here\'s how it works.', cast: 'Alice, Jensen and Lori' }));
    expect(r.merged).toBe(`${OTHER}/${NAME(52)}`);
    expect(r.note).toMatch(/kept the edit/i);
  });

  it('does the same when versionOf is the whole path', async () => {
    personEdits();
    const r = said(await write({ versionOf: `${OTHER}/${NAME(46)}`, content: script({ close: 'Bye.' }) }));
    expect(r.path).toBe(`designs/${row.id}/${NAME(53)}`);
    expect(text(r.path)).toBe(script({ cast: 'Alice, Jensen and Lori', close: 'Bye.' }));
  });

  it('is refused, naming v52, when both changed the same lines', async () => {
    personEdits();
    const r = await write({ versionOf: NAME(46), content: script({ cast: 'Carol and Dan' }) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain(`${OTHER}/${NAME(52)}`);
    expect(fs.existsSync(path.join(dir, `designs/${row.id}`))).toBe(false);
  });

  it('read_document on v46 says v52 is newer and gives its words', async () => {
    personEdits();
    const r = said(await tool('read_document').run({ product: product.id, path: `${OTHER}/${NAME(46)}` }));
    expect(r.replacedBy).toBe(`${OTHER}/${NAME(52)}`);
    expect(r.newestVersion).toBe(`${OTHER}/${NAME(52)}`);
    expect(r.content).toBe(script({ cast: 'Alice, Jensen and Lori' }));
  });
});

describe('must not change', () => {
  it('a copy of the newest version: saved as written, numbered next', async () => {
    const r = said(await write({ versionOf: NAME(46), content: script({ opener: 'New opener.' }) }));
    expect(r.path).toBe(`designs/${row.id}/${NAME(47)}`);
    expect(r.merged).toBeUndefined();
    expect(text(r.path)).toBe(script({ opener: 'New opener.' }));
  });

  it('an agent that read v52 and names v46: its words are already on top, so nothing is merged', async () => {
    personEdits();
    const r = said(await write({ versionOf: NAME(46), content: script({ opener: 'New opener.', cast: 'Alice, Jensen and Lori' }) }));
    expect(r.path).toBe(`designs/${row.id}/${NAME(53)}`);
    expect(r.merged).toBeUndefined();
  });

  it('a file of another name in the same folder', async () => {
    personEdits();
    put(`${OTHER}/2026-11-19-tweet-hooks-v9.md`, 'other words\n');
    const r = said(await write({ versionOf: NAME(46), content: script({ opener: 'X.' }) }));
    expect(r.path).toBe(`designs/${row.id}/${NAME(53)}`);
  });

  it('read_document on the newest version gives it as it is', async () => {
    personEdits();
    const r = said(await tool('read_document').run({ product: product.id, path: `${OTHER}/${NAME(52)}` }));
    expect(r.replacedBy).toBeNull();
    expect(r.newestVersion).toBeUndefined();
  });
});
