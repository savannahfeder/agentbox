// A TEAMMATE ASKED TO HELP ANSWERS THE STEP ON THE OWNER'S THREAD (2026-11-20).
//
// Synthetic team run: Sam asked Theo to help with one step of "Idempotency key
// for POST appointments", where the agent offered two options. On Theo's copy
// the options were plain text, and his only ways in were a comment ("did not
// start the agent"), which Sam then had to relay, or Continue it yourself,
// which takes the thread off Sam. Now, while the owner's help ask waits on
// him, Theo's page offers the options as buttons and his box answers the
// owner's agent. On the owner's copy that answer is the thread's reply under
// Theo's name: the agent runs on it, the thread stays the owner's, the wait
// ends saying Theo answered. A review ask, someone else's comment, or one
// written before the ask stays a comment. Measured on the rules, the ledger
// and two copies of the app over the in-memory cloud.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askedPatch, answersTheStep, helpAnswers } from '../shared/thread-ask.mts';
import { personWait } from '../shared/thread-waits.mts';
import { toldBy } from '../shared/answers.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const at = 1_000_000;
const asking = (want: 'help' | 'review', o = {}) => ({
  status: 'blocked', ...askedPatch(['p-theo'], 'Asked Theo', at, want),
  wrote: { blockedBy: { source: 'founder', ts: at }, asked: { source: 'founder', ts: at } }, ...o,
});

describe('whose words answer the step', () => {
  it('the person a help ask waits on, after it was asked', () => {
    expect(helpAnswers(asking('help'), 'p-theo', at + 1)).toBe(true);
  });
  it('not on a review ask, from someone else, from before the ask, or once the wait is over', () => {
    expect(helpAnswers(asking('review'), 'p-theo', at + 1)).toBe(false);
    expect(helpAnswers(asking('help'), 'p-jun', at + 1)).toBe(false);
    expect(helpAnswers(asking('help'), 'p-theo', at - 1)).toBe(false);
    expect(helpAnswers(asking('help', { blockedBy: [] }), 'p-theo', at + 1)).toBe(false);
  });
  it('the helper\'s copy reads it off the card', () => {
    const card = { blockedBy: [{ id: personWait('p-theo'), title: null, want: 'help' as const }] };
    expect(answersTheStep(card, 'p-theo')).toBe(true);
    expect(answersTheStep(card, 'p-jun')).toBe(false);
    expect(answersTheStep({ blockedBy: [{ id: personWait('p-theo'), title: null, want: 'review' as const }] }, 'p-theo')).toBe(false);
    expect(answersTheStep({ blockedBy: [{ id: personWait('p-theo'), title: null }] }, 'p-theo')).toBe(false);
  });
});

describe('the answer on the owner\'s thread', () => {
  it('is drawn as the helper answering, not as handing it over', () => {
    const events = threadEvents([
      { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Idempotency', body: 'Add a key' } },
      { id: 'w-1', ts: 2, source: 'system', uid: 'comment-c1', patch: { answer: 'Use a Postgres table', from: { teammate: 'p-theo', name: 'Theo Park' } } },
    ]);
    const said = events.find((e) => e.words === 'Use a Postgres table');
    expect(said?.said).toBe('Theo Park answered');
  });
});

describe('on two copies of the app', () => {
  async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'help-answers-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
    return { personId, store, service };
  }
  let sam: Awaited<ReturnType<typeof aMac>>;
  let theo: Awaited<ReturnType<typeof aMac>>;
  let thread: { id: string };
  const both = async () => { for (let k = 0; k < 2; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@nw.test', name: 'Sam Rivera' }));
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
    await sam.service.signIn();
    await sam.service.createTeam('Northwind');
    await sam.service.invite('theo@nw.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(sam.service.state().team.id);
    disk.setLineAuthor(sam.personId);
    thread = sam.store.composeItem('api', { title: 'Idempotency key for POST appointments', body: 'Add an idempotency key.', visibility: 'team' });
    sam.store.recordSessionResult('api', thread.id, { result: 'Where should idempotency keys be stored?\n\n## Options\n1. Postgres table\n2. Redis with a TTL' });
  });
  afterEach(async () => { disk.setLineAuthor(null); await sam.service.signOut(); await theo.service.signOut(); });

  const ask = (want: 'help' | 'review') => sam.store.threadEdit('api', thread.id, askedPatch([theo.personId], 'Asked Theo', Date.now() - 1000, want));

  it('the helper\'s copy sees that the step is theirs to answer', async () => {
    ask('help');
    await both();
    const card = theo.service.state().cards.find((c: { threadId: string }) => c.threadId === thread.id);
    expect(answersTheStep(card, theo.personId)).toBe(true);
  });

  it('a help answer is the thread\'s reply under the helper\'s name, and the wait ends', async () => {
    ask('help');
    await both();
    await theo.service.commentOnThread(sam.personId, thread.id, 'Postgres table');
    await both();
    const row = sam.store.readItem('api', thread.id);
    expect(row.answer).toBe('Postgres table');
    expect(toldBy(row)).toEqual({ name: 'Theo Park', teammate: theo.personId });
    expect(row.status).toBe('open');
    expect(row.blockedBy).toEqual([]);
    expect(row.waitEnded?.said).toBe('Theo answered this step');
    expect(row.waitingComments ?? []).toEqual([]);
    expect(row.createdBy).toBe(sam.personId);
  });

  it('is written once however often the copies sync', async () => {
    ask('help');
    await both();
    await theo.service.commentOnThread(sam.personId, thread.id, 'Postgres table');
    await both();
    await both();
    const answers = sam.store.readHistory('api', thread.id, { max: 1000 }).filter((l: { patch?: { answer?: string } }) => l.patch?.answer === 'Postgres table');
    expect(answers).toHaveLength(1);
  });

  it('a review stays a comment for the owner to read', async () => {
    ask('review');
    await both();
    await theo.service.commentOnThread(sam.personId, thread.id, 'Looks right');
    await both();
    const row = sam.store.readItem('api', thread.id);
    expect(row.answer ?? null).toBeNull();
    expect(row.waitingComments?.map((c: { text: string }) => c.text)).toEqual(['Looks right']);
  });
});

describe('the options a helper can press', () => {
  it('are the agent\'s newest offer, and none once someone replied after it', async () => {
    const { optionsToAnswer } = await import('../renderer/src/threads/TeammateThread.tsx');
    const { itemThread } = await import('../renderer/src/item-thread.ts');
    const lines = [
      { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Idempotency', body: 'Add a key.' } },
      { id: 'w-1', ts: 2, source: 'agent', patch: { result: 'Where should keys be stored?\n\n## Options\n1. Postgres table (recommended)\n2. Redis with a TTL' } },
    ];
    const events = (ls: typeof lines) => itemThread(ls, [], null, { whole: true });
    expect(optionsToAnswer(events(lines)).map((o) => o.text)).toEqual(['Postgres table (recommended)', 'Redis with a TTL']);
    expect(optionsToAnswer(events([...lines, { id: 'w-1', ts: 3, source: 'founder', patch: { answer: 'Postgres' } }]))).toEqual([]);
    expect(optionsToAnswer(events([...lines, { id: 'w-1', ts: 3, source: 'agent', patch: { result: 'Done, used Postgres.' } }]))).toEqual([]);
  });
});

describe('the helper\'s page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('offers the step\'s options and says the box answers the agent', () => {
    expect(page).toContain('answersTheStep(card, team?.me ?? null)');
    expect(page).toContain('const options = helping ? optionsToAnswer({ events, outcome: built.outcome }) : [];');
    expect(page).toContain("`Goes to ${owner}'s agent.`");
  });
});
