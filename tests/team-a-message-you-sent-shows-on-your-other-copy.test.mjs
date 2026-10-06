// A MESSAGE YOU SENT FROM ONE COPY OF THE APP SHOWS IN THE OTHER COPY.
//
// Reported 2026-10-04 (w-2fce569057): a message sent to a teammate never came
// back.
//
// MEASURED, end to end, through a real team cloud. The message left the Mac and
// reached the cloud as a line of its own, and reached the teammate's app, whose
// namer wrote to the same conversation 24 seconds later. Nothing dropped it.
//
// What was missing was the message ON THE SENDER'S OWN SCREEN. It had been sent
// from a second copy of the app signed in as the same person, and the everyday
// copy's ledger for that conversation still ended three days earlier, at 9 lines
// and 1,814 bytes, with no line for what had just been written, while its pull
// cursor had already moved past it. So that copy READ its own person's four
// lines out of the cloud and threw all four away: `pullProject` in
// main/team/sync.mjs skipped every line whose writer was you, on the reasoning
// that a line you wrote is "already here". That is true of the copy that wrote
// it and false of every other copy you own, and a conversation that is missing
// your own half is a conversation that looks like it never sent.
//
// ONLY IN A MESSAGE RECORD. A line of your own carries a body, an answer and a
// status, which on an ordinary shared row is what starts an agent (mayRunHere
// believes a line whose writer is you, because it is you). Two copies of your
// app would then both start one on the same row. A message record never runs an
// agent at all (shared/team-rules.mjs), so this is the one place your own words
// may cross, and the last test here pins the other place shut.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';

// ONE COPY OF THE APP: its own store folder, its own sync cursors. Two copies
// signed in as one person is exactly the shape that lost the message.
async function aCopy(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'own-words-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on, accountRoot };
}

// The conversation with somebody, as this copy holds it.
function talk(copy) {
  const product = copy.store.listProducts().find((p) => p.team?.direct);
  if (!product) return null;
  const row = copy.store.listItems().filter((i) => i.product === product.slug)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  return row ? { product, row } : null;
}

// Every line in a project's ledger, as written. The ledger does not live in the
// project folder (main/store/home.mjs), so the store is asked for it.
const ledger = (dir) => disk.readLinesFrom(dir, 0).lines;

let cloud, laptop, copy, theo, me;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  me = signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' });
  laptop = await aCopy(cloud, me);
  copy = await aCopy(cloud, me);
  theo = await aCopy(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await laptop.service.signIn();
  await laptop.service.createTeam('Northwind');
  await laptop.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(laptop.service.state().team.id);
  await copy.service.signIn();
  // THE SHAPE THE REAL ONE HAD, which matters: the TEAMMATE wrote first, so
  // their app made the record, Maya answered from the everyday copy, and the
  // second copy joined the record afterwards. A second copy that joins a record
  // it did not make is how it comes to hold the conversation at all.
  await theo.on(() => theo.service.message(me, 'Morning! Are we still on for Thursday?'));
  await laptop.service.syncNow();
  await laptop.on(() => laptop.service.message(theo.personId, 'Yes — see you then.'));
  await theo.service.syncNow();
  await copy.service.syncNow();
});
afterEach(async () => { for (const c of [laptop, copy, theo]) await c.service.signOut(); });

it('shows on the everyday copy a message sent from the other copy', async () => {
  await copy.on(() => copy.service.message(theo.personId, 'How is the rewrite going?'));
  // It left that copy and reached the other person: the half that always worked.
  await theo.service.syncNow();
  expect(talk(theo).row.answer).toBe('How is the rewrite going?');
  // And now it is on the sender's own screen, where it was missing. One conversation,
  // not a second one: the message went on the end of the one that was there.
  await laptop.service.syncNow();
  expect(talk(laptop).row.answer).toBe('How is the rewrite going?');
  expect(laptop.store.listItems().filter((i) => i.product === talk(laptop).product.slug)).toHaveLength(1);
});

// WHAT THE SECOND COPY SHOWS: your own half of the conversation, which was
// missing there for the same reason.
it('shows the second copy what you had already said from the first', async () => {
  expect(talk(copy).row.answer).toBe('Yes — see you then.');
});

it('stores it once however many times the copies sync', async () => {
  await copy.on(() => copy.service.message(theo.personId, 'and one more thing'));
  await laptop.service.syncNow();
  await laptop.service.syncNow();
  await copy.service.syncNow();
  await laptop.service.syncNow();
  const lines = ledger(talk(laptop).product.dir);
  expect(lines.filter((l) => l.patch?.answer === 'and one more thing')).toHaveLength(1);
  expect(talk(laptop).row.answer).toBe('and one more thing');
});

it('still brings the other person\'s reply to both copies', async () => {
  await theo.on(() => theo.service.message(me, 'Thursday works. 3pm?'));
  await laptop.service.syncNow();
  await copy.service.syncNow();
  expect(talk(laptop).row.answer).toBe('Thursday works. 3pm?');
  expect(talk(copy).row.answer).toBe('Thursday works. 3pm?');
});

// A LEASE BELONGS TO THE MAC THAT TOOK IT, even when that Mac is also yours.
it('leaves the other copy\'s lease on the other copy', async () => {
  const there = talk(copy);
  await copy.on(() => disk.claimWorkItem(there.product.dir, { id: there.row.id, holder: 'the-other-copy' }));
  await copy.service.syncNow();
  await laptop.service.syncNow();
  expect(talk(laptop).row.claim).toBeFalsy();
});

// THE CASE THAT MUST NOT MATCH: an ordinary shared project is not a
// conversation, and your own words do not cross into it. A body, an answer or a
// status arriving from another copy of your app is a line mayRunHere believes,
// so both copies would start an agent on the same row.
it('does not carry your own words into an ordinary shared project', async () => {
  const website = laptop.store.createProduct({ name: 'Website' }).slug;
  const row = await laptop.on(() => laptop.store.composeItem(website, { title: 'Ship the landing page' }));
  await laptop.service.share(website, { visibility: 'team' });
  await laptop.on(() => laptop.store.answerItem(website, row.id, { answer: 'yes, go' }));
  await laptop.on(() => laptop.store.threadEdit(website, row.id, { progress: 'Under way.' }));
  await laptop.service.syncNow();
  await copy.service.syncNow();
  const here = copy.store.listProducts().find((p) => p.team?.projectId && !p.team.direct);
  expect(here).toBeTruthy();
  // The project is joined, and not one line of your own is in it. Not the
  // answer, which would start an agent here as well, and not the summary
  // either: on a shared row the copy that wrote it is the only copy holding it.
  expect(ledger(here.dir)).toEqual([]);
  expect(copy.store.readItem(here.slug, row.id)).toBeFalsy();
  // The everyday copy is untouched by any of it.
  expect(laptop.store.readItem(website, row.id).answer).toBe('yes, go');
});
