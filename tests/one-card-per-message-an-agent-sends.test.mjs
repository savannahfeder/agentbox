// ONE CARD PER MESSAGE AN AGENT SENDS.
//
// "One announcement (Sofia now owns the film) cost me five cards and
// six clicks... two cards (the app's permission card and the agent's own
// question) ask the same yes." The app's card read "Chief of staff asked to
// send this." over a RESULT section, so it never said plainly what would go to
// whom; the store tool told the agent "Say so in your answer", so its run ended
// on a second card asking for the same yes; after the yes nothing told that run
// it had gone ("Neither has been told yet" stayed in Needs you); and once a
// person was allowed "from now on" a message left at once with no way back.
//
// Measured on two copies over the memory cloud, the way the app's tick runs.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell } from '../mcp/core/reach.mjs';
import { REACH_LABEL, UNDO_HOLD_MS, reachAudienceOf } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';
import { sendingWords } from '../renderer/src/team/agent-sending.ts';

let t; let chief; let run;
const WORDS = 'Sofia now owns the launch film, Maya decided it today.';

const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const tap = (row, words) => t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { answer: words }));
const dmOf = (copy) => t.conversationsOf(copy).filter((i) => !isTaskRow(i));
const sending = (now = Date.now()) => t.maya.store.teammates.view(t.maya.store.listItems(now), now).sending ?? [];
const allowDev = async () => {
  teamTell({ text: 'Dev, hello.', to: ['Dev'] });
  await t.tick();
  await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
  await t.tick();
  await t.dev.service.syncNow();
};

beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Film owner note', body: 'Tell Sofia and Dev.', labels: [`teammate:${chief.id}`] });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
});
afterEach(() => t.stop());

describe('the card the owner answers', () => {
  it('shows the exact words once, and who they go to and where', async () => {
    teamTell({ text: WORDS, to: ['Sofia', 'Dev'] });
    await t.tick();
    const [row] = askRows();
    const shown = `${row.body}\n${row.result}`;
    expect(shown.split(WORDS)).toHaveLength(2);
    expect(row.body).toBe('To Sofia Reyes and Dev Patel, in your messages with them.');
    expect(row.body).not.toMatch(/asked to send this/);
  });

  it('once answered, "Sent to" names the people, not the card', async () => {
    teamTell({ text: WORDS, to: ['Sofia', 'Dev'] });
    await t.tick();
    expect(reachAudienceOf(askRows()[0])).toBe('Sofia Reyes and Dev Patel');
    expect(reachAudienceOf({ title: 'Chief of staff wants to write to Dev', labels: [] })).toBeNull();
  });

  it('says a task goes as a task', async () => {
    const { teamTask } = await import('../mcp/core/reach.mjs');
    teamTask({ to: 'Dev', title: 'Turn on the booking API', details: 'Staging first.' });
    await t.tick();
    expect(askRows()[0].body).toBe('A task for Dev Patel, in your messages with them.');
  });
});

describe('the agent asks nothing of its own about it', () => {
  it('is told the app shows the owner its words, and not to ask for the yes itself', () => {
    const out = teamTell({ text: WORDS, to: ['Sofia'] });
    expect(out.held).toBe(true);
    expect(out.note).toMatch(/the app shows your owner these exact words/i);
    expect(out.note).toMatch(/do not ask them for this yes yourself/i);
    expect(out.note).not.toMatch(/say so in your answer/i);
  });

  it('its brief says a message it sends asks for its own yes', () => {
    const brief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, run.id));
    expect(brief).toMatch(/team_tell and team_task ask your owner for that yes themselves/);
  });

  it('a run still open when the owner says yes is told the message went, so its own words are not left stale', async () => {
    teamTell({ text: WORDS, to: ['Sofia'] });
    await t.tick();
    await tap(askRows()[0], '2. Send this one only');
    await t.tick();
    expect(t.told.at(-1)).toMatchObject({ id: run.id });
    expect(t.told.at(-1).text).toMatch(/said yes, and your message to Sofia Reyes went/);
  });

  it('a run already finished is not woken for it', async () => {
    teamTell({ text: WORDS, to: ['Sofia'] });
    await t.tick();
    await t.maya.on(() => t.maya.store.modules.workItemsDisk.updateWorkItem(t.maya.store.productDir(t.product.id), run.id, { status: 'done' }, { source: 'agent' }));
    const before = t.told.length;
    await tap(askRows()[0], '2. Send this one only');
    await t.tick();
    expect(t.told.length).toBe(before);
  });
});

describe('once the owner said from now on', () => {
  it('asks nothing, and holds the message ten seconds with its words before it goes', async () => {
    await allowDev();
    const now = Date.now();
    expect(teamTell({ text: 'Dev, and the staging link?', to: ['Dev'] }, { now }).held).toBe(false);
    await t.tick(now);
    expect(sending(now)).toEqual([expect.objectContaining({ from: 'Chief of staff', to: 'Dev Patel', text: 'Dev, and the staging link?', until: now + UNDO_HOLD_MS })]);
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)[0].answer).not.toBe('Dev, and the staging link?');
    expect(askRows().filter((r) => r.status !== 'done')).toHaveLength(0);

    await t.tick(now + UNDO_HOLD_MS);
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)[0].answer).toBe('Dev, and the staging link?');
    expect(sending(now + UNDO_HOLD_MS)).toEqual([]);
  });

  it('Undo in those ten seconds sends nothing and tells the agent', async () => {
    await allowDev();
    const now = Date.now();
    teamTell({ text: 'Dev, scrap that.', to: ['Dev'] }, { now });
    await t.tick(now);
    const [held] = sending(now);
    expect(t.maya.store.teammates.unsend(held.id, now + 2000)).toBe(true);
    await t.tick(now + UNDO_HOLD_MS);
    await t.dev.service.syncNow();
    expect(dmOf(t.dev)[0].answer ?? dmOf(t.dev)[0].body).not.toBe('Dev, scrap that.');
    expect(t.told.at(-1).text).toMatch(/took back your message to Dev Patel/);
  });

  it('Undo after it went changes nothing', async () => {
    await allowDev();
    const now = Date.now();
    teamTell({ text: 'Dev, one more.', to: ['Dev'] }, { now });
    await t.tick(now);
    const [held] = sending(now);
    await t.tick(now + UNDO_HOLD_MS);
    expect(t.maya.store.teammates.unsend(held.id, now + UNDO_HOLD_MS + 1)).toBe(false);
  });

  it('the bar over the screen names who it goes to, the seconds left and the words', () => {
    const h = { from: 'Chief of staff', to: 'Dev Patel', text: 'Dev, one more.', until: 20_000 };
    expect(sendingWords(h, 12_100)).toEqual({ title: 'Chief of staff to Dev Patel, in 8s', line: 'Dev, one more.' });
    expect(sendingWords(h, 19_999).title).toMatch(/in 1s$/);
  });

  it('someone not yet allowed is still asked, with no hold', async () => {
    await allowDev();
    const now = Date.now();
    teamTell({ text: 'Sofia, hello.', to: ['Sofia'] }, { now });
    await t.tick(now);
    expect(sending(now)).toEqual([]);
    expect(askRows().filter((r) => r.status !== 'done')).toHaveLength(1);
  });
});
