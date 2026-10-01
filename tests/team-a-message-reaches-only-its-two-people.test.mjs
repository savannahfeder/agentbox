// A MESSAGE REACHES ONLY ITS TWO PEOPLE, AND COMES BACK WHEN ANSWERED.
//
// Approved 2026-10-01: people send each other messages, never tasks. A message
// lives in a record the two of them share and nobody else can see, made the
// first time one writes to the other and reused after. It waits in the
// recipient's inbox; their reply hands it back. It is never a card on the Team
// board, and no agent runs on it.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { inMyInbox, mayRunHere, handedOnByReply } from '../shared/team-rules.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-msg-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  // Three people share one process here, and the author is process-wide, so
  // it is set around each person's own writes, awaited.
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on };
}

let cloud, maya, theo, jun;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ito' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await maya.service.invite('jun@nw.test');
  await theo.service.signIn();
  await jun.service.signIn();
  await maya.service.syncNow();
});
afterEach(async () => { for (const m of [maya, theo, jun]) await m.service.signOut(); });

const inbox = (mac) => mac.store.listItems().filter((i) => inMyInbox(i, mac.store.listProducts().find((p) => p.slug === i.product), mac.personId));

it('lands in the recipient\'s inbox and nobody else\'s', async () => {
  await maya.on(() => maya.service.message(theo.personId, 'Can you take the Acme call on Thursday? I’m flying that day.'));
  await theo.service.syncNow();
  await jun.service.syncNow();
  const got = inbox(theo);
  expect(got.map((i) => i.title)).toEqual(['Can you take the Acme call on Thursday?']);
  expect(got[0].wrote.body.by).toBe(maya.personId);
  expect(jun.store.listProducts().filter((p) => p.team?.direct)).toEqual([]);
  expect(inbox(maya)).toEqual([]);
});

it('comes back to the sender when the recipient answers', async () => {
  await maya.on(() => maya.service.message(theo.personId, 'Can you take the Acme call?'));
  await theo.service.syncNow();
  const msg = inbox(theo)[0];
  const product = theo.store.listProducts().find((p) => p.slug === msg.product);
  theo.on(() => theo.store.answer?.(msg.product, msg.id, 'Yes, I’ll take it.') ?? disk.updateWorkItem(product.dir, msg.id, { answer: 'Yes, I’ll take it.' }, { source: 'founder' }));
  const next = handedOnByReply(theo.store.readItem(msg.product, msg.id), product, theo.personId);
  await theo.on(() => theo.store.teamPatch(msg.product, msg.id, { assignee: next }));
  await theo.service.syncNow();
  await maya.service.syncNow();
  const back = inbox(maya);
  expect(back.map((i) => i.answer)).toEqual(['Yes, I’ll take it.']);
});

it('reuses the same record for the next message between the same two people', async () => {
  await maya.on(() => maya.service.message(theo.personId, 'First.'));
  await maya.on(() => maya.service.message(theo.personId, 'Second.'));
  expect(maya.store.listProducts().filter((p) => p.team?.direct)).toHaveLength(1);
});

it('is never a card on the Team board, and no agent runs on it', async () => {
  await maya.on(() => maya.service.message(theo.personId, 'Private between us.'));
  const products = maya.store.listProducts();
  expect(cardsFor({ products, readItems: (p) => disk.readWorkItems(p.dir) })).toEqual([]);
  const item = maya.store.listItems()[0];
  expect(mayRunHere(item, products.find((p) => p.slug === item.product), maya.personId)).toBe(false);
});

it('refuses somebody who is not on the team, and an empty message', async () => {
  await expect(maya.service.message('p-stranger', 'Hi')).rejects.toThrow(/not on your team/);
  await expect(maya.service.message(theo.personId, '   ')).rejects.toThrow(/words/);
});
