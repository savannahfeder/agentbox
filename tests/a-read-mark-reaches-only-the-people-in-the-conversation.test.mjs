// A READ MARK REACHES ONLY THE PEOPLE IN THE CONVERSATION.
//
// Sofia: "My reply to Dev sat 6 hours 45 minutes unseen: your reply
// did not reach me." Neither of them could tell whether it had reached him and
// gone unread, or never arrived. Nothing said when a person opened a message.
// Now opening a conversation leaves a read mark in the cloud, under the same
// rule as its lines (can_see_project), and the sender's copy holds it per row.
// Measured with three copies over the in-memory cloud.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seen-'));
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

let cloud, sofia, dev, maya, sent;
const sync = async () => { for (const m of [sofia, dev, maya, sofia]) await m.service.syncNow(); };
const slugOn = (mac, made) => {
  const id = sofia.store.listProducts().find((q) => q.slug === made.product).team.projectId;
  return mac.store.listProducts().find((p) => p.team?.projectId === id)?.slug ?? null;
};
const seenOn = (mac, made) => mac.service.state().seen?.[`${slugOn(mac, made)}/${made.id}`] ?? {};

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  let clock = 1_800_000_000_000;
  cloud.now = () => (clock += 1000);
  sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Reyes' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  await sofia.service.signIn();
  await sofia.service.createTeam('Lumen');
  await sofia.service.invite('dev@lumen.test');
  await sofia.service.invite('maya@lumen.test');
  for (const m of [dev, maya]) { await m.service.signIn(); await m.service.acceptInvite(sofia.service.state().team.id); }
  await sync();
  sent = await sofia.on(() => sofia.service.message(dev.personId, 'The cancel dialog copy is in.'));
  await sync();
});
afterEach(async () => { for (const m of [sofia, dev, maya]) await m.service.signOut(); });

describe('opening a conversation', () => {
  it('tells the sender when the other person opened it', async () => {
    expect(seenOn(sofia, sent)[dev.personId]).toBeUndefined();
    await dev.service.seen(slugOn(dev, sent), sent.id);
    await sync();
    expect(seenOn(sofia, sent)[dev.personId]).toBeGreaterThan(0);
  });

  it('a later open moves the mark on', async () => {
    await dev.service.seen(slugOn(dev, sent), sent.id);
    await sync();
    const first = seenOn(sofia, sent)[dev.personId];
    await sofia.on(() => sofia.store.answerItem(sent.product, sent.id, { answer: 'And the date?' }));
    await sync();
    await dev.service.seen(slugOn(dev, sent), sent.id);
    await sync();
    expect(seenOn(sofia, sent)[dev.personId]).toBeGreaterThan(first);
  });

  it('is said once per new message, not on every open', async () => {
    await dev.service.seen(slugOn(dev, sent), sent.id);
    const marks = () => [...(cloud.reads?.values() ?? [])].length;
    const before = cloud.reads.get([...cloud.reads.keys()][0]).at;
    await dev.service.seen(slugOn(dev, sent), sent.id);
    expect(marks()).toBe(1);
    expect(cloud.reads.get([...cloud.reads.keys()][0]).at).toBe(before);
  });
});

describe('who it reaches', () => {
  it('not Maya, who is not in that conversation', async () => {
    await dev.service.seen(slugOn(dev, sent), sent.id);
    await sync();
    expect(maya.service.state().seen ?? {}).toEqual({});
    expect(await memoryBackend(cloud, maya.personId).seenMarks()).toEqual([]);
  });

  it('nobody may leave a mark on a conversation they are not in', async () => {
    const projectId = sofia.store.listProducts().find((q) => q.slug === sent.product).team.projectId;
    await expect(memoryBackend(cloud, maya.personId).markSeen(projectId, sent.id)).rejects.toThrow(/not allowed/);
  });

  it('a mark is always the writer\'s own, with the cloud\'s time on it', async () => {
    const projectId = sofia.store.listProducts().find((q) => q.slug === sent.product).team.projectId;
    await memoryBackend(cloud, dev.personId).markSeen(projectId, sent.id);
    const [mark] = await memoryBackend(cloud, sofia.personId).seenMarks();
    expect(mark).toMatchObject({ projectId, itemId: sent.id, personId: dev.personId });
    expect(mark.at).toBeGreaterThan(1_800_000_000_000);
  });

  it('a row id that is not one is refused', async () => {
    const projectId = sofia.store.listProducts().find((q) => q.slug === sent.product).team.projectId;
    await expect(memoryBackend(cloud, dev.personId).markSeen(projectId, '../x')).rejects.toThrow();
  });
});

describe('the cloud keeps the same rule', () => {
  const sql = fs.readFileSync(new URL('../cloud/supabase/migrations/20261101000000_a_conversation_says_who_has_seen_it.sql', import.meta.url), 'utf8');
  it('reads under can_see_project and writes only your own', () => {
    expect(sql).toMatch(/for select using \(public\.can_see_project\(project_id\)\)/);
    expect(sql).toMatch(/person_id = auth\.uid\(\) and public\.can_see_project\(project_id\)/);
  });
  it('stamps the time on the server', () => {
    expect(sql).toMatch(/seen_at := now\(\)|seen_at = now\(\)/);
  });
});
