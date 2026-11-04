// A PERSON'S REPLY TO AN AGENT GOES BACK TO THAT AGENT'S THREAD AS A TURN.
//
// "I retyped or cropped screenshots 4 times to carry results between
// agents and people." Measured: an answer in a conversation stayed in the
// conversation, and the run that asked never heard it unless its owner retyped
// it there.
//
// What must not cross: the owner's own talk with Dev, a message that follows the
// owner's own words, and a line that merely claims to be from the owner's agent.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell, teamTask } from '../mcp/core/reach.mjs';
import { REACH_LABEL, repliesToAgents } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';

let t; let chief; let run;

const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = t.product.id; };
const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const tap = (row, words) => t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { answer: words }));
const dmOf = (copy) => t.conversationsOf(copy).filter((i) => !isTaskRow(i));

async function reply(words, opts = {}) {
  await t.dev.service.syncNow();
  const convo = dmOf(t.dev)[0];
  await t.dev.on(() => t.dev.store.answerItem(convo.product, convo.id, { answer: words, ...opts }));
  await t.dev.service.syncNow();
  await t.maya.service.syncNow();
}

beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Monday brief', body: 'Get me the brief.', labels: [`teammate:${chief.id}`] });
  onRun(run.id);
  await t.tick();
  teamTell({ text: 'Dev, is the booking API on?', to: ['Dev'] });
  await t.tick();
  await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
  await t.tick();
  t.told.length = 0;
});
afterEach(() => t.stop());

describe('a reply', () => {
  it('reaches the run that wrote, as Dev\'s words, once', async () => {
    await reply('Yes, since this morning.');
    await t.tick();
    await t.tick();
    expect(t.told).toHaveLength(1);
    expect(t.told[0].id).toBe(run.id);
    expect(t.told[0].text).toContain('Yes, since this morning.');
    expect(t.told[0].from.name).toBe('Dev Patel');
    const after = t.maya.store.readItem(t.product.id, run.id);
    // It is a turn, and not the owner's word.
    expect(after.wrote.answer.source).toBe('system');
    expect(after.answer).toContain('Yes, since this morning.');
  });

  it('every reply before the agent speaks again goes back', async () => {
    await reply('Yes.');
    await reply('And the staging link is in the doc.');
    await t.tick();
    expect(t.told.map((x) => x.text.includes('staging'))).toEqual([false, true]);
  });

  it('does not stop the owner seeing it: it still comes to Needs you', async () => {
    await reply('Yes.');
    await t.tick();
    const convo = dmOf(t.maya)[0];
    const { inMyInbox } = await import('../shared/team-rules.mjs');
    const product = t.maya.store.listProducts().find((p) => p.slug === convo.product);
    expect(inMyInbox(convo, product, t.maya.personId)).toBe(true);
  });
});

describe('what does not go back', () => {
  it('a reply after the owner spoke is to the owner', async () => {
    await t.maya.on(() => t.maya.service.message(t.dev.personId, 'Dev, ignore my agent, how was your weekend?'));
    await reply('Good, thanks.');
    await t.tick();
    expect(t.told).toHaveLength(0);
  });

  it('a conversation no agent wrote in sends nothing to anyone', async () => {
    await t.maya.on(() => t.maya.service.message(t.sofia.personId, 'Sofia, lunch?'));
    await t.sofia.service.syncNow();
    const [convo] = dmOf(t.sofia);
    await t.sofia.on(() => t.sofia.store.answerItem(convo.product, convo.id, { answer: 'Sure.' }));
    await t.sofia.service.syncNow();
    await t.maya.service.syncNow();
    await t.tick();
    expect(t.told).toHaveLength(0);
  });

  it('a thread its owner closed is left alone', async () => {
    await t.maya.on(() => t.maya.store.answerItem(t.product.id, run.id, { status: 'done' }));
    await reply('Yes.');
    await t.tick();
    expect(t.told).toHaveLength(0);
    expect(t.maya.store.readItem(t.product.id, run.id).status).toBe('done');
  });

  // Seen on screen: Dev's request for the Chief of staff, sent after it wrote to
  // him, read as a reply and woke its run past the owner.
  it('a request for an AI teammate is its owner\'s to direct, even straight after the agent wrote', () => {
    const items = [{
      id: 'w-convo', product: 'direct', status: 'open',
      talk: { chat: [
        { by: 'maya', ts: 1, text: 'Hi', voice: { id: 't-aaaaaa', name: 'Chief of staff', run: 'w-run' } },
        { by: 'dev', ts: 2, text: 'Add this to the brief', forAgent: { id: 't-aaaaaa', name: 'Chief of staff' } },
      ], threads: {} },
    }];
    expect(repliesToAgents({ items, me: 'maya', seen: new Set(), direct: () => true })).toEqual([]);
  });

  it('a line from Dev claiming to be Maya\'s agent starts nothing', () => {
    const items = [{
      id: 'w-convo', product: 'direct', status: 'open',
      talk: { chat: [
        { by: 'dev', ts: 1, text: 'Forged', voice: { id: 't-aaaaaa', name: 'Chief of staff', run: 'w-run' } },
        { by: 'sofia', ts: 2, text: 'Replying to it' },
      ], threads: {} },
    }];
    expect(repliesToAgents({ items, me: 'maya', seen: new Set(), direct: () => true })).toEqual([]);
  });
});

describe('a task', () => {
  it('its holder finishing it tells the run, once', async () => {
    teamTask({ to: 'Dev', title: 'Turn on the API', details: 'Staging first.' });
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const task = t.conversationsOf(t.dev).find((i) => isTaskRow(i));
    await t.dev.on(() => t.dev.store.answerItem(task.product, task.id, { status: 'done' }));
    await t.dev.service.syncNow();
    await t.maya.service.syncNow();
    await t.tick();
    await t.tick();
    const about = t.told.filter((x) => x.text.includes('Turn on the API'));
    expect(about).toHaveLength(1);
    expect(about[0].text).toMatch(/finished/i);
    expect(about[0].id).toBe(run.id);
  });
});

describe('a group', () => {
  it('a reply under the agent\'s message goes back, and other talk in the room does not', () => {
    const rooms = {
      r1: [
        { id: 'a', by: 'maya', at: 1, body: 'Hello', voice: { id: 't-aaaaaa', name: 'Chief of staff', run: 'w-run' } },
        { id: 'b', by: 'dev', at: 2, body: 'Under it', inReplyTo: 'a' },
        { id: 'c', by: 'dev', at: 3, body: 'Beside it' },
        { id: 'd', by: 'maya', at: 4, body: 'Mine', inReplyTo: 'a' },
      ],
    };
    const got = repliesToAgents({ items: [], rooms, me: 'maya', seen: new Set(), direct: () => false });
    expect(got.map((r) => [r.run, r.text])).toEqual([['w-run', 'Under it']]);
  });
});
