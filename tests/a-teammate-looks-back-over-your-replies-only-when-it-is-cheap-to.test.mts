// A teammate only learned inside a run, and only if that run remembered to
// update its method before it ended. Nothing ever went back over its threads
// to fix a rule your later words had overturned, or to catch a correction it
// missed. Anthropic's memory research (components-of-agent-memory, 2026-11)
// found that an offline look-back against the transcripts is what corrects a
// wrong note. Now a teammate looks back over the threads you replied on and
// tightens its method. You asked that this spend carefully and never exhaust
// your limits, so it runs only after three threads with your replies since the
// last one, at most once a day, never within three runs of its weekly cap,
// only while it is idle, and only while the plan's usage reading is fresh and
// well under both limits. It runs at medium effort.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  planWakes, teammateLabel, DEFAULT_LIMIT, LOOK_BACK_LABEL, LOOK_BACK_AFTER, roomToLookBack, taughtRuns, lookBackEffort,
} from '../shared/teammates.mts';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 9, 15, 0).getTime();
const base = { id: 't-aaaaaa', name: 'Marketing lead', letter: 'M', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [], duties: [], dutyServed: {} };
const chat = { messages: [], seen: new Set() };
const lookBacks = (acts) => acts.filter((a) => a.type === 'run' && a.trigger.kind === 'look-back');
const yes = { ok: () => true };

// A finished run of the teammate's. `replied` is how long ago you answered on it.
const ran = (id, { ago = 2 * HOUR, replied = null, labels = [], status = 'done', closedByYou = false } = {}) => ({
  id, product: 'kestrel', title: id, status,
  labels: ['founder', teammateLabel(base.id), 'hop:0', ...labels],
  createdAt: NOW - ago,
  wrote: {
    ...(replied !== null ? { answer: { source: 'founder', ts: NOW - replied } } : {}),
    ...(closedByYou ? { status: { source: 'founder', ts: NOW - HOUR } } : { status: { source: 'agent', ts: NOW - ago + 1000 } }),
    result: { source: 'agent', ts: NOW - ago + 1000 },
  },
});
const replied = (n, opts = {}) => Array.from({ length: n }, (_, k) => ran(`w-r${k}`, { ago: (k + 2) * HOUR, replied: (k + 1) * HOUR, ...opts }));

describe('when a teammate looks back', () => {
  it('starts one look-back once three threads have your replies, and not at two', () => {
    expect(LOOK_BACK_AFTER).toBe(3);
    const three = lookBacks(planWakes({ teammates: [base], chat, items: replied(3), now: NOW, lookBack: yes }));
    expect(three).toHaveLength(1);
    expect(three[0]).toMatchObject({ start: 'now', title: 'Learn from your recent replies' });
    expect(lookBacks(planWakes({ teammates: [base], chat, items: replied(2), now: NOW, lookBack: yes }))).toHaveLength(0);
  });

  it('counts a thread you closed yourself as one you replied on', () => {
    const items = [...replied(2), ran('w-closed', { closedByYou: true })];
    expect(lookBacks(planWakes({ teammates: [base], chat, items, now: NOW, lookBack: yes }))).toHaveLength(1);
  });

  it('never starts without the go-ahead the app gives (no method, or no room in the plan)', () => {
    expect(lookBacks(planWakes({ teammates: [base], chat, items: replied(5), now: NOW }))).toHaveLength(0);
    expect(lookBacks(planWakes({ teammates: [base], chat, items: replied(5), now: NOW, lookBack: { ok: () => false } }))).toHaveLength(0);
  });

  it('counts only replies since its last look-back, and runs at most once a day', () => {
    const last = ran('w-lb', { ago: 30 * HOUR, labels: [LOOK_BACK_LABEL, 'clean'] });
    const before = Array.from({ length: 4 }, (_, k) => ran(`w-old${k}`, { ago: 40 * HOUR, replied: 35 * HOUR }));
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [last, ...before, ...replied(2)], now: NOW, lookBack: yes }))).toHaveLength(0);
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [last, ...before, ...replied(3)], now: NOW, lookBack: yes }))).toHaveLength(1);
    const recent = ran('w-lb2', { ago: 20 * HOUR, labels: [LOOK_BACK_LABEL, 'clean'] });
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [recent, ...replied(6)], now: NOW, lookBack: yes }))).toHaveLength(0);
  });

  it('does not count its own look-backs, runs you never answered, or replies over two weeks old', () => {
    const quiet = [ran('w-q1'), ran('w-q2'), ran('w-q3')];
    const stale = Array.from({ length: 3 }, (_, k) => ran(`w-s${k}`, { ago: 20 * DAY, replied: 15 * DAY }));
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [...quiet, ...stale, ...replied(2)], now: NOW, lookBack: yes }))).toHaveLength(0);
    expect(taughtRuns(base.id, [...quiet, ...stale, ...replied(2)], 0, NOW).map((i) => i.id)).toEqual(['w-r1', 'w-r0']);
  });

  it('waits while the teammate is busy, has work queued, or is paused', () => {
    const busy = { ...ran('w-busy', { ago: HOUR }), status: 'claimed', wrote: {} };
    const queued = { ...ran('w-q', { ago: HOUR }), status: 'open', start: 'later', wrote: {} };
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [...replied(4), busy], now: NOW, lookBack: yes }))).toHaveLength(0);
    expect(lookBacks(planWakes({ teammates: [base], chat, items: [...replied(4), queued], now: NOW, lookBack: yes }))).toHaveLength(0);
    expect(lookBacks(planWakes({ teammates: [{ ...base, paused: true }], chat, items: replied(4), now: NOW, lookBack: yes }))).toHaveLength(0);
  });

  it('leaves three runs of the weekly cap for real work, and says nothing about the cap', () => {
    const t = { ...base, limit: 7 };
    const four = lookBacks(planWakes({ teammates: [t], chat, items: replied(3), now: NOW, lookBack: yes }));
    expect(four).toHaveLength(1);
    const acts = planWakes({ teammates: [t], chat, items: replied(4), now: NOW, lookBack: yes });
    expect(lookBacks(acts)).toHaveLength(0);
    expect(acts.some((a) => a.type === 'limit')).toBe(false);
  });
});

