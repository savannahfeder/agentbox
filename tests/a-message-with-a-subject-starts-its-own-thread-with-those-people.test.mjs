// A MESSAGE WITH A SUBJECT STARTS ITS OWN THREAD WITH THOSE PEOPLE.
//
// Sofia: the record "Onboarding direction A implementation" (Maya, Dev,
// Sofia) held the colour decision, deck v4 and v5 notes, a fact check, the
// voiceover, the shot list and a pin test, because every message to the same
// people went on the end of the one row they shared (main/team/index.mjs
// `message`). Done on it meant "all of it is done", which it never was.
// Measured here with three copies over the in-memory cloud: a subject now makes
// a row of its own in the record those people share, and talk without one still
// goes to the conversation.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { inMyInbox, isWorkThread, whatATeammateMaySet, WORK_THREAD } from '../shared/team-rules.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'work-thread-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on };
}

let cloud, sofia, dev, maya;
const sync = async () => { for (const m of [sofia, dev, maya, sofia]) await m.service.syncNow(); };
const rowsOf = (mac, slug) => mac.store.listItems().filter((i) => i.product === slug && !i.agent);
const productOf = (mac, slug) => mac.store.listProducts().find((p) => p.slug === slug);
const sameRecordOn = (mac, slug) => {
  const id = productOf(sofia, slug).team.projectId;
  return mac.store.listProducts().find((p) => p.team?.projectId === id);
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Reyes' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  await sofia.service.signIn();
  await sofia.service.createTeam('Lumen');
  await sofia.service.invite('dev@lumen.test');
  await sofia.service.invite('maya@lumen.test');
  for (const m of [dev, maya]) { await m.service.signIn(); await m.service.acceptInvite(sofia.service.state().team.id); }
  await sync();
});
afterEach(async () => { for (const m of [sofia, dev, maya]) await m.service.signOut(); });

const both = () => [dev.personId, maya.personId];

describe('a subject starts a thread of its own', () => {
  it('is a second row in the record the three share, named by the subject', async () => {
    const talk = await sofia.on(() => sofia.service.message(both(), 'Morning both.'));
    const film = await sofia.on(() => sofia.service.message(both(), 'Shots 4 to 7 need clinic names.', undefined, [], { subject: 'Launch film shot list' }));
    expect(film.product).toBe(talk.product);
    expect(film.id).not.toBe(talk.id);
    expect(film.title).toBe('Launch film shot list');
    expect(isWorkThread(film)).toBe(true);
    expect(isWorkThread(talk)).toBe(false);
    expect(rowsOf(sofia, talk.product)).toHaveLength(2);
  });

  it('reaches both of them as its own row with its own name, waiting on them', async () => {
    const film = await sofia.on(() => sofia.service.message(both(), 'Shots 4 to 7 need clinic names.', undefined, [], { subject: 'Launch film shot list' }));
    await sync();
    for (const mac of [dev, maya]) {
      const p = sameRecordOn(mac, film.product);
      const row = mac.store.readItem(p.slug, film.id);
      expect(row.title).toBe('Launch film shot list');
      expect(isWorkThread(row)).toBe(true);
      expect(inMyInbox(row, p, mac.personId)).toBe(true);
    }
  });

  it('a second subject is a third row, and each keeps its own words', async () => {
    const a = await sofia.on(() => sofia.service.message(both(), 'v5 notes inside.', undefined, [], { subject: 'Investor deck v5' }));
    const b = await sofia.on(() => sofia.service.message(both(), 'Is the cancel dialog right?', undefined, [], { subject: 'Cancel dialog fact check' }));
    expect(a.id).not.toBe(b.id);
    expect(sofia.store.readItem(a.product, a.id).body).toContain('v5 notes');
    expect(sofia.store.readItem(b.product, b.id).body).toContain('cancel dialog');
  });

  it('works for one person too', async () => {
    const t = await sofia.on(() => sofia.service.message(dev.personId, 'Can you check the copy?', undefined, [], { subject: 'Staff page copy' }));
    expect(t.title).toBe('Staff page copy');
    expect([...new Set(productOf(sofia, t.product).team.people)].sort()).toEqual([sofia.personId, dev.personId].sort());
  });
});

