// IN A GROUP, A TEAMMATE SPEAKS WHEN ASKED AND DOES NOT PILE ON.
//
// The owner: "the agents are writing in a way that doesn't feel very human." In a
// group nothing stopped three teammates posting one after another, nothing but a
// reply under its own message woke one (naming it did nothing), and a group
// message could not carry a document. Measured with reachTick and team_tell on a
// team of three copies: every message below went out before this change.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mts';
import { teamTell } from '../mcp/core/reach.mts';
import { reachTick } from '../main/teammate-reach.mts';
import { readChat, readOutbox, writeOutbox } from '../main/store/teammates-files.mts';
import { roomBody } from '../shared/agent-voice.mts';
import { CHAT_LABEL } from '../shared/teammates.mts';
import { GROUP_QUIET_MS, MOST_IN_A_ROW, asksInGroups, groupTurn } from '../shared/teammate-reach.mts';

const NOW = 1_800_000_000_000;
const person = (at, names = []) => ({ by: 'p-dev', at, agent: null, names });
const agent = (at, run, name = 'Metrics writer', id = 't-aaaaaa') => ({ by: 'p-maya', at, agent: { id, run, name }, names: [] });

describe('whose turn it is in a group', () => {
  const mate = 't-bbbbbb';
  const run = 'w-bbbbbb';

  it('is free when nobody has spoken', () => {
    expect(groupTurn({ recent: [], mate, run, now: NOW })).toBeNull();
  });

  it('is free just after a person spoke', () => {
    expect(groupTurn({ recent: [person(NOW - 1000)], mate, run, now: NOW })).toBeNull();
  });

  it('is taken when another agent has just spoken and nobody has answered', () => {
    expect(groupTurn({ recent: [person(NOW - 5000), agent(NOW - 1000, 'w-aaaaaa')], mate, run, now: NOW })).toMatch(/Metrics writer/);
  });

  it('is taken by a message still on its way out of this Mac', () => {
    expect(groupTurn({ recent: [], pending: [{ at: NOW - 1000, agent: { id: 't-aaaaaa', run: 'w-aaaaaa', name: 'Bug triage' } }], mate, run, now: NOW })).toMatch(/Bug triage/);
  });

  it('is free again once a person has answered that agent', () => {
    expect(groupTurn({ recent: [agent(NOW - 5000, 'w-aaaaaa'), person(NOW - 1000)], mate, run, now: NOW })).toBeNull();
  });

  it('is free once the other agent spoke longer ago than the quiet time, and not a moment before', () => {
    expect(groupTurn({ recent: [agent(NOW - GROUP_QUIET_MS - 1, 'w-aaaaaa')], mate, run, now: NOW })).toBeNull();
    expect(groupTurn({ recent: [agent(NOW - GROUP_QUIET_MS + 1, 'w-aaaaaa')], mate, run, now: NOW })).toMatch(/Metrics writer/);
  });

  it('is its own when the person last spoke named it, even after another agent', () => {
    expect(groupTurn({ recent: [person(NOW - 5000, [mate]), agent(NOW - 1000, 'w-aaaaaa')], mate, run, now: NOW })).toBeNull();
  });

  it('is not its own when the person named someone else', () => {
    expect(groupTurn({ recent: [person(NOW - 5000, ['t-cccccc']), agent(NOW - 1000, 'w-aaaaaa')], mate, run, now: NOW })).toMatch(/Metrics writer/);
  });

  it('is its own when its owner asked for this run', () => {
    expect(groupTurn({ recent: [agent(NOW - 1000, 'w-aaaaaa')], mate, run, asked: true, now: NOW })).toBeNull();
  });

  it('lets one run send a few short messages in a row, and no more', () => {
    const mine = (n) => Array.from({ length: n }, (_, i) => agent(NOW - 1000 + i, run, 'Chief of staff', mate));
    expect(groupTurn({ recent: mine(MOST_IN_A_ROW - 1), mate, run, now: NOW })).toBeNull();
    expect(groupTurn({ recent: mine(MOST_IN_A_ROW), mate, run, now: NOW })).toMatch(/document/i);
    expect(groupTurn({ recent: mine(MOST_IN_A_ROW), mate, run, asked: true, now: NOW })).toMatch(/document/i);
  });
});

