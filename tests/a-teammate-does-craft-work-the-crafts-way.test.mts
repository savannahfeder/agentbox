// A TEAMMATE DOES CRAFT WORK THE CRAFT'S WAY.
//
// The owner, 2026-11-04: "every time in the past i've asked an ai teammate to
// make a video it does a very poor job. this time i even gave it the prompt that
// i know works incredibly, and it still sucked. ai teammates should OUTPERFORM
// regular threads not underperform."
//
// READ OFF THE RUN THAT MADE THE FILM (w-480ebb3f7b57). The entry skill for the
// video tool names a quality path and none of it was taken: the library of ~450
// ready-made components was never opened and every element was hand-written as a
// plain div; no spec and no storylines were written though the skill asks for
// both; the second creative pass the prompt asked for never happened; the design
// check the owner's standing instructions require was skipped twice, in as many
// words, to save tokens; and the tool's own lint going green was taken as the
// work being done.
//
// WHY A TEAMMATE AND NOT A FRESH THREAD. Three things in its brief, each
// reasonable on its own:
//
//   ITS METHOD OUTRANKS "anything older", and that method is about how this
//     person likes their posts written. When the job turned into a film the
//     teammate went on obeying the copy rules and read the craft skill as a
//     checklist to clear.
//   SAVING THE PERSON'S TOKENS is a virtue in the brief, and the teammate spent
//     it on the one thing it must never buy: the quality of what it hands over.
//   ITS JOB IS TO BRING A PROPOSAL AND GET A YES, so the first thing that would
//     pass the gate is the thing that ships.
//
// So the brief now says which of the two outranks the other on a craft, that
// quality is not what a teammate's own budget is spent on, and that looking at
// what it made is part of making it. The model half of the same bug is
// tests/a-run-nobody-picked-a-model-for-is-on-the-model-the-card-names.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { Supervisor } from '../main/supervisor.mts';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe('a teammate\'s own brief', () => {
  let team; let store; let dir; let product;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const brief = () => {
    const t = team.describe({ text: 'Write the posts' }).teammate;
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Make the film', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    return team.briefFor({ id: run.id, product: product.id, labels: run.labels });
  };

  it('says the skill for a craft outranks the method for that piece of work', () => {
    expect(brief()).toContain('the skill for it outranks your method');
  });

  it('says the craft is followed whole, including the parts that cost time', () => {
    expect(brief()).toMatch(/its library of ready-made parts, its written spec, its second pass/);
  });

  it('says quality is not what a teammate spends its own budget on', () => {
    expect(brief()).toContain('Never pay for your own tokens or time with the quality of what you hand over');
  });

  it('says a tool passing is not the work being good, and to look at what it made', () => {
    expect(brief()).toContain('A tool saying your work is valid is not your work being good');
    expect(brief()).toMatch(/look at what you made/);
  });
});

/* ======================= and nobody else's brief ========================= */
// A PLAIN WORKER IS UNTOUCHED. Its rules are a different contract, set by the
// owner's own brief, and nothing of the teammate block reaches it.

describe('a thread that is nobody\'s teammate', () => {
  it('is given none of it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-plain-'));
    const sup = new Supervisor({ storeRoot: dir, maxConcurrentSessions: 1 }, { listItems: () => [], listProducts: () => [], isDue: () => true }, REPO, REPO, dir);
    const system = sup.spawnPlan({ id: 'w-1a2b3c4d5e', product: 'p', title: 'Make the film', body: 'Do it.', labels: ['founder'] }, { slug: 'p', dir: os.tmpdir(), repoPath: null }, { engine: 'claude' }).system;
    expect(system).not.toContain('the skill for it outranks your method');
    expect(system).not.toContain('Never pay for your own tokens or time');
  });
});
