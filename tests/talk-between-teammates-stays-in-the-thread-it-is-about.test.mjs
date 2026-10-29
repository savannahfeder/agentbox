// On 26 Oct one of your threads handed a daily clip lane to the Growth
// marketer and the Video producer, one minute apart. In under two hours that
// became 19 threads, 8 of the Growth marketer's and 11 of the Video
// producer's, counted off the store by their teammate labels. Every @mention
// from one to the other opened a new thread, a pass sent with an @mention
// opened two at once, and two runs of the Video producer rendered the same
// clip side by side. Two threads in Needs you asked you to pick between
// different posts about the same number, and four videos were made that you
// never said yes to.
//
// A first fix held teammates' words for the thread on that work, inferred
// from where messages came from. Codex's review found it half-built: the
// words never woke a thread waiting on you, the oldest of more than twelve
// were marked read and never shown, two jobs in two projects merged, a thread
// closed by its own agent opened a new one again, and nothing enforced your
// yes. This is the design that replaced it:
//
// - Talk between teammates (@Name) wakes nobody; a hand-off (team_pass) does.
// - Every run carries the work of yours it is on (`work:`), and a hand-off goes
//   to the receiver's thread already talking with the sender, else its thread
//   on that work in that project, as a reply credited to the sender. A thread
//   its agent finished opens again; one you closed is left closed.
// - That reply takes the road yours takes (the queue, the live steer, the
//   delivery marks) but never your authority: not your words, never a
//   command, never past your stop.
// - A teammate set to `handoffsNeedYes` holds a hand-off in Needs you.
// - Hand-offs count up without you and your reply resets the count.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { queuedReplyText } from '../main/live-replies.mjs';
import { planWakes, runIdFor, seenKey, teammateLabel, teammateIdOf, workOf, handOffText, foldChat, DEFAULT_LIMIT, MAX_HOPS } from '../shared/teammates.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { toldBy, heldForHer, stoppedByHer } from '../shared/answers.mjs';
import { threadEvents } from '../renderer/src/thread-history';
import { threadState } from '../shared/thread-cards.mjs';

const NOW = new Date(2026, 9, 26, 15, 43).getTime();
const base = { status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const gm = { ...base, id: 't-growth', name: 'Growth marketer', letter: 'G' };
const vp = { ...base, id: 't-video', name: 'Video producer', letter: 'V' };
const YOURS = 'w-xaccount';

const handOff = (id, to, title, via = YOURS) => ({ id, kind: 'pass', from: 'you', to: to.id, title, details: '', via, viaProduct: 'kestrel', ts: NOW });
const thread = (t, id, work, over = {}) => ({ id, product: 'kestrel', title: 'x', status: 'open', labels: ['founder', teammateLabel(t.id), 'hop:0', `work:${work}`], createdAt: NOW, wrote: {}, ...over });
const asking = (ts = NOW + 1000) => ({ result: 'Pick A, B or C?', wrote: { result: { ts, source: 'agent' } } });
const pass = (id, from, to, title, run, work, ts, over = {}) => ({ id, kind: 'pass', from: from.id, to: to.id, title, details: 'see the doc', hop: 0, run, work, ts, ...over });
const say = (id, from, to, text, run, work, ts) => ({ id, kind: 'msg', from: from.id, to: [to.id], text, hop: 0, run, work, ts });
const chat = (messages, seen = [], into = new Map()) => ({ messages, seen: new Set(seen), into });

// Both lanes, handed off from your thread, each with a thread asking you.
const lanes = [handOff('m-0', gm, 'Run a daily Factory-style feature clip'), handOff('m-1', vp, 'Work out with the Growth marketer how a clip a day gets made')];
const laneSeen = lanes.map((l) => seenKey(l.id, l.to));
const GM_LANE = runIdFor(`m-0>${gm.id}`);
const VP_LANE = runIdFor(`m-1>${vp.id}`);
const gmLane = (over) => thread(gm, GM_LANE, YOURS, { ...asking(), ...over });
const vpLane = (over) => thread(vp, VP_LANE, YOURS, { ...asking(), ...over });
const plan = (messages, items, extra = {}) => planWakes({ teammates: [gm, vp, ...(extra.teammates ?? [])].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).map((t) => (extra.teammates ?? []).find((x) => x.id === t.id) ?? t), chat: chat([...lanes, ...messages], [...laneSeen, ...(extra.seen ?? [])], extra.into), items, now: NOW + 60_000 });