describe('being asked in a group', () => {
  const team = [{ id: 't-aaaaaa', name: 'Chief of staff' }, { id: 't-bbbbbb', name: 'Metrics writer', openToTeam: true }];
  const room = (m) => ({ 'r-1': [{ id: 'm-1', by: 'p-maya', at: NOW - 1000, body: 'hello', ...m }] });
  const asks = (m) => asksInGroups({ rooms: room(m), roomNames: { 'r-1': 'Lumen' }, team, me: 'p-maya', now: NOW });

  it('wakes the teammate its owner names', () => {
    const [a, more] = asks({ body: '@Chief of staff what is stuck?' });
    expect(a).toMatchObject({ teammate: 't-aaaaaa', by: 'p-maya', room: 'r-1', roomName: 'Lumen', text: '@Chief of staff what is stuck?' });
    expect(more).toBeUndefined();
  });

  it('does not wake anyone for talk that names nobody, or just says its name without the @', () => {
    expect(asks({ body: 'what is stuck?' })).toEqual([]);
    expect(asks({ body: 'the chief of staff said so' })).toEqual([]);
  });

  it('does not wake a teammate for someone else unless its owner opened it to the team', () => {
    expect(asks({ by: 'p-dev', body: '@Chief of staff what is stuck?' })).toEqual([]);
    expect(asks({ by: 'p-dev', body: '@Metrics writer what moved?' })[0]).toMatchObject({ teammate: 't-bbbbbb', by: 'p-dev' });
  });

  it('is never woken by another agent naming it', () => {
    expect(asks({ body: roomBody({ name: 'Bug triage', id: 't-cccccc' }, '@Chief of staff look at this') })).toEqual([]);
  });

  it('is not woken by what is already seen, deleted or old', () => {
    expect(asksInGroups({ rooms: room({ body: '@Chief of staff hi' }), team, me: 'p-maya', now: NOW, seen: new Set(['room-ask:m-1:t-aaaaaa']) })).toEqual([]);
    expect(asks({ body: '@Chief of staff hi', deleted: true })).toEqual([]);
    expect(asks({ body: '@Chief of staff hi', at: NOW - 7 * 60 * 60 * 1000 })).toEqual([]);
  });
});

