// A TEAMMATE GIVES A MISROUTED THREAD TO AN AGENT WHEN YOU SAY SO (w-064dd249d2).
//
// "How complex would it be for us to do something like that?", a question
// about building a cloud browser that keeps logins, was sent To Auto and went
// to the Performance lead. Asked "this was routed to the wrong agent. should
// have just been a basic thread. please fix it", the teammate could not:
// update_work_item puts a teammate label back on every write
// (`keepRunLabels`), and only the person's "Give it to someone else" writes
// `routed`. So a write that quotes the person's own words saying it went to
// the wrong one now gives the thread to an ordinary agent, as that button
// would. Without their words, nothing moves.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';

const SAID = 'this was routed to the wrong agent. should have just been a basic thread. please fix it';

describe('giving a thread a teammate took to an ordinary agent', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Misrouted ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
    store = await import('../main/store/work-items.mts');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const routedTo = (mate: string, { labels = ['founder'], answer = SAID } = {}) => {
    // Labels on the app's authority, as a thread sent To Auto carries them.
    const row = work.createItem(product.id, { title: 'How complex would it be for us to do something like that?' }, { source: 'founder' });
    store.updateWorkItem(dir, row.id, {
      labels: [...labels, `teammate:${mate}`],
      routed: { to: `mate:${mate}`, why: 'It keeps your cloud runs working.', at: Date.now(), by: 'auto' },
    }, { source: 'system' });
    if (answer) store.updateWorkItem(dir, row.id, { answer }, { source: 'founder' });
    return row;
  };

  it('goes to an agent when the teammate quotes their words', async () => {
    const row = routedTo('t-perf');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { toAnAgentBecause: 'should have just been a basic thread' });
    expect(after.labels).toEqual(['founder']);
    expect(after.routed).toMatchObject({ to: 'agent', by: 'you' });
    expect(after.notGivenToAnAgent).toBeUndefined();
    expect(store.readWorkItem(dir, row.id).labels).not.toContain('teammate:t-perf');
  });

  it('keeps the rest of the write', async () => {
    const row = routedTo('t-perf');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { toAnAgentBecause: 'routed to the wrong agent', note: 'Given to an agent.' });
    expect(after.note).toBe('Given to an agent.');
    expect(after.routed?.to).toBe('agent');
  });

  it('stays with the teammate when the words are not theirs', async () => {
    const row = routedTo('t-perf');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { toAnAgentBecause: 'not my job', note: 'Tried.' });
    expect(after.labels).toContain('teammate:t-perf');
    expect(after.routed?.to).toBe('mate:t-perf');
    expect(after.notGivenToAnAgent).toMatch(/their exact words/);
    expect(after.note).toBe('Tried.');
  });

  it('stays with the teammate on a thread the person did not write', async () => {
    const row = routedTo('t-perf', { labels: [] });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { toAnAgentBecause: 'should have just been a basic thread' });
    expect(after.labels).toContain('teammate:t-perf');
    expect(after.notGivenToAnAgent).toBeTruthy();
  });

  it('says so on a thread no teammate has', async () => {
    const row = work.createItem(product.id, { title: 'fix the build' }, { source: 'founder' });
    store.updateWorkItem(dir, row.id, { labels: ['founder'] }, { source: 'system' });
    store.updateWorkItem(dir, row.id, { answer: SAID }, { source: 'founder' });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { toAnAgentBecause: 'should have just been a basic thread' });
    expect(after.labels).toEqual(['founder']);
    expect(after.routed).toBeUndefined();
    expect(after.notGivenToAnAgent).toMatch(/already/);
  });
});
