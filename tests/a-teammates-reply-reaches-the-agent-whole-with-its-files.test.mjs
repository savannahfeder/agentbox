// A TEAMMATE'S REPLY REACHES THE AGENT WHOLE, WITH ITS FILES.
//
// Sofia's answer to Dev's agent arrived as "... The full list and the
// picture are attached. [seat-pic" and stopped; a second one stopped at "Maya
// talks to". The agent went looking and said the list and picture never came.
// Measured: repliesToAgents read the words off the fold's talk record, which
// keeps 280 characters of each message for a row's one line, and a file link
// past that point was cut with the rest. Now the words come from the ledger
// line itself, and each attached file is named with where it is on this Mac.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell } from '../mcp/core/reach.mjs';
import { REACH_LABEL } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';
import { filesForTheAgent } from '../main/teammate-reach.mjs';

let t; let run;
const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const LONG = `Sofia picked the seat picker lines for a slot with 6 open. Only one line changes: "Only 6 seats left in this session." The rest stay as they are, because they read the same at 20 and at 6, and the group label is already short enough for a phone. ${'The full list and the picture are attached, and the reasons for each pick are in the list. '.repeat(2)}Last line: Maya talks to the clinics about it on Monday.`;

beforeEach(async () => {
  t = await aTeamWithAgents();
  const chief = t.maya.store.teammates.create({ starter: 'chief' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Seat picker copy', body: 'Ask Dev about the lines.', labels: [`teammate:${chief.id}`] });
  process.env.ZERO_ITEM = run.id; process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  teamTell({ text: 'Dev, which lines for 6 open?', to: ['Dev'] });
  await t.tick();
  await t.maya.on(() => t.maya.store.answerItem(askRows()[0].product, askRows()[0].id, { answer: '1. Send it, and let it write to Dev Patel from now on' }));
  await t.tick();
  t.told.length = 0;
});
afterEach(() => t.stop());

describe('a long reply with a picture', () => {
  beforeEach(async () => {
    await t.dev.service.syncNow();
    await t.dev.on(() => t.dev.service.message(t.maya.personId, LONG, undefined, [{ name: 'seat-picker-6-open.png', dataBase64: Buffer.from('png').toString('base64') }]));
    await t.dev.service.syncNow();
    await t.maya.service.syncNow();
    await t.tick();
  });
  it('reaches the agent to its last word', () => {
    expect(LONG.length).toBeGreaterThan(280);
    expect(t.told).toHaveLength(1);
    expect(t.told[0].text).toContain('Maya talks to the clinics about it on Monday.');
  });
  it('names the picture with a path the agent can open on this Mac', () => {
    const named = /seat-picker-6-open\.png \(on this Mac at (\/[^)]+)\)/.exec(t.told[0].text);
    expect(named).not.toBeNull();
    expect(fs.existsSync(named[1])).toBe(true);
  });
});

it('a short reply still goes as it was written', async () => {
  await t.dev.service.syncNow();
  const convo = t.conversationsOf(t.dev).filter((i) => !isTaskRow(i))[0];
  await t.dev.on(() => t.dev.store.answerItem(convo.product, convo.id, { answer: 'Yes, since this morning.' }));
  await t.dev.service.syncNow();
  await t.maya.service.syncNow();
  await t.tick();
  expect(t.told[0].text).toContain('> Yes, since this morning.');
});

describe('filesForTheAgent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-for-agent-'));
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', 'abc123def456-list.md'), 'x');
  it('a file here is named with its path', () => {
    const out = filesForTheAgent('See [list.md](attachments/abc123def456-list.md)', dir, { at: 0, now: 0 });
    expect(out.text).toBe(`See list.md (on this Mac at ${path.join(dir, 'attachments', 'abc123def456-list.md')})`);
    expect(out.waiting).toBe(false);
  });
  it('a file not here yet holds the reply a while, then goes saying so', () => {
    const link = 'And ![pic](attachments/0123456789ab-pic.png)';
    expect(filesForTheAgent(link, dir, { at: 0, now: 60_000 }).waiting).toBe(true);
    const late = filesForTheAgent(link, dir, { at: 0, now: 60 * 60_000 });
    expect(late.waiting).toBe(false);
    expect(late.text).toContain('pic (has not reached this Mac)');
  });
  it('words with no links are left alone', () => {
    expect(filesForTheAgent('attachments are in Files', dir, { at: 0, now: 0 })).toEqual({ text: 'attachments are in Files', waiting: false });
  });
});
