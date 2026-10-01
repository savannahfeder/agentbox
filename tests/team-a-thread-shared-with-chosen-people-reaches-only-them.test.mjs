// A THREAD SHARED WITH CHOSEN PEOPLE IS ON THEIR TEAM PAGE AND ON NOBODY ELSE'S.
//
// Until now a thread was Team or Private, so sharing anything shared it with
// everyone (w-41ff964775, her words: "sharing your calendar within a company,
// you don't necessarily want to share it with everyone, but you might want to
// share it with your boss or some people"). A third choice, chosen people,
// publishes a card that reaches exactly the people named on it.
//
// Measured here from both ends: the rule that builds the cards
// (shared/thread-cards.mjs), and three Macs over the in-memory cloud through
// the real sync engine, where Maya shares one thread with Theo, and Jun, who
// is on the same team, must not see it. The hosted database enforces the same
// thing in its own row level security, which is tested on PGlite in
// tests/team-cloud-keeps-each-team-to-itself.test.mjs.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as disk from '../main/store/work-items.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamSync, memorySyncState } from '../main/team/sync.mjs';
import { cardsFor, shownToTeam, shownToPeople } from '../shared/thread-cards.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `chosen-${name}-`));

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';

describe('the rule that decides what a card carries', () => {
  const thread = (over) => ({ id: 'w-1', title: 'Acme renewal terms', createdAt: 10, updatedAt: 10, status: 'open', ...over });
  const cards = (items, since = null) => cardsFor({
    products: [{ name: 'Website', dir: '/nowhere' }],
    readItems: () => items,
    now: 1_000,
    since,
  });

  it('says a thread shared with chosen people is shared, and names them', () => {
    const item = thread({ visibility: 'people', visibleTo: [THEO] });
    expect(shownToTeam(item)).toBe(true);
    expect(shownToPeople(item)).toEqual([THEO]);
    expect(cards([item])[0]).toMatchObject({ title: 'Acme renewal terms', people: [THEO] });
  });

  // NO LIST IS THE WHOLE TEAM. Never an empty list, which would have to mean
  // both everyone and nobody; both clouds refuse to store one.
  it('leaves a team thread open to everyone, with no list of people at all', () => {
    expect(shownToPeople(thread({ visibility: 'team' }))).toEqual([]);
    expect(cards([thread({ visibility: 'team' })])[0].people).toBe(null);
  });

  it('publishes nothing at all for a private thread, as before', () => {
    expect(cards([thread({ visibility: 'private' })])).toEqual([]);
  });

  // FAIL CLOSED. A pick of Chosen people with nobody named reaches nobody, so
  // it is not published: a card with an empty list would otherwise read as the
  // whole team's, which is the one mistake that cannot be taken back.
  it('publishes nothing when chosen people names nobody', () => {
    expect(shownToTeam(thread({ visibility: 'people', visibleTo: [] }))).toBe(false);
    expect(cards([thread({ visibility: 'people' })])).toEqual([]);
  });

  it('drops a name repeated in the list and anything that is not a person', () => {
    expect(shownToPeople(thread({ visibility: 'people', visibleTo: [THEO, THEO, '', 7, null] }))).toEqual([THEO]);
  });

  // A LINK NAMES A THREAD ONLY IF EVERYONE WHO READS THE CARD MAY SEE IT. The
  // card rows are read by whoever the card names, and a blocker shared with
  // two people would have told a third its title, which is the leak the
  // visible/invisible rule already closed for private threads.
  it('never names a chosen-people thread in another thread\'s links', () => {
    const blocker = thread({ id: 'w-quiet', title: 'Board deck numbers', visibility: 'people', visibleTo: [THEO] });
    const open = thread({ id: 'w-open', title: 'Launch video', visibility: 'team', blockedBy: ['w-quiet'] });
    const [card] = cards([open, blocker]).filter((c) => c.threadId === 'w-open');
    expect(card.blockedBy).toEqual([{ id: 'w-quiet', title: null }]);
  });

  it('still names a team thread in the links of one shared with chosen people', () => {
    const open = thread({ id: 'w-open', title: 'Launch video', visibility: 'team' });
    const quiet = thread({ id: 'w-quiet', title: 'Pay review', visibility: 'people', visibleTo: [THEO], blockedBy: ['w-open'] });
    const [card] = cards([open, quiet]).filter((c) => c.threadId === 'w-quiet');
    expect(card.blockedBy).toEqual([{ id: 'w-open', title: 'Launch video' }]);
  });
});

