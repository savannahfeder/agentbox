// NO CHIEF OF STAFF IS MADE FOR YOU (w-bb45118b10).
//
// From 2026-11-13 the first tick made a Chief of staff for everyone. Two days
// later the person: "Think about the whole function of employees: they narrowly
// focus on a particular task, learn from it, and then do it in a recurring way
// ... if you have a general agent like a Chief of staff, it almost has no
// utility. I found the performance to be much worse." Its morning check-in had
// "zero utility", and a research task routed to it needed five corrections.
// They chose to stop making it and to pause the one already made, keeping its
// history. One the person made themselves is theirs and is left alone.
// A rule for one project is still kept in that project's instructions, which
// any agent can do with add_project_rule.
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

// What the app did from 2026-11-13: made the Chief and wrote the time to `chief-made`.
const madeTheOldWay = (team: { create: (f: object, now: number) => { id: string }; start: (id: string, now: number) => void; dir: () => string }, now: number) => {
  const chief = team.create({ starter: 'chief' }, now);
  team.start(chief.id, now);
  fs.mkdirSync(team.dir(), { recursive: true });
  fs.writeFileSync(path.join(team.dir(), 'chief-made'), `${now}\n`);
  return chief.id;
};

describe('the Chief of staff', () => {
  it('is not made on the first tick, or on any after it', async () => {
    const { team, store } = await setup();
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list()).toHaveLength(0);
  });

  it('the one the app made for you is paused, not removed, so its history stays', async () => {
    const { team, store } = await setup();
    const id = madeTheOldWay(team, Date.now() - 60_000);
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    const [chief] = team.list();
    expect(chief).toMatchObject({ id, paused: true });
    expect(chief.endedAt ?? null).toBeNull();
  });

  it('is paused once: one you start again stays started', async () => {
    const { team, store } = await setup();
    const id = madeTheOldWay(team, Date.now() - 60_000);
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    team.update(id, { paused: false });
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list()[0].paused).toBe(false);
  });

  it('one you made yourself is left alone', async () => {
    const { team, store } = await setup();
    const mine = team.create({ starter: 'chief' }, Date.now() - 60_000);
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list().find((t) => t.id === mine.id)?.paused).toBe(false);
  });

  it('a teammate you made beside it, at another time, is left alone too', async () => {
    const { team, store } = await setup();
    madeTheOldWay(team, Date.now() - 60_000);
    const ops = team.create({ name: 'Ops lead', job: 'Runs things.' }, Date.now() - 30_000);
    await team.tick({ items: store.listItems(), now: Date.now(), chief: true });
    expect(team.list().find((t) => t.id === ops.id)?.paused).toBe(false);
  });

  it('is not offered when you make a new teammate, nor in the setup', async () => {
    const { starterAsks } = await import('../shared/teammates.mts');
    const { starterChoices } = await import('../renderer/src/setup-split.ts');
    const { STARTERS } = await import('../shared/teammates.mts');
    expect(starterAsks([]).map((s) => s.starter)).not.toContain('chief');
    expect(starterAsks([]).length).toBeGreaterThan(0);
    expect(starterChoices(STARTERS).map((s) => s.starter)).not.toContain('chief');
  });

  it('is paused only by the running app\'s tick, not by every caller of it', async () => {
    const { team, store } = await setup();
    madeTheOldWay(team, Date.now() - 60_000);
    await team.tick({ items: store.listItems(), now: Date.now() });
    expect(team.list()[0].paused).toBe(false);
    expect(read('main/supervisor.mts')).toMatch(/teammates\.tick\(\{[^}]*chief: true \}\)/);
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
