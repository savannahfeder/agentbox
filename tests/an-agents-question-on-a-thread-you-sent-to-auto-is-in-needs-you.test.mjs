// AN AGENT'S QUESTION ON A THREAD YOU SENT TO AUTO IS IN NEEDS YOU.
//
// On a team, Maya sent "Draft our October investor update" to Auto. Its
// agent ended on "Is the draft ready to share...? 1 Share it now
// (recommended) 2 Send me the revenue...", yet the thread read Done and sat in
// no list. Measured here: Auto gave it to a teammate, which adds a
// `teammate:` label, and every rule then took her ask for the teammate's own
// run. The store tool let the agent close it with no words of hers
// (`herRow`), the teammate brief told it to close with `clean`, and
// `isCleanRun` hid it from Needs you.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { belongsInInbox } from '../renderer/src/list-rules';
import { isCleanRun } from '../shared/repeats.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';

const ASK = '**Is the draft ready to share?**\n\n1. Share it now (recommended)\n2. Send me the revenue and shipped items first';
const routed = { to: 'mate:t-chief12345', why: 'Investor updates are the chief of staff\'s work.', at: 1, by: 'auto' };

describe('the store tool', () => {
  let product; let work; let claims; let dir; let store;
  beforeEach(async () => {
    process.env.STORE_ACCOUNT_ID = 'acct-routed-ask';
    fs.mkdirSync(path.join(appHome(), 'accounts', 'acct-routed-ask'), { recursive: true });
    (await import('../mcp/core/account.mjs')).resolveAccount();
    product = (await import('../mcp/core/products.mjs')).createProduct(`Lumen ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(appHome(), 'accounts', 'acct-routed-ask', product.id);
    work = await import('../mcp/core/work.mjs');
    store = await import('../main/store/work-items.mjs');
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });
  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const row = (fields) => work.createItem(product.id, { title: 'Draft our October investor update', ...fields }, { source: 'founder' });
  const finish = async (r, labels) => {
    await claims.claim({ id: r.id });
    return claims.update(r.id, { status: 'done', labels, result: ASK });
  };

  it('leaves her ask open when Auto gave it to a teammate, and it is in Needs you', async () => {
    const r = row({ labels: ['founder', 'teammate:t-chief12345'], routed });
    const after = await finish(r, ['founder', 'teammate:t-chief12345', 'clean']);
    expect(after.status).toBe('open');
    expect(belongsInInbox(store.readWorkItem(dir, r.id))).toBe(true);
  });

  it('leaves it open when she picked the teammate herself', async () => {
    const r = row({ labels: ['founder', 'teammate:t-chief12345'], routed: { ...routed, by: 'you' } });
    expect((await finish(r, ['founder', 'teammate:t-chief12345'])).status).toBe('open');
  });

  it('still lets a teammate close its own run without her words', async () => {
    const r = row({ labels: ['founder', 'teammate:t-chief12345', 'hop:3'] });
    expect((await finish(r, ['founder', 'teammate:t-chief12345', 'hop:3', 'clean'])).status).toBe('done');
  });
});

describe('a clean label', () => {
  const done = (over) => ({ status: 'done', updatedAt: 5_000, wrote: { status: { ts: 5_000, source: 'agent' } }, result: ASK, ...over });

  it('never hides a thread she sent to Auto', () => {
    const i = done({ labels: ['founder', 'teammate:t-chief12345', 'clean'], routed });
    expect(isCleanRun(i)).toBe(false);
    expect(belongsInInbox(i)).toBe(true);
  });

  it('still hides a teammate\'s own quiet run', () => {
    const i = done({ labels: ['founder', 'teammate:t-chief12345', 'hop:3', 'clean'], result: 'Nothing new.' });
    expect(isCleanRun(i)).toBe(true);
    expect(belongsInInbox(i)).toBe(false);
  });
});

describe('what the teammate is told', () => {
  let team; let mate;
  beforeEach(async () => {
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mjs')).resolveAccount();
    const product = (await import('../mcp/core/products.mjs')).createProduct(`Lumen ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    team = new Teammates({
      config: { storeRoot: appHome(), accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
    mate = team.create({ name: 'Chief of staff', role: 'Chief of staff' });
    mate = mate.teammate ?? mate;
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('on her ask, to leave it open; on its own run, that it may close it', () => {
    const labels = ['founder', `teammate:${mate.id}`, 'hop:0'];
    const asked = team.briefFor({ id: 'w-a', labels, routed });
    expect(asked).toMatch(/the person's own ask, sent to you/);
    expect(asked).not.toMatch(/This run is your own work/);
    expect(team.briefFor({ id: 'w-b', labels })).toMatch(/This run is your own work/);
  });
});
