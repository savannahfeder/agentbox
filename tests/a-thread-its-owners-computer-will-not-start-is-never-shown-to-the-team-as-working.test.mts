// A THREAD ITS OWNER'S COMPUTER WILL NOT START IS NEVER SHOWN TO THE TEAM AS WORKING.
//
// Three synthetic testers on one team, three rounds: a teammate's Codex runbook
// read "Working on" on the Team page while Codex was out of usage and nothing
// had run, and another teammate's stopped agent read as working on Everyone.
// Measured with `cardsFor` on the rows as the store holds them: a thread sent to
// an agent and not picked up is published as 'running' whatever the owner's
// supervisor knows, because the card never heard what the supervisor says will
// not start (`status()`: atLimit, signInNeeded, cannotStart, stalled).
//
// Now the supervisor's own lists reach the card. A thread on them is 'waiting',
// and one held by its tool says on what, as a wait in plain words, the shape
// every card drawing already reads as "Waits on …".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardsFor } from '../shared/thread-cards.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const project = { name: 'Payments API', dir: '/nowhere' };
const row = (o: Record<string, unknown>) => ({ product: 'payments', status: 'open', labels: ['founder'], title: o.id, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000, ...o }) as { id: string } & Record<string, unknown>;
const cardOf = (item: { id: string }, wontStart = {}, running: string[] = []) =>
  cardsFor({ products: [project], readItems: () => [item] as never, now: NOW, running, wontStart })[0];

const runbook = row({ id: 'w-runbook', title: 'Stripe runbook' });

describe('a thread nothing will start', () => {
  it('while its tool is out of usage is waiting, and waits on that usage', () => {
    const card = cardOf(runbook, { atLimit: { 'w-runbook': { tool: 'Codex', until: 0 } } });
    expect(card.state).toBe('waiting');
    expect(card.blockedBy).toEqual([{ id: 'name:Codex usage', title: 'Codex usage' }]);
  });

  it('while its tool is signed out, or not installed, says which', () => {
    expect(cardOf(runbook, { signInNeeded: { 'w-runbook': 'Codex' } })).toMatchObject({ state: 'waiting', blockedBy: [{ title: 'a Codex sign-in' }] });
    expect(cardOf(runbook, { cannotStart: { 'w-runbook': { why: 'engine', tool: 'Codex' } } })).toMatchObject({ state: 'waiting', blockedBy: [{ title: 'Codex being installed' }] });
    expect(cardOf(runbook, { cannotStart: { 'w-runbook': { why: 'login', tool: 'Claude Code' } } })).toMatchObject({ state: 'waiting', blockedBy: [{ title: 'a Claude Code sign-in' }] });
  });

  it('that the supervisor names stalled is waiting on its owner', () => {
    const card = cardOf(runbook, { stalled: ['w-runbook'] });
    expect(card.state).toBe('waiting');
    expect(card.blockedBy).toEqual([]);
  });

  it('whose last run died at the limit says so once, as the wait and not again as the solution', () => {
    const died = row({
      id: 'w-died', result: 'Codex is at its usage limit on Plus, so nothing has been done on this task. It starts again on its own when the limit resets.',
      wrote: { result: { ts: NOW - 60_000, source: 'agent' } },
    });
    const card = cardOf(died, { atLimit: { 'w-died': { tool: 'Codex', until: 0 } } });
    expect(card.state).toBe('waiting');
    expect(card.blockedBy.map((b) => b.title)).toEqual(['Codex usage']);
    expect(card.solution).toBeNull();
  });
});

describe('what keeps its state', () => {
  it('a thread waiting its turn, with nothing in its way, is running as before', () => {
    expect(cardOf(runbook).state).toBe('running');
    expect(cardOf(runbook, { cannotStart: { 'w-runbook': { why: 'memory', tool: 'Codex' } } }).state).toBe('running');
  });

  it('a live claim, or a run going, is running even with its tool now at the limit', () => {
    const claimed = row({ id: 'w-runbook', status: 'claimed', claim: { holder: 'mcp-1' } });
    const limit = { atLimit: { 'w-runbook': { tool: 'Codex', until: 0 } } };
    expect(cardOf(claimed, limit)).toMatchObject({ state: 'running', blockedBy: [] });
    expect(cardOf(row({ id: 'w-runbook', result: 'Second turn.' }), limit, ['w-runbook'])).toMatchObject({ state: 'running', blockedBy: [] });
  });

  it('a done thread stays done', () => {
    expect(cardOf(row({ id: 'w-runbook', status: 'done' }), { stalled: ['w-runbook'], atLimit: { 'w-runbook': { tool: 'Codex', until: 0 } } })).toMatchObject({ state: 'done', blockedBy: [] });
  });

  it('a thread with an ordinary answer is waiting with no wait added, even with its tool out of usage', () => {
    const answered = row({ id: 'w-runbook', result: 'The runbook is in docs/stripe.md.', wrote: { result: { ts: NOW - 60_000, source: 'agent' } } });
    const card = cardOf(answered, { atLimit: { 'w-runbook': { tool: 'Codex', until: 0 } } });
    expect(card).toMatchObject({ state: 'waiting', blockedBy: [], solution: 'The runbook is in docs/stripe.md.' });
  });
});

describe('through the team service, as a teammate reads it', () => {
  let cloud: ReturnType<typeof createMemoryCloud>;
  const macs: { personId: string; store: Store; service: ReturnType<typeof createTeamService> }[] = [];
  let atLimit: Record<string, { tool: string; until: number }> = {};

  async function aMac(personId: string, wontStart?: () => object) {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wont-start-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({
      session: memorySession(() => memoryBackend(cloud, personId)),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      ...(wontStart ? { wontStart } : {}),
    } as Parameters<typeof createTeamService>[0]);
    const mac = { personId, store, service };
    macs.push(mac);
    return mac;
  }

  beforeEach(() => { disk._internals.forgetFolds(); cloud = createMemoryCloud(); atLimit = {}; macs.length = 0; });
  afterEach(async () => { disk.setLineAuthor(null); for (const m of macs) await m.service.signOut(); });

  it("Theo's runbook reads running on Lena's copy until Codex runs out, then waits on Codex usage", async () => {
    const theo = await aMac(signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }), () => ({ atLimit }));
    const lena = await aMac(signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Ito' }));
    await theo.service.signIn();
    await theo.service.createTeam('Northwind');
    await theo.service.invite('lena@nw.test');
    await lena.service.signIn();
    await lena.service.acceptInvite(theo.service.state().team!.id);
    disk.setLineAuthor(theo.personId);
    const t = theo.store.composeItem('website', { title: 'Codex runbook', body: 'Write the runbook.' });
    const seen = async () => {
      for (const m of [theo, lena, theo, lena]) await m.service.syncNow();
      return lena.service.state().cards!.find((c) => c.threadId === t.id)!;
    };
    expect((await seen()).state).toBe('running');
    atLimit = { [t.id]: { tool: 'Codex', until: 0 } };
    expect(await seen()).toMatchObject({ state: 'waiting', blockedBy: [{ id: 'name:Codex usage', title: 'Codex usage' }] });
  });
});
