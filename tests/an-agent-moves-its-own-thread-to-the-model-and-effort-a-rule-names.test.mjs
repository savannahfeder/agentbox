// "AI teammates should be able to adjust effort level and model for certain
// tasks, because for certain tasks I might say 'video gen always uses Opus 5.5
// at High effort'."
//
// The person told a teammate demo videos always run on Opus 5.5 at High. The
// teammate stopped the build and offered three options, because a session
// cannot change its own model or effort, it is never told its effort, and no
// store tool could set either on a thread. Now the run is told both in its
// standing instructions, update_work_item and create_work_item take a model and
// an effort, and when an agent moves its own thread during a turn the app starts
// the next turn on them at once, in the same conversation, at most three times
// in 30 minutes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { effortWord, modelWord } from '../shared/model-words.mjs';

describe('the words an agent may write', () => {
  it('reads a model by alias, id or the name on screen', () => {
    expect(modelWord('opus')).toEqual({ model: 'opus' });
    expect(modelWord('Opus 5.5')).toEqual({ model: 'opus' });
    expect(modelWord('Opus 5')).toEqual({ model: 'claude-opus-5' });
    expect(modelWord('claude-opus-5-5')).toEqual({ model: 'claude-opus-5-5' });
    expect(modelWord('gpt-5.6-sol')).toEqual({ model: 'gpt-5.6-sol' });
    expect(modelWord('')).toEqual({ model: '' });
  });

  it('refuses a model no run could start on', () => {
    expect(modelWord('Opus five point five').error).toMatch(/opus, sonnet, haiku, fable/);
    expect(modelWord('opus 5.5 high').error).toBeTruthy();
  });

  it('reads an effort by id or the name on screen, and refuses others', () => {
    expect(effortWord('high')).toEqual({ effort: 'high' });
    expect(effortWord('High')).toEqual({ effort: 'high' });
    expect(effortWord('Extra')).toEqual({ effort: 'xhigh' });
    expect(effortWord('ultra')).toEqual({ effort: 'ultra' });
    expect(effortWord('ultrathink').error).toMatch(/low, medium, high, xhigh, max/);
  });
});

