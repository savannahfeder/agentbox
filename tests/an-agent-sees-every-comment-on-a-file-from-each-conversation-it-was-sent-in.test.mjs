// AN AGENT SEES EVERY COMMENT ON A FILE, FROM EACH CONVERSATION IT WAS SENT IN.
//
// Sofia: "a comment belongs to a copy of a file in a thread, so my
// agent read 'no comments' on a file that had one." Her agent made the picture in
// its own thread, she sent it to Dev, and Dev's note went on the copy in their
// conversation. team_read on the agent's thread read only its own ledger, so it
// listed the file with no comments. Measured with two copies over the memory
// cloud and the store tool an agent calls.
//
// What must NOT cross: a note on a different file, and the conversation's notes
// for an AI teammate its owner has not let read direct messages.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import * as disk from '../main/store/work-items.mjs';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamRead } from '../mcp/core/reach.mjs';

let t; let run;
const PNG = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
const note = (id, file, text) => ({ do: 'note', id, file, place: { kind: 'whole' }, text });
const sync = async () => { for (let i = 0; i < 2; i += 1) { await t.maya.service.syncNow(); await t.dev.service.syncNow(); } };

beforeEach(async () => {
  t = await aTeamWithAgents();
  run = t.maya.store.composeItem(t.product.id, { title: 'Onboarding picture', body: 'Make the onboarding picture.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  const dir = t.maya.store.productDir(t.product.id);
  await t.maya.on(() => disk.updateWorkItem(dir, run.id, { note: 'Here it is: [onboarding.png](designs/onboarding.png)' }, { source: 'agent' }));
  // Maya sends the picture to Dev, and Dev comments on the copy in their conversation.
  const sent = await t.maya.on(() => t.maya.service.message(t.dev.personId, 'Is this right?', undefined, [{ name: 'onboarding.png', dataBase64: PNG }, { name: 'other.png', dataBase64: PNG }]));
  await sync();
  const devSlug = t.dev.store.listProducts().find((p) => p.team?.projectId === t.maya.store.listProducts().find((q) => q.slug === sent.product).team.projectId).slug;
  await t.dev.on(() => t.dev.store.fileMark(devSlug, sent.id, note('n-dev', 'onboarding.png', 'Make the button text darker')));
  await t.dev.on(() => t.dev.store.fileMark(devSlug, sent.id, note('n-other', 'other.png', 'Not this one')));
  await sync();
  await t.tick();
});
afterEach(() => t.stop());

describe('team_read on the agent\'s own thread', () => {
  it('lists the comment made on the copy in the conversation, saying where', () => {
    const file = teamRead({}).files.find((f) => f.file === 'onboarding.png');
    const dev = file.comments.find((c) => c.text === 'Make the button text darker');
    expect(dev).toBeTruthy();
    expect(dev.by).toMatch(/Dev/);
    expect(dev.in).toMatch(/conversation with Dev/);
  });

  it('not a comment on another file', () => {
    const file = teamRead({}).files.find((f) => f.file === 'onboarding.png');
    expect(file.comments.map((c) => c.text)).not.toContain('Not this one');
  });

  it('a comment on the thread itself stays as it was, with no place named', async () => {
    const dir = t.maya.store.productDir(t.product.id);
    await t.maya.on(() => disk.updateWorkItem(dir, run.id, { artifact: note('n-own', 'onboarding.png', 'Mine') }, { source: 'system' }));
    const file = teamRead({}).files.find((f) => f.file === 'onboarding.png');
    expect(file.comments.find((c) => c.text === 'Mine').in).toBeUndefined();
  });
});

describe('an AI teammate not let read direct messages', () => {
  it('sees only the thread\'s own comments', async () => {
    const chief = t.maya.store.teammates.create({ starter: 'chief' });
    const mateRun = t.maya.store.composeItem(t.product.id, { title: 'Onboarding picture', body: 'x', labels: [`teammate:${chief.id}`] });
    const dir = t.maya.store.productDir(t.product.id);
    await t.maya.on(() => disk.updateWorkItem(dir, mateRun.id, { note: '[onboarding.png](designs/onboarding.png)' }, { source: 'agent' }));
    process.env.ZERO_ITEM = mateRun.id;
    await t.tick();
    const file = teamRead({}).files.find((f) => f.file === 'onboarding.png');
    expect(file.comments).toEqual([]);
  });
});