describe('who a teammate wakes', () => {
  it('naming a teammate in the chat wakes nobody and opens nothing', () => {
    const m = say('m-2', vp, gm, '@Growth marketer has the new day one', VP_LANE, YOURS, NOW + 2000);
    const acts = plan([m], [gmLane(), vpLane()]);
    expect(acts.filter((a) => a.type === 'run' || a.type === 'tell')).toEqual([]);
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-2', teammate: gm.id });
  });

  it('a hand-off goes to the thread the receiver has on that work, as a reply from the sender', () => {
    const p = pass('m-2', vp, gm, 'Hold every post with a bracket', VP_LANE, YOURS, NOW + 2000);
    const acts = plan([p], [gmLane(), vpLane()]);
    expect(acts.filter((a) => a.type === 'run')).toEqual([]);
    expect(acts).toContainEqual({
      type: 'tell', teammate: gm.id, item: GM_LANE, product: 'kestrel', msg: 'm-2', hop: 1, hold: true,
      text: handOffText(p), from: { teammate: vp.id, name: 'Video producer' },
    });
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-2', teammate: gm.id, run: GM_LANE });
  });

  it('it goes back to the thread already talking with the sender, ahead of a newer one on the same work', () => {
    const older = gmLane();
    const newer = thread(gm, 'w-newer', YOURS, { createdAt: NOW + 500 });
    // The Growth marketer's lane passed work to the Video producer's run; that run answers.
    const into = new Map([[VP_LANE, [{ ref: 'm-a', for: vp.id, ts: NOW + 100 }]]]);
    const earlier = pass('m-a', gm, vp, 'Make the clip', GM_LANE, YOURS, NOW + 50);
    const back = pass('m-2', vp, gm, 'Clip is rendered', VP_LANE, YOURS, NOW + 2000);
    const acts = plan([earlier, back], [older, newer, vpLane()], { into, seen: [seenKey('m-a', vp.id)] });
    expect(acts.find((a) => a.type === 'tell')).toMatchObject({ item: GM_LANE });
  });

  it('a thread its agent finished opens again rather than a new one starting', () => {
    const finished = gmLane({ status: 'done', labels: [...gmLane().labels, 'clean'], wrote: { ...asking().wrote, status: { ts: NOW + 1500, source: 'agent' } } });
    const acts = plan([pass('m-2', vp, gm, 'Day one is rendered', VP_LANE, YOURS, NOW + 2000)], [finished, vpLane()]);
    expect(acts.filter((a) => a.type === 'run')).toEqual([]);
    expect(acts.find((a) => a.type === 'tell')).toMatchObject({ item: GM_LANE });
  });

  it('a thread you closed stays closed, and the hand-off starts a new one on the same work', () => {
    const closed = gmLane({ status: 'done', wrote: { ...asking().wrote, status: { ts: NOW + 1500, source: 'founder' } } });
    const acts = plan([pass('m-2', vp, gm, 'Day one is rendered', VP_LANE, YOURS, NOW + 2000)], [closed, vpLane()]);
    expect(acts.filter((a) => a.type === 'tell')).toEqual([]);
    const run = acts.find((a) => a.type === 'run');
    expect(run).toMatchObject({ teammate: gm.id, id: runIdFor(`m-2>${gm.id}`) });
    expect(run.trigger.work).toBe(YOURS);
  });

  it('other work, or the same work in another project, gets a thread of its own', () => {
    const other = pass('m-2', vp, gm, 'Which post goes under the launch video?', 'w-launchrun', 'w-launch', NOW + 2000);
    expect(plan([other], [gmLane(), vpLane()]).filter((a) => a.type === 'run')).toHaveLength(1);
    const elsewhere = pass('m-3', vp, gm, 'Fix sign-in', VP_LANE, YOURS, NOW + 2000, { product: 'other-project' });
    const acts = plan([elsewhere], [gmLane(), vpLane()]);
    expect(acts.filter((a) => a.type === 'tell')).toEqual([]);
    expect(acts.filter((a) => a.type === 'run')).toHaveLength(1);
  });

  it('a pass and the @mention sent with it make one thread, and a second pass in the same tick joins it', () => {
    const done = vpLane({ status: 'done', wrote: { ...asking().wrote, status: { ts: NOW + 1500, source: 'founder' } } });
    const first = pass('m-p', gm, vp, 'The first daily feature clip', GM_LANE, YOURS, NOW + 2000);
    const note = say('m-n', gm, vp, '@Video producer has the shot list', GM_LANE, YOURS, NOW + 2001);
    const second = pass('m-q', gm, vp, 'Day one changed', GM_LANE, YOURS, NOW + 2002);
    const acts = plan([first, note, second], [gmLane(), done]);
    expect(acts.filter((a) => a.type === 'run')).toEqual([expect.objectContaining({ teammate: vp.id, id: runIdFor(`m-p>${vp.id}`) })]);
    expect(acts.find((a) => a.type === 'tell')).toMatchObject({ item: runIdFor(`m-p>${vp.id}`), msg: 'm-q' });
  });

  it('a teammate whose hand-offs need your yes holds them, in its thread or a new one', () => {
    const careful = { ...vp, handoffsNeedYes: true };
    const into = plan([pass('m-2', gm, vp, 'Make the Hyperfocus clip', GM_LANE, YOURS, NOW + 2000)], [gmLane(), vpLane()], { teammates: [careful] });
    expect(into.find((a) => a.type === 'tell')).toMatchObject({ item: VP_LANE, hold: true });
    const fresh = plan([pass('m-2', gm, vp, 'Make the Hyperfocus clip', GM_LANE, YOURS, NOW + 2000)], [gmLane()], { teammates: [careful] });
    expect(fresh.find((a) => a.type === 'run').trigger).toMatchObject({ hold: true });
    // Your own hand-off is your yes.
    const yours = plan([handOff('m-3', vp, 'Make the clip')], [gmLane(), vpLane()], { teammates: [careful] });
    expect(yours.find((a) => a.type === 'run').trigger.hold).toBeUndefined();
  });

  it('hand-offs count up without you and stop at the limit, saying so', () => {
    const at = (hop) => pass(`m-h${hop}`, vp, gm, 'again', VP_LANE, YOURS, NOW + 2000, { hop });
    expect(plan([at(MAX_HOPS - 1)], [gmLane(), vpLane()]).find((a) => a.type === 'tell').hop).toBe(MAX_HOPS);
    const stop = plan([at(MAX_HOPS)], [gmLane(), vpLane()]);
    expect(stop.find((a) => a.type === 'tell' || a.type === 'run')).toBeUndefined();
    expect(stop).toContainEqual({ type: 'hops', teammate: gm.id, msg: `m-h${MAX_HOPS}`, from: vp.id });
  });
});

