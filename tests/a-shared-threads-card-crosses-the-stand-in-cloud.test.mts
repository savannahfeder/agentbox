// A helper asked about a teammate's thread was told it was not shared with her: over the stand-in
// cloud the set of changed cards went as `{}`, every card upload threw "changed.has is not a function", and no card ever reached the cloud.
import { describe, it, expect, afterEach } from 'vitest';
import { startStandinCloud } from '../cloud/standin/server.mjs';
import { standinSession } from '../main/team/standin-backend.mts';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => { while (stops.length) await stops.pop()!(); });
const person = (url: string, name: string) => standinSession({ cloudConfig: { url }, testLogin: `${name}@lumen.test:x` }).restore();

const card = (threadId: string, title: string) => ({
  threadId, visible: true, title, project: 'Payments API', people: null, state: 'waiting', priority: null,
  problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: Date.now(),
});

async function team() {
  const c = await startStandinCloud();
  stops.push(c.stop);
  const theo = await person(c.url, 'theo');
  const lena = await person(c.url, 'lena');
  const made = await theo.createTeam('Brightline');
  await theo.invite(made.id, 'lena@lumen.test');
  await lena.acceptInvite(made.id);
  return { theo, lena, teamId: made.id };
}

describe('a shared thread\'s card over the stand-in cloud', () => {
  it('reaches a teammate when only the cards that changed are sent', async () => {
    const { theo, lena, teamId } = await team();
    await theo.putCards(teamId, [card('w-ask', 'Payments api routes missing input validation')], new Set(['w-ask']));
    expect((await lena.listCards()).map((c: { threadId: string; title: string }) => [c.threadId, c.title]))
      .toEqual([['w-ask', 'Payments api routes missing input validation']]);
  });

  it('writes only the changed ones and keeps the rest as they were', async () => {
    const { theo, lena, teamId } = await team();
    await theo.putCards(teamId, [card('w-a', 'First'), card('w-b', 'Second')]);
    await theo.putCards(teamId, [card('w-a', 'First, renamed'), card('w-b', 'Second, renamed')], new Set(['w-b']));
    const titles = (await lena.listCards()).map((c: { threadId: string; title: string }) => [c.threadId, c.title]).sort();
    expect(titles).toEqual([['w-a', 'First'], ['w-b', 'Second, renamed']]);
  });

  it('sends every card when no set of changed ones is given', async () => {
    const { theo, lena, teamId } = await team();
    await theo.putCards(teamId, [card('w-a', 'First'), card('w-b', 'Second')]);
    expect((await lena.listCards()).length).toBe(2);
  });
});
