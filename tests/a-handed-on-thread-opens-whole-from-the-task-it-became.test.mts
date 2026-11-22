// A HANDED-ON THREAD OPENS WHOLE FROM THE TASK IT BECAME (2026-11-11).
//
// A synthetic team run: Theo gave Lena his CSV investigation with "Give it to
// someone else". "Lena confirms the CSV arrived but asks me to share the
// original thread separately because she sees only the handoff summary." The
// change that would most raise his score: "a handoff that reliably carries the
// full agent thread, task branch files and ownership without a second share".
// Measured on the branch through two copies of the app over the in-memory
// cloud: the task `handOn` made held the brief and the files and nothing that
// led back to the thread, and a thread that was Only you never reached her copy
// at all, so there was nothing to open.
//
// Now the task opens with the thread's own link, the one Share sends, and the
// thread is opened to the person it went to the way Share › Send opens it. The
// receiver's link opens the teammate's thread, with the whole conversation.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { isGivenTask } from '../shared/team-rules.mts';
import { threadOfLink } from '../renderer/src/threads/share-rules.ts';
import { whereALinkGoes } from '../renderer/src/link-click.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'handed-thread-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service };
}

let cloud, theo, lena, jun, macs;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Ito' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ross' }));
  macs = [theo, lena, jun];
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('lena@nw.test');
  await theo.service.invite('jun@nw.test');
  await lena.service.signIn();
  await lena.service.acceptInvite(theo.service.state().team.id);
  await jun.service.signIn();
  await jun.service.acceptInvite(theo.service.state().team.id);
  disk.setLineAuthor(theo.personId);
});
afterEach(async () => { disk.setLineAuthor(null); for (const m of macs) await m.service.signOut(); });

const allSync = async () => { for (let k = 0; k < 2; k += 1) for (const m of macs) await m.service.syncNow(); };
const wordsIn = (work) => work.lines.flatMap((l) => [l.patch?.body, l.patch?.answer, l.patch?.result]).filter(Boolean);
const LINKS = /\]\((https:[^)\s]+)\)/g;

async function investigation(seen = null) {
  const t = theo.store.composeItem('website', { title: 'Why does the CSV import drop rows?', body: 'Find out why rows go missing.' });
  theo.store.recordSessionResult('website', t.id, { result: 'The parser stops at a quoted newline. Fix is on the branch.' });
  for (const patch of seen ?? []) theo.store.threadEdit('website', t.id, patch);
  return t;
}
async function handTo(mac, t) {
  await theo.service.handOn({ product: 'website', id: t.id, to: mac.personId });
  await allSync();
  return mac.store.listItems().find((i) => isGivenTask(i, mac.store.listProducts().find((p) => p.slug === i.product)));
}
const cardOn = (mac, t) => (mac.service.state().cards ?? []).find((c) => c.personId === theo.personId && c.threadId === t.id);

describe('the task a hand-off makes', () => {
  it('opens with the link to the thread it came from, which opens as a thread', async () => {
    const t = await investigation();
    const task = await handTo(lena, t);
    const links = [...task.body.matchAll(LINKS)].map((m) => m[1]);
    const thread = links.find((l) => threadOfLink(l));
    expect(threadOfLink(thread)).toEqual({ owner: theo.personId, id: t.id });
    expect(whereALinkGoes(thread)).toBe('thread');
    expect(task.body.startsWith(`[Why does the CSV import drop rows?](${thread})`)).toBe(true);
    // The brief is still there under it.
    expect(task.body).toContain('Find out why rows go missing.');
  });

  it('lets the person it went to open the whole conversation, the agent\'s answer included', async () => {
    const t = await investigation();
    await handTo(lena, t);
    expect(cardOn(lena, t)?.visible).toBe(true);
    const work = lena.service.threadWork(theo.personId, t.id);
    expect(work.shared).toBe(true);
    expect(wordsIn(work)).toContain('The parser stops at a quoted newline. Fix is on the branch.');
  });

  it('opens a thread that was Only you to the person it went to, as Send does, and to nobody else', async () => {
    const t = await investigation([{ visibility: 'private' }]);
    await handTo(lena, t);
    expect(theo.store.readItem('website', t.id)).toMatchObject({ visibility: 'people', visibleTo: [lena.personId] });
    expect(lena.service.threadWork(theo.personId, t.id).shared).toBe(true);
    expect(cardOn(jun, t)).toBeUndefined();
    expect(jun.service.threadWork(theo.personId, t.id).shared).toBe(false);
  });

  it('leaves a Team thread as it was', async () => {
    const t = await investigation();
    await handTo(lena, t);
    const row = theo.store.readItem('website', t.id);
    expect(row.visibility).toBeUndefined();
    expect(row.visibleTo).toBeUndefined();
  });

  it('does not let back in someone the thread named before it went private', async () => {
    const t = await investigation([{ visibility: 'people', visibleTo: [jun.personId] }, { visibility: 'private' }]);
    await handTo(lena, t);
    expect(theo.store.readItem('website', t.id).visibleTo).toEqual([lena.personId]);
    expect(cardOn(jun, t)).toBeUndefined();
    expect(jun.service.threadWork(theo.personId, t.id).shared).toBe(false);
  });

  it('still closes the giver\'s copy saying who has it', async () => {
    const t = await investigation();
    await handTo(lena, t);
    const row = theo.store.readItem('website', t.id);
    expect(row.status).toBe('done');
    expect(row.answer).toContain('Lena Ito');
  });
});
