// A THREAD LINK IN A CHAT OPENS FOR THE PERSON IT WAS SENT TO (2026-11-20).
//
// Round 3: Priya's chat with Lena held Lena's "Review and send back" with a
// link to "Mock up the pricing page". Priya sent a message and clicked the
// link, twice: nothing happened. Lena's ledger: the thread was started before
// she began sharing and nobody had opened it to anyone, so Priya's copy had
// no card for it, and the review sent from the file's Share panel asked about
// the thread without opening it to her (Share's own Send and a hand-over both
// do). Priya's copy then synced in silence and gave up. The file's review now
// opens the thread to the reviewer before the message goes, as Share does,
// and a link to a thread this copy cannot see yet says it is looking at once.
// Measured on two copies over the in-memory cloud and by reading the window.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-opens-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'web'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'web', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'web', name: 'Web app', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

describe('a thread asked about from its file', () => {
  let lena: Awaited<ReturnType<typeof aMac>>;
  let priya: Awaited<ReturnType<typeof aMac>>;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
    priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@nw.test', name: 'Priya Shah' }));
    disk.setLineAuthor(lena.personId);
  });
  afterEach(async () => { disk.setLineAuthor(null); await lena.service.signOut(); await priya.service.signOut(); });

  it('is opened to the reviewer, so their copy has its card and the link opens', async () => {
    // Started before sharing began: only Lena's until something opens it.
    const t = lena.store.composeItem('web', { title: 'Mock up the pricing page', body: 'A pricing page mockup.' });
    await lena.service.signIn();
    await lena.service.createTeam('Northwind');
    await lena.service.invite('priya@nw.test');
    await priya.service.signIn();
    await priya.service.acceptInvite(lena.service.state().team.id);
    for (let k = 0; k < 2; k += 1) { await lena.service.syncNow(); await priya.service.syncNow(); }
    const cardOn = () => (priya.service.state().cards ?? []).find((c: { threadId: string; visible?: boolean }) => c.threadId === t.id && c.visible);
    expect(cardOn()).toBeUndefined();
    await lena.service.openThreadTo('web', t.id, [priya.personId]);
    for (let k = 0; k < 2; k += 1) { await lena.service.syncNow(); await priya.service.syncNow(); }
    expect(cardOn()).toBeTruthy();
  });
});

describe('the wiring', () => {
  const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('the review sent from a file opens the thread before the message goes', () => {
    const ipc = read('main/ipc.mts');
    const at = ipc.indexOf("const about = item && link ? { title: String(item.label || item.title || 'A thread'), link } : null;");
    expect(at).toBeGreaterThan(-1);
    const open = ipc.indexOf('if (about) await team.openThreadTo(arg.product as string, item!.id, [to]);', at);
    expect(open).toBeGreaterThan(at);
    expect(open).toBeLessThan(ipc.indexOf('await sendFileToChat(', at));
  });
  it('a hand-over opens it the same way', () => {
    // Its own sync comes after the thread is closed (a-handed-over-thread-carries-its-change-as-a-patch).
    expect(read('main/team/index.mts')).toContain('await this.openThreadTo(slug, id, [to], { sync: false });');
  });
  it('a link to a thread not here yet says so at once', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf('linkWaiting.current = { personId, threadId, at };');
    expect(app.slice(at - 200, at)).toContain('showToast(`Opening ${');
  });
});
