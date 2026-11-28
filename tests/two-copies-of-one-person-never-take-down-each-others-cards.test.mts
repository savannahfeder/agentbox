// TWO COPIES OF ONE PERSON NEVER TAKE DOWN EACH OTHER'S CARDS.
//
// The Supabase spend check (2026-11-28) found thread_cards losing about 2,000
// rows a minute to deletes while the table stayed at 434 rows, and the
// database rolling back about 7 transactions a minute. Two copies of the app
// were signed in as the same person: one listed 426 threads, a new one listed
// only its 8 Email threads. Every pass, each copy deleted "every card of mine
// I do not list", so the new copy tried to delete the other's 426 cards, and
// with them their shared work (2.6 GB, by ON DELETE CASCADE). That ran past the
// 8 second statement timeout and rolled back, the pass failed before it
// recorded what it sent, so the next pass sent its 8 cards again and the other
// copy deleted those: a loop of realtime messages, and one fast enough database
// away from wiping a person's board.
//
// A copy now takes down only cards it sent itself and no longer lists.
import { it, expect, beforeEach } from 'vitest';
import * as disk from '../main/store/work-items.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamSync, memorySyncState } from '../main/team/sync.mts';
import type { SyncCard } from '../main/team/sync.mts';
import { supabaseBackend } from '../main/team/supabase-backend.mts';

type Cloud = ReturnType<typeof createMemoryCloud>;

const card = (id: string, over: Partial<SyncCard> = {}): SyncCard => ({
  threadId: id, visible: true, title: `Thread ${id}`, project: 'Website', state: 'waiting',
  priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000, ...over,
});

let cloud: Cloud;
let teamId: string;
let mayaId: string;
let theo: ReturnType<typeof memoryBackend>;
let writes: number;
let deletes: string[];

function copyOf(cards: SyncCard[]) {
  const backend = memoryBackend(cloud, mayaId);
  return createTeamSync({ backend, disk, state: memorySyncState(), listShared: () => [], joinProject: () => null, listCards: () => cards.slice(), teamIdOf: () => teamId });
}

const board = async () => (await theo.listCards()).filter((c) => c.personId === mayaId).map((c) => c.threadId).sort();

beforeEach(async () => {
  cloud = createMemoryCloud();
  mayaId = signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' });
  const theoId = signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo' });
  const maya = memoryBackend(cloud, mayaId);
  theo = memoryBackend(cloud, theoId);
  teamId = (await maya.createTeam('Northwind')).id;
  await maya.invite(teamId, 'theo@northwind.test');
  await theo.acceptInvite(teamId);
  writes = 0;
  deletes = [];
  const set = cloud.cards.set.bind(cloud.cards);
  cloud.cards.set = (key, value) => { writes += 1; return set(key, value); };
  const del = cloud.cards.delete.bind(cloud.cards);
  cloud.cards.delete = (key) => { if (cloud.cards.has(key)) deletes.push(key.split(':')[1]); return del(key); };
});

const main = Array.from({ length: 10 }, (_, i) => card(`w-main-${i}`));
const email = Array.from({ length: 3 }, (_, i) => card(`w-mail-${i}`, { project: 'Email' }));

it('a new copy with a few threads leaves the other copy\'s cards on the board', async () => {
  const mac = main.slice();
  await copyOf(mac).syncOnce();
  await copyOf(email.slice()).syncOnce();
  expect(deletes).toEqual([]);
  expect(await board()).toEqual([...main, ...email].map((c) => c.threadId).sort());
});

it('neither copy deletes or re-sends the other\'s cards as their own threads change', async () => {
  const mac = main.slice();
  const macCopy = copyOf(mac);
  const mail = email.slice();
  const mailCopy = copyOf(mail);
  await macCopy.syncOnce();
  await mailCopy.syncOnce();
  writes = 0;
  for (let pass = 1; pass <= 5; pass += 1) {
    mac[0] = { ...mac[0], updatedAt: 1_790_000_000_000 + pass };
    await macCopy.syncOnce();
    await mailCopy.syncOnce();
  }
  expect(deletes).toEqual([]);
  expect(writes).toBe(5);
  expect(await board()).toEqual([...main, ...email].map((c) => c.threadId).sort());
});

it('a copy still takes down a card it sent and no longer lists', async () => {
  const mac = main.slice();
  const macCopy = copyOf(mac);
  await macCopy.syncOnce();
  await copyOf(email.slice()).syncOnce();
  const dropped = mac.splice(4, 1)[0];
  await macCopy.syncOnce();
  expect(deletes).toEqual([dropped.threadId]);
  expect(await board()).not.toContain(dropped.threadId);
  expect(await board()).toEqual(expect.arrayContaining(email.map((c) => c.threadId)));
});

it('the database is asked to delete only the cards named, never every card not listed', async () => {
  const asked: { eq: [string, unknown][]; in: [string, unknown][]; not: unknown[] }[] = [];
  const answer = { data: null, error: null };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }), getSession: async () => ({ data: { session: { user: { id: 'me' } } }, error: null }) },
    from: () => ({
      upsert: async () => answer,
      delete: () => {
        const d = { eq: [] as [string, unknown][], in: [] as [string, unknown][], not: [] as unknown[] };
        asked.push(d);
        const chain = {
          eq: (col: string, v: unknown) => { d.eq.push([col, v]); return chain; },
          in: (col: string, v: unknown) => { d.in.push([col, v]); return chain; },
          not: (...args: unknown[]) => { d.not.push(args); return chain; },
          then: (ok: (v: typeof answer) => unknown) => Promise.resolve(answer).then(ok),
        };
        return chain;
      },
    }),
  };
  const backend = supabaseBackend(client as unknown as Parameters<typeof supabaseBackend>[0]);
  await backend.putCards('team', [card('w-a')], new Set(), []);
  expect(asked).toEqual([]);
  await backend.putCards('team', [card('w-a')], new Set(), ['w-b']);
  expect(asked).toEqual([{ eq: [['person_id', 'me']], in: [['thread_id', ['w-b']]], not: [] }]);
});
