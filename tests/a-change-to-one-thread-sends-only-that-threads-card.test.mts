// A CHANGE TO ONE THREAD SENDS ONLY THAT THREAD'S CARD.
//
// Supabase warned that the organisation holding Agentbox's database had used
// 6,173,999 realtime messages against 5,500,000. The database's own counters
// (2026-11-21) showed thread_cards rewritten 3,038 times in two minutes, all of
// it one person's 434 cards, while only four cards had changed in 30 seconds:
// a running thread checks in every 100 seconds, which moves its card's time,
// and the sync sent every card again whenever any one of them changed. Each
// row rewritten is one realtime message to every Mac listening.
//
// Counted here as rows the cloud writes, which is what a teammate's Mac hears.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamSync, memorySyncState, fileSyncState } from '../main/team/sync.mts';
import type { SyncCard, SyncState } from '../main/team/sync.mts';
import { supabaseBackend } from '../main/team/supabase-backend.mts';

type Cloud = ReturnType<typeof createMemoryCloud>;

const card = (n: number, over: Partial<SyncCard> = {}): SyncCard => ({
  threadId: `w-${String(n).padStart(10, '0')}`, visible: true, title: `Thread ${n}`, project: 'Website', state: 'waiting',
  priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000, ...over,
});

let cloud: Cloud;
let written: string[];
let teamId: string;
let mayaId: string;
let theo: ReturnType<typeof memoryBackend>;

function macOf(cards: SyncCard[], state: SyncState = memorySyncState()) {
  const backend = memoryBackend(cloud, mayaId);
  const sync = createTeamSync({ backend, disk, state, listShared: () => [], joinProject: () => null, listCards: () => cards.slice(), teamIdOf: () => teamId });
  return { backend, sync };
}

const theoSees = async () => (await theo.listCards()).filter((c) => c.personId === mayaId);

beforeEach(async () => {
  cloud = createMemoryCloud();
  mayaId = signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' });
  const theoId = signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo' });
  const maya = memoryBackend(cloud, mayaId);
  theo = memoryBackend(cloud, theoId);
  teamId = (await maya.createTeam('Northwind')).id;
  await maya.invite(teamId, 'theo@northwind.test');
  await theo.acceptInvite(teamId);
  written = [];
  const set = cloud.cards.set.bind(cloud.cards);
  cloud.cards.set = (key, value) => { written.push(key.split(':')[1]); return set(key, value); };
});

