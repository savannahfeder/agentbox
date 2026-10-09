// YOUR PERSONAL PROJECT KEEPS ITS THREADS TO YOU UNLESS YOU SAY OTHERWISE.
//
// w-b989839656. On a team, every new thread is shown to the team by default
// (a short summary on the Team page), so doing your own personal things in the
// app meant remembering, every time, to flip it to Private. The ask: "every
// user gets a special project in which everything added to it is automatically
// their own/private unless they specify otherwise", because it is anxiety
// inducing to maybe expose something personal to the team by accident.
//
// Measured before the change: a thread written into any local project with no
// visibility of its own published a card to the team (cardsFor returned it),
// and nothing made a personal project at all.
//
// So: signing in makes one project called Personal, flagged `personal: true`.
// In it, a thread with no choice of its own is Only you, wherever it came from
// (the composer, an agent, a repeat), and the project itself cannot be shared.
// Choosing Team or chosen people on one thread still shares that thread.
import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardsFor, shownToTeam, visibilityOf } from '../shared/thread-cards.mjs';
import { ensurePersonalProject, markShared, PERSONAL_FLAG } from '../main/team/projects.mjs';
import { rowSharing, teamEntries } from '../renderer/src/threads/page-rules.ts';
import { whoSees } from '../renderer/src/threads/summary-rules.ts';
import { startingVisibility } from '../renderer/src/threads/composer-rules.ts';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';

const SINCE = 1_000_000;
const AFTER = SINCE + 10;
const personal = { slug: 'personal', name: 'Personal', personal: true, team: null };
const work = { slug: 'nw', name: 'Northwind', team: null };
const row = (id, extra = {}) => ({ id, product: 'personal', title: `Thread ${id}`, status: 'open', createdAt: AFTER, updatedAt: AFTER, createdBy: 'me', ...extra });

describe('who sees a thread in your personal project', () => {
  it('a thread with no choice of its own is yours alone', () => {
    expect(visibilityOf(row('a'), personal)).toBe('private');
    expect(shownToTeam(row('a'), SINCE, personal)).toBe(false);
  });
  it('a thread you chose to show the team is shown', () => {
    expect(shownToTeam(row('b', { visibility: 'team' }), SINCE, personal)).toBe(true);
  });
  it('a thread you shared with chosen people reaches them', () => {
    expect(shownToTeam(row('c', { visibility: 'people', visibleTo: ['theo'] }), SINCE, personal)).toBe(true);
  });
  it('a thread marked private stays private', () => {
    expect(shownToTeam(row('d', { visibility: 'private' }), SINCE, personal)).toBe(false);
  });
  it('holds with nobody signed in yet, too', () => {
    expect(shownToTeam(row('e'), null, personal)).toBe(false);
  });
  it('leaves every other project to the old rule: a new thread is the team’s', () => {
    expect(visibilityOf(row('f', { product: 'nw' }), work)).toBeUndefined();
    expect(shownToTeam(row('f', { product: 'nw' }), SINCE, work)).toBe(true);
    expect(shownToTeam(row('f', { product: 'nw' }), SINCE)).toBe(true);
  });
});

it('publishes no card for a personal thread unless it was shared on purpose', () => {
  const items = {
    personal: [row('mine'), row('agent-filed', { labels: ['proposal'], createdBy: 'me' }), row('told-team', { visibility: 'team' })],
    nw: [row('work', { product: 'nw' })],
  };
  const cards = cardsFor({ products: [personal, work], readItems: (p) => items[p.slug], now: AFTER + 100, since: SINCE });
  expect(cards.map((c) => c.threadId).sort()).toEqual(['told-team', 'work']);
});

it('never names a personal thread in another card’s links', () => {
  const items = { personal: [row('secret')], nw: [row('work', { product: 'nw', blockedBy: ['secret'] })] };
  const cards = cardsFor({ products: [personal, work], readItems: (p) => items[p.slug], now: AFTER + 100, since: SINCE });
  expect(cards.find((c) => c.threadId === 'work').blockedBy).toEqual([{ id: 'secret', title: null }]);
});

