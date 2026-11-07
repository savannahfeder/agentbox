// A TASK AN AGENT FILES FROM A PRIVATE THREAD IS SEEN BY NO MORE PEOPLE THAN
// THAT THREAD.
//
// Asked to check (w-e053ed3581) that private messages stay with the people in
// them. The agent you bring into a chat with @ now gets a task seen only by the
// chat's people. But that agent is often asked to file more ("make tasks from
// findings 1 to 3"), and a task it filed carried no privacy of its own, so in a
// project that reads as the whole team (37 of 38 on one Mac, measured
// 2026-10-05) each follow-up, written from the chat, landed on every
// teammate's board. Now a filed task takes the privacy of the task the agent
// is holding, and of the parent it names, whichever is narrower.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';

const CHAT = ['p-me', 'p-alice'];

describe('a task an agent files', () => {
  let product; let work; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Privacy ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mjs');
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const asked = (fields) => work.createItem(product.id, { title: 'Make tasks from findings 1 to 3', ...fields }, { source: 'founder' });
  // The card a Mac would publish for a row, in a project that reads as the whole team.
  const cardOf = (row) => cardsFor({ products: [{ slug: product.id, name: 'P' }], readItems: () => [row], since: 1 })[0] ?? null;

  it('while holding a chat task: seen by the chat, not the team (the reported case)', async () => {
    const chatTask = asked({ visibility: 'people', visibleTo: CHAT });
    await claims.claim({ id: chatTask.id });
    const filed = claims.file(product.id, { title: 'Finding 1: the export drops rows' });
    expect(filed.visibility).toBe('people');
    expect(filed.visibleTo).toEqual(CHAT);
    expect(cardOf(filed).people).toEqual(CHAT);
  });

  it('while holding a private task: private, and no card at all', async () => {
    const mine = asked({ visibility: 'private' });
    await claims.claim({ id: mine.id });
    const filed = claims.file(product.id, { title: 'A follow-up' });
    expect(filed.visibility).toBe('private');
    expect(cardOf(filed)).toBeNull();
  });

  it('naming a private parent: private, even when the session holds nothing', () => {
    const mine = asked({ visibility: 'people', visibleTo: CHAT });
    const filed = claims.file(product.id, { title: 'A subtask', parent: mine.id });
    expect(filed.visibleTo).toEqual(CHAT);
  });

  it('two sources: the narrower wins, never the wider', async () => {
    const chatTask = asked({ visibility: 'people', visibleTo: CHAT });
    const withCarol = asked({ visibility: 'people', visibleTo: ['p-me', 'p-carol'] });
    await claims.claim({ id: chatTask.id });
    expect(claims.file(product.id, { title: 'x', parent: withCarol.id }).visibleTo).toEqual(['p-me']);
    const priv = asked({ visibility: 'private' });
    expect(claims.file(product.id, { title: 'y', parent: priv.id }).visibility).toBe('private');
  });

  it('while holding a team task: no word of its own, so the project decides, as before', async () => {
    const teamTask = asked({});
    await claims.claim({ id: teamTask.id });
    const filed = claims.file(product.id, { title: 'An ordinary follow-up' });
    expect(filed.visibility).toBeUndefined();
    expect(cardOf(filed).people).toBeNull();
  });

  it('a parent that does not exist is not an error', () => {
    expect(claims.file(product.id, { title: 'z', parent: 'w-nope000000' }).title).toBe('z');
  });
});

describe('the filing tool goes through that rule', () => {
  it('create_work_item files through the session, not around it', () => {
    const tools = fs.readFileSync(new URL('../mcp/tools.mjs', import.meta.url), 'utf8');
    expect(tools).toContain('json(claims.file(product, fields))');
  });
});
