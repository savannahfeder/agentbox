// AN AI TEAMMATE IS RENAMED, GIVEN A NEW JOB AND RESCHEDULED ON ITS PAGE.
//
// "Quality lead 2 at weekdays 10am; no rename". The only way to change any of it
// was to ask the teammate in its chat. "Find bugs before your users do" became a
// job trying the app as a new user; a name came from the first words typed.
//
// Measured: `update` takes a name with no check against the team, and refuses
// nothing it cannot store, and a teammate with duties cannot have them edited at
// all (the window is handed only their words and when, not their parts).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { STARTERS, dutySlot } from '../shared/teammates.mts';

let team; let store;

beforeEach(async () => {
  const home = appHome();
  const accountId = `acct-${Math.random().toString(36).slice(2, 8)}`;
  process.env.STORE_ACCOUNT_ID = accountId;
  fs.mkdirSync(path.join(home, 'accounts', accountId), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  const product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
  const dir = path.join(home, 'accounts', accountId, product.id);
  const mods = await loadStore();
  store = {
    config: { storeRoot: home, accountId }, modules: mods,
    listProducts: () => [{ slug: product.id, dir, name: product.name }],
    productDir: () => dir,
    listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
  };
  team = new Teammates(store);
});
afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

describe('what you asked for', () => {
  it('"Find bugs before your users do" keeps what was asked, not only a new-user test', () => {
    const { teammate } = team.describe({ starter: 'quality' });
    expect(teammate.name).toBe('Quality lead');
    expect(teammate.job.toLowerCase()).toContain('before your users do');
    expect(teammate.job.toLowerCase()).not.toMatch(/^use the project the way a new user would/);
    expect(teammate.works).toEqual({ every: 'weekday', at: '09:00' });
  });

  it('a name never comes from the first words typed', () => {
    const { teammate } = team.describe({ text: 'You are my chief of staff at Lumen. Every Monday write a brief.' });
    expect(teammate.name).toBe('New teammate');
    expect(teammate.job).toContain('chief of staff');
  });

  it('a second Quality lead starts unnamed, to be named, not "Quality lead 2"', () => {
    team.describe({ starter: 'quality' });
    expect(team.describe({ starter: 'quality' }).teammate.name).toBe('New teammate');
  });

  it('every starter says what it does in its asker\'s terms', () => {
    expect(STARTERS.find((s) => s.starter === 'quality').outcome).toContain('before your users do');
  });
});

describe('rename', () => {
  it('changes its name and letter, and says so in the chat', () => {
    const q = team.create({ starter: 'quality' });
    const after = team.update(q.id, { name: '  QA lead  ' });
    expect(after.name).toBe('QA lead');
    expect(team.chat().messages.at(-1).text).toMatch(/QA lead/);
  });

  it('refuses a name another teammate has, whatever its case', () => {
    team.create({ starter: 'support' });
    const q = team.create({ starter: 'quality' });
    expect(() => team.update(q.id, { name: 'support LEAD' })).toThrow(/taken/);
  });

  it('refuses an empty name and leaves it as it was', () => {
    const q = team.create({ starter: 'quality' });
    expect(() => team.update(q.id, { name: '   ' })).toThrow(/name/);
    expect(team.get(q.id).name).toBe('Quality lead');
  });

  it('keeps its name when saved unchanged, saying nothing', () => {
    const q = team.create({ starter: 'quality' });
    const before = team.chat().messages.length;
    team.update(q.id, { name: 'Quality lead' });
    expect(team.chat().messages.length).toBe(before);
  });
});

describe('its job', () => {
  it('is edited in place and read by its next brief', () => {
    const q = team.create({ starter: 'quality' });
    team.update(q.id, { job: 'Read the support inbox and find what users hit.' });
    const run = { id: 'w-1234567890', labels: [`teammate:${q.id}`], title: 'x', product: 'p' };
    expect(team.briefFor(run)).toContain('Read the support inbox');
  });

  it('refuses an empty job', () => {
    const q = team.create({ starter: 'quality' });
    expect(() => team.update(q.id, { job: '  ' })).toThrow(/job/);
  });
});

describe('when it runs', () => {
  const now = new Date(2026, 9, 30, 8, 0).getTime();

  it('a round moves to a new time and does not fire for a time already past', () => {
    const q = team.create({ starter: 'quality' });
    const later = new Date(2026, 9, 30, 11, 0).getTime();
    const after = team.update(q.id, { works: { every: 'weekday', at: '10:00' } }, later);
    expect(after.works.at).toBe('10:00');
    expect(after.served).toBe('2026-10-30');
  });

  it('nothing on its own clears the schedule', () => {
    const q = team.create({ starter: 'quality' });
    expect(team.update(q.id, { works: null }).works).toBeNull();
  });

  it('a duty keeps its id and words, and its new time does not fire one already past', () => {
    const q = team.create({ starter: 'quality' });
    team.update(q.id, { duties: [{ id: 'd-aaaa', what: 'Triage', every: 'day', at: ['09:00'] }] }, now);
    const later = new Date(2026, 9, 30, 12, 0).getTime();
    const after = team.update(q.id, { duties: [{ id: 'd-aaaa', what: 'Triage', every: 'weekday', at: ['10:00'] }] }, later);
    expect(after.duties).toHaveLength(1);
    expect(after.duties[0]).toMatchObject({ id: 'd-aaaa', every: 'weekday', at: ['10:00'] });
    expect(after.dutyServed['d-aaaa']).toBe(dutySlot(after.duties[0], later));
  });

  it('refuses a time that cannot run, and keeps the old one', () => {
    const q = team.create({ starter: 'quality' });
    team.update(q.id, { duties: [{ id: 'd-aaaa', what: 'Triage', every: 'day', at: ['09:00'] }] }, now);
    expect(() => team.update(q.id, { duties: [{ id: 'd-aaaa', what: 'Triage', every: 'day', at: ['25:00'] }] }, now)).toThrow(/cannot run/);
    expect(team.get(q.id).duties[0].at).toEqual(['09:00']);
  });

  it('the page is handed a duty\'s parts, so it can draw them to edit', () => {
    const q = team.create({ starter: 'quality' });
    team.update(q.id, { duties: [{ id: 'd-aaaa', what: 'Triage', every: 'week', on: 2, at: ['09:00'] }] }, now);
    const [d] = team.view([], now).list.find((x) => x.id === q.id).duties;
    expect(d).toMatchObject({ id: 'd-aaaa', every: 'week', on: 2, at: ['09:00'] });
    expect(d.when).toContain('Tuesday');
  });
});

describe('who it is open to', () => {
  it('reading direct messages and taking work from the team are off until the owner says', () => {
    const q = team.create({ starter: 'chief' });
    expect(team.get(q.id).readsMessages ?? false).toBe(false);
    expect(team.get(q.id).openToTeam ?? false).toBe(false);
    const after = team.update(q.id, { readsMessages: true, openToTeam: true });
    expect(after.readsMessages).toBe(true);
    expect(after.openToTeam).toBe(true);
  });
});