describe('what the window says about it', () => {
  const team = { me: 'me', since: SINCE };
  it('the inbox row wears the lock', () => expect(rowSharing(row('a'), personal, team)).toBe('private'));
  it('a shared one wears no lock', () => expect(rowSharing(row('a', { visibility: 'team' }), personal, team)).toBe('team'));
  it('the summary panel says Only you', () => expect(whoSees(row('a'), SINCE, personal)).toBe('private'));
  it('and the same thread elsewhere says Team', () => expect(whoSees(row('a', { product: 'nw' }), SINCE, work)).toBe('team'));
  it('your own Team board keeps it, with its lock, like any private thread', () => {
    const ids = teamEntries({ items: [row('a')], products: [personal], cards: [], me: 'me', now: AFTER + 100, since: SINCE }).map((e) => e.item?.id);
    expect(ids).toEqual(['a']);
  });
});

describe('the composer', () => {
  it('starts on Private in your personal project', () => expect(startingVisibility(personal)).toBe('private'));
  it('starts on Team everywhere else', () => {
    expect(startingVisibility(work)).toBe('team');
    expect(startingVisibility(null)).toBe('team');
  });
});

describe('the personal project itself', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const read = (slug) => JSON.parse(fs.readFileSync(path.join(root, slug, 'project.json'), 'utf8'));

  // CALLED MY WORKSPACE, in title case (the founder's pick, 2026-10-04, over
  // Personal, Personal Workspace, Personal Space and a name-based one).
  it('is made once, called My Workspace, and says so about itself', () => {
    const made = ensurePersonalProject(root);
    expect(made).toEqual({ slug: 'my-workspace', made: true });
    expect(read('my-workspace')).toMatchObject({ name: 'My Workspace', [PERSONAL_FLAG]: true });
    expect(ensurePersonalProject(root)).toEqual({ slug: 'my-workspace', made: false });
    expect(fs.readdirSync(root)).toEqual(['my-workspace']);
  });

  it('never takes over a project of yours that happens to be called my workspace', () => {
    fs.mkdirSync(path.join(root, 'my-workspace'));
    fs.writeFileSync(path.join(root, 'my-workspace', 'project.json'), JSON.stringify({ name: 'my workspace', id: 'my-workspace' }));
    expect(ensurePersonalProject(root)).toEqual({ slug: 'my-workspace-2', made: true });
    expect(read('my-workspace')).toMatchObject({ name: 'my workspace' });
    expect(read('my-workspace')).not.toHaveProperty(PERSONAL_FLAG);
    expect(read('my-workspace-2')[PERSONAL_FLAG]).toBe(true);
  });

  it('is not made again once you archived it', () => {
    ensurePersonalProject(root);
    const file = path.join(root, 'my-workspace', 'project.json');
    fs.writeFileSync(file, JSON.stringify({ ...read('my-workspace'), archived: true }));
    expect(ensurePersonalProject(root)).toEqual({ slug: 'my-workspace', made: false });
    expect(fs.readdirSync(root)).toEqual(['my-workspace']);
  });

  // IT SHIPPED AS "Personal" FIRST (9e2a626), so Macs that signed in since
  // hold one by that name. It takes the new name where it still carries the
  // old one, in the same folder, and a name the person chose is left alone.
  const madeAsPersonal = (name) => {
    fs.mkdirSync(path.join(root, 'personal'));
    fs.writeFileSync(path.join(root, 'personal', 'project.json'), JSON.stringify({ id: 'personal', name, [PERSONAL_FLAG]: true }));
  };
  it('renames one made as Personal to My Workspace, in place', () => {
    madeAsPersonal('Personal');
    expect(ensurePersonalProject(root)).toEqual({ slug: 'personal', made: false });
    expect(read('personal')).toMatchObject({ name: 'My Workspace', [PERSONAL_FLAG]: true });
    expect(fs.readdirSync(root)).toEqual(['personal']);
  });
  it('leaves a name you gave it yourself', () => {
    madeAsPersonal('Home Stuff');
    ensurePersonalProject(root);
    expect(read('personal').name).toBe('Home Stuff');
  });
  it('leaves a project called Personal that is not the flagged one', () => {
    fs.mkdirSync(path.join(root, 'personal'));
    fs.writeFileSync(path.join(root, 'personal', 'project.json'), JSON.stringify({ id: 'personal', name: 'Personal' }));
    ensurePersonalProject(root);
    expect(read('personal').name).toBe('Personal');
  });

  it('cannot be shared with the team as a project', () => {
    ensurePersonalProject(root);
    expect(() => markShared(path.join(root, 'my-workspace'), { teamId: 't1', sharedBy: 'me' })).toThrow(/My Workspace stays on this computer/);
    expect(read('my-workspace')).not.toHaveProperty('team');
  });

  it('leaves an ordinary project shareable', () => {
    fs.mkdirSync(path.join(root, 'nw'));
    fs.writeFileSync(path.join(root, 'nw', 'project.json'), JSON.stringify({ name: 'Northwind', id: 'nw' }));
    expect(markShared(path.join(root, 'nw'), { teamId: 't1', sharedBy: 'me' }).projectId).toBeTruthy();
  });
});