// Replays the evening of 26 Oct: the two hand-offs, then the sixteen times the
// teammates woke each other, in the order the store has them. After each one
// the thread that took it ends its turn, and as on the night most of them
// close themselves quietly, which is what reopened new threads in the first fix.
describe('the evening of 26 October, replayed', () => {
  const EVENING = [
    ['pass', gm, vp, 'The first daily feature clip: One at a time'], ['msg', gm, vp, 'With the shot list; four whole posts are waiting on your yes'],
    ['pass', gm, vp, 'Day one changed: Claude Code runs out, Codex picks the thread up'], ['msg', gm, vp, 'Has the new day one and is holding the old clip'],
    ['msg', vp, gm, 'The daily clip is built and the first one is rendered'], ['msg', gm, vp, 'That split is exactly the one written in marketing/daily-clips.md'],
    ['pass', gm, vp, 'Measure the speed run before we shoot it'], ['msg', gm, vp, 'Is measuring the speed run before anything gets shot'],
    ['msg', vp, gm, "Day five's One at a time clip is rendered"], ['msg', gm, vp, 'Your one-at-a-time clip is day two, not day five'],
    ['pass', gm, vp, 'The Hyperfocus clip: the scroll back, then one key each'], ['msg', vp, gm, 'Your three cards are on it word for word'],
    ['msg', vp, gm, 'Please stop handing me clips to build'], ['msg', vp, gm, 'Please retire your side of it'],
    ['msg', vp, gm, "It uses your three cards and the app's own sentence"], ['msg', vp, gm, 'Hold every post with a bracket in it'],
  ];

  const replay = ({ before = false, careful = false, eager = false } = {}) => {
    const team = [gm, careful ? { ...vp, handoffsNeedYes: true } : eager ? { ...vp, handoffsNeedYes: false } : vp];
    const items = [];
    const messages = [];
    const lines = [];
    const turns = { [gm.id]: 0, [vp.id]: 0 };
    const tick = (now, n) => {
      const folded = foldChat(lines);
      for (const a of planWakes({ teammates: team, chat: { messages, seen: folded.seen, into: folded.into }, items, now })) {
        if (a.type === 'run') {
          items.push({ id: a.id, product: 'kestrel', title: a.title, status: a.trigger.hold ? 'blocked' : 'open', labels: ['founder', teammateLabel(a.teammate), `hop:${a.trigger.hop}`, `work:${a.trigger.work ?? a.id}`], createdAt: now, wrote: {} });
          if (!a.trigger.hold) turns[a.teammate] += 1;
        }
        if (a.type === 'tell') {
          const home = items.find((i) => i.id === a.item);
          Object.assign(home, { status: a.hold ? 'blocked' : 'open', answer: a.text, wrote: { ...home.wrote, answer: { ts: now, source: 'system', from: a.from.name } } });
          if (!a.hold) turns[a.teammate] += 1;
        }
        if (a.type === 'seen') lines.push({ kind: 'seen', ref: a.msg, for: a.teammate, ...(a.run ? { run: a.run } : {}), ts: now });
      }
      // Each turn ends: every other one asks you, the rest close quietly.
      for (const i of items) {
        if (i.status !== 'open') continue;
        Object.assign(i, n % 2 ? { status: 'done', labels: [...i.labels, 'clean'], wrote: { ...i.wrote, status: { ts: now + 1, source: 'agent' } } } : asking(now + 1));
      }
    };
    messages.push(...lanes);
    tick(NOW, 0);
    const home = (t) => items.filter((i) => teammateIdOf(i) === t.id).at(-1)?.id;
    EVENING.forEach(([kind, from, to, words], n) => {
      const ts = NOW + (n + 1) * 60_000;
      const provenance = before ? {} : { run: home(from), work: YOURS };
      messages.push(kind === 'pass'
        ? { id: `m-e${n}`, kind, from: from.id, to: to.id, title: words, details: '', hop: 0, ...provenance, ts }
        : { id: `m-e${n}`, kind, from: from.id, to: [to.id], text: `@${to.name} ${words}`, hop: 0, ...provenance, ts });
      tick(ts + 1, n + 1);
    });
    const count = (t) => items.filter((i) => teammateIdOf(i) === t.id).length;
    return { gm: count(gm), vp: count(vp), turns, items };
  };

  it('is one thread each, and the Video producer starts nothing a teammate handed it without you', () => {
    const now = replay();
    expect({ gm: now.gm, vp: now.vp }).toEqual({ gm: 1, vp: 1 });
    // Its first turn only: the four hand-offs wait for your yes.
    expect(now.turns).toEqual({ [gm.id]: 1, [vp.id]: 1 });
  });

  it('told to take hand-offs straight away, only the four hand-offs woke it', () => {
    const now = replay({ eager: true });
    expect({ gm: now.gm, vp: now.vp }).toEqual({ gm: 1, vp: 1 });
    // Two first turns, then one turn per hand-off: the twelve mentions cost nothing.
    expect(now.turns).toEqual({ [gm.id]: 1, [vp.id]: 5 });
  });

  it('with the Video producer set to need your yes, no clip starts without you', () => {
    const now = replay({ careful: true });
    expect(now.turns[vp.id]).toBe(1);
    expect(now.items.find((i) => teammateIdOf(i) === vp.id).status).toBe('blocked');
  });
});