describe('three Macs on one team', () => {
  let cloud, team, maya, theo, jun, project;

  // One Mac: its own folder, and the real sync engine over the memory cloud.
  function mac(personId) {
    const local = [];
    const backend = memoryBackend(cloud, personId);
    const sync = createTeamSync({
      backend,
      disk,
      state: memorySyncState(),
      listShared: () => local.slice(),
      joinProject: (p) => { const entry = { projectId: p.id, dir: tmp(personId.slice(0, 4)), name: p.name }; local.push(entry); return entry; },
      listCards: () => cardsFor({
        products: local.map((p) => ({ name: p.name, dir: p.dir })),
        readItems: (p) => disk.readWorkItems(p.dir),
      }),
      teamIdOf: () => team?.id ?? null,
    });
    return { personId, backend, sync, local };
  }

  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    for (const [id, email, name] of [[MAYA, 'maya@northwind.test', 'Maya'], [THEO, 'theo@northwind.test', 'Theo'], [JUN, 'jun@northwind.test', 'Jun']]) {
      signUpMemory(cloud, { id, email, name });
    }
    maya = mac(MAYA);
    theo = mac(THEO);
    jun = mac(JUN);
    team = await maya.backend.createTeam('Northwind');
    for (const email of ['theo@northwind.test', 'jun@northwind.test']) await maya.backend.invite(team.id, email);
    await theo.backend.acceptInvite(team.id);
    await jun.backend.acceptInvite(team.id);
    project = { projectId: crypto.randomUUID(), dir: tmp('maya'), name: 'Website' };
    maya.local.push(project);
    await maya.backend.shareProject({ id: project.projectId, teamId: team.id, name: 'Website', visibility: 'team' });
  });

  const titlesOn = async (who) => (await who.backend.listCards()).map((c) => c.title).sort();

  it('puts a thread shared with one teammate on their page and on nobody else\'s', async () => {
    disk.createWorkItem(project.dir, { title: 'Pay review for Theo', visibility: 'people', visibleTo: [THEO] }, { source: 'founder' });
    disk.createWorkItem(project.dir, { title: 'Launch video', visibility: 'team' }, { source: 'founder' });
    await maya.sync.syncOnce();

    expect(await titlesOn(theo)).toEqual(['Launch video', 'Pay review for Theo']);
    expect(await titlesOn(jun)).toEqual(['Launch video']);
    // Her own card is hers to read, whoever else it names.
    expect(await titlesOn(maya)).toEqual(['Launch video', 'Pay review for Theo']);
  });

  it('reaches two chosen people and not the third', async () => {
    disk.createWorkItem(project.dir, { title: 'Hiring plan', visibility: 'people', visibleTo: [THEO, JUN] }, { source: 'founder' });
    await maya.sync.syncOnce();
    expect(await titlesOn(theo)).toEqual(['Hiring plan']);
    expect(await titlesOn(jun)).toEqual(['Hiring plan']);
  });

  it('takes the card off a page when the person comes off the list', async () => {
    const row = disk.createWorkItem(project.dir, { title: 'Pay review', visibility: 'people', visibleTo: [THEO, JUN] }, { source: 'founder' });
    await maya.sync.syncOnce();
    expect(await titlesOn(jun)).toEqual(['Pay review']);

    disk.updateWorkItem(project.dir, row.id, { visibleTo: [THEO] }, { source: 'founder' });
    await maya.sync.syncOnce();
    expect(await titlesOn(jun)).toEqual([]);
    expect(await titlesOn(theo)).toEqual(['Pay review']);
  });

  it('takes it off everybody\'s page when the thread goes private', async () => {
    const row = disk.createWorkItem(project.dir, { title: 'Board deck', visibility: 'people', visibleTo: [THEO] }, { source: 'founder' });
    await maya.sync.syncOnce();
    expect(await titlesOn(theo)).toEqual(['Board deck']);

    disk.updateWorkItem(project.dir, row.id, { visibility: 'private' }, { source: 'founder' });
    await maya.sync.syncOnce();
    expect(await titlesOn(theo)).toEqual([]);
  });
});
