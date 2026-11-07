// An AI teammate's thread could not be moved to the cloud: its top bar had no
// cloud-or-this-computer choice (2026-11-04, a Head of Marketing thread). It
// was barred on purpose after a teammate's team_post failed in a cloud run on
// 2026-10-24. The cause was not the cloud: every cloud run's store tools are
// served in one shared process, and the team tools read which thread they were
// on from that process's ZERO_ITEM, which belongs to no run. Measured from a
// cloud run on 2026-11-04: team_roster, which works on any thread, answered
// "this session is not a teammate's run". The tools now take the run's own
// thread, and a teammate's thread may go to the cloud like any other.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { Supervisor } from '../main/supervisor.mts';
import { filesNamedIn } from '../main/cloud/run.mts';
import { threadPlace } from '../renderer/src/cloud-menu.ts';
import { teammateIdOf, YOU } from '../shared/teammates.mjs';

const product = { slug: 'p', repoPath: '/r' };
const RUN = { id: 'w-t1', product: 'p', labels: ['founder', 'teammate:t-abcdef1234', 'hop:0'] };
const PLAIN = { id: 'w-p1', product: 'p', labels: ['founder'] };
const makeSup = () => new Supervisor({ storeRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-cloud-')), maxConcurrentSessions: 2 },
  { listItems: () => [], listProducts: () => [product], isDue: () => true }, '/tmp');

describe('where an AI teammate\'s thread may run', () => {
  it('may go to the cloud, as a plain thread may, and a digest still may not', () => {
    const sup = makeSup();
    expect(sup._cloudEligible(RUN)).toBe(true);
    expect(sup._cloudEligible(PLAIN)).toBe(true);
    expect(sup._cloudEligible({ id: 'digest-1', product: 'p', labels: [] })).toBe(false);
    expect(sup._mayRunInCloud(RUN, product, '/r/.claude/worktrees/w-t1')).toBe(true);
    expect(sup._mayRunInCloud(RUN, product, '/r')).toBe(false);
  });

  it('is never said to run here because it is a teammate', () => {
    const sup = makeSup();
    sup._cloudSetUp = () => true;
    sup._cloudFirst = () => true;
    expect(sup._whyLocal({ item: RUN, product })).not.toEqual({ why: 'teammate' });
  });

  it('offers the cloud-or-this-computer choice in its top bar, unless the cloud does not take its project', () => {
    const cloud = { setUp: true, mode: 'all', projects: ['p'] };
    expect(threadPlace(RUN, null, cloud)).toBe('here');
    expect(threadPlace(RUN, { where: 'cloud' }, cloud)).toBe('cloud');
    expect(threadPlace({ ...RUN, onMac: true }, null, cloud)).toBe('kept');
    expect(threadPlace({ ...RUN, product: 'other' }, null, cloud)).toBeNull();
  });
});

// Run over the real store on 2026-11-04, a teammate's brief naming each
// project's documents folder would have sent 534 files, 133 MB, ledgers
// included, up with every cloud run: a folder a prompt names travels whole.
describe('what a teammate\'s brief carries to the cloud', () => {
  it('names no project\'s documents folder, so none travels, and a repository still reads as code', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-carry-'));
    const docs = path.join(root, 'accounts', 'a', 'other');
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, 'work-items.jsonl'), '{}\n');
    const listed = [{ slug: 'p', dir: path.join(root, 'accounts', 'a', 'p'), name: 'Mine', repoPath: '/r/mine' }, { slug: 'other', dir: docs, name: 'Other', repoPath: null }];
    const here = new Teammates({ config: { storeRoot: root, accountId: 'a' }, modules: await loadStore(), listProducts: () => listed, listItems: () => [] });
    const ada = here.create({ starter: 'quality', product: 'p' });
    const brief = here.briefFor({ id: 'w-a', product: 'p', labels: ['founder', `teammate:${ada.id}`, 'hop:0'] });
    expect(brief).toContain('- Mine (yours): code at /r/mine');
    expect(brief).toContain('- Other: no code');
    expect(filesNamedIn(brief, { cwd: '/nowhere', roots: [root] }).filter((f) => f.startsWith(docs))).toEqual([]);
  });

  it('still carries a file it names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-carry-'));
    const file = path.join(root, 'source.md');
    fs.writeFileSync(file, 'a thread');
    expect(filesNamedIn(`- ${file} (a thread)`, { cwd: '/nowhere', roots: [root] })).toEqual([file]);
  });
});

describe('the team tools in a cloud run, served from one shared process', () => {
  let p; let dir; let team; let store; let built;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    p = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, p.id);
    const mods = await loadStore();
    const work = mods.workItemsDisk;
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: p.id, dir, name: p.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: p.id })),
    };
    team = new Teammates(store);
    built = [];
  });

  afterEach(() => {
    for (const b of built) b.claims._stop();
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const runOf = async (mate) => {
    team.post({ text: 'Draft today\'s post', to: [mate.id] });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now(), deliver: async () => {} });
    return store.listItems().find((i) => teammateIdOf(i) === mate.id);
  };
  const toolsFor = async (ownItem) => {
    const b = (await import('../mcp/tools.mjs')).buildTools({ holder: `test-${Math.random()}`, ownItem, ownProduct: p.id });
    built.push(b);
    return async (name, args = {}) => {
      const r = await b.tools.find((t) => t.name === name).run(args);
      if (r.isError) throw new Error(r.content[0].text);
      return JSON.parse(r.content[0].text);
    };
  };
  const plainThread = async (title) => (await import('../mcp/core/work.mjs')).createItem(p.id, { title, labels: ['founder'] }, { source: 'founder' });

  it('post as the run\'s own teammate when the process names no thread', async () => {
    const ada = team.create({ starter: 'quality' });
    const run = await runOf(ada);
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
    const call = await toolsFor(run.id);
    await call('team_roster');
    await call('team_post', { text: 'Draft is up.' });
    expect(team.chat().messages.at(-1)).toMatchObject({ kind: 'msg', from: ada.id, text: 'Draft is up.' });
  });

  it('post as the run\'s own teammate when the process names another run\'s thread', async () => {
    const ada = team.create({ starter: 'quality' });
    const run = await runOf(ada);
    const other = await plainThread('Something else');
    process.env.ZERO_ITEM = other.id;
    process.env.ZERO_PRODUCT = p.id;
    const call = await toolsFor(run.id);
    await call('team_post', { text: 'Mine, not theirs.' });
    expect(team.chat().messages.at(-1)).toMatchObject({ from: ada.id, text: 'Mine, not theirs.' });
  });

  it('speak for the person on a thread that is no teammate\'s run, even when the process names one', async () => {
    const ada = team.create({ starter: 'quality' });
    const run = await runOf(ada);
    const plain = await plainThread('Plain');
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = p.id;
    const call = await toolsFor(plain.id);
    await call('team_post', { text: 'From you.' });
    expect(team.chat().messages.at(-1)).toMatchObject({ from: YOU, text: 'From you.' });
    await expect(call('team_remember', { text: 'x' })).rejects.toThrow(/not a teammate/);
  });
});
