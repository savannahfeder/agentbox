// "There is no way to delete an agent right now", and "I'll send a message and
// it'll start doing work... it won't tell me that it's doing work... should I
// really want to stop that? but I can't." The store could already end a
// teammate (`remove`), but nothing on screen called it, and it left the
// teammate's runs open with their agents still going. The chat's working line
// had no Stop, and the ⋯ menu only had Pause, which stops nothing in flight.
// Measured on a throwaway store: before this change `remove` killed nothing and
// left every run it had open, and `stop` did not exist.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { teammateIdOf, runLines, statusOf } from '../shared/teammates.mts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('stopping and deleting a teammate, through the store', () => {
  let dir; let work; let store; let team; let product;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    work = mods.workItemsDisk;
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const tick = () => team.tick({ items: store.listItems(), now: Date.now(), deliver: async () => {} });
  const runsOf = (id) => store.listItems().filter((i) => teammateIdOf(i) === id).sort((a, b) => a.createdAt - b.createdAt);

  // One run up, one queued behind it, and one waiting on your answer.
  async function busy(t) {
    team.post({ text: 'What moved signups last week?', to: [t.id] });
    await tick();
    const [first] = runsOf(t.id);
    team.post({ text: 'And draft a post about it', to: [t.id], fresh: true });
    await tick();
    const asked = work.createWorkItem(dir, { title: 'Which channel?', kind: 'question', labels: ['founder', `teammate:${t.id}`] }, { source: 'system' });
    work.updateWorkItem(dir, asked.id, { result: 'Which channel?', status: 'open' }, { source: 'agent' });
    return { running: first.id, queued: runsOf(t.id).find((i) => i.start === 'later').id, waiting: asked.id };
  }

  it('Stop ends the run it is on and what it queued, kills that agent, and leaves its question and the teammate alone', async () => {
    const ada = team.create({ starter: 'quality' });
    const { running, queued, waiting } = await busy(ada);
    const killed = [];
    const out = team.stop(ada.id, { kill: (id) => killed.push(id) });
    expect(out).toEqual({ stopped: 2 });
    expect(killed.sort()).toEqual([running, queued].sort());
    const after = new Map(runsOf(ada.id).map((i) => [i.id, i]));
    expect(after.get(running).status).toBe('done');
    expect(after.get(queued).status).toBe('done');
    expect(after.get(waiting).status).toBe('open');
    // Closed as you, so it is filed rather than news in Needs you. The same
    // close written as the app lands in Needs you, which is the case that must not happen.
    const { belongsInInbox, belongsInProgress } = await import('../renderer/src/list-rules.ts');
    expect(after.get(running).wrote.status.source).toBe('founder');
    expect(belongsInInbox(after.get(running))).toBe(false);
    expect(belongsInProgress(after.get(running))).toBe(false);
    const asApp = { ...after.get(running), wrote: { ...after.get(running).wrote, status: { ...after.get(running).wrote.status, source: 'system' } } };
    expect(belongsInInbox(asApp)).toBe(true);
    expect(team.get(ada.id)).toMatchObject({ paused: false });
    expect(statusOf(team.get(ada.id), store.listItems()).running).toBeNull();
  });

  it('Stop on a teammate with nothing on ends nothing, and stops no one else', async () => {
    const ada = team.create({ starter: 'quality' });
    const bo = team.create({ starter: 'maintainer' });
    const { running } = await busy(bo);
    const killed = [];
    expect(team.stop(ada.id, { kill: (id) => killed.push(id) })).toEqual({ stopped: 0 });
    expect(killed).toEqual([]);
    expect(runsOf(bo.id).find((i) => i.id === running).status).toBe('open');
  });

  it('a stopped run says Stopped in your chat with it, and a finished one still says Finished', async () => {
    const ada = team.create({ starter: 'quality' });
    const { running } = await busy(ada);
    team.stop(ada.id, { kill: () => {} });
    const lines = runLines(store.listItems(), team.list());
    expect(lines.find((l) => l.item === running && l.verb === 'stopped')).toBeTruthy();
    expect(lines.find((l) => l.item === running && l.verb === 'finished')).toBeUndefined();
    const { chatWith } = await import('../renderer/src/teammates/chat-lines.ts');
    const view = team.view(store.listItems());
    expect(chatWith(view, ada.id).some((e) => e.kind === 'run' && e.verb === 'stopped')).toBe(true);
    // Reopened by a reply and finished later, it reads as finished again.
    work.updateWorkItem(dir, running, { status: 'open' }, { source: 'founder', now: Date.now() + 1000 });
    work.updateWorkItem(dir, running, { status: 'done' }, { source: 'agent', now: Date.now() + 2000 });
    const again = runLines(store.listItems(), team.list()).filter((l) => l.item === running);
    expect(again.map((l) => l.verb)).toContain('finished');
    expect(again.map((l) => l.verb)).not.toContain('stopped');
  });

  it('Delete ends every open run, its question too, kills its agent, and takes it off the team', async () => {
    const ada = team.create({ starter: 'quality' });
    const bo = team.create({ starter: 'maintainer' });
    const { running, queued, waiting } = await busy(ada);
    const theirs = await busy(bo);
    const killed = [];
    team.remove(ada.id, { kill: (id) => killed.push(id) });
    expect(killed.sort()).toEqual([running, queued, waiting].sort());
    for (const r of runsOf(ada.id)) expect(r.status).toBe('done');
    expect(team.list().map((t) => t.id)).toEqual([bo.id]);
    expect(runsOf(bo.id).find((i) => i.id === theirs.running).status).toBe('open');
    // A message to it afterwards wakes nothing.
    team.post({ text: 'Are you there?', to: [ada.id] });
    const before = runsOf(ada.id).length;
    await tick();
    expect(runsOf(ada.id)).toHaveLength(before);
  });

  it('Delete on a teammate that is not there says so', () => {
    expect(() => team.remove('t-0000000000', { kill: () => {} })).toThrow(/No such teammate/);
  });
});

