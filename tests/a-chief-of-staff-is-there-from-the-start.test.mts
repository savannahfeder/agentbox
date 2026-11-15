// A CHIEF OF STAFF IS THERE FROM THE START (w-bb45118b10).
//
// The founder wanted a lead by default rather than one somebody has to find:
// "I like the idea of default leads." The Chief of staff starter already took
// what Auto could not place and checked in each weekday, but only for someone
// who knew to make it. With teammates on, the first tick now makes it and starts
// it, so it introduces itself; it is made once, and one you remove stays gone.
// It also keeps a rule you give for one project in that project's instructions,
// which every agent there reads, rather than in its own memory.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

async function setup({ products = [{ slug: 'site', name: 'Site', repoPath: '/r' }] } = {}) {
  const { loadStore } = await import('../main/store-modules.mts');
  const { Teammates } = await import('../main/teammates.mts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-chief-'));
  const mods = await loadStore();
  const w = mods.workItemsDisk;
  const store = {
    config: { storeRoot: root, accountId: `acct-chief-${Math.random()}` }, modules: mods,
    listProducts: () => products.map((p) => ({ ...p, dir: root })),
    productDir: () => root,
    listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
  };
  return { team: new Teammates(store), store };
}

describe('the Chief of staff', () => {
  it('is made on the first tick, as your primary, and started so it introduces itself', async () => {
    const { team, store } = await setup();
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    const made = team.list();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ name: 'Chief of staff', primary: true, status: 'active', starter: 'chief' });
    expect(team.chat().messages.some((m) => m.kind === 'msg' && m.start && m.to?.includes(made[0].id))).toBe(true);
  });

  it('is made once', async () => {
    const { team, store } = await setup();
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list()).toHaveLength(1);
  });

  it('stays gone once you remove it', async () => {
    const { team, store } = await setup();
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    team.remove(team.list()[0].id);
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list().filter((t) => !t.endedAt)).toHaveLength(0);
  });

  it('is not made beside a primary you already have', async () => {
    const { team, store } = await setup();
    team.create({ name: 'Ops lead', job: 'Runs things.', primary: true });
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list().map((t) => t.name)).toEqual(['Ops lead']);
  });

  it('is made only by the running app\'s tick, not by every caller of it', async () => {
    const { team, store } = await setup();
    await team.tick({ items: store.listItems(), now: Date.now() });
    expect(team.list()).toHaveLength(0);
    expect(read('main/supervisor.mts')).toMatch(/teammates\.tick\(\{[^}]*chief: true \}\)/);
  });

  it('waits, without trouble, until there is a project to work in', async () => {
    const { team, store } = await setup({ products: [] });
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list()).toHaveLength(0);
    expect(team.trouble ?? null).toBeNull();
  });

  it('is told to keep a rule for one project in that project\'s instructions, once you agree', async () => {
    const { STARTERS } = await import('../shared/teammates.mts');
    const chief = STARTERS.find((s) => s.starter === 'chief');
    expect(chief.job).toMatch(/add_project_rule/);
    expect(chief.job).toMatch(/agree/);
  });
});

describe('a rule for one project', () => {
  it('is added to that project\'s instructions, under what was there', async () => {
    const { addProjectRule } = await import('../mcp/core/project-rules.mts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rule-'));
    fs.writeFileSync(path.join(dir, 'instructions.md'), 'Use British spelling.\n');
    addProjectRule(dir, 'Ship fixes at level 2 and below without asking.');
    addProjectRule(dir, '  Ask before anything touches billing.  ');
    expect(fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8')).toBe('Use British spelling.\n\n- Ship fixes at level 2 and below without asking.\n- Ask before anything touches billing.\n');
  });

  it('starts the file when the project had none', async () => {
    const { addProjectRule } = await import('../mcp/core/project-rules.mts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rule-'));
    addProjectRule(dir, 'Ship after the test suite passes.');
    expect(fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8')).toBe('- Ship after the test suite passes.\n');
  });

  it('refuses an empty rule or one that is several paragraphs', async () => {
    const { addProjectRule } = await import('../mcp/core/project-rules.mts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rule-'));
    expect(() => addProjectRule(dir, '  ')).toThrow();
    expect(() => addProjectRule(dir, 'One.\n\nTwo.')).toThrow();
  });
});
