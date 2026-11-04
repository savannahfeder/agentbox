// AN AI TEAMMATE READS THE TEAM'S TASKS AND SETS WHAT BLOCKS ONE.
//
// Dev, "Two sources disagree on my order of work": the triage teammate ranked LUM-47 first while
// Maya's priorities said it could wait, and nothing an agent could read listed
// the team's tasks with who has them and what blocks them. Measured before
// this: team_threads gave a task only its title and state, and team_task had
// no way to say a task is blocked, so a triage teammate could not keep the
// list true.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTask, teamThreads } from '../mcp/core/reach.mjs';
import { REACH_LABEL } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';

let t;
const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const yes = async () => {
  await t.tick();
  await t.maya.on(() => t.maya.store.answerItem(askRows()[0].product, askRows()[0].id, { answer: '1. Send it, and let it write to Dev Patel from now on' }));
  await t.tick();
  await t.dev.service.syncNow();
};

beforeEach(async () => {
  t = await aTeamWithAgents();
  const chief = t.maya.store.teammates.create({ starter: 'chief' });
  const run = t.maya.store.composeItem(t.product.id, { title: 'Triage', body: 'Keep the list true.', labels: [`teammate:${chief.id}`] });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
});
afterEach(() => t.stop());

describe('team_task', () => {
  it('gives a task blocked on a person, by name', async () => {
    teamTask({ to: 'Dev', title: 'Ship LUM-47', blockedBy: ['Sofia'] });
    await yes();
    const task = t.conversationsOf(t.dev).find((i) => isTaskRow(i));
    expect(task.blockedBy).toEqual([`person:${t.sofia.personId}`]);
  });

  it('refuses a block it cannot name', () => {
    expect(() => teamTask({ to: 'Dev', title: 'Ship LUM-47', blockedBy: ['Nobody at all'] })).toThrow();
  });
});

describe('team_threads', () => {
  it('lists a task with who has it, who gave it, when it is due and what blocks it', async () => {
    await t.dev.on(() => t.dev.service.giveTask(t.sofia.personId, { title: 'Cut the launch film', body: 'Cut it.', visibility: 'team', due: '2026-11-04', blockedBy: [`person:${t.dev.personId}`] }));
    await t.sofia.service.syncNow();
    await t.maya.service.syncNow();
    await t.tick();
    const task = teamThreads().threads.find((x) => x.title === 'Cut the launch film');
    expect(task).toMatchObject({ person: 'Sofia Reyes', task: { from: 'Dev Patel', due: '2026-11-04', blockedBy: ['Dev Patel'] } });
  });
});
