// A THREAD THAT WAITS ON SOMEONE ELSE IS NOT IN NEEDS YOU.
//
// On a team, an engineer's threads blocked until Jordan's code or waiting for Sofia's
// pins sat in Needs you with one choice, "Wait for Jordan's code, then work
// through the checklist (recommended)"; he pressed it to clear them and they
// came back. Measured here: only a wait a person set (`setByPerson`) took a
// thread out of Needs you and said whom it waited on. An agent had no way to
// write "waits on Sofia", and a blocked row with no thread to wait on stays in
// Needs you, so asking him to say "keep waiting" was all it could do.
//
// A wait on a person still ends: when that person writes, or after three days,
// the thread comes back to Needs you saying so (`endedWaits`).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { legacyRoot } from '../main/store/project.mjs';
import { teamDir, writeTeamView } from '../main/store/teammates-files.mjs';
import { personWait, cardWait, setByPerson, endedWaits, waitWords, WAIT_GIVES_UP_MS } from '../shared/thread-waits.mjs';
import { belongsInInbox, belongsInProgress, waitCameBack } from '../renderer/src/list-rules.ts';

const now = new Date(2026, 9, 31, 8).getTime();
const at = now - 3_600_000;
const names = { dev: 'Dev Patel', sofia: 'Sofia Reyes', jordan: 'Jordan Lee' };
const ctx = (o = {}) => ({ items: [], cards: [], lastWordFrom: () => 0, nameOf: (id) => names[id] ?? 'Someone', now, ...o });
const agentWait = (on, o = {}) => ({
  id: 'w-1', product: 'lumen', title: 'Double booking race', status: 'blocked', labels: ['founder'], createdBy: 'dev',
  result: 'Blocked until Jordan sends the booking server code.', blockedBy: on,
  wrote: { status: { source: 'agent', ts: at }, blockedBy: { source: 'agent', ts: at } }, updatedAt: at, ...o,
});

describe('an agent\'s wait on someone else', () => {
  it('is out of Needs you and says whom it waits on', () => {
    const i = agentWait([personWait('jordan')]);
    expect(belongsInInbox(i, { now })).toBe(false);
    expect(belongsInProgress(i, { now })).toBe(false);
    expect(waitWords(i, ctx())).toEqual({ word: 'Waits on Jordan', title: 'Waits on Jordan' });
  });

  it('on a teammate\'s thread too, and on a row the agent left open', () => {
    expect(belongsInInbox(agentWait([cardWait('sofia', 'w-9')]), { now })).toBe(false);
    expect(belongsInInbox(agentWait([personWait('sofia')], { status: 'open' }), { now })).toBe(false);
  });

  it('comes back to Needs you when that person writes, or after three days', () => {
    const i = agentWait([personWait('sofia')]);
    expect(endedWaits([i], ctx())).toEqual([]);
    expect(endedWaits([i], ctx({ lastWordFrom: (p) => (p === 'sofia' ? now : 0) }))[0].said).toBe('Sofia wrote to you');
    expect(endedWaits([i], ctx({ now: at + WAIT_GIVES_UP_MS }))[0].said).toBe('Still waiting on Sofia after 3 days');
    const back = { ...i, blockedBy: [], waitEnded: { said: 'Sofia wrote to you', at: now } };
    expect(waitCameBack(back)).toBe(true);
    expect(belongsInInbox(back, { now })).toBe(true);
  });
});

describe('what stays in Needs you', () => {
  it('a wait on the thread\'s own owner, which is a question for them', () => {
    expect(setByPerson(agentWait([personWait('dev')]))).toBe(false);
    expect(belongsInInbox(agentWait([personWait('dev')]), { now })).toBe(true);
  });

  it('the agent\'s answer to a reply sent after it wrote the wait', () => {
    const replied = agentWait([personWait('jordan')], { status: 'open', answer: 'Jordan says next week.', result: 'Then shall I mock the API for now?', answeredThrough: at + 1 });
    replied.wrote = { ...replied.wrote, answer: { source: 'founder', ts: at + 1 }, result: { source: 'agent', ts: at + 2 } };
    expect(belongsInInbox(replied, { now })).toBe(true);
  });

  it('a blocked row that names nobody it waits on', () => {
    expect(belongsInInbox(agentWait([]), { now })).toBe(true);
  });

  it('a thread nothing will start again, whatever it waits on', () => {
    expect(belongsInInbox(agentWait([personWait('jordan')]), { now, stopped: true })).toBe(true);
  });

  it('a wait on another of your threads keeps the old rule', () => {
    expect(setByPerson(agentWait(['w-9']))).toBe(false);
    expect(setByPerson(agentWait([personWait('sofia'), 'w-9']))).toBe(false);
  });
});

describe('the store tool', () => {
  let tools; let work; let claims; let row; let dir;
  beforeEach(async () => {
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mjs')).resolveAccount();
    const product = (await import('../mcp/core/products.mjs')).createProduct(`Lumen ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    work = await import('../mcp/core/work.mjs');
    row = work.createItem(product.id, { title: 'Double booking race', labels: ['founder'] }, { source: 'founder' });
    writeTeamView(teamDir(legacyRoot(), process.env.STORE_ACCOUNT_ID), {
      at: Date.now(), me: { id: 'dev' },
      people: Object.entries(names).map(([id, name]) => ({ id, name })),
    });
    process.env.ZERO_ITEM = row.id;
    process.env.ZERO_PRODUCT = product.id;
    ({ tools } = (await import('../mcp/tools.mjs')).buildTools({ holder: 'test-worker', ownItem: row.id }));
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });
  const update = (patch) => tools.find((t) => t.name === 'update_work_item').run({ id: row.id, ...patch });
  const stored = async () => (await import('../main/store/work-items.mjs')).readWorkItem(dir, row.id);

  it('takes a wait on a person by name, as the id the lists read', async () => {
    await update({ status: 'blocked', blockedBy: ['person:Sofia'] });
    expect((await stored()).blockedBy).toEqual(['person:sofia']);
  });

  it('refuses a name nobody on the team has, and its owner\'s own', async () => {
    expect((await update({ status: 'blocked', blockedBy: ['person:Priya'] })).content[0].text).toMatch(/nobody on the team is called Priya/);
    expect((await update({ status: 'blocked', blockedBy: ['person:Dev'] })).content[0].text).toMatch(/your owner/);
    expect((await stored()).blockedBy ?? []).toEqual([]);
  });
});
