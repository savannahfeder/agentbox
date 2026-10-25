// A MESSAGE TO A TEAMMATE CARRIES THE LEVEL YOU PICKED (w-7ba439c883).
//
// The team announcement said teammate messages land in the recipient's inbox
// sorted by priority. A tester messaging a teammate found only a text box and
// Send: no level to pick, and nothing to mark one urgent with. Every message
// was therefore composed at priority 0, which the inbox reads as Medium.
//
// Measured before this change, in the built app with two projects in the order:
// a message drew fourth of six rows at Medium and could never draw higher,
// because nothing on the card could say so.
//
// What this file pins, end to end over two Macs and a cloud:
//   - the level the sender picks arrives on the other Mac with the message;
//   - a message sent without picking one is Medium there, as every new thread is;
//   - a teammate's later line cannot re-rank a row, in a conversation or
//     anywhere else: the level rides the line that OPENS a message and no other;
//   - the Mac that receives one does not ask a model to guess a level over the
//     one the sender chose, but still guesses when nobody chose.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { whatATeammateMaySet } from '../shared/team-rules.mjs';
import { itemPriority, DEFAULT_PRIORITY } from '../shared/rank.mjs';
import { LEVELS, wantsPriority } from '../main/message-priority.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-level-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  // Both people share one process here and the author is process-wide, so it is
  // set around each person's own writes, awaited.
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on };
}

let cloud, maya, theo;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  await maya.service.syncNow();
});
afterEach(async () => { for (const m of [maya, theo]) await m.service.signOut(); });

/** The one row Theo now has in the conversation Maya started. */
const theirMessage = () => {
  const product = theo.store.listProducts().find((p) => p.team?.direct);
  return product ? theo.store.listItems().find((i) => i.product === product.slug) : null;
};

describe('the level crosses with the message', () => {
  it('arrives on the other Mac as the level the sender picked', async () => {
    await maya.on(() => maya.service.message(theo.personId, 'The checkout page is down for everyone.', LEVELS.urgent));
    await theo.service.syncNow();
    const got = theirMessage();
    expect(got.title).toBe('The checkout page is down for everyone.');
    expect(got.priority).toBe(LEVELS.urgent);
    // And the inbox's own reading of it, which is what decides where it sorts.
    expect(itemPriority(got)).toBe(LEVELS.urgent);
  });

  // THE BOUNDARY EITHER SIDE. Low is the bottom of the scale and must cross as
  // itself rather than falling back to the middle.
  it('carries the bottom of the scale as well as the top', async () => {
    await maya.on(() => maya.service.message(theo.personId, 'Thanks for yesterday.', LEVELS.low));
    await theo.service.syncNow();
    expect(itemPriority(theirMessage())).toBe(LEVELS.low);
  });

  it('is Medium when the sender picked nothing, like every new thread', async () => {
    await maya.on(() => maya.service.message(theo.personId, 'Can you look at the pricing page?'));
    await theo.service.syncNow();
    const got = theirMessage();
    expect(got.priority).toBe(0);
    expect(itemPriority(got)).toBe(DEFAULT_PRIORITY);
  });

  // A level is the opening message's, not the conversation's: the second
  // message is a reply on a row that already has a place in the other inbox.
  it('leaves the conversation where it is when a second message follows', async () => {
    await maya.on(() => maya.service.message(theo.personId, 'The checkout page is down.', LEVELS.urgent));
    await maya.on(() => maya.service.message(theo.personId, 'Still down.', LEVELS.low));
    await theo.service.syncNow();
    expect(theirMessage().priority).toBe(LEVELS.urgent);
  });
});

describe('a teammate cannot re-rank a row of yours', () => {
  const line = (patch) => ({ id: 'w-1', ts: 2000, source: 'founder', by: 'p-maya', patch });

  // The line that opens a message is the one that makes the row: it carries the
  // kind, which nothing else ever sets. That is the only line a level rides.
  it('keeps the level on the line that opens a message', () => {
    const kept = whatATeammateMaySet(line({ title: 'Site is down', kind: 'directive', priority: 9 }), { direct: true });
    expect(kept.patch).toMatchObject({ title: 'Site is down', priority: 9 });
  });

  it('drops a level sent on any later line of a conversation', () => {
    const kept = whatATeammateMaySet(line({ answer: 'still down', priority: 9 }), { direct: true });
    expect(kept.patch).toEqual({ answer: 'still down' });
  });

  // THE CASE THAT MUST NOT MATCH. Outside a conversation nothing a teammate
  // writes may touch a level, opening line or not: those are your own threads.
  it('drops a level on a shared project that is not a conversation', () => {
    expect(whatATeammateMaySet(line({ problem: 'x', kind: 'directive', priority: 9 }), { direct: false }).patch)
      .toEqual({ problem: 'x' });
    expect(whatATeammateMaySet(line({ kind: 'directive', priority: 9 }), { direct: false })).toBe(null);
  });
});

describe('the Mac that receives one does not guess over the sender', () => {
  const product = { slug: 'direct-1', team: { direct: true, people: ['p-me', 'p-maya'] } };
  const message = (priority, by = 'p-maya') => ({
    id: 'w-1', status: 'open', assignee: 'p-me', priority,
    body: 'The checkout page is down.',
    wrote: { body: { ts: 1001, source: 'founder', by }, priority: { ts: 1000, source: 'system', by } },
  });

  it('leaves a message that arrived carrying its sender\'s level alone', () => {
    expect(wantsPriority(message(LEVELS.urgent), product, 'p-me')).toBe(false);
  });

  // THE CASE THAT MUST STILL MATCH: nobody picked a level, so the model is
  // still what sorts the message (main/message-priority.mjs).
  it('still sorts a message that arrived with no level at all', () => {
    expect(wantsPriority(message(0), product, 'p-me')).toBe(true);
  });
});

describe('the card says so', () => {
  const src = read('renderer/src/threads/ThreadComposer.tsx');
  // The person branch of the bottom bar: everything between "{person && sendAs === 'message' ? (" and
  // the agent's branch that follows it. It held a line and Send and no more.
  const from = src.indexOf("{person && sendAs === 'message' ? (");
  const messageBar = src.slice(from, src.indexOf('\n        ) : (', from));

  it('draws the one priority control on a message to a person', () => {
    expect(messageBar).toMatch(/\{priorityChip\}/);
    // And it is the card's own chip, not a second copy of the four words.
    expect(src.match(/const priorityChip = \(/g)).toHaveLength(1);
  });

  it('no longer says where the message goes, now that the corner is filled', () => {
    expect(messageBar).not.toMatch(/landsIn/);
    expect(messageBar).not.toMatch(/tc-only/);
  });

  it('sends the level the sender picked', () => {
    const send = src.slice(src.indexOf('const sendMessage'), src.indexOf('const send ='));
    expect(send).toMatch(/api\.teamMessage\(/);
    expect(send).toMatch(/priorityValueOf\(prio\)/);
  });
});
