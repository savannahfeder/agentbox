// The founder's Growth marketer saved "When a check turns up nothing, do you
// want to hear about it at all, or only when there's something?" as what
// needs their yes first, and About showed that question as the rule. Setup
// now refuses a question there (a-teammate-asks-in-the-chat-and-keeps-its-
// times-as-duties), but a teammate that saved one before keeps it. A saved
// question is not shown as the rule, and the teammate's next run is told
// the rule is missing, to ask the person in the chat and save their answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { yesFirst } from '../shared/teammates.mjs';

const Q = 'When a check turns up nothing, do you want to hear about it at all, or only when there\'s something?';

describe('what needs your yes first', () => {
  it('is the saved rule, and nothing when what was saved is a question', () => {
    expect(yesFirst('Anything that goes out in public or costs money.')).toBe('Anything that goes out in public or costs money.');
    expect(yesFirst('Posts (and replies?) before they go out')).toBe('Posts (and replies?) before they go out');
    expect(yesFirst(Q)).toBeNull();
    expect(yesFirst('Anything public?  ')).toBeNull();
    expect(yesFirst(null)).toBeNull();
    expect(yesFirst('  ')).toBeNull();
  });

  it('is what About shows, and the brief carries', () => {
    expect(fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8')).toMatch(/\{yesFirst\(t\.asksFirst\) && <><h5>What needs your yes first<\/h5><p>\{yesFirst\(t\.asksFirst\)\}<\/p><\/>\}/);
  });
});

describe('a teammate that saved a question there', () => {
  it('is told in its brief to ask you in the chat and save your answer as the rule', async () => {
    const { appHome } = await import('../main/store/home.mjs');
    const { loadStore } = await import('../main/store-modules.mjs');
    const { Teammates } = await import('../main/teammates.mjs');
    const { writeTeammate } = await import('../main/store/teammates-files.mjs');
    const path = await import('node:path');
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    const team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
    const t = team.create({ starter: 'growth' });
    writeTeammate(team.dir(), t.id, { asksFirst: Q }, Date.now());
    const brief = team.briefFor({ id: 'w-1', labels: ['founder', `teammate:${t.id}`, 'hop:0'] });
    expect(brief).not.toContain(`Ask the person first: ${Q}`);
    expect(brief).toMatch(/What needs the person's yes first is not set[^\n]*team_post[^\n]*team_setup/);
    writeTeammate(team.dir(), t.id, { asksFirst: 'Anything public.' }, Date.now());
    expect(team.briefFor({ id: 'w-1', labels: ['founder', `teammate:${t.id}`, 'hop:0'] })).toContain('Ask the person first: Anything public.');
    delete process.env.STORE_ACCOUNT_ID;
  });
});
