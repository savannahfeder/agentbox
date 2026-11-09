// A MOVED THREAD OPENS WITH YOUR WORDS AND TAKES YOU THERE (w-8b637c7802).
//
// Three synthetic testers moved an answered thread with ⌘K. The new thread's
// first message read "Moved here from Backend." and nothing of what they had
// asked, a reply still waiting for the agent was dropped, and the screen stayed
// on the old row, now closed, so two of them reopened it and had two copies.
// Measured through the store's move and the app's code for after it.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { movedHere } from '../shared/move-thread.mts';
import { listedNow, OPENS_WITHIN_MS } from '../renderer/src/opens-when-listed.ts';

let store, root;
const project = (slug, name) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name }));
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-words-'));
  project('website', 'Website');
  project('company', 'Company');
  store = await new Store({ accountRoot: root, products: [] }).init();
});
const agentSays = (slug, id, result) => store.modules.workItemsDisk.updateWorkItem(store.productDir(slug), id, { result }, { source: 'agent' });

describe('the moved thread’s first message', () => {
  it('is what you asked, when you asked it in one line', () => {
    const made = store.composeItem('website', { title: "Draft this month's investor update" });
    agentSays('website', made.id, 'Here is a draft.');
    const out = store.moveItem('website', made.id, 'company');
    const body = store.readItem('company', out.item.id).body;
    expect(body.startsWith("Draft this month's investor update")).toBe(true);
    expect(body.endsWith(movedHere('Website'))).toBe(true);
  });

  it('keeps a body you wrote under a subject, as it was', () => {
    const made = store.composeItem('website', { title: 'Pricing page', body: 'The annual toggle shows monthly prices.' });
    agentSays('website', made.id, 'Fixed.');
    const body = store.readItem('company', store.moveItem('website', made.id, 'company').item.id).body;
    expect(body).toBe(`The annual toggle shows monthly prices.\n\n${movedHere('Website')}`);
  });

  it('carries what you added after as your replies, the one still waiting as the one owed an answer', () => {
    const made = store.composeItem('website', { title: 'Write a short help article' });
    agentSays('website', made.id, 'Draft one.');
    store.answerItem('website', made.id, { answer: 'Shorter, and link the pricing page.' });
    store.answerItem('website', made.id, { answer: 'Also add a screenshot.' });
    const id = store.moveItem('website', made.id, 'company').item.id;
    const landed = store.readItem('company', id);
    expect(landed.body).toBe(['Write a short help article', movedHere('Website')].join('\n\n'));
    expect(store.readThread('company', id).filter((t) => t.field === 'answer').map((t) => t.text))
      .toEqual(['Shorter, and link the pricing page.', 'Also add a screenshot.']);
    expect(landed.answer).toBe('Also add a screenshot.');
    expect(landed.status).toBe('open');
  });

  it('folds your replies into the message of a thread nothing ran on, since the run starts from it', () => {
    const made = store.composeItem('website', { title: 'Write a short help article' });
    store.answerItem('website', made.id, { answer: 'Shorter, and link the pricing page.' });
    const body = store.readItem('company', store.moveItem('website', made.id, 'company').item.id).body;
    expect(body).toBe(['Write a short help article', 'Shorter, and link the pricing page.', movedHere('Website')].join('\n\n'));
  });

  it('a thread nothing ran on moves as before: its words, then where it came from', () => {
    const made = store.composeItem('website', { title: 'Tidy the footer' });
    const body = store.readItem('company', store.moveItem('website', made.id, 'company').item.id).body;
    expect(body).toBe(`Tidy the footer\n\n${movedHere('Website')}`);
  });
});

describe('after the move', () => {
  const row = { product: 'company', id: 'w-new' };
  it('opens the new thread as soon as it is in the lists', () => {
    const want = { ...row, at: 1000 };
    expect(listedNow(want, [], 1500)).toEqual({ open: null, keep: want });
    expect(listedNow(want, [{ product: 'company', id: 'w-new', title: 'x' }], 2000).open?.id).toBe('w-new');
  });
  it('gives up rather than jumping you somewhere later', () => {
    const want = { ...row, at: 1000 };
    expect(listedNow(want, [{ product: 'company', id: 'w-new' }], 1000 + OPENS_WITHIN_MS + 1)).toEqual({ open: null, keep: null });
  });
  it('never opens a row of the same id in another project', () => {
    expect(listedNow({ ...row, at: 1000 }, [{ product: 'website', id: 'w-new' }], 1200).open).toBe(null);
  });
  it('is asked for only when the moved thread was the one open', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    const move = app.slice(app.indexOf('const moveToProject = useCallback'), app.indexOf('const moveToProject = useCallback') + 2500);
    expect(move).toMatch(/focusedNow\.current\?\.id === item\.id[\s\S]*opensWhenListed\.current = /);
  });
});