describe('the cards a Mac sends', () => {
  it('go up whole on the first pass', async () => {
    const cards = Array.from({ length: 50 }, (_, i) => card(i));
    await macOf(cards).sync.syncOnce();
    expect(written).toHaveLength(50);
    expect(await theoSees()).toHaveLength(50);
  });

  it('send only the one that changed, and the rest stay as they were', async () => {
    const cards = Array.from({ length: 50 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    written.length = 0;
    cards[7] = { ...cards[7], updatedAt: 1_790_000_100_000 };
    await mac.sync.syncOnce();
    expect(written).toEqual([cards[7].threadId]);
    const seen = await theoSees();
    expect(seen).toHaveLength(50);
    expect(seen.find((c) => c.threadId === cards[7].threadId)?.updatedAt).toBe(1_790_000_100_000);
  });

  it('send two when two changed', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    written.length = 0;
    cards[2] = { ...cards[2], state: 'running' };
    cards[5] = { ...cards[5], title: 'Renamed' };
    await mac.sync.syncOnce();
    expect(written.sort()).toEqual([cards[2].threadId, cards[5].threadId].sort());
  });

  it('send nothing when nothing changed', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    let calls = 0;
    const put = mac.backend.putCards;
    mac.backend.putCards = async (...args) => { calls += 1; return put(...args); };
    written.length = 0;
    await mac.sync.syncOnce();
    await mac.sync.syncOnce();
    expect(calls).toBe(0);
    expect(written).toEqual([]);
  });

  it('take a card off the board without sending the others again', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    written.length = 0;
    const gone = cards.splice(3, 1)[0];
    await mac.sync.syncOnce();
    expect(written).toEqual([]);
    const seen = await theoSees();
    expect(seen).toHaveLength(9);
    expect(seen.some((c) => c.threadId === gone.threadId)).toBe(false);
  });

  it('take a thread made private off the board', async () => {
    const cards = Array.from({ length: 4 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    written.length = 0;
    cards[1] = { ...cards[1], visible: false, title: null };
    await mac.sync.syncOnce();
    expect(written).toEqual([]);
    expect((await theoSees()).map((c) => c.threadId)).toEqual([cards[0], cards[2], cards[3]].map((c) => c.threadId));
  });

  it('send nothing when only a private thread changed', async () => {
    const cards = [card(1), card(2, { visible: false, title: null })];
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    let calls = 0;
    const put = mac.backend.putCards;
    mac.backend.putCards = async (...args) => { calls += 1; return put(...args); };
    cards[1] = { ...cards[1], state: 'running' };
    await mac.sync.syncOnce();
    expect(calls).toBe(0);
  });

  it('send a changed card again on the next pass when the send failed', async () => {
    const cards = Array.from({ length: 5 }, (_, i) => card(i));
    const mac = macOf(cards);
    await mac.sync.syncOnce();
    const put = mac.backend.putCards;
    mac.backend.putCards = async () => { throw new Error('offline'); };
    cards[0] = { ...cards[0], state: 'running' };
    await expect(mac.sync.syncOnce()).rejects.toThrow('offline');
    mac.backend.putCards = put;
    written.length = 0;
    await mac.sync.syncOnce();
    expect(written).toEqual([cards[0].threadId]);
  });

  it('are remembered across a restart, so an unchanged board sends nothing', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cards-sent-')), 'team-sync.json');
    const cards = Array.from({ length: 6 }, (_, i) => card(i));
    await macOf(cards, fileSyncState(file, fs)).sync.syncOnce();
    written.length = 0;
    await macOf(cards, fileSyncState(file, fs)).sync.syncOnce();
    expect(written).toEqual([]);
    cards[4] = { ...cards[4], updatedAt: 1_790_000_200_000 };
    await macOf(cards, fileSyncState(file, fs)).sync.syncOnce();
    expect(written).toEqual([cards[4].threadId]);
  });

  it('go up whole once after an update from the copy that kept one fingerprint for them all', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cards-sent-')), 'team-sync.json');
    fs.writeFileSync(file, JSON.stringify({ cardsHash: 'from-before' }));
    const cards = Array.from({ length: 6 }, (_, i) => card(i));
    await macOf(cards, fileSyncState(file, fs)).sync.syncOnce();
    expect(written).toHaveLength(6);
  });
});

describe('the real database', () => {
  // A stand-in for supabase-js that keeps what was asked of thread_cards.
  function client() {
    const upserts: Record<string, unknown>[][] = [];
    const deletes: { eq: [string, unknown][]; not: [string, string, unknown][] }[] = [];
    const answer = { data: null, error: null };
    const deleting = () => {
      const d = { eq: [] as [string, unknown][], not: [] as [string, string, unknown][] };
      deletes.push(d);
      const chain = {
        eq: (col: string, v: unknown) => { d.eq.push([col, v]); return chain; },
        not: (col: string, op: string, v: unknown) => { d.not.push([col, op, v]); return chain; },
        then: (ok: (v: typeof answer) => unknown) => Promise.resolve(answer).then(ok),
      };
      return chain;
    };
    const c = {
      auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }), getSession: async () => ({ data: { session: { user: { id: 'me' } } }, error: null }) },
      from: (table: string) => {
        if (table !== 'thread_cards') throw new Error(`not here: ${table}`);
        return { upsert: async (rows: Record<string, unknown>[]) => { upserts.push(rows); return answer; }, delete: deleting };
      },
    };
    return { backend: supabaseBackend(c as unknown as Parameters<typeof supabaseBackend>[0]), upserts, deletes };
  }

  it('rewrites only the cards it is told changed, and keeps every card still listed', async () => {
    const { backend, upserts, deletes } = client();
    const cards = Array.from({ length: 5 }, (_, i) => card(i));
    await backend.putCards('team', cards, new Set([cards[3].threadId]));
    expect(upserts.map((rows) => rows.map((r) => r.thread_id))).toEqual([[cards[3].threadId]]);
    expect(String(deletes[0].not[0][2])).toBe(`(${cards.map((c) => `"${c.threadId}"`).join(',')})`);
  });

  it('rewrites nothing when nothing changed, and still clears a card no longer listed', async () => {
    const { backend, upserts, deletes } = client();
    await backend.putCards('team', [card(1)], new Set());
    expect(upserts).toEqual([]);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].eq).toEqual([['person_id', 'me']]);
  });

  it('rewrites every card when it is not told which changed', async () => {
    const { backend, upserts } = client();
    await backend.putCards('team', [card(1), card(2), card(3, { visible: false })]);
    expect(upserts.map((rows) => rows.map((r) => r.thread_id))).toEqual([[card(1).threadId, card(2).threadId]]);
  });
});
