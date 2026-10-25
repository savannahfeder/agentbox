// "It asked, 'You've been doing these recurring tasks. Do you want me to make a
// teammate?' ... My assumption was that it was going to go through all those
// tasks and figure out how they work. It just sent a very vague message to set
// up a teammate." Tapping Make it opened a new teammate on five thread titles
// and nothing else: the asks, the work done in them and every correction the
// person gave were on disk and never reached it. Mira set herself up from the
// titles and asked one question. Now the offer keeps which threads it came
// from, and the new teammate's setup brief carries what was said in each,
// your words whole, with orders to learn from them before asking anything.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { offerFrom, threadsDigest, OFFER_LABEL, OFFER_MAKE } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 24, 9, 0).getTime();
const DAY = 86_400_000;

describe('the offer of a teammate', () => {
  it('keeps every thread it came from, and none it did not', () => {
    const ask = (id, title, ago) => ({ id, product: 'site', title, labels: ['founder'], status: 'done', createdAt: NOW - ago * DAY });
    const items = [
      ask('w-1', 'Agentbox launch video, version 3', 2),
      ask('w-2', 'Agentbox launch video, cut the intro', 6),
      ask('w-3', 'Agentbox launch video for the phone app', 9),
      ask('w-4', 'Fix the login button', 1),
    ];
    const offer = offerFrom({ items, now: NOW });
    expect(offer.threads.map((t) => t.id).sort()).toEqual(['w-1', 'w-2', 'w-3']);
    expect(offer.threads[0]).toEqual({ product: 'site', id: 'w-1', title: 'Agentbox launch video, version 3' });
  });
});

describe('what a new teammate reads of those threads', () => {
  const turns = {
    'w-1': [
      { source: 'founder', field: 'body', text: 'Make a launch video for agentbox, 40 seconds.' },
      { source: 'agent', field: 'result', text: 'Here are two cuts. '.repeat(200) },
      { source: 'founder', field: 'answer', text: 'Too slow at the start. Always open on the product, never a logo.' },
    ],
    'w-2': [{ source: 'founder', field: 'body', text: 'Cut the intro.' }, { source: 'system', field: 'note', text: 'Moved to Later' }],
  };
  const read = (product, id) => turns[id] ?? [];
  const threads = [{ product: 'site', id: 'w-1', title: 'Launch video' }, { product: 'site', id: 'w-2', title: 'Cut the intro' }, { product: 'site', id: 'w-9', title: 'Gone' }];

  it('keeps your words whole and cuts the agent\'s long replies short', () => {
    const text = threadsDigest(threads, read);
    expect(text).toContain('### Launch video (site/w-1)');
    expect(text).toContain('You: Make a launch video for agentbox, 40 seconds.');
    expect(text).toContain('You: Too slow at the start. Always open on the product, never a logo.');
    expect(text).toMatch(/Agent: Here are two cuts\.[^\n]{0,1300}…/);
    expect(text).not.toMatch(/Here are two cuts\.[^\n]{1400}/);
  });

  it('leaves out the app\'s own notes, and still names a thread it cannot read', () => {
    const text = threadsDigest(threads, read);
    expect(text).not.toContain('Moved to Later');
    expect(text).toContain('### Gone (site/w-9)');
  });

  it('stays inside its budget however long the threads are, and is nothing for no threads', () => {
    const long = { 'w-1': Array.from({ length: 60 }, (_, i) => ({ source: 'founder', field: 'answer', text: `Note ${i} `.repeat(80) })) };
    expect(threadsDigest([threads[0]], (p, id) => long[id], { cap: 6000 }).length).toBeLessThanOrEqual(6000);
    expect(threadsDigest([], read)).toBe('');
  });
});

describe('making a teammate from the offer', () => {
  it('hands its setup run what was said in every thread behind it, and tells it to learn from that first', async () => {
    const { loadStore } = await import('../main/store-modules.mjs');
    const { Teammates } = await import('../main/teammates.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-learn-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    const ids = [];
    for (const [title, ago, said] of [
      ['Write this week’s changelog from the merged PRs', 2, 'Group by what users notice, not by PR.'],
      ['Write the changelog for the merged PRs this week', 9, 'No internal refactors in it, ever.'],
      ['Changelog: write it up from merged PRs', 16, 'Shorter. One line per change.'],
    ]) {
      const made = w.createWorkItem(root, { title, labels: ['founder'] }, { source: 'founder', now: now - ago * DAY });
      w.updateWorkItem(root, made.id, { result: 'Here is the changelog draft.' }, { source: 'agent', now: now - ago * DAY + 1000 });
      w.updateWorkItem(root, made.id, { answer: said }, { source: 'founder', now: now - ago * DAY + 2000 });
      w.updateWorkItem(root, made.id, { status: 'done' }, { source: 'founder', now: now - ago * DAY + 3000 });
      ids.push(made.id);
    }
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer-learn' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
      readHistory: (slug, id, opts) => w.readItemHistory(root, id, opts),
    };
    const team = new Teammates(store);
    await team.tick({ items: store.listItems(), now });
    const offer = store.listItems().find((i) => (i.labels ?? []).includes(OFFER_LABEL));
    w.updateWorkItem(root, offer.id, { answer: OFFER_MAKE }, { source: 'founder', now });
    await team.tick({ items: store.listItems(), now });

    const [mate] = team.list();
    const opening = team.chat().messages.find((m) => m.kind === 'msg' && m.setup && m.to?.includes(mate.id));
    expect(opening.threads.map((t) => t.id).sort()).toEqual([...ids].sort());
    // A tight list: a blank line between items drew a gap a line high in the chat.
    expect(opening.text).not.toMatch(/\n\n- /);
    expect(opening.text.match(/^- /gm)).toHaveLength(3);

    const brief = team.briefFor({ id: 'w-setup', labels: ['founder', `teammate:${mate.id}`, 'hop:0'] }, now);
    expect(brief).toContain('## The threads you come from');
    for (const said of ['Group by what users notice, not by PR.', 'No internal refactors in it, ever.', 'Shorter. One line per change.']) expect(brief).toContain(`You: ${said}`);
    expect(brief).toMatch(/read every thread under[^\n]*team_remember/i);

    // Once it is set up, its runs carry what it learned, not the threads again.
    const { writeTeammate } = await import('../main/store/teammates-files.mjs');
    writeTeammate(team.dir(), mate.id, { status: 'active' }, now);
    expect(team.briefFor({ id: 'w-next', labels: ['founder', `teammate:${mate.id}`, 'hop:0'] }, now)).not.toContain('## The threads you come from');
  });
});

// The same opening drew each item a blank line apart: the chat keeps every
// newline (rooms.css, `.rm-cm .tx`), and markdown puts one between list items.
describe('a list in the team chat', () => {
  it('is drawn without a blank line between its items', () => {
    const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.rm-cm\.tq-m \.tx ul, \.rm-cm\.tq-m \.tx ol \{[^}]*white-space: normal;/);
  });
});