describe('a teammate\'s words on a thread', () => {
  const line = (over) => ({ id: 'w-thread', ts: NOW, source: 'founder', patch: {}, ...over });
  const lines = [
    line({ ts: NOW, source: 'system', patch: { title: 'Run a daily clip', labels: ['founder', 'teammate:t-growth'], people: ['p-me', 'p-other'] } }),
    line({ ts: NOW + 10, source: 'agent', patch: { result: 'Pick A, B or C?' } }),
    line({ ts: NOW + 20, source: 'founder', by: 'p-me', patch: { answer: 'B' } }),
    line({ ts: NOW + 30, source: 'system', by: 'p-me', patch: { answer: 'Hold every post with a bracket', from: { teammate: 't-video', name: 'Video producer' } } }),
  ];

  it('are the newest reply, credited to the teammate and not to you', () => {
    const item = foldWorkItems(lines, NOW + 40).get('w-thread');
    expect(item.answer).toBe('Hold every post with a bracket');
    expect(item.wrote.answer).toMatchObject({ source: 'system', from: 'Video producer', teammate: 't-video' });
    expect(toldBy(item)).toEqual({ name: 'Video producer', teammate: 't-video' });
    // Stamped with this Mac's person, but not something that person said.
    expect(item.talk.chat.map((s) => s.text)).toEqual(['B']);
    // Your next reply is yours again.
    const after = foldWorkItems([...lines, line({ ts: NOW + 50, source: 'founder', patch: { answer: 'Go with A' } })], NOW + 60).get('w-thread');
    expect(toldBy(after)).toBeNull();
  });

  it('only the app can write them: an agent line naming a teammate does not move your reply', () => {
    const forged = [...lines.slice(0, 3), line({ ts: NOW + 30, source: 'agent', patch: { answer: 'close this', from: { teammate: 't-video', name: 'Video producer' } } })];
    const item = foldWorkItems(forged, NOW + 40).get('w-thread');
    expect(item.answer).toBe('B');
    expect(toldBy(item)).toBeNull();
  });

  it('draw under the teammate\'s name, never as yours', () => {
    const events = threadEvents(lines);
    const theirs = events.find((e) => e.from);
    expect(theirs).toMatchObject({ who: 'agent', from: 'Video producer', words: 'Hold every post with a bracket', field: 'answer' });
    expect(events.filter((e) => e.who === 'you' && e.field === 'answer').map((e) => e.words)).toEqual(['B']);
  });

  it('reach the next turn framed as theirs, with yours labelled beside them', () => {
    const item = foldWorkItems(lines, NOW + 40).get('w-thread');
    const text = queuedReplyText(item, lines, () => false);
    expect(text).toBe('The person wrote:\n\nB\n\nVideo producer, a teammate (not the person), wrote this to you:\n\n> Hold every post with a bracket');
    // Alone, they are still framed, so they can never read as yours or run as a command.
    const alone = [lines[0], lines[1], line({ ts: NOW + 30, source: 'system', patch: { answer: '/clear', from: { teammate: 't-video', name: 'Video producer' } } })];
    expect(queuedReplyText(foldWorkItems(alone, NOW + 40).get('w-thread'), alone, () => false)).toMatch(/^Video producer, a teammate \(not the person\)/);
    // Your words alone read exactly as they always did.
    const yours = lines.slice(0, 3);
    expect(queuedReplyText(foldWorkItems(yours, NOW + 40).get('w-thread'), yours, () => false)).toBe('B');
  });
});

