// AN AI TEAMMATE IS A MEMBER WITH AN OWNER.
//
// Round one could not say whose an AI teammate was: Dev could not see Maya's
// Chief of staff, its job, or write to it. Measured: a teammate lives on its
// owner's disk and nothing of it reaches the cloud.
//
// The rule: anyone on the team can see what it does. Only its owner directs it.
// Someone else writing to it reaches the owner's Needs you as a request, unless
// the owner opened it to the team. No other copy may wake it.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { isMateCard, mateCard, mateFromCard, splitCards } from '../shared/mate-cards.mjs';
import { teammateIdOf } from '../shared/teammates.mjs';
import { inMyInbox } from '../shared/team-rules.mjs';
import { messageLine } from '../renderer/src/threads/page-rules';

let t; let chief;
const ownMates = (store) => store.teammates.list();

beforeEach(async () => {
  t = await aTeamWithAgents({ ownMates });
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  await t.maya.service.syncNow();
  await t.dev.service.syncNow();
});
afterEach(() => t.stop());

const runsOf = () => t.rows(t.maya).filter((i) => teammateIdOf(i) === chief.id);

describe('the team can see it', () => {
  it('arrives on a teammate\'s copy with its owner and job, and not as a thread', async () => {
    const { teamMates, cards } = t.dev.service.state();
    const seen = teamMates.find((m) => m.id === chief.id);
    expect(seen.name).toBe('Chief of staff');
    expect(seen.owner).toBe(t.maya.personId);
    expect(seen.job).toContain('main point of contact');
    expect(cards.some((c) => isMateCard(c))).toBe(false);
  });

  it('is left off its owner\'s list, which already has it', () => {
    expect(t.maya.service.state().teamMates ?? []).toEqual([]);
  });

  it('a card round trip keeps what is shown and only that', () => {
    const card = mateCard({ id: 't-abc123', name: 'QA', job: 'Find bugs', openToTeam: true, memory: [{ text: 'secret' }], asksFirst: 'private rule' }, { now: 'Triage', at: 5 });
    expect(JSON.stringify(card)).not.toContain('secret');
    expect(JSON.stringify(card)).not.toContain('private rule');
    expect(mateFromCard({ ...card, personId: 'p' })).toEqual({ id: 't-abc123', owner: 'p', name: 'QA', job: 'Find bugs', now: 'Triage', open: true, running: false, updatedAt: 5 });
    expect(mateFromCard({ ...mateCard({ id: 't-abc123', name: 'QA' }, { running: true }), personId: 'p' }).running).toBe(true);
    expect(splitCards([card, { threadId: 'w-1', personId: 'p' }]).cards).toHaveLength(1);
  });
});

describe('someone else writing to it', () => {
  const write = (words) => t.dev.on(() => t.dev.service.messageMate({ owner: t.maya.personId, mate: chief.id, text: words }));
  const land = async () => { await t.dev.service.syncNow(); await t.maya.service.syncNow(); await t.tick(); await t.tick(); await t.wake(); await t.wake(); };

  it('reaches the owner\'s Needs you as a request, and wakes nothing', async () => {
    await write('Can you add group bookings to the brief?');
    await land();
    expect(runsOf()).toHaveLength(0);
    const convo = t.conversationsOf(t.maya)[0];
    const product = t.maya.store.listProducts().find((p) => p.slug === convo.product);
    expect(inMyInbox(convo, product, t.maya.personId)).toBe(true);
    const line = messageLine(convo, product, t.maya.personId, () => 'Dev');
    expect(line.text).toBe('For Chief of staff: Can you add group bookings to the brief?');
  });

  it('starts it when the owner opened it to the team, once, as Dev\'s words', async () => {
    t.maya.store.teammates.update(chief.id, { openToTeam: true });
    await write('Add group bookings to the brief.');
    await land();
    const runs = runsOf();
    expect(runs).toHaveLength(1);
    expect(runs[0].title).toContain('From Dev');
    expect(runs[0].body).toContain('Add group bookings to the brief.');
    // Not the owner's words: it carries no owner's authority.
    expect(runs[0].wrote.body.source).not.toBe('founder');
  });

  it('an answer to someone who wrote first needs no yes', async () => {
    t.maya.store.teammates.update(chief.id, { openToTeam: true });
    await write('Add group bookings to the brief.');
    await land();
    const { teamTell } = await import('../mcp/core/reach.mjs');
    process.env.ZERO_ITEM = runsOf()[0].id;
    process.env.ZERO_PRODUCT = t.product.id;
    expect(teamTell({ text: 'Added.', to: ['Dev'] }).held).toBe(false);
  });

  it('cannot be aimed at a teammate that is not on the team list', async () => {
    await expect(t.dev.on(() => t.dev.service.messageMate({ owner: t.maya.personId, mate: 't-ffffff', text: 'Hi' }))).rejects.toThrow(/no longer/);
  });

  it('a person cannot make it their own, or message their own through this', async () => {
    await expect(t.maya.on(() => t.maya.service.messageMate({ owner: t.maya.personId, mate: chief.id, text: 'Hi' }))).rejects.toThrow();
  });

  it('a request does not reach a run when the line comes from the owner\'s own copy', async () => {
    await t.maya.on(() => t.maya.service.message(t.dev.personId, 'Hi', undefined, [], { forAgent: { id: chief.id, name: 'Chief of staff' } }));
    t.maya.store.teammates.update(chief.id, { openToTeam: true });
    await t.tick();
    expect(runsOf()).toHaveLength(0);
  });
});
