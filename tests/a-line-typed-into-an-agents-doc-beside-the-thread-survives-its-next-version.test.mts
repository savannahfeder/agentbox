// A LINE TYPED INTO AN AGENT'S DOCUMENT BESIDE THE THREAD SURVIVES ITS NEXT VERSION (w-cb4ca690d4).
//
// What broke: the document beside a thread saves a person's typing over the
// file itself (zero:write-doc), not as a new version. Nothing kept the words
// the agent had written, so the file still looked like the agent's own, and
// an agent writing its next version from the copy it remembered dropped the
// person's line without a word.
//
// Measured in a power test on stand-ins: a founder typed "Side view edit:
// buddy is Sam." at the end of week-1-plan.md, replied, and week-1-plan-v2.md
// came back without it, on an ordinary thread and on a teammate's thread.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { legacyRoot } from '../main/store/project.mts';
import { writeTeammate, teamDir } from '../main/store/teammates-files.mts';

let tools; let product; let dir; let row;

const PLAN = '# Week 1\n\nStatus: draft 1\n\n## Day 1\n\n- Meet the team.\n\n## Questions\n\nA. Who is their buddy?\n';
const BY_HAND = 'My answer: buddy is Sam.\n';

const write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
const said = (r) => {
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};
const text = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
/** What the document beside the thread does: the file itself, rewritten. */
const typeBeside = (rel, words) => fs.writeFileSync(path.join(dir, rel), words);

for (const who of ['a teammate', 'a plain agent']) {
  describe(`${who}'s next version after a person typed into its document beside the thread`, () => {
    let first;
    beforeEach(async () => {
      const acct = `acct-beside-${Math.random().toString(36).slice(2, 8)}`;
      process.env.STORE_ACCOUNT_ID = acct;
      fs.mkdirSync(path.join(appHome(), 'accounts', acct), { recursive: true });
      (await import('../mcp/core/account.mts')).resolveAccount();
      const { createProduct } = await import('../mcp/core/products.mts');
      product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
      dir = path.join(appHome(), 'accounts', acct, product.id);
      const work = await import('../mcp/core/work.mts');
      const labels = ['founder'];
      if (who === 'a teammate') {
        writeTeammate(teamDir(legacyRoot(), acct), 't-a1b2c3', { name: 'YC Partner', status: 'active' });
        labels.push('teammate:t-a1b2c3');
      }
      row = work.createItem(product.id, { title: 'Set up a new teammate', labels }, { source: 'founder' });
      process.env.ZERO_PRODUCT = product.id;
      process.env.ZERO_ITEM = row.id;
      ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id }));
      first = said(await write({ path: `designs/${row.id}/week-1.md`, title: 'Week 1', content: PLAN })).path;
    });
    afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

    it('keeps the line when the agent writes from the copy it remembers', async () => {
      typeBeside(first, PLAN + BY_HAND);
      const r = said(await write({ versionOf: 'week-1.md', content: PLAN.replace('draft 1', 'draft 2') }));
      expect(text(r.path)).toBe((PLAN + BY_HAND).replace('draft 1', 'draft 2'));
    });

    it('keeps it on a later version too', async () => {
      const second = said(await write({ versionOf: 'week-1.md', content: PLAN.replace('draft 1', 'draft 2') })).path;
      typeBeside(second, PLAN.replace('draft 1', 'draft 2') + BY_HAND);
      const r = said(await write({ versionOf: 'week-1.md', content: PLAN.replace('draft 1', 'draft 3') }));
      expect(text(r.path)).toContain(BY_HAND);
      expect(text(r.path)).toContain('draft 3');
    });

    it('saves a version written from the edited file as it was written', async () => {
      typeBeside(first, PLAN + BY_HAND);
      const content = (PLAN + BY_HAND).replace('A. Who is their buddy?\n', 'A. Sam is their buddy.\n').replace('draft 1', 'draft 2');
      const r = said(await write({ versionOf: 'week-1.md', content }));
      expect(text(r.path)).toBe(content);
    });

    it('is refused, and saves nothing, when the agent rewrites the line the person changed', async () => {
      typeBeside(first, PLAN.replace('- Meet the team.', '- Meet the team on Tuesday.'));
      const r = await write({ versionOf: 'week-1.md', content: PLAN.replace('- Meet the team.', '- Meet everyone.') });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/changed since you read it/);
    });

    it('leaves an untouched document alone', async () => {
      const content = PLAN.replace('draft 1', 'draft 2');
      const r = said(await write({ versionOf: 'week-1.md', content }));
      expect(r.merged).toBeUndefined();
      expect(text(r.path)).toBe(content);
    });
  });
}
