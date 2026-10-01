// TWO TEAMMATES' MACS END UP WITH THE SAME SHARED PROJECT.
//
// This is the whole promise of the team version, end to end below the screen:
// Maya shares a project, Theo's Mac joins it as a project of its own (in a
// folder of its own, at a different path), and the rows' summaries and who
// has to act next reach both Macs. Since a review on 2026-10-01 that is ALL a
// teammate's line may set here (shared/team-rules.mjs whatATeammateMaySet):
// a body, answer or status from another Mac could start an agent on words
// its owner never wrote. Words travel between two people as messages.
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
import { createTeamSync, memorySyncState, MAX_SHARED_PROJECTS } from '../main/team/sync.mjs';

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
  await theo.backend.acceptInvite(team.id);
  // Maya's Website project, which already has history from before she signed in.
  shared = { projectId: crypto.randomUUID(), dir: tmp('maya'), name: 'Website' };
  disk.createWorkItem(shared.dir, { title: 'Old task from before the team', status: 'done' }, { source: 'founder' });
  maya.local.push(shared);
  await maya.backend.shareProject({ id: shared.projectId, teamId: team.id, name: 'Website', visibility: 'team' });
});

describe('a shared project', () => {
  it('appears on a teammate\'s Mac as a project of its own, and its words stay on the Mac they were written on', async () => {
    await maya.sync.syncOnce();
    const report = await theo.sync.syncOnce();
    expect(report.joined).toEqual(['Website']);
    expect(theo.local).toHaveLength(1);
    expect(theo.local[0].dir).not.toBe(shared.dir);
    expect(disk.readWorkItems(theo.local[0].dir)).toEqual([]);
  });

  it('carries a row\'s summary and who acts next both ways, and never its title, body or answer', async () => {
    const row = maya.as(() => disk.createWorkItem(shared.dir, { title: 'Launch video: ship Friday\'s cut?', assignee: theo.personId, problem: 'The cut runs long.' }, { source: 'founder' }));
    await maya.sync.syncOnce();
    await theo.sync.syncOnce();
    const theirs = theo.local[0].dir;
    const onTheo = disk.readWorkItem(theirs, row.id);
    expect([onTheo.title, onTheo.problem, onTheo.assignee, onTheo.createdBy]).toEqual(['', 'The cut runs long.', theo.personId, maya.personId]);

    theo.as(() => disk.updateWorkItem(theirs, row.id, { answer: 'Change the ending first', progress: 'Ending recut.' }, { source: 'founder' }));
    await theo.sync.syncOnce();
    await maya.sync.syncOnce();
    const onMaya = disk.readWorkItem(shared.dir, row.id);
    expect(onMaya.answer).toBeUndefined();
    expect(onMaya.progress).toBe('Ending recut.');
    expect(onMaya.wrote.progress.by).toBe(theo.personId);
    expect(onMaya.title).toBe('Launch video: ship Friday\'s cut?');
  });

  it('moves the pull past a line it cannot keep, so the next one still lands', async () => {
    await maya.sync.syncOnce();
    await theo.sync.syncOnce();
    const theirs = theo.local[0].dir;
    await maya.backend.pushLines(shared.projectId, [
      { id: 'w-big', ts: 1, source: 'founder', by: maya.personId, uid: 'l-big', patch: { progress: 'y'.repeat(300 * 1024) } },
      { id: 'w-big', ts: 2, source: 'founder', by: maya.personId, uid: 'l-nothing', patch: { body: 'dropped' } },
      { id: 'w-next', ts: 3, source: 'founder', by: maya.personId, uid: 'l-next', patch: { problem: 'Still here.' } },
    ]);
    await theo.sync.syncOnce();
    expect(disk.readWorkItem(theirs, 'w-next')?.problem).toBe('Still here.');
    expect(await theo.sync.syncOnce()).toMatchObject({ pulled: 0 });
  });

  // Review 2026-10-01: every project anyone on the team shared became a folder
  // here, with no limit, so one teammate could fill a disk with them.
  it('joins at most fifty shared projects by itself', async () => {
    for (let i = 0; i < MAX_SHARED_PROJECTS + 5; i += 1) {
      await maya.backend.shareProject({ id: crypto.randomUUID(), teamId: team.id, name: `Flood ${i}`, visibility: 'team' });
    }
    const report = await theo.sync.syncOnce();
    expect(theo.local).toHaveLength(MAX_SHARED_PROJECTS);
    expect(report.notJoined).toBe(6);
  });

  it('sends nothing twice and stores nothing twice, however often it runs', async () => {
    maya.as(() => disk.createWorkItem(shared.dir, { title: 'One row', problem: 'Its summary travels.' }, { source: 'founder' }));
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

  // A private thread publishes no card at all (decided 2026-10-01).
  it('reach a teammate, and a private thread does not arrive at all', async () => {
    maya.cards.push({ ...blank('w-open-1', 'running'), visible: true, title: 'Acme renewal terms', project: 'Website' });
    maya.cards.push(blank('w-private-1', 'running'));
    await maya.sync.syncOnce();
    const seen = await theo.backend.listCards();
    expect(seen.map((c) => [c.personId, c.threadId, c.visible, c.state])).toEqual([[maya.personId, 'w-open-1', true, 'running']]);
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
