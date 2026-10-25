// "I also like the idea of it suggesting making a teammate for repetitive
// tasks" (round 3, approved). Three or more of your own asks in a month that
// are one job become one inbox row from the app, answered with a tap, which no
// agent runs. These pin when it is offered and when it is not: one-offs, a
// teammate's own runs, an offer already made or turned down, two open at once.
import { describe, it, expect } from 'vitest';
import { offerFrom, offerAnswer, OFFER_LABEL, OFFER_MAKE, OFFER_NOT_NOW } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 24, 9, 0).getTime();
const DAY = 86_400_000;
let n = 0;
const ask = (title, over = {}) => ({ id: `w-${++n}`, product: 'site', title, labels: ['founder'], status: 'done', createdAt: NOW - DAY * 2, ...over });
const CHANGELOG = [
  ask('Write this week’s changelog from the merged PRs'),
  ask('Write the changelog for the merged PRs this week', { createdAt: NOW - DAY * 9 }),
  ask('Changelog: write it up from merged PRs', { createdAt: NOW - DAY * 16 }),
];

describe('when the app offers a teammate', () => {
  it('offers one for three asks that are one job, in the project they were in', () => {
    const offer = offerFrom({ items: [...CHANGELOG, ask('Fix the login button')], now: NOW });
    expect(offer).toMatchObject({ count: 3, product: 'site' });
    expect(offer.key).toContain('changelog');
    expect(offer.title).toMatch(/^Want a teammate for things like “.+”\?$/);
    expect(offer.said).toBe("You've asked for this 3 times this month.");
  });

  // Nine asks with the same words listed the same line five times (third power test).
  it('lists the same words once', () => {
    const same = [1, 2, 3, 4].map((d) => ask('Onboarding is confusing people, fix the first screen', { createdAt: NOW - DAY * d }));
    expect(offerFrom({ items: same, now: NOW }).titles).toEqual(['Onboarding is confusing people, fix the first screen']);
  });

  it('does not offer for two alike asks, or three unalike ones', () => {
    expect(offerFrom({ items: CHANGELOG.slice(0, 2), now: NOW })).toBeNull();
    expect(offerFrom({ items: [ask('Fix the login button'), ask('Write the pricing page'), ask('Book flights to Lisbon')], now: NOW })).toBeNull();
  });

  it('counts only your own asks from the last month', () => {
    const old = CHANGELOG.map((i) => ({ ...i, createdAt: NOW - DAY * 40 }));
    expect(offerFrom({ items: old, now: NOW })).toBeNull();
    const runs = CHANGELOG.map((i) => ({ ...i, labels: ['founder', 'teammate:t-abcdef1234'] }));
    expect(offerFrom({ items: runs, now: NOW })).toBeNull();
    const repeats = CHANGELOG.map((i) => ({ ...i, labels: ['founder', 'repeat:r1'] }));
    expect(offerFrom({ items: repeats, now: NOW })).toBeNull();
    const filed = CHANGELOG.map((i) => ({ ...i, labels: [] }));
    expect(offerFrom({ items: filed, now: NOW })).toBeNull();
  });

  it('never offers the same job twice, nor a second while one is open or one went out today', () => {
    const offer = offerFrom({ items: CHANGELOG, now: NOW });
    expect(offerFrom({ items: CHANGELOG, offered: new Set([offer.key]), now: NOW })).toBeNull();
    const open = { id: 'w-o', product: 'site', title: 'x', labels: [OFFER_LABEL], status: 'open', createdAt: NOW - DAY * 3 };
    expect(offerFrom({ items: [...CHANGELOG, open], now: NOW })).toBeNull();
    const today = { ...open, status: 'done', createdAt: NOW - 3600_000 };
    expect(offerFrom({ items: [...CHANGELOG, today], now: NOW })).toBeNull();
    expect(offerFrom({ items: [...CHANGELOG, { ...today, createdAt: NOW - DAY * 2 }], now: NOW })).not.toBeNull();
  });
});

describe('a tap on the offer', () => {
  it('makes one, turns it down, or makes one from your own words', () => {
    expect(offerAnswer(OFFER_MAKE)).toEqual({ kind: 'make' });
    expect(offerAnswer(`1. ${OFFER_MAKE}`)).toEqual({ kind: 'make' });
    expect(offerAnswer(OFFER_NOT_NOW)).toEqual({ kind: 'dismiss' });
    expect(offerAnswer('no thanks')).toEqual({ kind: 'dismiss' });
    expect(offerAnswer('Yes, and have it post the changelog on Fridays')).toEqual({ kind: 'make' });
    expect(offerAnswer('Someone who writes the changelog and tweets it')).toEqual({ kind: 'make', words: 'Someone who writes the changelog and tweets it' });
    expect(offerAnswer('(withdrawn)')).toBeNull();
    expect(offerAnswer('')).toBeNull();
  });
});

describe('the offer in the store', () => {
  it('is one inbox row the app answers, which no agent ever runs, and a tap makes the teammate', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { loadStore } = await import('../main/store-modules.mjs');
    const { Teammates } = await import('../main/teammates.mjs');
    const { Supervisor } = await import('../main/supervisor.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-offer-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const now = Date.now();
    for (const [title, ago] of [['Write this week’s changelog from the merged PRs', 2], ['Write the changelog for the merged PRs this week', 9], ['Changelog: write it up from merged PRs', 16]]) {
      const made = w.createWorkItem(root, { title, labels: ['founder'] }, { source: 'founder', now: now - ago * 86_400_000 });
      w.updateWorkItem(root, made.id, { status: 'done' }, { source: 'founder', now });
    }
    const store = {
      config: { storeRoot: root, accountId: 'acct-offer' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
    };
    const team = new Teammates(store);
    await team.tick({ items: store.listItems(), now });
    await team.tick({ items: store.listItems(), now });
    const offers = store.listItems().filter((i) => (i.labels ?? []).includes(OFFER_LABEL));
    expect(offers).toHaveLength(1);
    expect(offers[0].result).toContain(OFFER_MAKE);
    // The asks are listed once, in the answer; the opening only says how many.
    expect(offers[0].body).not.toMatch(/^- /m);
    expect(offers[0].result.match(/^- /gm)).toHaveLength(3);
    expect(offers[0].progress).toMatch(/^Found 3 asks/);
    // Answered, it is still not work for an agent.
    w.updateWorkItem(root, offers[0].id, { answer: OFFER_MAKE }, { source: 'founder', now });
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 1 }, store, '/tmp');
    const answered = store.listItems().find((i) => i.id === offers[0].id);
    expect(sup._isContinuation(answered)).toBe(false);
    expect(sup._isContinuation({ ...answered, labels: ['founder'] })).toBe(true);
    await team.tick({ items: store.listItems(), now });
    const closed = store.listItems().find((i) => i.id === offers[0].id);
    expect(closed.status).toBe('done');
    // And out of Needs you: the second power test found it there, done and counted.
    const { isCleanRun } = await import('../shared/repeats.mjs');
    expect(isCleanRun(closed)).toBe(true);
    const made = team.list();
    expect(made).toHaveLength(1);
    expect(made[0].status).toBe('draft');
    expect(team.chat().messages.some((m) => m.kind === 'msg' && /changelog/i.test(m.text))).toBe(true);
    // And never offered again.
    await team.tick({ items: store.listItems(), now: now + 3 * 86_400_000 });
    expect(store.listItems().filter((i) => (i.labels ?? []).includes(OFFER_LABEL))).toHaveLength(1);
  });
});