describe('what a subject must not change', () => {
  it('talk with no subject goes to the conversation, not to the newest thread', async () => {
    const talk = await sofia.on(() => sofia.service.message(both(), 'Morning both.'));
    await sofia.on(() => sofia.service.message(both(), 'Shots 4 to 7.', undefined, [], { subject: 'Launch film shot list' }));
    const next = await sofia.on(() => sofia.service.message(both(), 'Lunch at one?'));
    expect(next.id).toBe(talk.id);
    expect(sofia.service.conversation(both())).toEqual({ product: talk.product, id: talk.id });
  });

  it('with only threads so far, talk with no subject starts the conversation rather than joining a thread', async () => {
    const film = await sofia.on(() => sofia.service.message(both(), 'Shots 4 to 7.', undefined, [], { subject: 'Launch film shot list' }));
    expect(sofia.service.conversation(both())).toBe(null);
    const talk = await sofia.on(() => sofia.service.message(both(), 'Lunch at one?'));
    expect(talk.id).not.toBe(film.id);
    expect(isWorkThread(talk)).toBe(false);
  });

  it('a thread with Dev alone is not in the record Dev and Maya share', async () => {
    const group = await sofia.on(() => sofia.service.message(both(), 'Hi both.', undefined, [], { subject: 'Launch film' }));
    const pair = await sofia.on(() => sofia.service.message(dev.personId, 'Just you.', undefined, [], { subject: 'Launch film' }));
    expect(pair.product).not.toBe(group.product);
    await sync();
    expect(maya.store.listItems().some((i) => i.id === pair.id)).toBe(false);
  });

  it('Done on one thread leaves the other and the conversation open', async () => {
    const talk = await sofia.on(() => sofia.service.message(both(), 'Morning both.'));
    const film = await sofia.on(() => sofia.service.message(both(), 'Shots 4 to 7.', undefined, [], { subject: 'Launch film shot list' }));
    const deck = await sofia.on(() => sofia.service.message(both(), 'v5.', undefined, [], { subject: 'Investor deck v5' }));
    await sync();
    const p = sameRecordOn(dev, film.product);
    await dev.on(() => dev.store.answerItem(p.slug, film.id, { status: 'done' }));
    expect(dev.store.readItem(p.slug, film.id).status).toBe('done');
    expect(dev.store.readItem(p.slug, deck.id).status).not.toBe('done');
    expect(dev.store.readItem(p.slug, talk.id).status).not.toBe('done');
  });

  it('a reply in a thread the other person marked Done brings it back to them', async () => {
    const film = await sofia.on(() => sofia.service.message(dev.personId, 'Shots 4 to 7.', undefined, [], { subject: 'Launch film shot list' }));
    await sync();
    const p = sameRecordOn(dev, film.product);
    await dev.on(() => dev.store.answerItem(p.slug, film.id, { answer: 'Done, names are in.' }));
    await dev.on(() => dev.store.answerItem(p.slug, film.id, { status: 'done' }));
    await sync();
    await sofia.on(() => sofia.store.answerItem(film.product, film.id, { answer: 'One more: shot 8.' }));
    await sync();
    const row = dev.store.readItem(p.slug, film.id);
    expect(row.status).toBe('open');
    expect(inMyInbox(row, p, dev.personId)).toBe(true);
  });
});

describe('the mark crosses only on the line that makes the row', () => {
  const opening = { id: 'w-0123456789', ts: 1, by: 'p-s', source: 'system', uid: 'u1', patch: { kind: 'directive', title: 'Film', labels: ['founder', WORK_THREAD] } };
  it('is kept on the opening line', () => {
    expect(whatATeammateMaySet(opening, { direct: true }).patch.labels).toEqual([WORK_THREAD]);
  });
  it('is dropped on any later line, so nobody turns the conversation into a thread', () => {
    const later = { ...opening, uid: 'u2', patch: { labels: [WORK_THREAD] } };
    expect(whatATeammateMaySet(later, { direct: true })).toBe(null);
  });
  it('is dropped outside a message record', () => {
    expect(whatATeammateMaySet(opening, { direct: false })).toBe(null);
  });
});
