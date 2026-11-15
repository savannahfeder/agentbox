// AN AGENT'S NEXT VERSION NEVER LOSES THE EDIT A PERSON MADE.
//
// What broke (w-612d9c3d28, the YC application): the one-liner was changed by
// hand to "Manage hundreds of AI agents like email." four or five times and
// kept coming back as "An inbox for running hundreds of AI agents at once". The
// person's edits were v8, v9, v10 and v13; the agent's next versions were
// copied from the version the agent itself had written last (v6, v7, v12), so
// every hand edit was stepped over and nobody was told. A finished paragraph
// went the same way: a sentence deleted by hand came back.
//
// Measured on the chain in the store: v13 was a person's edit and v14, written
// from v12, said "An inbox for running…" again.
//
// So write_document now merges what the agent wrote against the newest version,
// with the version the agent started from as the base, and refuses when both
// changed the same lines rather than picking a winner silently.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { filesOf } from '../main/files-place.mts';
import { saveNextVersion } from '../main/file-version.mts';

let tools; let product; let dir; let store; let row;

const ONE_LINER = 'An inbox for running hundreds of AI agents at once';
const BY_HAND = 'Manage hundreds of AI agents like email.';
const draft = (one, why = 'Agents got good in 2026.') => [
  '# Agentbox', '', '## One-liner', '', one, '', '## Why now', '', why, '',
].join('\n');

const write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
const said = (r) => JSON.parse(r.content[0].text);
const lines = () => store.readItemHistory(dir, row.id, { max: 1000 });
const text = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const chain = () => filesOf([{ ref: { kind: 'thread', product: product.id, id: row.id }, title: 'Draft', project: product.name, lines: lines() }]);

/** The same save the big view makes when somebody edits the document by hand. */
const editByHand = (words) => {
  const saved = saveNextVersion({ dir, threadId: row.id, lines: lines(), baseId: 'application.md', text: words });
  expect(saved.ok, saved.error).toBe(true);
  store.updateWorkItem(dir, row.id, { artifact: { do: 'edit', file: saved.file, path: saved.path, ...(saved.over ? { over: saved.over } : {}) } }, { source: 'founder' });
  return saved.path;
};

beforeEach(async () => {
  process.env.STORE_ACCOUNT_ID = 'acct-no-lost-edit';
  fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-no-lost-edit'), { recursive: true });
  (await import('../mcp/core/account.mts')).resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(appHome(), 'accounts', 'acct-no-lost-edit', product.id);
  const work = await import('../mcp/core/work.mts');
  store = await import('../main/store/work-items.mts');
  row = work.createItem(product.id, { title: 'Write the YC application', labels: ['founder'] }, { source: 'founder' });
  process.env.ZERO_PRODUCT = product.id;
  process.env.ZERO_ITEM = row.id;
  ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id }));
  await write({ path: 'yc/application.md', title: 'YC application', content: draft(ONE_LINER) });
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