describe('room in the plan for a look-back', () => {
  const reading = (session, week, ago = HOUR) => ({ at: NOW - ago, limits: [
    { span: 'session', percent: session }, { span: 'week', percent: week },
  ] });

  it('needs a fresh reading under half the session limit and under 60% of the week', () => {
    expect(roomToLookBack(reading(30, 40), NOW)).toBe(true);
    expect(roomToLookBack(reading(49, 59), NOW)).toBe(true);
    expect(roomToLookBack(reading(50, 10), NOW)).toBe(false);
    expect(roomToLookBack(reading(10, 60), NOW)).toBe(false);
  });

  it('is no when nothing is known: no reading, no limits, or a reading over six hours old', () => {
    expect(roomToLookBack(null, NOW)).toBe(false);
    expect(roomToLookBack({ at: NOW, limits: [] }, NOW)).toBe(false);
    expect(roomToLookBack(reading(10, 10, 7 * HOUR), NOW)).toBe(false);
  });

  it('counts every weekly limit, a model\'s own included', () => {
    const r = { at: NOW - HOUR, limits: [{ span: 'session', percent: 5 }, { span: 'week', percent: 10 }, { span: 'week', qualifier: 'Opus', percent: 80 }] };
    expect(roomToLookBack(r, NOW)).toBe(false);
  });

  it('thinks at medium effort, or low when the teammate is set to low', () => {
    expect(lookBackEffort(undefined)).toBe('medium');
    expect(lookBackEffort('max')).toBe('medium');
    expect(lookBackEffort('low')).toBe('low');
  });
});

describe('a look-back run', () => {
  let product; let dir; let mods; let team; let store; let histories;

  beforeEach(async () => {
    const { appHome } = await import('../main/store/home.mts');
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const { loadStore } = await import('../main/store-modules.mts');
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
    const { Teammates } = await import('../main/teammates.mts');
    team = new Teammates(store);
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const setUp = async (t, { method = true } = {}) => {
    const { methodFile, writeTeammate } = await import('../main/store/teammates-files.mts');
    writeTeammate(team.dir(), t.id, { status: 'active', product: product.id }, NOW - 10 * DAY);
    if (method) {
      const file = methodFile(team.dir(), t.id);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '## Standing rules\n- "Short posts" (2026-11-01)\n');
    }
    // Three finished runs you replied on, each with what you said in it.
    for (const k of [1, 2, 3]) {
      const made = mods.workItemsDisk.createWorkItem(dir, { title: `Post ${k}`, kind: 'directive', priority: 5, labels: ['founder', teammateLabel(t.id), 'hop:0', 'work:x'] }, { source: 'system', now: NOW - (k + 5) * HOUR });
      mods.workItemsDisk.updateWorkItem(dir, made.id, { result: `Draft ${k}` }, { source: 'agent', now: NOW - (k + 4) * HOUR });
      mods.workItemsDisk.updateWorkItem(dir, made.id, { answer: `Too long, cut it ${k}` }, { source: 'founder', now: NOW - (k + 3) * HOUR });
      mods.workItemsDisk.updateWorkItem(dir, made.id, { status: 'done' }, { source: 'agent', now: NOW - (k + 2) * HOUR });
      histories[made.id] = [
        { source: 'agent', field: 'result', text: `Draft ${k}`, ts: NOW - (k + 4) * HOUR },
        { source: 'founder', field: 'answer', text: `Too long, cut it ${k}`, ts: NOW - (k + 3) * HOUR },
      ];
    }
  };

  it('starts at medium effort with its label, and its brief writes out the threads you replied on', async () => {
    const t = team.create({ name: 'Growth marketer', job: 'Suggest posts.' });
    await setUp(t);
    const done = await team.tick({ items: store.listItems(NOW), now: NOW, room: () => true });
    const started = done.filter((a) => a.type === 'run' && a.trigger.kind === 'look-back');
    expect(started).toHaveLength(1);
    const row = store.listItems(NOW).find((i) => i.id === started[0].id);
    expect(row.labels).toContain(LOOK_BACK_LABEL);
    expect(row.effort).toBe('medium');
    expect(row.body).toMatch(/learn from what the person said/i);
    const brief = team.briefFor(row, NOW);
    expect(brief).toContain('## Threads named in what woke you');
    expect(brief.match(/\(Post \d, \d+ characters\)/g)).toHaveLength(3);
  });

  it('does not start for a teammate with no method yet, or when the plan has no room', async () => {
    const t = team.create({ name: 'Growth marketer', job: 'Suggest posts.' });
    await setUp(t, { method: false });
    const none = await team.tick({ items: store.listItems(NOW), now: NOW, room: () => true });
    expect(none.filter((a) => a.type === 'run')).toHaveLength(0);
    const u = team.create({ name: 'Support lead', job: 'Answer people.' });
    await setUp(u);
    const tight = await team.tick({ items: store.listItems(NOW), now: NOW, room: () => false });
    expect(tight.filter((a) => a.type === 'run')).toHaveLength(0);
    const nothing = await team.tick({ items: store.listItems(NOW), now: NOW });
    expect(nothing.filter((a) => a.type === 'run')).toHaveLength(0);
  });
});
