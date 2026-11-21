// A HAND-BACK SAYS ONLY WHAT THE HELPER SAID (2026-11-21).
//
// Sam asked Theo to review and added a reply on the ask: "The branch is
// agentbox/w-1, use staging creds." Theo pressed Looks good and wrote
// nothing. Sam's thread then read "Theo reviewed this and it looks good. The
// branch is agentbox/w-1, use staging creds." as Theo's words: the hand-back
// read the task's newest answer, whoever wrote it and whenever. Found by a
// code review of the shipped Ask or hand off; reproduced on the in-memory
// cloud with two computers. Now only words the helper wrote with the
// hand-back come back as theirs.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { handBackSaid } from '../shared/thread-asks.mts';

async function aMac(cloud, personId, tellThread) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-back-words-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread });
  return { personId, store, service };
}

let cloud, sam, theo, told;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud(); told = [];
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), (slug, id, o) => { told.push({ slug, id, ...o }); });
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }), vi.fn());
  await sam.service.signIn(); await sam.service.createTeam('Clinicflow');
  await sam.service.invite('theo@cf.test');
  await theo.service.signIn(); await theo.service.acceptInvite(sam.service.state().team.id);
});
afterEach(async () => { disk.setLineAuthor(null); for (const m of [sam, theo]) await m.service.signOut(); });

const both = async (n = 3) => { for (let k = 0; k < n; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
const theosTask = () => theo.store.listItems().find((i) => i.ask);
async function reviewAsked() {
  disk.setLineAuthor(sam.personId);
  const t = sam.store.composeItem('api', { title: 'Add an idempotency key', body: 'Add one.' });
  await both();
  await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'review', note: 'Is it safe?' });
  await both();
  const onSams = sam.store.listItems().find((i) => i.ask);
  sam.store.answerItem(onSams.product, onSams.id, { answer: 'The branch is agentbox/w-1, use staging creds.' });
  await both();
  return t;
}

it("Looks good with no words does not carry the owner's own reply as the reviewer's", async () => {
  await reviewAsked();
  disk.setLineAuthor(theo.personId);
  await theo.service.handBack({ product: theosTask().product, id: theosTask().id, verdict: 'yes' });
  await both(); await both();
  const back = told.find((x) => x.hold);
  expect(back.text).toContain('looks good');
  expect(back.text).not.toContain('staging creds');
});

it('words the reviewer writes with the hand-back still come back', async () => {
  await reviewAsked();
  disk.setLineAuthor(theo.personId);
  await theo.service.handBack({ product: theosTask().product, id: theosTask().id, verdict: 'changes', words: 'Rename the column first.' });
  await both(); await both();
  expect(told.find((x) => x.hold).text).toContain('Rename the column first.');
});

it('reads the answer only when the helper wrote it at the hand-back', () => {
  const row = (wrote) => ({ id: 'k', status: 'done', assignee: 'theo', answer: 'Words.', wrote });
  expect(handBackSaid(row({ verdict: { ts: 10 }, answer: { by: 'theo', ts: 10 } }))).toBe('Words.');
  expect(handBackSaid(row({ verdict: { ts: 10 }, answer: { by: 'sam', ts: 10 } }))).toBe('');
  expect(handBackSaid(row({ verdict: { ts: 10 }, answer: { by: 'theo', ts: 4 } }))).toBe('');
  expect(handBackSaid(row({ verdict: { ts: 10 } }))).toBe('');
});