describe('an agent writing from the version it wrote last', () => {
  it('keeps the one-liner a person changed, and its own change beside it', async () => {
    editByHand(draft(BY_HAND));
    // The agent's copy of v1, with its own change in another section.
    const r = said(await write({ versionOf: 'application.md', content: draft(ONE_LINER, 'Agents got good in 2026, and nobody can watch them.') }));
    expect(r.path).toBe(`designs/${row.id}/application-v3.md`);
    expect(text(r.path)).toContain(BY_HAND);
    expect(text(r.path)).toContain('nobody can watch them');
    expect(text(r.path)).not.toContain(ONE_LINER);
    expect(r.merged).toBe(`designs/${row.id}/application-v2.md`);
    expect(r.note).toMatch(/kept the edit/i);
  });

  it('keeps a sentence a person deleted deleted', async () => {
    editByHand(draft(ONE_LINER, ''));
    const r = said(await write({ versionOf: 'application.md', content: draft(ONE_LINER).replace('# Agentbox', '# Agentbox (YC W27)') }));
    expect(text(r.path)).toContain('YC W27');
    expect(text(r.path)).not.toContain('Agents got good in 2026.');
  });

  it('is refused, and loses nothing, when both changed the same words', async () => {
    editByHand(draft(BY_HAND));
    const r = await write({ versionOf: 'application.md', content: draft('An inbox for your agents.') });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(new RegExp(`changed since you read it[\\s\\S]*designs/${row.id}/application-v2.md`));
    expect(fs.existsSync(path.join(dir, `designs/${row.id}/application-v3.md`))).toBe(false);
    expect(text(`designs/${row.id}/application-v2.md`)).toContain(BY_HAND);
  });

  it('leaves the ordinary write alone: the newest version is its own, so nothing is merged', async () => {
    const second = said(await write({ versionOf: 'application.md', content: draft(ONE_LINER, 'Agents got good in 2026, truly.') }));
    expect(second.path).toBe(`designs/${row.id}/application-v2.md`);
    expect(second.merged).toBeUndefined();
    const third = said(await write({ versionOf: 'application.md', content: draft('A third try.', 'Agents got good in 2026, truly.') }));
    expect(third.path).toBe(`designs/${row.id}/application-v3.md`);
    expect(third.merged).toBeUndefined();
    expect(text(third.path)).toContain('A third try.');
  });

  it('lands as one more version of the one file, however many times this happens', async () => {
    editByHand(draft(BY_HAND));
    // Round two: the agent's copy of v1 is merged into v3, so v3 holds both.
    const second = said(await write({ versionOf: 'application.md', content: draft(ONE_LINER, 'One.') }));
    expect(text(second.path)).toBe(draft(BY_HAND, 'One.'));
    // Round three: edited by hand again, then the agent writes from its own v3.
    editByHand(draft(BY_HAND, 'One.').replace('# Agentbox', '# Agentbox, by hand'));
    const r = said(await write({ versionOf: 'application.md', content: draft(BY_HAND, 'One. Two.') }));
    expect(text(r.path)).toContain(BY_HAND);
    expect(text(r.path)).toContain('by hand');
    expect(text(r.path)).toContain('One. Two.');
    const [file] = chain();
    expect(file.name).toBe('application.md');
    expect(file.versions).toBe(5);
  });
});

// The same loss from the other end: somebody typing in the big view started
// from the version it had open, and an agent's write landing meanwhile used to
// leave two siblings with one set of words each.
describe('a person saving from a version that is no longer the newest', () => {
  it('keeps what the agent wrote since, in the one version they save', async () => {
    await write({ versionOf: 'application.md', content: draft(ONE_LINER, 'Agents got good in 2026, and nobody can watch them.') });
    // Typed from v1, which was on screen before the agent's v2 arrived.
    const saved = saveNextVersion({ dir, threadId: row.id, lines: lines(), basePath: 'yc/application.md', text: draft(BY_HAND) });
    expect(saved).toMatchObject({ ok: true, path: `designs/${row.id}/application-v3.md`, over: 'application-v2.md' });
    expect(text(saved.path)).toContain(BY_HAND);
    expect(text(saved.path)).toContain('nobody can watch them');
  });

  it('keeps their own words when the two cannot be merged, and says the other version stands', async () => {
    await write({ versionOf: 'application.md', content: draft('An inbox for your agents.') });
    const saved = saveNextVersion({ dir, threadId: row.id, lines: lines(), basePath: 'yc/application.md', text: draft(BY_HAND) });
    expect(saved).toMatchObject({ ok: true, over: 'application-v2.md' });
    expect(text(saved.path)).toBe(draft(BY_HAND));
  });

  it('leaves a save from the newest version exactly as it was typed', async () => {
    const saved = saveNextVersion({ dir, threadId: row.id, lines: lines(), basePath: 'yc/application.md', text: draft(BY_HAND) });
    expect(saved.over).toBeUndefined();
    expect(text(saved.path)).toBe(draft(BY_HAND));
  });
});
