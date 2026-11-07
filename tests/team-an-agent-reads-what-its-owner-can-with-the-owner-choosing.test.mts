// AN AGENT READS WHAT ITS OWNER CAN, WITH THE OWNER CHOOSING.
//
// Maya's report: the chief of staff's instructions "only cover Company, Launch,
// Lumen app and My Workspace, not direct messages, which is where the group
// bookings and video work are". Its brief missed most of the company. And two
// agents took the same job (group bookings) because neither could see the other
// was on it.
//
// Measured: no tool reads a teammate's thread, a brief names no thread but its
// own teammate's, and nothing says whether direct messages are readable.
//
// What must NOT be read: a thread whose card does not reach the owner, and direct
// messages until the owner has said so.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mts';
import { teamThreads, teamRead } from '../mcp/core/reach.mts';

let t; let chief; let run; let quality;
const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = t.product.id; };

beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  quality = t.maya.store.teammates.create({ starter: 'quality' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Monday brief', body: 'Get me the brief.', labels: [`teammate:${chief.id}`] });
  onRun(run.id);
});
afterEach(() => t.stop());

// A thread on Dev's copy with a card the team can see, and its work published.
async function devsThread(title, { visibility, visibleTo } = {}) {
  const dir = path.join(t.dev.store.config.accountRoot, 'dev-work');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ id: 'dev-work', name: 'Dev work' }));
  const row = await t.dev.on(() => t.dev.store.composeItem('dev-work', { title, body: `Build ${title}.`, ...(visibility ? { visibility } : {}), ...(visibleTo ? { visibleTo } : {}) }));
  await t.dev.service.syncNow();
  await t.dev.service.syncNow();
  await t.maya.service.syncNow();
  await t.maya.service.syncNow();
  await t.tick();
  return row;
}

describe('the team\'s threads', () => {
  it('lists a teammate\'s thread with who has it, so a new one notices existing work', async () => {
    const row = await devsThread('Group bookings');
    const seen = teamThreads();
    const card = seen.threads.find((c) => c.thread === row.id);
    expect(card.title).toBe('Group bookings');
    expect(card.person).toBe('Dev Patel');
  });

  it('reads that thread\'s messages by name', async () => {
    const row = await devsThread('Group bookings');
    const got = teamRead({ person: 'Dev', thread: row.id });
    expect(got.title).toBe('Group bookings');
    expect(got.messages.some((m) => m.text === 'Build Group bookings.')).toBe(true);
  });

  it('leaves out and refuses a thread shared with someone else', async () => {
    const row = await devsThread('Secret plan', { visibility: 'people', visibleTo: [t.sofia.personId] });
    expect(teamThreads().threads.some((c) => c.thread === row.id)).toBe(false);
    expect(() => teamRead({ person: 'Dev', thread: row.id })).toThrow(/cannot read/i);
  });

  it('leaves out and refuses a private thread', async () => {
    const row = await devsThread('Private', { visibility: 'private' });
    expect(teamThreads().threads.some((c) => c.thread === row.id)).toBe(false);
    expect(() => teamRead({ person: 'Dev', thread: row.id })).toThrow(/cannot read/i);
  });
});

describe('direct messages', () => {
  const dm = async () => {
    await t.maya.on(() => t.maya.service.message(t.dev.personId, 'Dev, the group bookings spec is yours.'));
    await t.tick();
  };

  it('are closed until the owner says, and the refusal says how to open them', async () => {
    await dm();
    expect(teamThreads().conversations).toBeUndefined();
    expect(teamThreads().note).toMatch(/direct messages/);
    expect(() => teamRead({ person: 'Dev' })).toThrow(/direct messages/);
  });

  it('open once the owner chooses, for that teammate only', async () => {
    await dm();
    t.maya.store.teammates.update(chief.id, { readsMessages: true });
    expect(teamThreads().conversations[0].people).toEqual(['Dev Patel']);
    const got = teamRead({ person: 'Dev' });
    expect(got.messages.at(-1).text).toBe('Dev, the group bookings spec is yours.');
    expect(got.messages.at(-1).from).toBe('Maya Chen');

    const other = t.maya.store.composeItem(t.product.id, { title: 'Round', body: 'Go.', labels: [`teammate:${quality.id}`] });
    onRun(other.id);
    expect(() => teamRead({ person: 'Dev' })).toThrow(/direct messages/);
  });

  it('a thread the person started reads them, because they asked it to', async () => {
    await dm();
    const plain = t.maya.store.composeItem(t.product.id, { title: 'Catch me up', body: 'What did Dev say?' });
    onRun(plain.id);
    expect(teamRead({ person: 'Dev' }).messages.length).toBeGreaterThan(0);
  });
});

describe('the brief', () => {
  it('names the team\'s threads, and to say so rather than start a second', async () => {
    await devsThread('Group bookings');
    const brief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, run.id));
    expect(brief).toContain('Group bookings');
    expect(brief).toContain('Dev Patel');
    expect(brief).toMatch(/already/);
  });

  it('says plainly how it reaches people, and never to ask its owner to forward', async () => {
    await t.tick();
    const brief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, run.id));
    expect(brief).toContain('team_tell');
    expect(brief).toMatch(/never ask .* to (forward|relay)/i);
  });

  it('a chief of staff being set up asks the owner about direct messages, in plain words', () => {
    const draft = t.maya.store.teammates.describe({ starter: 'chief' }).teammate;
    const setup = t.maya.store.composeItem(t.product.id, { title: 'Set up', body: 'Be the one I talk to', labels: [`teammate:${draft.id}`] });
    const brief = t.maya.store.teammates.briefFor(setup);
    expect(brief).toMatch(/direct messages/);
    expect(brief).toContain('readsMessages');
  });

  it('says which it can read once chosen', async () => {
    await t.tick();
    t.maya.store.teammates.update(chief.id, { readsMessages: true });
    const brief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, run.id));
    expect(brief).toMatch(/You can read .* direct messages/);
  });
});