describe('in the app', () => {
  let tmp, accountRoot, store;
  const shellPersonId = process.env.AGENTBOX_PERSON_ID;
  beforeEach(async () => {
    delete process.env.AGENTBOX_PERSON_ID;
    disk._internals.forgetFolds();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-app-'));
    accountRoot = path.join(tmp, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'nw'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'nw', 'project.json'), JSON.stringify({ name: 'Northwind', id: 'nw' }));
    store = await new Store({ storeRoot: tmp, accountId: 'a', accountRoot, products: [] }).init();
  });
  afterEach(() => {
    store.unwatch?.();
    fs.rmSync(tmp, { recursive: true, force: true });
    if (shellPersonId === undefined) delete process.env.AGENTBOX_PERSON_ID;
    else process.env.AGENTBOX_PERSON_ID = shellPersonId;
  });

  // MY WORKSPACE MOVED OUT OF SIGNING IN (w-f8d123be62, approved 2026-10-05).
  // These two said the opposite, and they were right about the old app: it was
  // made in `signedIn()` and nowhere else, which is exactly why a Mac with no
  // team cloud opened on no projects at all and Send did nothing. Boot makes it
  // now (main/main.mjs), so what the team service owes this project is only
  // that it leaves it alone.
  it('the store says which project is My Workspace, and signing in does not make a second', async () => {
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' });
    const service = createTeamService({
      session: memorySession(() => memoryBackend(cloud, me)), store, disk, accountRoot,
      stateFile: path.join(tmp, '.team-sync.json'), intervalMs: 60_000,
    });
    ensurePersonalProject(accountRoot); // what boot does, before anybody signs in
    store.watch?.();
    await service.signIn();
    const listed = store.listProducts().map((p) => ({ slug: p.slug, name: p.name, personal: p.personal }));
    expect(listed).toEqual([{ slug: 'my-workspace', name: 'My Workspace', personal: true }, { slug: 'nw', name: 'Northwind', personal: false }]);
    await service.signOut();
  });

  it('is there with nobody signed in, which is the whole point of moving it', () => {
    expect(store.listProducts().some((p) => p.personal)).toBe(false);
    ensurePersonalProject(accountRoot);
    store.watch?.();
    expect(store.listProducts().filter((p) => p.personal).map((p) => p.name)).toEqual(['My Workspace']);
  });

  it('a thread you chose to show the team in Personal is written as Team, and one left alone carries no word', () => {
    ensurePersonalProject(accountRoot);
    const shared = store.composeItem('my-workspace', { title: 'Book the offsite', visibility: 'team' });
    const quiet = store.composeItem('my-workspace', { title: 'Dentist on Friday' });
    const read = (id) => disk.readWorkItem(path.join(accountRoot, 'my-workspace'), id);
    expect(read(shared.id).visibility).toBe('team');
    expect(read(quiet.id).visibility).toBeUndefined();
    const products = store.listProducts();
    const cards = cardsFor({ products, readItems: (p) => disk.readWorkItems(p.dir), since: null });
    expect(cards.map((c) => c.title)).toEqual(['Book the offsite']);
  });
});
