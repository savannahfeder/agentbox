// A TEAMMATE WORKS FROM ONE METHOD IT KEEPS, AND READS IT IN FULL EVERY RUN.
//
// Measured on the real store, 2026-10-29: 43 teammate runs over five days, and
// every one started from nothing but memory lines cut at 300 characters,
// playbook lessons cut at 400 and the last 30 team-chat lines. The threads a
// teammate was made from were shown once, in its setup run, squeezed to about
// 3,300 characters a thread, and never again. A post the person turned down
// came back "four or five times"; the Growth marketer said why itself: "Two
// documents disagreed, and every run believed the one that read as live."
//
// Now each teammate has one method file: what the job is, how it is done, the
// work the person approved and turned down in their words, and what needs
// their yes. Every run reads it whole. A teammate without one builds it first,
// from the full threads, which the app writes out uncut.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { methodFile, sourcesDir, writeTeammate } from '../main/store/teammates-files.mjs';
import { METHOD_CAP, sourceText } from '../shared/teammates.mjs';

describe('a teammate method', () => {
  let product; let dir; let mods; let team; let store; let histories;

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
    histories = {};
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: { ...mods, workItemsCore: { ...mods.workItemsCore, threadOf: (h) => h } },
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
      readHistory: (slug, id) => histories[id] ?? [],
    };
    team = new Teammates(store);
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const run = (t, id = 'w-run1') => ({ id, product: product.id, labels: ['founder', `teammate:${t.id}`, 'hop:0'] });
  const writeMethod = (t, text) => {
    const file = methodFile(team.dir(), t.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };

  it('reads the whole method, with where it lives, on every run', () => {
    const t = team.create({ name: 'Growth marketer', job: 'Suggest posts.' });
    const file = writeMethod(t, '# Growth marketer\n\n## Turned down\n- "Claude Duet for coding agents": "too late" (2026-10-26, w-4e546ce41d)\n');
    const brief = team.briefFor(run(t));
    expect(brief).toContain('## Your method');
    expect(brief).toContain(file);
    expect(brief).toContain('"Claude Duet for coding agents": "too late"');
    expect(brief).not.toMatch(/build your method/i);
  });

  // You read it too, on its About page.
  it('is handed to its About page, and is nothing for a teammate without one', () => {
    const t = team.create({ name: 'Growth marketer' });
    expect(team.method(t.id)).toBeNull();
    writeMethod(t, '## Turned down\n- x\n');
    expect(team.method(t.id).text).toBe('## Turned down\n- x\n');
    expect(() => team.method('t-000000')).toThrow(/No such teammate/);
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    expect(ipc).toMatch(/const TEAMMATE_OPS = new Set\(\[[^\]]*'method'/);
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/api\.teammates\('method', \{ id: t\.id \}\)/);
  });

  it('cuts a method past its cap with a mark that says so, and never in silence', () => {
    const t = team.create({ name: 'Growth marketer' });
    writeMethod(t, `# Method\n${'x'.repeat(METHOD_CAP + 500)}\nTHE-LAST-LINE`);
    const brief = team.briefFor(run(t));
    expect(brief).not.toContain('THE-LAST-LINE');
    expect(brief).toMatch(/method is longer than .* cut here.*tighten/i);
  });

  it('a method just under the cap is shown whole', () => {
    const t = team.create({ name: 'Growth marketer' });
    writeMethod(t, `# Method\n${'x'.repeat(METHOD_CAP - 200)}\nTHE-LAST-LINE`);
    expect(team.briefFor(run(t))).toContain('THE-LAST-LINE');
  });

  it('without a method, the run builds one first from its own past runs, written out uncut', () => {
    const t = team.create({ name: 'Video producer', job: 'Make the videos.' });
    writeTeammate(team.dir(), t.id, { remember: { id: 'm-1', text: 'One cut, not two.' } }, Date.now());
    const long = `Here is the cut. ${'Every frame checked. '.repeat(400)}THE-END-OF-THE-ANSWER`;
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-old', { title: 'Launch film round 3', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    histories['w-old'] = [
      { source: 'founder', field: 'body', text: 'Make round 3 of the launch film.' },
      { source: 'agent', field: 'result', text: long },
      { source: 'founder', field: 'answer', text: 'Boring for the first two seconds. Open on the product.' },
    ];
    const brief = team.briefFor(run(t, 'w-now'));
    expect(brief).toMatch(/build your method/i);
    expect(brief).toContain(methodFile(team.dir(), t.id));
    // Its memory goes into the method; until then it is still in front of it.
    expect(brief).toContain('One cut, not two.');
    const src = sourcesDir(team.dir(), t.id);
    const files = fs.readdirSync(src);
    expect(files).toHaveLength(1);
    expect(brief).toContain(path.join(src, files[0]));
    const text = fs.readFileSync(path.join(src, files[0]), 'utf8');
    // Uncut: the digest used to stop an answer like this at 1,200 characters.
    expect(text).toContain('THE-END-OF-THE-ANSWER');
    expect(text).toContain('Boring for the first two seconds. Open on the product.');
  });

  // Both real teammates were made before the app kept which threads they came
  // from, so their method would have been built from their own runs alone. The
  // threads where the person did the work themselves are named in those runs.
  it('learns from your own threads its past runs name, and not from a thread nobody named', () => {
    const t = team.create({ name: 'Video producer' });
    const w = mods.workItemsDisk;
    w.createWorkItemIfAbsent(dir, 'w-588787adb7', { title: 'Launch film', labels: ['founder'] }, { source: 'founder' });
    w.createWorkItemIfAbsent(dir, 'w-8cd65863e0', { title: 'Warming up the X account', labels: ['founder'] }, { source: 'founder' });
    w.createWorkItemIfAbsent(dir, 'w-0000000000', { title: 'Unrelated', labels: ['founder'] }, { source: 'founder' });
    w.createWorkItemIfAbsent(dir, 'w-run0000001', { title: 'Analyze the video threads', labels: ['founder', `teammate:${t.id}`, 'hop:0', 'work:w-8cd65863e0'] }, { source: 'system' });
    histories['w-run0000001'] = [{ source: 'agent', field: 'result', text: 'Read the launch film (w-588787adb7) and the rest.' }];
    histories['w-588787adb7'] = [{ source: 'founder', field: 'body', text: 'LAUNCH-FILM-ASK' }, { source: 'founder', field: 'answer', text: 'Bored two seconds in.' }];
    histories['w-8cd65863e0'] = [{ source: 'founder', field: 'body', text: 'WARM-UP-ASK' }];
    histories['w-0000000000'] = [{ source: 'founder', field: 'body', text: 'UNRELATED-ASK' }];
    team.briefFor(run(t, 'w-now'));
    const src = sourcesDir(team.dir(), t.id);
    const all = fs.readdirSync(src).map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
    expect(all).toContain('LAUNCH-FILM-ASK');
    expect(all).toContain('WARM-UP-ASK');
    expect(all).not.toContain('UNRELATED-ASK');
  });

  // Grok Bot's "teach a task": you do it once, then the bot learns it. Here
  // the doing is a thread of yours that went well, and the teaching is naming
  // it to a teammate: "@Video producer learn from w-588787adb7".
  it('reads a thread of yours named in what woke it whole, even once it has a method', () => {
    const t = team.create({ name: 'Video producer' });
    writeMethod(t, '# Method\n');
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-588787adb7', { title: 'Launch film', labels: ['founder'] }, { source: 'founder' });
    histories['w-588787adb7'] = [{ source: 'founder', field: 'body', text: 'LAUNCH-FILM-ASK' }, { source: 'founder', field: 'answer', text: 'So good! This is the winner.' }];
    const woke = { ...run(t, 'w-now'), body: 'Learn how I want films made from w-588787adb7 and update your method.' };
    const brief = team.briefFor(woke);
    expect(brief).toMatch(/## Threads named in what woke you/);
    const file = brief.match(/^- (\/\S+w-588787adb7\.md)/m)?.[1];
    expect(fs.readFileSync(file, 'utf8')).toContain('So good! This is the winner.');
  });

  it('names nothing when what woke it names no thread, or only one of its own runs', () => {
    const t = team.create({ name: 'Video producer' });
    writeMethod(t, '# Method\n');
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-aaaaaaaaaa', { title: 'Own run', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    histories['w-aaaaaaaaaa'] = [{ source: 'agent', field: 'result', text: 'x' }];
    expect(team.briefFor({ ...run(t, 'w-now'), body: 'Make the next cut.' })).not.toMatch(/Threads named in what woke you/);
    expect(team.briefFor({ ...run(t, 'w-now'), body: 'Same as w-aaaaaaaaaa.' })).not.toMatch(/Threads named in what woke you/);
  });

  it('the run it is on now is not one of its sources', () => {
    const t = team.create({ name: 'Video producer' });
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-now', { title: 'Now', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    histories['w-now'] = [{ source: 'founder', field: 'body', text: 'Do the thing.' }];
    team.briefFor(run(t, 'w-now'));
    const src = sourcesDir(team.dir(), t.id);
    expect(fs.existsSync(src) ? fs.readdirSync(src) : []).toEqual([]);
  });

  it('once it has a method, its memory lines are in the method, not repeated beside it', () => {
    const t = team.create({ name: 'Growth marketer' });
    writeTeammate(team.dir(), t.id, { remember: { id: 'm-1', text: 'MEMORY-LINE-ONE', at: Date.now() - 60_000 } }, Date.now() - 60_000);
    writeMethod(t, '# Method\n- the steps\n');
    expect(team.briefFor(run(t))).not.toContain('MEMORY-LINE-ONE');
  });

  it('a memory line kept after the method last changed is shown, to be put into it', () => {
    const t = team.create({ name: 'Growth marketer' });
    const file = writeMethod(t, '# Method\n');
    const then = Date.now() - 60_000;
    fs.utimesSync(file, new Date(then), new Date(then));
    writeTeammate(team.dir(), t.id, { remember: { id: 'm-2', text: 'NEWER-THAN-THE-METHOD', at: Date.now() } }, Date.now());
    writeTeammate(team.dir(), t.id, { remember: { id: 'm-1', text: 'OLDER-THAN-THE-METHOD', at: then - 60_000 } }, then - 60_000);
    const brief = team.briefFor(run(t));
    expect(brief).toContain('NEWER-THAN-THE-METHOD');
    expect(brief).not.toContain('OLDER-THAN-THE-METHOD');
  });

  it('tells a run to show its work when the method changed since the person last answered one', () => {
    const t = team.create({ name: 'Growth marketer' });
    const now = Date.now();
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-seen', { title: 'Old', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system', now: now - 60_000 });
    mods.workItemsDisk.updateWorkItem(dir, 'w-seen', { answer: 'Good.' }, { source: 'founder', now: now - 50_000 });
    const file = writeMethod(t, '# Method\n');
    fs.utimesSync(file, new Date(now - 10_000), new Date(now - 10_000));
    expect(team.briefFor(run(t, 'w-new'), now)).toMatch(/method has changed since the person last saw your work/i);
    // The person answered after the change: trusted again.
    mods.workItemsDisk.updateWorkItem(dir, 'w-seen', { answer: 'Still good.' }, { source: 'founder', now: now - 1_000 });
    expect(team.briefFor(run(t, 'w-new'), now)).not.toMatch(/method has changed since the person last saw your work/i);
  });
});