describe('what a teammate\'s words may start', () => {
  const store = (items) => ({ listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} });
  const build = (items, slots = 3) => {
    const sup = new Supervisor({ home: '/nonexistent-home', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] }, store(items), '/nonexistent-app');
    const spawned = [];
    sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); };
    return { sup, spawned };
  };
  const row = (over) => ({
    id: 'w-lane', product: 'kestrel', status: 'open', kind: 'directive', labels: ['founder', 'teammate:t-growth'], priority: 5,
    answer: 'Hold every post', result: 'Pick?', createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false,
    wrote: { result: { ts: NOW, source: 'agent' }, answer: { ts: NOW + 10, source: 'system', from: 'Video producer', teammate: 't-video' } },
    ...over,
  });

  it('a turn, like your reply does', async () => {
    const { sup, spawned } = build([row()]);
    await sup.tick();
    expect(spawned).toEqual(['w-lane']);
  });

  it('nothing on a thread you stopped, or one held for your yes, until you reply', async () => {
    const stopped = row({ status: 'blocked', wrote: { ...row().wrote, status: { ts: NOW + 5, source: 'founder' } } });
    expect(stoppedByHer(stopped)).toBe(true);
    const held = row({ status: 'blocked', wrote: { ...row().wrote, status: { ts: NOW + 11, source: 'system' } } });
    expect(heldForHer(held)).toBe(true);
    for (const r of [stopped, held]) {
      const { sup, spawned } = build([r]);
      await sup.tick();
      expect(spawned).toEqual([]);
    }
    // An agent's own block is not a hold: the teammate's words are what it waited for.
    const parked = row({ status: 'blocked', wrote: { ...row().wrote, status: { ts: NOW + 5, source: 'agent' } } });
    const { sup, spawned } = build([parked]);
    await sup.tick();
    expect(spawned).toEqual(['w-lane']);
  });

  it('never one of your commands, which skip the queue', async () => {
    const busy = (sup) => { for (let i = 0; i < 2; i += 1) sup.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'kestrel' }); };
    const theirs = build([row({ answer: '/usage' })], 2);
    busy(theirs.sup);
    await theirs.sup.tick();
    expect(theirs.spawned).toEqual([]);
    const yours = build([row({ answer: '/usage', wrote: { ...row().wrote, answer: { ts: NOW + 10, source: 'founder' } } })], 2);
    busy(yours.sup);
    await yours.sup.tick();
    expect(yours.spawned).toEqual(['w-lane']);
  });

  it('are introduced to the agent as a teammate\'s, which do not outrank yours', () => {
    const { sup } = build([]);
    const brief = sup.replyBrief(row());
    expect(brief).toMatch(/^Video producer, a teammate, has written on the work item/);
    expect(brief).toMatch(/not the founder's word/);
    expect(brief).not.toMatch(/outranks anything/);
    expect(sup.replyBrief(row({ wrote: { answer: { ts: NOW, source: 'founder' } } }))).toMatch(/^The founder has replied/);
  });
});

