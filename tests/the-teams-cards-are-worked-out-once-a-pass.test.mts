// The team's cards are worked out once a pass.
//
// 2026-11-23: listing the team's cards was 8% of the main thread's busy time
// in the app's CPU record. The sync with the team runs every five seconds, and
// each pass worked the whole list out twice: once to send the cards that
// changed, and again a moment later to send those threads' work. 441 cards on
// that Mac, each one a read of its thread's state, summary and last answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { createTeamSync, memorySyncState } from '../main/team/sync.mts';
import type { SyncCard } from '../main/team/sync.mts';
import { memorySession } from '../main/team/session.mts';
import * as threadCards from '../shared/thread-cards.mts';

// The real rule, counted.
vi.mock('../shared/thread-cards.mts', async (original) => {
  const real = await original<typeof import('../shared/thread-cards.mts')>();
  return { ...real, cardsFor: vi.fn(real.cardsFor) };
});
const workedOut = () => vi.mocked(threadCards.cardsFor).mock.calls.length;

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cards-once-')));
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
type Mac = Awaited<ReturnType<typeof aMac>>;

let cloud: ReturnType<typeof createMemoryCloud>;
let maya: Mac;
let theo: Mac;
const cardOn = (mac: Mac, id: string) => (mac.service.state().cards ?? []).find((c) => c.threadId === id);
const bothSync = async () => { await maya.service.syncNow(); await theo.service.syncNow(); };

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team!.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => { for (const m of [maya, theo]) await m.service.signOut(); });

describe('one pass of the sync with the team', () => {
  it('works the cards out once, for the cards and for their threads\' work alike', async () => {
    for (let n = 0; n < 5; n += 1) maya.store.composeItem('website', { title: `Thread ${n}`, body: 'An ask.', visibility: 'team' });
    await maya.service.syncNow();
    const before = workedOut();
    await maya.service.syncNow();
    expect(workedOut() - before).toBe(1);
  });

  it('still carries a thread made since the last pass to a teammate, card and words', async () => {
    await bothSync();
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'It takes nine seconds.', visibility: 'team' });
    await bothSync();
    expect(cardOn(theo, item.id)?.title).toBe('Checkout is slow');
    const work = theo.service.threadWork(maya.personId, item.id);
    expect(work.shared).toBe(true);
    expect(work.lines.map((l) => l.patch?.body).filter(Boolean)).toEqual(['It takes nine seconds.']);
  });

  it('still takes a thread made private since the last pass away from a teammate, card and words', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'It takes nine seconds.', visibility: 'team' });
    await bothSync();
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(true);
    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await bothSync();
    expect(cardOn(theo, item.id)).toBeUndefined();
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(false);
  });
});

describe('the list handed on to the shared threads', () => {
  const card = (n: number): SyncCard => ({
    threadId: `w-${String(n).padStart(10, '0')}`, visible: true, title: `Thread ${n}`, project: 'Website', state: 'waiting',
    priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000,
  });

  it('is the one the pass read, and is never one left over from a pass that had a team', async () => {
    const personId = signUpMemory(cloud, { email: 'sofia@nw.test', name: 'Sofia' });
    const backend = memoryBackend(cloud, personId);
    let teamId: string | null = (await backend.createTeam('Elsewhere')).id;
    const lists: SyncCard[][] = [];
    const handed: (readonly SyncCard[] | undefined)[] = [];
    const sync = createTeamSync({
      backend, disk, state: memorySyncState(), listShared: () => [], joinProject: () => null, teamIdOf: () => teamId,
      listCards: () => { lists.push([card(1), card(2)]); return lists.at(-1)!; },
      threadShare: { pass: (_team, cards) => { handed.push(cards); } },
    });
    await sync.syncOnce();
    expect(lists).toHaveLength(1);
    expect(handed[0]).toBe(lists[0]);

    teamId = null;
    await sync.syncOnce();
    expect(lists).toHaveLength(1);
    expect(handed[1]).toBeUndefined();
  });
});
