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

const DAY = 86_400_000;

// Since 2026-11-10 the offer is made on the thread itself, by Auto
// (tests/auto-offers-a-teammate-in-the-moment); a tap on it still hands the
// new teammate the thread it came from, whole.
describe('making a teammate from the offer on a thread', () => {
  it('hands its setup run what was said in the thread, and tells it to learn from that first', async () => {
    const { loadStore } = await import('../main/store-modules.mts');
    const { Teammates } = await import('../main/teammates.mts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-learn-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    const made = w.createWorkItem(root, { title: 'Write this week’s changelog from the merged PRs', labels: ['founder'] }, { source: 'founder', now: now - 2 * DAY });
    w.updateWorkItem(root, made.id, { result: 'Here is the changelog draft.' }, { source: 'agent', now: now - 2 * DAY + 1000 });
    w.updateWorkItem(root, made.id, { answer: 'Group by what users notice, not by PR.' }, { source: 'founder', now: now - 2 * DAY + 2000 });
    w.updateWorkItem(root, made.id, { routed: { to: 'agent', why: 'x', at: now, by: 'auto', offer: { role: 'Changelog writer', why: 'It is every week.', gains: ['Learns what your users notice', 'Carries on from this changelog', 'Writes it every Friday, and asks you before it posts'] } } }, { source: 'system', now: now - 2 * DAY + 3000 });
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer-learn' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
      readHistory: (slug, id, opts) => w.readItemHistory(root, id, opts),
    };
    const team = new Teammates(store);
    const item = store.listItems().find((i) => i.id === made.id);
    team.answerOffer(item, true, now);

    const [mate] = team.list();
    const opening = team.chat().messages.find((m) => m.kind === 'msg' && m.setup && m.to?.includes(mate.id));
    expect(opening.threads.map((t) => t.id)).toEqual([made.id]);
    expect(opening.text).toMatch(/^Changelog writer\. Take on work like this thread/);
    // The card's three reasons are what the person said yes to, so they are its job.
    expect(opening.text).toContain('Writes it every Friday, and asks you before it posts');
    expect(store.listItems().find((i) => i.id === made.id).routed.offer.answered).toBe('made');

    const brief = team.briefFor({ id: 'w-setup', labels: ['founder', `teammate:${mate.id}`, 'hop:0'] }, now);
    expect(brief).toContain('## The threads you come from');
    const files = [...brief.matchAll(/^- (\/\S+\.md) \(/gm)].map((m) => m[1]);
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(files[0], 'utf8')).toContain('Group by what users notice, not by PR.');
    expect(brief).toMatch(/read every file under "The threads you come from"[^\n]*write your method/i);

    // Once it has written its method, its runs carry the method, not the threads again.
    const { methodFile } = await import('../main/store/teammates-files.mts');
    fs.mkdirSync(path.dirname(methodFile(team.dir(), mate.id)), { recursive: true });
    fs.writeFileSync(methodFile(team.dir(), mate.id), '# Method\n- Group by what users notice.\n');
    const next = team.briefFor({ id: 'w-next', labels: ['founder', `teammate:${mate.id}`, 'hop:0'] }, now);
    expect(next).not.toContain('## The threads you come from');
    expect(next).toContain('- Group by what users notice.');
  });

  // 2026-11-13: an answer on one thread left the same card waiting on every
  // other thread that had been offered the same role.
  it('answered on one thread, answers the same role waiting on your other threads, and no other role', async () => {
    const { loadStore } = await import('../main/store-modules.mts');
    const { Teammates } = await import('../main/teammates.mts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-everywhere-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    const offerOn = (title: string, role: string) => {
      const it = w.createWorkItem(root, { title, labels: ['founder'] }, { source: 'founder', now });
      w.updateWorkItem(root, it.id, { routed: { to: 'agent', why: 'x', at: now, by: 'auto', offer: { role, why: 'It repeats.' } } }, { source: 'system', now });
      return it.id;
    };
    const a = offerOn('Weekly update for investors', 'Investor writer');
    const b = offerOn('Investor update for March', 'investor writer');
    const c = offerOn('Answer support email', 'Support lead');
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer-everywhere' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
    };
    const team = new Teammates(store);
    team.answerOffer(store.listItems().find((i) => i.id === a), false, now);
    const offerOf = (id: string) => store.listItems().find((i) => i.id === id).routed.offer;
    expect(offerOf(a).answered).toBe('no');
    expect(offerOf(b).answered).toBe('no');
    expect(offerOf(c).answered).toBeUndefined();
  });

  it('turned down, is never offered again, and makes nobody', async () => {
    const { loadStore } = await import('../main/store-modules.mts');
    const { Teammates } = await import('../main/teammates.mts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-no-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    const made = w.createWorkItem(root, { title: 'Weekly investor update', labels: ['founder'] }, { source: 'founder', now });
    w.updateWorkItem(root, made.id, { routed: { to: 'agent', why: 'x', at: now, by: 'auto', offer: { role: 'Investor relations', why: 'It is every week.' } } }, { source: 'system', now });
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer-no' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
    };
    const team = new Teammates(store);
    team.answerOffer(store.listItems()[0], false, now);
    expect(team.list()).toHaveLength(0);
    expect(team.declinedRoles()).toEqual(['investor relations']);
    expect(store.listItems()[0].routed.offer.answered).toBe('no');
    expect(() => team.answerOffer(store.listItems()[0], true, now)).toThrow(/already answered/);
  });

  it('is no longer made in hindsight from alike titles', async () => {
    const { loadStore } = await import('../main/store-modules.mts');
    const { Teammates } = await import('../main/teammates.mts');
    const { OFFER_LABEL } = await import('../shared/teammates.mts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-gone-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    for (const [title, ago] of [['Write the changelog from merged PRs', 2], ['Write the changelog for merged PRs', 9], ['Changelog from the merged PRs', 16]]) {
      w.createWorkItem(root, { title, labels: ['founder'] }, { source: 'founder', now: now - ago * DAY });
    }
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer-gone' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
    };
    await new Teammates(store).tick({ items: store.listItems(), now });
    expect(store.listItems().some((i) => (i.labels ?? []).includes(OFFER_LABEL))).toBe(false);
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
