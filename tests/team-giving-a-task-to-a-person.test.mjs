// GIVING A TASK TO A PERSON, AND THE PERSON PASSING IT ON.
//
// "Who does it" in the composer names Claude Code, Codex or a teammate
// (approved 2026-09-30, w-e731ca9376). A task given to a person carries who
// has to do it, when it is due, and the two people on it, so a reply can hand
// it back. Afterwards only a person moves it on (to an agent, kept, handed
// back), and that is written on a person's authority so an agent writing
// later cannot quietly take it back.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-give-'));
  const accountRoot = path.join(root, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  return new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
}

describe('giving a task to a person', () => {
  it('writes who does it, when, and the two people on it', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Website' });
    const row = s.composeItem(slug, { title: 'Send Acme their renewal terms', assignee: 'p-maya', due: '2026-10-02', people: ['p-me', 'p-maya'] });
    expect(row).toMatchObject({ assignee: 'p-maya', due: '2026-10-02', people: ['p-me', 'p-maya'] });
  });

  it('writes none of it for a task an agent does', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Website' });
    const row = s.composeItem(slug, { title: 'Draft the renewal email' });
    expect(row.assignee).toBeUndefined();
    expect(row.people).toBeUndefined();
  });
});

describe('passing it on', () => {
  it('changes only who it is with', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Website' });
    const row = s.composeItem(slug, { title: 't', assignee: 'p-maya' });
    const after = s.teamPatch(slug, row.id, { assignee: 'agent', runner: 'p-maya', title: 'renamed', status: 'done' });
    expect(after).toMatchObject({ assignee: 'agent', runner: 'p-maya', title: 't', status: 'open' });
  });

  it('refuses a change that touches none of the team fields', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Website' });
    const row = s.composeItem(slug, { title: 't' });
    expect(() => s.teamPatch(slug, row.id, { title: 'x' })).toThrow(/nothing to change/);
  });

  it('is not undone by an agent writing afterwards', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Website' });
    const row = s.composeItem(slug, { title: 't', assignee: 'p-maya' });
    s.teamPatch(slug, row.id, { assignee: 'p-theo' });
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row.id, { assignee: 'p-maya' }, { source: 'agent' });
    expect(s.readItem(slug, row.id).assignee).toBe('p-theo');
  });
});