describe('through the store', () => {
  let product; let dir; let mods; let team; let core; let work; let store;

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
    work = mods.workItemsDisk;
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = product.id; };
  // The real store's tell, without a supervisor to steer a live session.
  const tellInto = (calls) => async (p, id, args) => {
    calls.push({ id, ...args });
    const { Store } = await import('../main/store.mjs');
    return Store.prototype.tellItem.call({ modules: mods, productDir: () => dir }, p, id, args);
  };
  const tick = (now, calls = []) => team.tick({ items: store.listItems(now), now, deliver: async () => {}, tell: tellInto(calls) });

  it('a hand-off lands on the other teammate\'s thread as theirs, and talk lands nowhere', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    const video = team.create({ name: 'Video producer' });
    const { writeChat, writeTeammate } = await import('../main/store/teammates-files.mjs');
    const T = Date.now();
    // The person told it to take hand-offs straight away.
    writeTeammate(team.dir(), growth.id, { handoffsNeedYes: false }, T);
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: growth.id, title: 'Run a daily clip', details: '', via: 'w-xaccount', viaProduct: product.id }, T);
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: video.id, title: 'Make the clips', details: '', via: 'w-xaccount', viaProduct: product.id }, T + 1);
    await tick(T + 2);
    const lane = store.listItems().find((i) => teammateIdOf(i) === growth.id);
    const clips = store.listItems().find((i) => teammateIdOf(i) === video.id);
    expect(workOf(lane)).toBe('w-xaccount');
    work.updateWorkItem(dir, lane.id, { result: 'Pick A, B or C?', status: 'open' }, { source: 'agent', now: T + 10 });

    onRun(clips.id);
    expect(core.teamPost({ text: '@Growth marketer FYI the clip is rendering' }, { now: T + 20 }).note).toMatch(/wakes nobody/);
    expect(team.chat().messages.at(-1)).toMatchObject({ from: video.id, run: clips.id, work: 'w-xaccount' });
    const passed = core.teamPass({ to: 'Growth marketer', title: 'Hold every post with a bracket', details: 'The terminal half is not measured.' }, { now: T + 21 });
    expect(passed.note).toMatch(/already has on this work/);

    const calls = [];
    await tick(T + 30, calls);
    await tick(T + 40, calls);
    expect(store.listItems().filter((i) => teammateIdOf(i) === growth.id).map((i) => i.id)).toEqual([lane.id]);
    expect(calls).toEqual([expect.objectContaining({ id: lane.id, hold: false, from: { teammate: video.id, name: 'Video producer' } })]);
    const after = store.listItems().find((i) => i.id === lane.id);
    expect(after.answer).toBe('**Hold every post with a bracket**\n\nThe terminal half is not measured.');
    expect(toldBy(after)).toMatchObject({ name: 'Video producer' });
    // The FYI is read on the lane's next turn, not lost.
    const brief = team.briefFor(after, T + 50);
    expect(brief).toContain('FYI the clip is rendering');
    expect(brief).toMatch(/not the person's yes/);
  });

  it('a hand-off to a teammate that needs your yes waits blocked in your inbox', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    const video = team.create({ name: 'Video producer' });
    const { writeChat } = await import('../main/store/teammates-files.mjs');
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: growth.id, title: 'Run a daily clip', details: '', via: 'w-xaccount', viaProduct: product.id }, Date.now());
    await tick(Date.now());
    const lane = store.listItems().find((i) => teammateIdOf(i) === growth.id);
    onRun(lane.id);
    // The Video producer saved the person's rule.
    const { writeTeammate } = await import('../main/store/teammates-files.mjs');
    writeTeammate(team.dir(), video.id, { handoffsNeedYes: true }, Date.now());
    expect(core.teamPass({ to: 'Video producer', title: 'Make the Hyperfocus clip', details: '' }).note).toMatch(/only with the person's yes/);
    await tick(Date.now());
    const held = store.listItems().find((i) => teammateIdOf(i) === video.id);
    expect(held).toMatchObject({ status: 'blocked' });
    expect(held.body).toMatch(/Nothing starts until you reply here/);
    // Its row says it waits on you, not that it is in progress.
    expect(threadState(held)).toBe('waiting');
    expect(threadState(lane)).toBe('running');
  });

  it('your reply on a run starts the hand-off count again', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    team.create({ name: 'Video producer' });
    const made = work.createWorkItem(dir, { title: 'deep in a chain', labels: ['founder', teammateLabel(growth.id), 'hop:5'] }, { source: 'system' });
    onRun(made.id);
    core.teamPass({ to: 'Video producer', title: 'one', details: '' });
    expect(team.chat().messages.at(-1).hop).toBe(5);
    work.updateWorkItem(dir, made.id, { answer: 'carry on' }, { source: 'founder' });
    core.teamPass({ to: 'Video producer', title: 'two', details: '' });
    expect(team.chat().messages.at(-1).hop).toBe(0);
  });
});
