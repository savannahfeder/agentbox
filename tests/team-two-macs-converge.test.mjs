// TWO TEAMMATES' MACS END UP WITH THE SAME SHARED PROJECT.
//
// This is the whole promise of the team version, end to end below the screen:
// Maya shares a project, Theo's Mac joins it as a project of its own (in a
// folder of its own, at a different path), Maya's row reaches Theo, Theo's
// answer reaches Maya, and both Macs fold the same row. A private project
// never leaves its Mac; only a title-free line per open task does.
//
// Two "Macs" here are two folders and two sync engines over one in-memory
// cloud (main/team/memory-cloud.mjs, kept honest against the real database by
// tests/team-cloud-backends-agree.test.mjs).
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as disk from '../main/store/work-items.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamSync, memorySyncState } from '../main/team/sync.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `two-macs-${name}-`));

// One Mac: its own folders, its own record of which projects are shared.
function mac(cloud, personId) {
  const local = []; // { projectId, dir, name }
  const cards = []; // the thread cards this Mac would publish
  const backend = memoryBackend(cloud, personId);
  const sync = createTeamSync({
    backend,
    disk,
    state: memorySyncState(),
    listShared: () => local.slice(),
    joinProject: (project) => {
      const entry = { projectId: project.id, dir: tmp(personId.slice(0, 4)), name: project.name };
      local.push(entry);
      return entry;
    },
    listCards: () => cards.slice(),
    teamIdOf: () => team?.id ?? null,
  });
  // Writing on this Mac: the store stamps the signed-in person.
  const as = (fn) => { disk.setLineAuthor(personId); try { return fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, backend, sync, local, cards, as };
}

let cloud, maya, theo, team, shared;

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = mac(cloud, signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' }));
  theo = mac(cloud, signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo' }));
  team = await maya.backend.createTeam('Northwind');
  await maya.backend.invite(team.id, 'theo@northwind.test');
  await theo.backend.acceptInvites();
  // Maya's Website project, which already has history from before she signed in.
  shared = { projectId: crypto.randomUUID(), dir: tmp('maya'), name: 'Website' };
  disk.createWorkItem(shared.dir, { title: 'Old task from before the team', status: 'done' }, { source: 'founder' });
  maya.local.push(shared);
  await maya.backend.shareProject({ id: shared.projectId, teamId: team.id, name: 'Website', visibility: 'team' });
});

describe('a shared project', () => {
  it('appears on a teammate\'s Mac as a project of its own, history and all', async () => {
    await maya.sync.syncOnce();
    const report = await theo.sync.syncOnce();
    expect(report.joined).toEqual(['Website']);
    expect(theo.local).toHaveLength(1);
    expect(theo.local[0].dir).not.toBe(shared.dir);
    expect(disk.readWorkItems(theo.local[0].dir).map((i) => i.title)).toEqual(['Old task from before the team']);
  });

  it('carries a row one way and the answer back, and both Macs fold the same row', async () => {
    const row = maya.as(() => disk.createWorkItem(shared.dir, { title: 'Launch video: ship Friday\'s cut?', assignee: theo.personId }, { source: 'founder' }));
    await maya.sync.syncOnce();
    await theo.sync.syncOnce();
    const theirs = theo.local[0].dir;
    const onTheo = disk.readWorkItem(theirs, row.id);
    expect(onTheo.title).toBe('Launch video: ship Friday\'s cut?');
    expect(onTheo.createdBy).toBe(maya.personId);
    expect(onTheo.assignee).toBe(theo.personId);

    theo.as(() => disk.updateWorkItem(theirs, row.id, { answer: 'Change the ending first' }, { source: 'founder' }));
    await theo.sync.syncOnce();
    await maya.sync.syncOnce();
    const onMaya = disk.readWorkItem(shared.dir, row.id);
    expect(onMaya.answer).toBe('Change the ending first');
    expect(onMaya.wrote.answer.by).toBe(theo.personId);

    const same = (i) => ({ title: i.title, answer: i.answer, assignee: i.assignee, status: i.status, createdBy: i.createdBy });
    expect(same(disk.readWorkItem(theirs, row.id))).toEqual(same(disk.readWorkItem(shared.dir, row.id)));
  });

  it('sends nothing twice and stores nothing twice, however often it runs', async () => {
    maya.as(() => disk.createWorkItem(shared.dir, { title: 'One row' }, { source: 'founder' }));
    await maya.sync.syncOnce();
    await theo.sync.syncOnce();
    const sizeAfterFirst = cloud.lines.length;
    const theirFile = disk._internals.ledgerPath(theo.local[0].dir);
    const theirBytes = fs.statSync(theirFile).size;
    for (let i = 0; i < 3; i += 1) { await maya.sync.syncOnce(); await theo.sync.syncOnce(); }
    expect(cloud.lines.length).toBe(sizeAfterFirst);
    expect(fs.statSync(theirFile).size).toBe(theirBytes);
  });

  it('never sends a teammate\'s own lines back as the person who pulled them', async () => {
    maya.as(() => disk.createWorkItem(shared.dir, { title: 'From Maya' }, { source: 'founder' }));
    await maya.sync.syncOnce();
    await theo.sync.syncOnce();
    await theo.sync.syncOnce();
    expect(cloud.lines.every((l) => l.byPerson === maya.personId)).toBe(true);
  });
});

describe('the cards a Mac publishes', () => {
  const blank = (threadId, state) => ({ threadId, visible: false, title: null, project: null, state, priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000 });

  it('reach a teammate, and a private thread arrives without a word of it', async () => {
    maya.cards.push(blank('w-private-1', 'running'));
    await maya.sync.syncOnce();
    const seen = await theo.backend.listCards();
    expect(seen.map((c) => [c.personId, c.threadId, c.visible, c.state])).toEqual([[maya.personId, 'w-private-1', false, 'running']]);
    expect(seen[0].title).toBeNull();
  });

  it('are not republished when nothing changed', async () => {
    maya.cards.push(blank('w-1', 'waiting'));
    let writes = 0;
    const put = maya.backend.putCards;
    maya.backend.putCards = async (t, c) => { writes += 1; return put(t, c); };
    await maya.sync.syncOnce();
    await maya.sync.syncOnce();
    expect(writes).toBe(1);
    maya.cards[0].state = 'running';
    await maya.sync.syncOnce();
    expect(writes).toBe(2);
  });
});