// A Codex run may write only inside its own task folder, so it could not edit
// a method in the store with its own tools. The store tool works on either.
describe('a teammate changing its method through the store', () => {
  let product; let dir; let mods; let core; let team;

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
    team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const onRunOf = (t) => {
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-run', { title: 'x', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = 'w-run';
    process.env.ZERO_PRODUCT = product.id;
  };

  it('writes it whole, then changes one passage of it exactly', () => {
    const t = team.create({ name: 'Growth marketer' });
    onRunOf(t);
    core.teamMethod({ text: '# Method\n\n## Turned down\n- nothing yet\n' });
    expect(fs.readFileSync(methodFile(team.dir(), t.id), 'utf8')).toContain('- nothing yet');
    core.teamMethod({ old: '- nothing yet', new: '- "Claude Duet": "too late" (2026-10-26, w-4e546ce41d)' });
    const text = fs.readFileSync(methodFile(team.dir(), t.id), 'utf8');
    expect(text).toContain('"Claude Duet": "too late"');
    expect(text).not.toContain('nothing yet');
  });

  it('refuses a passage that is not there, or is there twice, and changes nothing', () => {
    const t = team.create({ name: 'Growth marketer' });
    onRunOf(t);
    core.teamMethod({ text: '# Method\n- a\n- a\n' });
    expect(() => core.teamMethod({ old: '- b', new: '- c' })).toThrow(/not in your method/);
    expect(() => core.teamMethod({ old: '- a', new: '- c' })).toThrow(/more than once/);
    expect(fs.readFileSync(methodFile(team.dir(), t.id), 'utf8')).toBe('# Method\n- a\n- a\n');
  });

  it('keeps the version it replaced, so a bad change can be undone', () => {
    const t = team.create({ name: 'Growth marketer' });
    onRunOf(t);
    core.teamMethod({ text: '# First\n' });
    core.teamMethod({ text: '# Second\n' });
    const kept = fs.readdirSync(path.join(path.dirname(methodFile(team.dir(), t.id)), `${t.id}.versions`));
    expect(kept).toHaveLength(1);
  });

  it('is not a session that is no teammate\'s run', () => {
    expect(() => core.teamMethod({ text: '# x' })).toThrow();
  });
});

