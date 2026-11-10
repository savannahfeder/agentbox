// A TEAMMATE'S NEXT VERSION OF ITS OWN DOCUMENT IS NEVER REFUSED (w-cb4ca690d4).
//
// What broke: on the "Set up a new teammate" thread (a teammate's own thread),
// write_document with versionOf refused next versions as "changed since you
// read it, and your words change the same lines" five times in a day: once
// when the new version was the last one word for word plus a section at the
// end, nobody having touched it, and again after a person's edit the agent had
// already read and kept. Only replacesEdits got them through.
//
// Measured here: the agent's own saves are named on its thread with no voice,
// so they read as "Agent", while the check for "its own version" compared that
// with the teammate's name. Every version it wrote looked like somebody else's,
// the merge ran against an older version, and its own earlier changes counted
// as the other side.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { legacyRoot } from '../main/store/project.mts';
import { saveNextVersion } from '../main/file-version.mts';
import { writeTeammate, teamDir } from '../main/store/teammates-files.mts';

let tools; let product; let dir; let store; let row;

const plan = (one, two, three = 'Ship the first draft.') => [
  '# Week 1', '', '## Day 1', '', one, '', '## Day 2', '', two, '', '## Day 3', '', three, '',
].join('\n');

const write = (fields) => tools.find((t) => t.name === 'write_document').run({ product: product.id, ...fields });
const said = (r) => {
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};
const lines = () => store.readItemHistory(dir, row.id, { max: 1000 });
const text = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const editByHand = (words) => {
  const saved = saveNextVersion({ dir, threadId: row.id, lines: lines(), baseId: 'week-1.md', text: words });
  expect(saved.ok, saved.error).toBe(true);
  store.updateWorkItem(dir, row.id, { artifact: { do: 'edit', file: saved.file, path: saved.path, ...(saved.over ? { over: saved.over } : {}) } }, { source: 'founder' });
  return saved.path;
};

for (const who of ['a teammate', 'a plain agent']) {
  describe(`${who} writing its next version`, () => {
    beforeEach(async () => {
      const acct = `acct-own-${Math.random().toString(36).slice(2, 8)}`;
      process.env.STORE_ACCOUNT_ID = acct;
      fs.mkdirSync(path.join(appHome(), 'accounts', acct), { recursive: true });
      (await import('../mcp/core/account.mts')).resolveAccount();
      const { createProduct } = await import('../mcp/core/products.mts');
      product = createProduct(`Company ${Math.random().toString(36).slice(2, 8)}`);
      dir = path.join(appHome(), 'accounts', acct, product.id);
      const work = await import('../mcp/core/work.mts');
      store = await import('../main/store/work-items.mts');
      const labels = ['founder'];
      if (who === 'a teammate') {
        writeTeammate(teamDir(legacyRoot(), acct), 't-a1b2c3', { name: 'YC Partner', status: 'active' });
        labels.push('teammate:t-a1b2c3');
      }
      row = work.createItem(product.id, { title: 'Set up a new teammate', labels }, { source: 'founder' });
      process.env.ZERO_PRODUCT = product.id;
      process.env.ZERO_ITEM = row.id;
      ({ tools } = (await import('../mcp/tools.mts')).buildTools({ holder: 'test-worker', ownItem: row.id }));
      said(await write({ path: 'plans/week-1.md', title: 'Week 1', content: plan('Meet the team.', 'Read the code.') }));
      said(await write({ versionOf: 'week-1.md', content: plan('Meet the team and the founders.', 'Read the code, then pair.') }));
    });
    afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_PRODUCT; delete process.env.ZERO_ITEM; });

    it('saves its last version plus a section at the end, word for word', async () => {
      const content = `${plan('Meet the team and the founders.', 'Read the code, then pair.')}## Day 4\n\nDemo.\n`;
      const r = said(await write({ versionOf: 'week-1.md', content }));
      expect(r.merged).toBeUndefined();
      expect(text(r.path)).toBe(content);
    });

    it('rewrites the sections it changed last time without a clash', async () => {
      const content = plan('Meet everyone on day one.', 'Pair on a real bug.');
      const r = said(await write({ versionOf: 'week-1.md', content }));
      expect(text(r.path)).toBe(content);
    });

    it('saves a version written from a person\'s edit it read, around the line they typed', async () => {
      editByHand(plan('Meet the team and the founders.\nA: yes, Monday works.', 'Read the code, then pair.'));
      // Read, kept their line, and rewrote the lines either side of it.
      const content = plan('Meet the whole team.\nA: yes, Monday works.\nThen lunch.', 'Pair on a real bug.');
      const r = said(await write({ versionOf: 'week-1.md', content }));
      expect(text(r.path)).toBe(content);
    });

    it('still keeps a person\'s edit it never read', async () => {
      editByHand(plan('Meet the team and the founders.', 'Read the code, then pair.', 'Ship it by Friday.'));
      const r = said(await write({ versionOf: 'week-1.md', content: plan('Meet everyone on day one.', 'Read the code, then pair.') }));
      expect(text(r.path)).toContain('Ship it by Friday.');
      expect(text(r.path)).toContain('Meet everyone on day one.');
    });

    it('is still refused when it rewrites the very line a person changed without reading it', async () => {
      editByHand(plan('Meet the team on Tuesday instead.', 'Read the code, then pair.'));
      const r = await write({ versionOf: 'week-1.md', content: plan('Meet everyone on day one.', 'Read the code, then pair.') });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/changed since you read it/);
    });
  });
}
