// A PROJECT IS SHARED OR PRIVATE, AND THE SHARED ONES KEEP ONE ID.
//
// Settled 2026-09-30 (w-e731ca9376): no workspaces. A project is a shared
// record with each person's own folder for it, or it is private and never
// leaves the Mac. These pin the local half: the `team` record in project.json,
// one cloud id per project for good, joining a teammate's project as a folder
// of its own (without clobbering a folder of the same name), and the
// title-free shape of private work on the Team page.
import { it, expect, describe, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { markShared, readTeam, joinSharedProject, listSharedProjects, teamOf } from '../main/team/projects.mjs';

let root;
const project = (slug, extra = {}) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug, ...extra }));
  return dir;
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-or-private-')); });

describe('sharing', () => {
  it('reads a project with no team record as private', () => {
    expect(readTeam(project('website'))).toBeNull();
  });

  it('mints a cloud id once and keeps it when who can see it changes', () => {
    const dir = project('website');
    const first = markShared(dir, { teamId: 't1', visibility: 'team' });
    const second = markShared(dir, { teamId: 't1', visibility: 'people', people: ['p-theo', 'p-theo'] });
    expect(second.projectId).toBe(first.projectId);
    expect(second).toMatchObject({ visibility: 'people', people: ['p-theo'] });
    // The rest of project.json is left as it was.
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).name).toBe('website');
  });

  it('ignores a team record with no id', () => {
    expect(teamOf({ team: { teamId: 't1' } })).toBeNull();
  });

  it('remembers who shared it, and keeps that through later changes', () => {
    const dir = project('website');
    markShared(dir, { teamId: 't1', sharedBy: 'p-maya' });
    expect(markShared(dir, { teamId: 't1', visibility: 'people', sharedBy: 'p-theo' }).sharedBy).toBe('p-maya');
  });

  it('is what the store says about each project', async () => {
    const { Store } = await import('../main/store.mjs');
    const accountRoot = path.join(root, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const s = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    const shared = s.productDir(s.createProduct({ name: 'Website' }).slug);
    s.createProduct({ name: 'Home' });
    markShared(shared, { teamId: 't1', sharedBy: 'p-maya' });
    const byName = Object.fromEntries(s.listProducts().map((p) => [p.name, p.team]));
    expect(byName.Home).toBeNull();
    expect(byName.Website).toMatchObject({ teamId: 't1', sharedBy: 'p-maya', visibility: 'team' });
  });

  it('lists only the shared projects for sync', () => {
    const products = [
      { slug: 'a', dir: '/a', name: 'A', team: { projectId: 'x' } },
      { slug: 'b', dir: '/b', name: 'B', team: null },
    ];
    // `direct` says whether it is a message record, whose lines the pull keeps more of.
    expect(listSharedProjects(products)).toEqual([{ projectId: 'x', dir: '/a', name: 'A', slug: 'a', direct: false }]);
  });
});

describe('joining a teammate\'s project', () => {
  const cloudProject = { id: 'cloud-1', teamId: 't1', name: 'Website', visibility: 'team', people: [] };

  it('makes it a project of its own, carrying the shared id', () => {
    const joined = joinSharedProject(root, cloudProject);
    expect(joined.slug).toBe('website');
    expect(readTeam(joined.dir)).toMatchObject({ projectId: 'cloud-1', teamId: 't1' });
  });

  it('does not take over a private project that happens to have the same name', () => {
    const mine = project('website');
    const joined = joinSharedProject(root, cloudProject);
    expect(joined.slug).toBe('website-2');
    expect(readTeam(mine)).toBeNull();
  });

  it('does not join the same project twice', () => {
    project('website');
    const first = joinSharedProject(root, cloudProject);
    const again = joinSharedProject(root, cloudProject);
    expect(again.dir).toBe(first.dir);
    expect(fs.readdirSync(root).sort()).toEqual(['website', 'website-2']);
  });
});

// Private work on the Team board is a thread card now, not a project-wide
// activity line: tests/team-a-teammate-sees-the-summary-and-nothing-more.test.mjs.
