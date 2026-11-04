// AN AGENT WRITES TO PEOPLE UNDER ITS OWN NAME, AND NEVER AS YOU.
//
// In the words of people using it: "My agents cannot send
// anything to a teammate: nothing here reaches Maya, so please forward the draft
// below." "Agents can't start a thread with several people or post into a thread
// with people." Then, once told to, the same agents wrote into Maya's own
// conversations: every row read "You: Dev, this is Chief of staff, Maya's agent",
// five times in three minutes, the agent named only in its own words.
//
// Measured: no store tool could address a person at all (team_post reaches only
// AI teammates), and a line in a conversation had no way to say an agent wrote it.
//
// What must NOT happen is pinned as hard as what must: nothing reaches a new
// person before the owner's yes, a "no" sends nothing, and something marked as
// leaving the team asks every time.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell, teamTask } from '../mcp/core/reach.mjs';
import { REACH_LABEL, reachAnswer } from '../shared/teammate-reach.mjs';
import { voiceName } from '../shared/agent-voice.mjs';
import { messageLine } from '../renderer/src/threads/page-rules';
import { isTaskRow } from '../shared/team-rules.mjs';
import { itemThread } from '../renderer/src/item-thread';

let t; let chief; let run;

const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = t.product.id; };
const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const tap = (row, words) => t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { answer: words }));
const dmOf = (copy) => t.conversationsOf(copy).filter((i) => !isTaskRow(i));

beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  // A run of Chief of staff, the way the tick makes one.
  run = t.maya.store.composeItem(t.product.id, { title: 'Monday brief', body: 'Get me the brief.', labels: [`teammate:${chief.id}`] });
  onRun(run.id);
  await t.tick();
});
afterEach(() => t.stop());

describe('the first time it writes to a new person', () => {
  it('waits for the owner, says so to the agent, and reaches nobody', async () => {
    const out = teamTell({ text: 'Dev, is the booking API on for Monday?', to: ['Dev'] });
    expect(out.held).toBe(true);
    expect(out.note).toMatch(/yes/i);
    await t.tick();
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)).toHaveLength(0);
    const [row] = askRows();
    expect(row.title).toBe('Chief of staff wants to write to Dev Patel');
    expect(row.result).toContain('Dev, is the booking API on for Monday?');
    expect(row.result).toContain('## Options');
    expect(row.status).not.toBe('done');
  });

  it('asks once for one message, however many ticks pass', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    await t.tick();
    expect(askRows()).toHaveLength(1);
  });

  it('a yes from now on sends it under the agent\'s name, and later ones go without asking', async () => {
    teamTell({ text: 'Dev, is the booking API on for Monday?', to: ['Dev'] });
    await t.tick();
    await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
    await t.tick();
    await t.dev.service.syncNow();
    const [got] = dmOf(t.dev);
    expect(got.body).toBe('Dev, is the booking API on for Monday?');
    expect(got.createdBy).toBe(t.maya.personId);

    const again = teamTell({ text: 'Dev, and the staging link?', to: ['Dev'] });
    expect(again.held).toBe(false);
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)[0].answer).toBe('Dev, and the staging link?');
    // Nothing more was asked of Maya.
    expect(askRows().filter((r) => r.status !== 'done')).toHaveLength(0);
  });

  it('a yes for one message leaves the next one to ask again', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    await tap(askRows()[0], '2. Send this one only');
    await t.tick();
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)).toHaveLength(1);
    expect(teamTell({ text: 'Dev, another.', to: ['Dev'] }).held).toBe(true);
  });

  it('a yes for Dev is not a yes for Sofia', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
    await t.tick();
    expect(teamTell({ text: 'Sofia, one thing.', to: ['Sofia'] }).held).toBe(true);
    await t.tick();
    await t.sofia.service.syncNow();
    expect(dmOf(t.sofia)).toHaveLength(0);
  });

  it('a no sends nothing and tells the agent', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    const [row] = askRows();
    await tap(row, "3. Don't send it");
    await t.tick();
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)).toHaveLength(0);
    expect(t.told.at(-1).id).toBe(run.id);
    expect(t.told.at(-1).text).toMatch(/not sent/i);
    expect(askRows()[0].status).toBe('done');
  });

  it('closing the ask sends nothing', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    const [row] = askRows();
    await t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { status: 'done' }));
    await t.tick();
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)).toHaveLength(0);
  });

  it('the owner\'s own words on the ask go to the agent and send nothing', () => {
    expect(reachAnswer('Not to Dev, ask Sofia')).toEqual({ kind: 'no', words: 'Not to Dev, ask Sofia' });
    expect(reachAnswer('1.').kind).toBe('always');
    expect(reachAnswer('2').kind).toBe('once');
    expect(reachAnswer('(withdrawn)')).toBeNull();
    expect(reachAnswer('')).toBeNull();
  });
});

describe('anything marked as leaving the team', () => {
  it('asks every time, even of someone it may already write to', async () => {
    teamTell({ text: 'Dev, one thing.', to: ['Dev'] });
    await t.tick();
    await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
    await t.tick();
    const out = teamTell({ text: 'Please send this to Harbor Dental.', to: ['Dev'], outside: true });
    expect(out.held).toBe(true);
    await t.tick();
    const open = askRows().filter((r) => r.status !== 'done');
    expect(open).toHaveLength(1);
    expect(open[0].result).toMatch(/outside the team/i);
    // No standing yes is offered for it.
    expect(open[0].result).not.toMatch(/from now on/);
  });
});