describe('the store tools', () => {
  let built = [];
  let product;
  beforeEach(async () => {
    const home = (await import('../main/store/home.mjs')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct-switch-model';
    fs.mkdirSync(path.join(home, 'accounts', 'acct-switch-model'), { recursive: true });
    (await import('../mcp/core/account.mjs')).resolveAccount();
    product = (await import('../mcp/core/products.mjs')).createProduct(`Switch ${Math.random().toString(36).slice(2, 8)}`);
  });
  afterEach(() => {
    for (const b of built) b.claims._stop();
    built = [];
    delete process.env.STORE_ACCOUNT_ID;
  });
  const tool = async (name, ownItem = null) => {
    const b = (await import('../mcp/tools.mjs')).buildTools({ holder: `test-${Math.random()}`, ownItem });
    built.push(b);
    const t = b.tools.find((x) => x.name === name);
    const said = (args) => Promise.resolve(t.run(args)).then((r) => r.content[0].text);
    return { schema: t.schema, said, run: (args) => said(args).then((text) => JSON.parse(text)) };
  };

  it('update_work_item sets the thread\'s model and effort as an agent', async () => {
    const work = await import('../mcp/core/work.mjs');
    const row = work.createItem(product.id, { title: 'Demo video', labels: ['founder'] }, { source: 'founder' });
    const update = await tool('update_work_item', row.id);
    expect(Object.keys(update.schema)).toEqual(expect.arrayContaining(['model', 'effort']));
    const out = await update.run({ id: row.id, model: 'Opus 5.5', effort: 'High' });
    expect(out).toMatchObject({ model: 'opus', effort: 'high' });
    expect(out.wrote.model.source).toBe('agent');
  });

  it('update_work_item refuses a word that would stop the run', async () => {
    const work = await import('../mcp/core/work.mjs');
    const row = work.createItem(product.id, { title: 'Demo video', labels: ['founder'] }, { source: 'founder' });
    const update = await tool('update_work_item', row.id);
    expect(await update.said({ id: row.id, model: 'the best one' })).toMatch(/^error: .*not a model/);
    expect(await update.said({ id: row.id, effort: 'ultrathink' })).toMatch(/^error: .*not an effort/);
    expect(work.listWorkItems({ product: product.id }).find((i) => i.id === row.id).model ?? null).toBe(null);
  });

  it('create_work_item files a thread on a model and effort', async () => {
    const create = await tool('create_work_item');
    const out = await create.run({ product: product.id, title: 'Cut the launch video', model: 'opus', effort: 'max' });
    expect(out).toMatchObject({ model: 'opus', effort: 'max' });
  });
});

describe('the next turn after an agent moves its own thread', () => {
  const started = 1_000_000;
  const row = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'Demo video', status: 'open', wrote: {}, ...over });
  const moved = (fields, { source = 'agent', ts = started + 5_000 } = {}) => row({
    ...fields, wrote: Object.fromEntries(Object.keys(fields).map((f) => [f, { source, ts }])),
  });
  const session = (ranOn = { model: null, effort: 'high' }) => ({ startedAt: started, ranOn });
  const supervisor = (current) => {
    const s = Object.create(Supervisor.prototype);
    s.sessions = new Map();
    s.store = { listItems: () => [current] };
    s.spawnWorker = vi.fn();
    return s;
  };
  let warn;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(Date, 'now').mockReturnValue(started + 10_000); });
  afterEach(() => vi.restoreAllMocks());

  it('starts at once, in the same conversation, on what it chose', () => {
    const s = supervisor(moved({ model: 'opus', effort: 'high' }));
    expect(s._carryOnAfterASwitch(row(), session({ model: 'claude-opus-5', effort: null }))).toBe(true);
    expect(s.spawnWorker).toHaveBeenCalledTimes(1);
    const [item, opts] = s.spawnWorker.mock.calls[0];
    expect(opts).toEqual({ continuation: true, switched: true });
    expect(item).toMatchObject({ model: 'opus', effort: 'high', answer: null });
  });

  it('starts on an effort change alone', () => {
    const s = supervisor(moved({ effort: 'max' }));
    expect(s._carryOnAfterASwitch(row(), session())).toBe(true);
  });

  it('does not start when nothing changed, or the change was made before the run', () => {
    expect(supervisor(moved({ effort: 'high' }))._carryOnAfterASwitch(row(), session())).toBe(false);
    expect(supervisor(moved({ effort: 'max' }, { ts: started - 1 }))._carryOnAfterASwitch(row(), session())).toBe(false);
  });

  it('does not start on a change the person or a teammate setting made', () => {
    expect(supervisor(moved({ effort: 'max' }, { source: 'founder' }))._carryOnAfterASwitch(row(), session())).toBe(false);
    expect(supervisor(moved({ effort: 'max' }, { source: 'system' }))._carryOnAfterASwitch(row(), session())).toBe(false);
  });

  it('does not start a thread that is finished, blocked or already running', () => {
    expect(supervisor(moved({ effort: 'max' }, {}))._carryOnAfterASwitch(row(), session())).toBe(true);
    expect(supervisor({ ...moved({ effort: 'max' }), status: 'done' })._carryOnAfterASwitch(row(), session())).toBe(false);
    expect(supervisor({ ...moved({ effort: 'max' }), status: 'blocked' })._carryOnAfterASwitch(row(), session())).toBe(false);
    const busy = supervisor(moved({ effort: 'max' }));
    busy.sessions.set('w-1', {});
    expect(busy._carryOnAfterASwitch(row(), session())).toBe(false);
  });

  it('stops after three in 30 minutes and says so', () => {
    const s = supervisor(moved({ effort: 'max' }));
    for (let i = 0; i < 3; i += 1) expect(s._carryOnAfterASwitch(row(), session())).toBe(true);
    expect(s._carryOnAfterASwitch(row(), session())).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/w-1 changed its own model or effort 3 times/));
    Date.now.mockReturnValue(started + 10_000 + 30 * 60_000);
    expect(s._carryOnAfterASwitch(row(), session())).toBe(true);
  });

  it('is asked at the end of every turn the app did not stop', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(!session\.stoppedByUs && !session\.exitFailed\) this\._carryOnAfterASwitch\(item, session\);/);
    expect(src).toMatch(/ranOn: \{ model: item\.model \|\| null, effort: item\.effort \|\| null \}/);
  });
});

describe('what the run is told', () => {
  let appDir;
  const acme = () => ({ slug: 'acme', name: 'Acme', dir: path.join(appDir, 'acme'), repoPath: null });
  const supervisor = (over = {}) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = appDir;
    s.userDir = appDir;
    s.config = { sessionArgs: ['--model', 'claude-opus-5'], personalSessionArgs: [], personalProducts: [] };
    s._personalSessions = {};
    s.buildBrief = () => 'THE BRIEF';
    s.store = { listProducts: () => [acme()] };
    return Object.assign(s, over);
  };
  const systemOf = (args) => args[args.indexOf('--append-system-prompt') + 1] ?? '';
  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-model-'));
    fs.mkdirSync(path.join(appDir, 'acme'), { recursive: true });
  });
  afterEach(() => fs.rmSync(appDir, { recursive: true, force: true }));

  it('names its model and effort, and how to move to others', () => {
    const plan = supervisor().spawnPlan({ id: 'w-1', product: 'acme', title: 'Demo video', model: 'opus', effort: 'high' }, acme());
    const system = systemOf(plan.args);
    expect(system).toMatch(/This thread runs on Opus 5\.5 \(`opus`\) at High effort\./);
    expect(system).toMatch(/update_work_item/);
  });

  it('says the engine decides when nothing is set', () => {
    expect(supervisor().modelAndEffortLine({ model: null, effort: null, engine: 'codex' }))
      .toMatch(/runs on Codex's own default model at its default effort/);
  });

  it('opens the switched turn on the switch, not on a reply nobody wrote', () => {
    const s = supervisor({ rowSessionFor: () => ({ sessionId: 'sess-1', profile: null }) });
    const plan = s.spawnPlan({ id: 'w-1', product: 'acme', title: 'Demo video', model: 'opus', effort: 'high', answer: null }, acme(), { continuation: true, switched: true });
    expect(plan.resumeId).toBe('sess-1');
    expect(plan.prompt).toMatch(/^You moved this thread to Opus 5\.5 at High effort, and this turn runs on it\./);
    expect(plan.prompt).not.toMatch(/replied/);
  });
});
