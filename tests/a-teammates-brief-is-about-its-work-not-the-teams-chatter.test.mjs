// A TEAMMATE'S BRIEF IS ABOUT ITS WORK, NOT THE TEAM'S CHATTER.
//
// Measured 2026-10-29 by building the real brief over the real store: a
// teammate run carried 33,683 characters of standing instructions where a
// fresh thread with the same words carried 11,411. Most of the difference was
// the last 30 lines of the team chat, mostly two teammates talking to each
// other, and rules about posting, passing and remembering. Runs went on that
// housekeeping instead of the work. Now a run sees what was said TO it and by
// the person, and a short list of how to work.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { writeChat, methodFile } from '../main/store/teammates-files.mjs';

describe('what a teammate run is told', () => {
  let product; let dir; let mods; let team; let store; let core;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const setUp = () => {
    const gm = team.create({ name: 'Growth marketer', job: 'Suggest posts.' });
    const vp = team.create({ name: 'Video producer', job: 'Make the videos.' });
    const file = methodFile(team.dir(), gm.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Method\n');
    return { gm, vp };
  };
  const runOf = (t) => ({ id: 'w-run', product: product.id, labels: ['founder', `teammate:${t.id}`, 'hop:0'] });

  it('leaves out what other teammates said to each other', () => {
    const { gm, vp } = setUp();
    const qa = team.create({ name: 'Quality lead' });
    writeChat(team.dir(), { kind: 'msg', from: vp.id, to: [qa.id], text: 'CHATTER-BETWEEN-OTHERS' }, Date.now());
    expect(team.briefFor(runOf(gm))).not.toContain('CHATTER-BETWEEN-OTHERS');
  });

  it('keeps what a teammate said to it, and what you said in the chat', () => {
    const { gm, vp } = setUp();
    writeChat(team.dir(), { kind: 'msg', from: vp.id, to: [gm.id], text: 'SAID-TO-YOU' }, Date.now());
    writeChat(team.dir(), { kind: 'msg', from: 'you', to: [vp.id], text: 'THE-PERSON-SAID' }, Date.now());
    const brief = team.briefFor(runOf(gm));
    expect(brief).toContain('SAID-TO-YOU');
    expect(brief).toContain('THE-PERSON-SAID');
  });

  it('is short: well under half of what it was', () => {
    const { gm } = setUp();
    for (let i = 0; i < 30; i += 1) writeChat(team.dir(), { kind: 'msg', from: 'you', to: [], text: `x${i}`.repeat(10) }, Date.now() + i);
    expect(team.briefFor(runOf(gm)).length).toBeLessThan(9000);
  });

  it('tells the run the work is the deliverable and to check it before showing it', () => {
    const { gm } = setUp();
    const brief = team.briefFor(runOf(gm));
    expect(brief).toMatch(/do the work itself/i);
    expect(brief).toMatch(/before you show/i);
    expect(brief).toMatch(/never bring back/i);
  });

  // Round two of the replay (2026-10-29): a run pitched "Undo Send", the
  // "Take it back" feature turned down on 25 Oct, because it had a new name
  // and a list in another file did not carry it.
  it('tells the run a turned-down idea under a new name is still turned down', () => {
    const { gm } = setUp();
    expect(team.briefFor(runOf(gm))).toMatch(/check by what it is, not what it is called/i);
  });

  it('a pause until a date is saved by the teammate, and a bad date is refused', () => {
    const { gm } = setUp();
    process.env.ZERO_ITEM = 'w-run';
    process.env.ZERO_PRODUCT = product.id;
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-run', { title: 'x', labels: ['founder', `teammate:${gm.id}`, 'hop:0'] }, { source: 'system' });
    expect(core.teamSetup({ pausedUntil: '2026-11-04' }).teammate.pausedUntil).toBe('2026-11-04');
    expect(team.get(gm.id).pausedUntil).toBe('2026-11-04');
    expect(() => core.teamSetup({ pausedUntil: 'next week' })).toThrow(/date/);
    expect(core.teamSetup({ pausedUntil: null }).teammate.pausedUntil ?? null).toBeNull();
  });
});