describe('on a real team', () => {
  let t; let chief; let metrics; let run; let sent; let messages; let team;
  const ROOM = 'r-lumen';

  const asA = (mate, labels = []) => {
    const item = t.maya.store.composeItem(t.product.id, { title: 'A round', body: 'Round.', labels: [`teammate:${mate.id}`, ...labels] });
    process.env.ZERO_ITEM = item.id;
    return item;
  };
  const tick = (now = Date.now()) => t.maya.on(() => reachTick({ mates: t.maya.store.teammates, store: t.maya.store, team, items: t.maya.store.listItems(now), now, tell: t.tell }));
  const room = (m) => { messages.push({ id: `m-${messages.length}`, by: 'p-dev', at: Date.now(), inReplyTo: null, ...m }); };

  beforeEach(async () => {
    t = await aTeamWithAgents();
    chief = t.maya.store.teammates.create({ starter: 'chief' });
    metrics = t.maya.store.teammates.create({ name: 'Metrics writer', job: 'Metrics.' });
    run = asA(chief);
    process.env.ZERO_PRODUCT = t.product.id;
    sent = [];
    messages = [];
    const real = t.maya.service;
    team = {
      state: () => { const s = real.state(); return { ...s, rooms: { rooms: [{ id: ROOM, name: 'Lumen' }], messages: { [ROOM]: messages } } }; },
      rooms: {
        send: async (id, body) => { sent.push({ id, body }); room({ by: real.state().me.id, body }); },
        putFileFrom: async (id, { name }) => { sent.push({ id, file: name }); return name; },
      },
    };
    await tick();
  });
  afterEach(() => { delete process.env.ZERO_ITEM; return t.stop(); });

  it('a second teammate is told at once, and nothing leaves, when the first just spoke', async () => {
    room({ by: team.state().me.id, body: roomBody({ id: metrics.id, run: 'w-aaaaaaaa', name: 'Metrics writer' }, 'Signups up 4%.') });
    await tick();
    expect(() => teamTell({ text: 'Agreed, signups look good.', group: 'Lumen' })).toThrow(/Metrics writer/);
    expect(readOutbox(t.maya.store.teammates.dir()).out.filter((o) => o.room)).toEqual([]);
  });

  it('a person speaking gives the floor back', async () => {
    room({ by: team.state().me.id, body: roomBody({ id: metrics.id, run: 'w-aaaaaaaa', name: 'Metrics writer' }, 'Signups up 4%.') });
    room({ body: 'Nice.' });
    await tick();
    expect(teamTell({ text: 'Tell me if that holds.', group: 'Lumen' }).to).toEqual(['Lumen']);
  });

  it('a run its owner\'s words woke may speak over another agent', async () => {
    room({ by: team.state().me.id, body: roomBody({ id: metrics.id, run: 'w-aaaaaaaa', name: 'Metrics writer' }, 'Signups up 4%.') });
    await tick();
    asA(chief, [CHAT_LABEL]);
    expect(teamTell({ text: 'Maya asked me to say the launch moved.', group: 'Lumen' }).to).toEqual(['Lumen']);
  });

  it('a plain thread\'s agent, which only writes when asked, is not held back', async () => {
    room({ by: team.state().me.id, body: roomBody({ id: metrics.id, run: 'w-aaaaaaaa', name: 'Metrics writer' }, 'Signups up 4%.') });
    await tick();
    const plain = t.maya.store.composeItem(t.product.id, { title: 'Tell the group', body: 'Tell them.' });
    process.env.ZERO_ITEM = plain.id;
    expect(teamTell({ text: 'The launch moved.', group: 'Lumen' }).to).toEqual(['Lumen']);
  });

  it('naming its teammate in the group wakes it, with the group to answer in and a yes to write there', async () => {
    room({ by: team.state().me.id, body: `@${chief.name} what is stuck?` });
    await tick();
    const chat = readChat(t.maya.store.teammates.dir());
    const woke = chat.messages.filter((m) => m.to === chief.id || (Array.isArray(m.to) && m.to.includes(chief.id)));
    expect(woke).toHaveLength(1);
    expect(woke[0].details ?? woke[0].text).toMatch(/group Lumen/);
    expect(woke[0].details ?? woke[0].text).toMatch(/what is stuck/);
    expect(readOutbox(t.maya.store.teammates.dir()).yes.has(`${chief.id}>room:${ROOM}`)).toBe(true);
    await tick();
    expect(readChat(t.maya.store.teammates.dir()).messages.filter((m) => m.to === chief.id || (Array.isArray(m.to) && m.to.includes(chief.id)))).toHaveLength(1);
  });

  it('a group message carries a document as a person\'s does, with its one sentence beside it', async () => {
    writeOutbox(t.maya.store.teammates.dir(), { kind: 'yes', who: chief.id, key: `room:${ROOM}` });
    fs.mkdirSync(path.join(t.product.dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(t.product.dir, 'reports', 'launch-plan.md'), '# Plan\n');
    expect(run.id).toBeTruthy();
    process.env.ZERO_ITEM = run.id;
    teamTell({ text: 'Launch plan is ready, one question on day 3.', group: 'Lumen', files: ['reports/launch-plan.md'] });
    await tick();
    await tick(Date.now() + 11_000);
    const posted = sent.find((s) => s.body);
    expect(sent.some((s) => s.file && s.file.endsWith('launch-plan.md'))).toBe(true);
    expect(posted.body).toMatch(/Launch plan is ready, one question on day 3\.\n\n\[launch-plan\.md\]\(attachments\/[^)]*launch-plan\.md\)/);
  });
});
