// MOVE TO A NEW THREAD CARRIES A MESSAGE AND ITS REPLIES, AND LEAVES A LINK.
//
// Sofia: Dev asked for clinic names for shots 4 to 7 in the thread
// about onboarding colours, and nothing could take that question out to where
// the film work was. "Or split a message out into its own thread (Move to new
// thread)." Measured with three copies over the in-memory cloud: the message and
// its replies in thread open a new thread with the same people, under the
// mover's name and saying who said what, and a link is left under the message.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { inMyInbox, isWorkThread } from '../shared/team-rules.mjs';
import { messageMore } from '../renderer/src/team/message-more.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'move-thread-'));
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

let cloud, sofia, dev, maya, talk;
const sync = async () => { for (const m of [sofia, dev, maya, sofia]) await m.service.syncNow(); };
const slugOn = (mac) => mac.store.listProducts().find((p) => p.team?.projectId === sofia.store.listProducts().find((q) => q.slug === talk.product).team.projectId).slug;
const uidOf = (mac, words) => mac.store.readHistory(slugOn(mac), talk.id, { max: 1e6 }).find((l) => (l.patch?.answer ?? l.patch?.body) === words).uid;
const say = (mac, words, inReplyTo) => mac.on(() => mac.store.answerItem(slugOn(mac), talk.id, { answer: words, ...(inReplyTo ? { inReplyTo } : {}) }));

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
  talk = await sofia.on(() => sofia.service.message([dev.personId, maya.personId], 'Onboarding colour: go with A.'));
  await sync();
  await say(dev, 'Can I have made-up clinic names for shots 4 to 7?');
  await sync();
  const ask = uidOf(maya, 'Can I have made-up clinic names for shots 4 to 7?');
  await say(maya, 'Northside Physio, Harbour Dental.', ask);
  await sync();
  await say(dev, 'Unrelated: the deck v5 is up.');
  await sync();
});
afterEach(async () => { for (const m of [sofia, dev, maya]) await m.service.signOut(); });

const move = async () => {
  const on = uidOf(sofia, 'Can I have made-up clinic names for shots 4 to 7?');
  return sofia.on(() => sofia.service.moveToThread({ product: talk.product, id: talk.id, on }));
};

describe('what moves', () => {
  it('a new thread about the work, in the record the three share, with its own name', async () => {
    const made = await move();
    expect(made.product).toBe(talk.product);
    expect(made.id).not.toBe(talk.id);
    expect(isWorkThread(made)).toBe(true);
    expect(made.title).toMatch(/clinic names/i);
  });

  // On screen the first try named one "A as well", from "A as well. Separate
  // thing: can I see the cancel dialog copy? I want to fact check the refund..."
  it('is named from the message\'s longest sentence, not its first words', async () => {
    await say(dev, 'A as well. Separate thing: can I see the cancel dialog copy? I want to fact check the refund wording before Friday.');
    await sync();
    const on = uidOf(sofia, 'A as well. Separate thing: can I see the cancel dialog copy? I want to fact check the refund wording before Friday.');
    const made = await sofia.on(() => sofia.service.moveToThread({ product: talk.product, id: talk.id, on }));
    expect(made.title).toMatch(/refund wording/i);
  });

  it('carries the message and its reply, saying who said each, in order', async () => {
    const made = await move();
    const body = sofia.store.readItem(made.product, made.id).body;
    expect(body).toMatch(/Dev: Can I have made-up clinic names for shots 4 to 7\?/);
    expect(body).toMatch(/Maya: Northside Physio, Harbour Dental\./);
    expect(body.indexOf('Dev:')).toBeLessThan(body.indexOf('Maya:'));
  });

  // On screen the row read "Moved here from Morning both.": its line is the
  // body's first, so the words lead and the way back closes it.
  it('opens on the words, and ends on a link back to the conversation', async () => {
    const made = await move();
    const parts = sofia.store.readItem(made.product, made.id).body.split('\n\n');
    expect(parts[0]).toMatch(/^Dev: Can I have/);
    expect(parts[parts.length - 1]).toBe(`Moved from [the conversation](${talk.id}).`);
  });

  it('reaches both of them and waits on them', async () => {
    const made = await move();
    await sync();
    for (const mac of [dev, maya]) {
      const p = mac.store.listProducts().find((x) => x.slug === slugOn(mac));
      const row = mac.store.readItem(p.slug, made.id);
      expect(isWorkThread(row)).toBe(true);
      expect(inMyInbox(row, p, mac.personId)).toBe(true);
    }
  });

  it('leaves a link to it under the message', async () => {
    const made = await move();
    await sync();
    const ask = uidOf(dev, 'Can I have made-up clinic names for shots 4 to 7?');
    const left = dev.store.readHistory(slugOn(dev), talk.id, { max: 1e6 }).filter((l) => l.patch?.inReplyTo === ask).map((l) => l.patch.answer);
    expect(left.some((t) => t.includes(`](${made.id})`))).toBe(true);
  });
});

describe('what must not move', () => {
  it('the messages around it, and the conversation keeps every word', async () => {
    const made = await move();
    // The last paragraph names where it came from; the rest is what was said.
    const quoted = sofia.store.readItem(made.product, made.id).body.split('\n\n').slice(0, -1).join('\n\n');
    expect(quoted).not.toMatch(/Onboarding colour|deck v5/);
    const kept = sofia.store.readHistory(talk.product, talk.id, { max: 1e6 }).map((l) => l.patch?.answer ?? l.patch?.body).filter(Boolean);
    expect(kept).toEqual(expect.arrayContaining(['Onboarding colour: go with A.', 'Can I have made-up clinic names for shots 4 to 7?', 'Northside Physio, Harbour Dental.', 'Unrelated: the deck v5 is up.']));
  });

  // On screen, moving a message twice carried the first move's link along as a reply.
  it('the link a previous move left under it', async () => {
    await move();
    const again = await move();
    expect(sofia.store.readItem(again.product, again.id).body).not.toMatch(/Moved to a new thread/);
  });

  it('a message that is not there', async () => {
    await expect(sofia.on(() => sofia.service.moveToThread({ product: talk.product, id: talk.id, on: 'no-such-uid' }))).rejects.toThrow(/message/);
  });

  it('a thread that is not a conversation with people', async () => {
    await expect(sofia.on(() => sofia.service.moveToThread({ product: 'my-workspace', id: 'w-0000000000', on: 'x' }))).rejects.toThrow(/conversation/);
  });
});

describe('where it is offered', () => {
  it('on a message in a conversation, in its more menu', () => {
    const items = messageMore({ mine: false, text: 'Shots 4 to 7?', onMove: () => {} });
    expect(items.some((i) => i !== 'rule' && i.label === 'Move to a new thread')).toBe(true);
  });
  it('not where nothing can move it', () => {
    const items = messageMore({ mine: false, text: 'Shots 4 to 7?' });
    expect(items.some((i) => i !== 'rule' && i.label === 'Move to a new thread')).toBe(false);
  });
});
