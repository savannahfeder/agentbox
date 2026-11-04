// EACH AI TEAMMATE WRITES SHORT, AND IN A VOICE OF ITS OWN.
//
// The owner, reading the team version on 2026-10-30: "the agents are writing in
// a way that doesn't feel very human. They don't have different writing styles
// and they write really big blocks of text." Their brief said what to do and
// never how to write to people, so every teammate wrote the same long report
// with headings into a chat. Now the brief says how a message to people reads,
// and each teammate has a voice: picked from its id unless it was given one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { methodFile } from '../main/store/teammates-files.mjs';
import { VOICES, voiceOf } from '../shared/teammates.mjs';

describe('a voice for every teammate', () => {
  it('comes from its id, so it is the same every run', () => {
    expect(voiceOf({ id: 't-abc123' })).toEqual(voiceOf({ id: 't-abc123' }));
  });

  it('is not the same for everyone', () => {
    const ids = ['t-a1b2c3', 't-d4e5f6', 't-0a0b0c', 't-777777', 't-123abc', 't-fedcba'];
    expect(new Set(ids.map((id) => voiceOf({ id }).id)).size).toBeGreaterThan(2);
  });

  it('is the one it was given, when it was given a known one', () => {
    expect(voiceOf({ id: 't-abc123', voice: 'dry' }).id).toBe('dry');
  });

  it('ignores a voice nobody defined', () => {
    expect(VOICES.map((v) => v.id)).toContain(voiceOf({ id: 't-abc123', voice: 'pirate' }).id);
    expect(voiceOf({ id: 't-abc123', voice: 'pirate' })).toEqual(voiceOf({ id: 't-abc123' }));
  });
});

describe('what a teammate run is told about writing', () => {
  let product; let dir; let team;

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
    team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const made = (fields) => {
    const t = team.create(fields);
    const file = methodFile(team.dir(), t.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Method\n');
    return t;
  };
  const briefOf = (t) => team.briefFor({ id: 'w-run', product: product.id, labels: ['founder', `teammate:${t.id}`, 'hop:0'] });

  it('says a message to people is a few short lines, not a report', () => {
    const brief = briefOf(made({ name: 'Support lead', job: 'Answer clinics.' }));
    expect(brief).toContain('## How you write');
    expect(brief).toMatch(/a line or two, then stop/i);
    expect(brief).toMatch(/no headings/i);
  });

  it('names its own voice', () => {
    const t = made({ name: 'Support lead', job: 'Answer clinics.' });
    expect(briefOf(t)).toContain(voiceOf(t).says);
  });

  it('follows a voice it was given', () => {
    const t = made({ name: 'Research lead', job: 'Prices.' });
    team.update(t.id, { voice: 'dry' });
    expect(briefOf(t)).toContain(VOICES.find((v) => v.id === 'dry').says);
  });

  it('keeps the brief short', () => {
    expect(briefOf(made({ name: 'Support lead', job: 'Answer clinics.' })).length).toBeLessThan(9000);
  });
});