describe('the buttons', () => {
  // The thread view's rule (w-581dbc6cc4): Stop takes the Send slot while a
  // run is up and the box is empty, and typing turns it back into Send.
  it('while it works, the chat box offers Stop where Send is, until you type', () => {
    const page = read('renderer/src/teammates/TeammatesPage.tsx');
    expect(page).toMatch(/stop=\{t\.running \? <button type="button" className="dock-stop" onClick=\{\(\) => \{ void call\('stop', \{ id: t\.id \}\); \}\}/);
    // Typing or attaching a file is a message to send.
    expect(page).toMatch(/const ready = !!text\.trim\(\) \|\| files\.length > 0;/);
    expect(page).toMatch(/\{stop && !ready \? stop\s*: <span className="dock-send-pair solo"><button type="button" className="dock-send"/);
  });

  it('the ⋯ menu offers Delete, which asks first and comes back with the reason when refused', () => {
    const page = read('renderer/src/teammates/TeammatesPage.tsx');
    expect(page).toMatch(/\['Delete', \(\) => setAsking\(true\)\]/);
    expect(page).toMatch(/<AskBeforeDeleting title=\{`Delete \$\{t\.name\}\?`\}/);
    expect(page).toMatch(/api\.teammates\('remove', \{ id: t\.id \}\)/);
    expect(page).toMatch(/if \(!r\.ok\) \{ setRefused\(r\.error\); setAsking\(true\); return; \}/);
    expect(read('renderer/src/teammates/useTeammates.tsx')).toMatch(/onDeleted=\{\(\) => \{ leave\(\); onChanged\(\); \}\}/);
  });

  it('the app stops the agents through the supervisor, for Stop and for Delete', () => {
    const ipc = read('main/ipc.mts');
    expect(ipc).toMatch(/const TEAMMATE_OPS = new Set\(\[[^\]]*'stop'/);
    expect(ipc).toMatch(/op === 'remove'\) value = mates\.remove\(a\.id, \{ kill \}\)/);
    expect(ipc).toMatch(/op === 'stop'\) value = mates\.stop\(a\.id, \{ kill \}\)/);
    expect(ipc).toMatch(/const kill = \(id(?:: string)?\) => supervisor\.stopSession\(id\)/);
  });
});