describe('who it shows as', () => {
  const allow = async (name) => {
    teamTell({ text: `${name}, hello.`, to: [name] });
    await t.tick();
    await tap(askRows().at(-1), `1. Send it, and let it write to ${name} from now on`);
    await t.tick();
  };

  it('says the agent and its owner on the other copy, and never You on the owner\'s', async () => {
    await allow('Dev');
    await t.dev.service.syncNow();
    const product = (copy) => copy.store.listProducts().find((p) => p.team?.direct);
    const names = { [t.maya.personId]: 'Maya', [t.dev.personId]: 'Dev' };
    const theirs = messageLine(dmOf(t.dev)[0], product(t.dev), t.dev.personId, (id) => names[id]);
    expect(theirs.fromMe).toBe(false);
    expect(theirs.text).toBe("Chief of staff, Maya's: Dev, hello.");
    const ours = messageLine(dmOf(t.maya)[0], product(t.maya), t.maya.personId, (id) => names[id]);
    expect(ours.fromMe).toBe(false);
    expect(ours.text).toBe('Chief of staff: Dev, hello.');
  });

  it('a person\'s own message in the same conversation still reads as theirs', async () => {
    await allow('Dev');
    await t.maya.on(() => t.maya.service.message(t.dev.personId, 'And from me, thanks.'));
    const product = t.maya.store.listProducts().find((p) => p.team?.direct);
    const ours = messageLine(dmOf(t.maya)[0], product, t.maya.personId, () => 'x');
    expect(ours.fromMe).toBe(true);
    expect(ours.text).toBe('And from me, thanks.');
  });

  it('draws the message in the thread as the agent\'s, not as yours', async () => {
    await allow('Dev');
    const convo = dmOf(t.maya)[0];
    const { events } = itemThread(t.maya.store.readHistory(convo.product, convo.id, { max: 100 }), [], null, { whole: true });
    const said = events.filter((e) => e.kind !== 'work').find((e) => e.text === 'Dev, hello.');
    expect(said.voice?.name).toBe('Chief of staff');
  });

  it('names the owner plainly', () => {
    expect(voiceName({ name: 'Chief of staff' }, 'Maya Chen')).toBe("Chief of staff, Maya's");
    expect(voiceName({ name: 'Chief of staff' }, 'Maya Chen', { mine: true })).toBe('Chief of staff');
    expect(voiceName({ name: 'Chief of staff' }, '')).toBe('Chief of staff');
  });
});

describe('who it can reach', () => {
  it('several people share one conversation', async () => {
    const out = teamTell({ text: 'Both of you, the seat bar is out.', to: ['Dev', 'Sofia'] });
    expect(out.to).toEqual(['Dev Patel', 'Sofia Reyes']);
    await t.tick();
    const [row] = askRows();
    expect(row.title).toBe('Chief of staff wants to write to Dev Patel and Sofia Reyes');
    await tap(row, '2. Send this one only');
    await t.tick();
    await t.dev.service.syncNow();
    await t.sofia.service.syncNow();
    expect(dmOf(t.dev)[0].id).toBe(dmOf(t.sofia)[0].id);
  });

  it('the people on its own thread, and a plain refusal when it has none', async () => {
    expect(() => teamTell({ text: 'Hello.', thread: true })).toThrow(/no people/);
    const shared = t.maya.store.composeItem(t.product.id, {
      title: 'Spec', body: 'Draft it.', labels: [`teammate:${chief.id}`], visibility: 'people', visibleTo: [t.dev.personId],
    });
    onRun(shared.id);
    expect(teamTell({ text: 'Dev, the spec is ready.', thread: true }).to).toEqual(['Dev Patel']);
  });

  it('refuses someone not on the team, naming who is', () => {
    expect(() => teamTell({ text: 'Hello.', to: ['Grace'] })).toThrow(/Dev Patel/);
  });

  it('refuses an empty message and a message to nobody', () => {
    expect(() => teamTell({ text: '  ', to: ['Dev'] })).toThrow(/nothing to say/);
    expect(() => teamTell({ text: 'Hello.' })).toThrow(/who/);
  });

  it('refuses when the app has not said who is on the team', () => {
    process.env.STORE_ACCOUNT_ID = 'nobody-here';
    expect(() => teamTell({ text: 'Hello.', to: ['Dev'] })).toThrow();
  });

  it('a thread that is no AI teammate\'s writes as the person\'s agent', async () => {
    const plain = t.maya.store.composeItem(t.product.id, { title: 'Quick one', body: 'Tell Dev.' });
    onRun(plain.id);
    teamTell({ text: 'Dev, Maya asked me to pass this on.', to: ['Dev'] });
    await t.tick();
    const [row] = askRows();
    expect(row.title).toBe('Your agent wants to write to Dev Patel');
    await tap(row, '2. Send this one only');
    await t.tick();
    await t.dev.service.syncNow();
    const product = t.dev.store.listProducts().find((p) => p.team?.direct);
    const line = messageLine(dmOf(t.dev)[0], product, t.dev.personId, () => 'Maya');
    expect(line.text).toBe("Agent, Maya's: Dev, Maya asked me to pass this on.");
  });
});

describe('a task', () => {
  it('lands with the person, from the agent, and no agent starts on it', async () => {
    teamTask({ to: 'Dev', title: 'Turn on the booking API', details: 'Staging first.' });
    await t.tick();
    await tap(askRows()[0], '2. Send this one only');
    await t.tick();
    await t.dev.service.syncNow();
    const task = t.conversationsOf(t.dev).find((i) => isTaskRow(i));
    expect(task.title).toBe('Turn on the booking API');
    expect(task.assignee).toBe(t.dev.personId);
    expect(task.body).toContain('Staging first.');
    expect(task.wrote.body.voice.name).toBe('Chief of staff');
  });

  it('refuses a task to several people', () => {
    expect(() => teamTask({ to: ['Dev', 'Sofia'], title: 'x' })).toThrow(/one person/);
  });
});
