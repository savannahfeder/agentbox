// "RESUME AGENTS" ONLY RESUMES ROWS THIS MAC RUNS.
//
// Reported 2026-10-06 (w-7fc38861be): "In this chat with Margaret, for some
// reason the agent took over when I didn't ask it to." Measured on the real
// store: at 22:17:23 on 2026-10-05 ten rows were reopened inside 50 ms, the
// mark `resumeItems` leaves, and over the next ten minutes seventeen workers
// started one per tick as slots freed, the way its queue drains. Two of the
// rows were conversations with teammates. One got a worker briefed that "the
// founder has answered: Testing a thread :)", the other a fresh one.
//
// The tick never runs a conversation, a teammate's row or a row a person
// holds: `mayRunHere` (shared/team-rules.mjs) refuses all three. Resuming by
// name never asked it, so ⌘K "Resume Agents" over a selection that happened to
// include a chat put an agent in the middle of it. Now it asks the same rule.
// It does not ban agents from talk: an @-mention in a chat starts its own
// thread in the project it names, which this does not touch.
import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const ME = 'p-me';
const TEAMMATE = 'p-teammate';

const chatProject = { slug: 'direct-bbde723e', team: { projectId: 'c1', visibility: 'people', people: [ME], sharedBy: TEAMMATE, direct: true } };
const sharedProject = { slug: 'website', team: { projectId: 's1', visibility: 'team', people: [], sharedBy: ME, direct: false } };
const privateProject = { slug: 'home', team: null };

// The real conversation, reduced: the teammate opened it, it was handed to
// them, and the newest words are yours, in a thread.
const chat = {
  id: 'w-881203686a', product: chatProject.slug, status: 'open', kind: 'directive',
  title: 'Hi, sending my findings here', body: 'Title: New project presets an empty folder',
  createdBy: TEAMMATE, assignee: TEAMMATE, people: [TEAMMATE, ME],
  answer: 'Testing a thread :)', inReplyTo: 'l-a9d616ede66a00ad',
  wrote: { answer: { ts: 1791252773333, by: ME }, body: { ts: 1, by: TEAMMATE } },
  labels: [], createdAt: 1, updatedAt: 1,
};
const row = (product, id, extra = {}) => ({
  id, product: product.slug, status: 'done', kind: 'directive', title: id, body: 'Do the thing',
  createdBy: ME, labels: ['founder'], createdAt: 1, updatedAt: 1, ...extra,
});

let before;
beforeEach(() => { before = process.env.AGENTBOX_PERSON_ID; process.env.AGENTBOX_PERSON_ID = ME; });
afterEach(() => { if (before === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = before; });

function supervisorWith(items, { slots = 5 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-resume-'));
  const sup = new Supervisor({ storeRoot: tmp, maxConcurrentSessions: 5 }, {
    listItems: () => items,
    listProducts: () => [chatProject, sharedProject, privateProject].map((p) => ({ ...p, name: p.slug, dir: tmp })),
    answerItem: (product, id, patch) => sup.reopened.push(id),
    isDue: () => true,
  }, tmp);
  sup.reopened = [];
  sup.started = [];
  let free = slots;
  sup._hasSlotFor = () => free > 0;
  sup._spawnResume = (item) => { free -= 1; sup.started.push(item.id); };
  return sup;
}

describe('Resume Agents over a selection', () => {
  it('leaves a conversation with a teammate alone: not reopened, not started, not counted', () => {
    const mine = row(privateProject, 'w-000000a1');
    const sup = supervisorWith([chat, mine]);
    const out = sup.resumeItems([chat.id, mine.id]);
    expect(sup.started).toEqual(['w-000000a1']);
    expect(sup.reopened).toEqual(['w-000000a1']);
    expect(out.resumed).toBe(1);
  });

  it('leaves a conversation alone even when it is the only row named', () => {
    const sup = supervisorWith([chat]);
    expect(sup.resumeItems([chat.id])).toMatchObject({ resumed: 0, queued: 0 });
    expect(sup.started).toEqual([]);
    expect(sup.reopened).toEqual([]);
  });

  it('does not queue one for later either, when every slot is full', () => {
    const mine = row(privateProject, 'w-000000b1');
    const sup = supervisorWith([chat, mine], { slots: 0 });
    const out = sup.resumeItems([chat.id, mine.id]);
    expect(out).toMatchObject({ resumed: 0, queued: 1 });
    expect([...sup._resumeQueue]).toEqual(['w-000000b1']);
  });

  it('leaves a teammate\'s shared task to their Mac, and a task a person holds to that person', () => {
    const theirs = row(sharedProject, 'w-000000c1', { createdBy: TEAMMATE });
    const held = row(sharedProject, 'w-000000c2', { assignee: TEAMMATE });
    const sup = supervisorWith([theirs, held]);
    sup.resumeItems([theirs.id, held.id]);
    expect(sup.started).toEqual([]);
    expect(sup.reopened).toEqual([]);
  });

  it('still resumes your own shared tasks and your private ones, done or open', () => {
    const shared = row(sharedProject, 'w-000000d1');
    const done = row(privateProject, 'w-000000d2');
    const open = row(privateProject, 'w-000000d3', { status: 'open' });
    const sup = supervisorWith([shared, done, open]);
    expect(sup.resumeItems([shared.id, done.id, open.id]).resumed).toBe(3);
    expect(sup.started).toEqual(['w-000000d1', 'w-000000d2', 'w-000000d3']);
    expect(sup.reopened).toEqual(['w-000000d1', 'w-000000d2']);
  });
});