describe('a thread written out for a teammate to learn from', () => {
  it('keeps every word the person said and the agent answered, in order', () => {
    const text = sourceText({ title: 'Launch film', product: 'site', id: 'w-1' }, [
      { source: 'founder', field: 'body', text: 'Make a launch film.' },
      { source: 'agent', field: 'result', text: 'A'.repeat(5000) },
      { source: 'system', field: 'note', text: 'Moved to Later' },
      { source: 'founder', field: 'answer', text: 'Too slow.' },
    ]);
    expect(text).toContain('# Launch film (site/w-1)');
    expect(text.indexOf('Make a launch film.')).toBeLessThan(text.indexOf('Too slow.'));
    expect(text).toContain('A'.repeat(5000));
    expect(text).not.toContain('Moved to Later');
  });

  it('a thread too long to keep is cut in the agent\'s words first, and says so', () => {
    const turns = [
      { source: 'founder', field: 'body', text: 'FIRST-ASK' },
      ...Array.from({ length: 40 }, (_, i) => ({ source: 'agent', field: 'result', text: `${i}:${'z'.repeat(9000)}` })),
      { source: 'founder', field: 'answer', text: 'LAST-WORD' },
    ];
    const text = sourceText({ title: 'Long', product: 'site', id: 'w-2' }, turns, { cap: 60_000 });
    expect(text.length).toBeLessThanOrEqual(61_000);
    expect(text).toContain('FIRST-ASK');
    expect(text).toContain('LAST-WORD');
    expect(text).toMatch(/cut/);
  });
});
