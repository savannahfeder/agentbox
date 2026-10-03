// A PROJECT CAN BE ARCHIVED, AND BROUGHT BACK.
//
// What broke: there was no way on any screen to get rid of a project. The
// Projects page listed ten of them (three called Daydream) with nothing on a
// row or on a project's own page but rename, picture and rules, and the ask
// was "a straightforward way to delete projects or at least not have to see
// them anymore entirely" (2026-10-02). Measured by reading the code: the store
// has honoured `archived: true` in project.json since before this was written
// (`Store.listProducts` skips it, so the inbox, the sidebar, the fleet and the
// Projects page all lose it at once), and nothing in the window could set it.
//
// Archiving rather than erasing, because it is the half of the ask that cannot
// cost anyone their work: the folder, its documents and its threads stay on
// disk, and the Projects page keeps a short list of archived ones to bring back.
//
// And one thing the flag broke the moment it became reachable: the team sync
// asks "is this shared project already on this Mac?" of the VISIBLE list, so an
// archived shared project read as missing and was joined again, as a second
// folder, beside the one you had just archived.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { listSharedProjects } from '../main/team/projects.mjs';
import { readSettings } from '../main/settings.mjs';
import { loadConfig } from '../main/config.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function store(projects = { alpha: { name: 'Alpha' }, beta: { name: 'Beta' } }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-archive-'));
  const accountRoot = path.join(tmp, 'accounts', 'test-account');
  for (const [slug, extra] of Object.entries(projects)) {
    fs.mkdirSync(path.join(accountRoot, slug), { recursive: true });
    fs.writeFileSync(
      path.join(accountRoot, slug, 'project.json'),
      JSON.stringify({ schemaVersion: 2, id: slug, ...extra }),
    );
    fs.writeFileSync(path.join(accountRoot, slug, 'notes.md'), '# kept\n');
  }
  const s = new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] });
  return { store: s, accountRoot, dir: (slug) => path.join(accountRoot, slug) };
}
const slugs = (list) => list.map((p) => p.slug);

describe('archiving a project', () => {
  it('takes it off the list everything else reads, and leaves the others alone', () => {
    const { store: s } = store();
    expect(slugs(s.listProducts())).toEqual(['alpha', 'beta']);

    s.setProductArchived('beta', true);

    expect(slugs(s.listProducts())).toEqual(['alpha']);
  });

  it('keeps its folder and everything in it', () => {
    const { store: s, dir } = store();
    s.setProductArchived('beta', true);
    expect(fs.readFileSync(path.join(dir('beta'), 'notes.md'), 'utf8')).toBe('# kept\n');
    const saved = JSON.parse(fs.readFileSync(path.join(dir('beta'), 'project.json'), 'utf8'));
    expect(saved).toMatchObject({ id: 'beta', name: 'Beta', archived: true });
  });

  it('can still be found by a caller that asks for archived ones, marked as such', () => {
    const { store: s } = store();
    s.setProductArchived('beta', true);
    const all = s.listProducts({ includeArchived: true });
    expect(slugs(all)).toEqual(['alpha', 'beta']);
    expect(all.find((p) => p.slug === 'beta').archived).toBe(true);
    expect(all.find((p) => p.slug === 'alpha').archived).toBe(false);
  });

  it('comes back exactly as it was', () => {
    const { store: s } = store();
    s.setProductArchived('beta', true);
    s.setProductArchived('beta', false);
    expect(slugs(s.listProducts())).toEqual(['alpha', 'beta']);
    expect(s.listProducts().find((p) => p.slug === 'beta').name).toBe('Beta');
  });

  it('archiving twice, or bringing back one that was never archived, changes nothing', () => {
    const { store: s } = store();
    s.setProductArchived('beta', true);
    s.setProductArchived('beta', true);
    expect(slugs(s.listProducts())).toEqual(['alpha']);
    s.setProductArchived('alpha', false);
    expect(slugs(s.listProducts())).toEqual(['alpha']);
  });

  // THE CASES THAT MUST NOT MATCH. The write lands only on a project folder
  // directly inside the account root, named exactly.
  it('refuses anything that is not a project in this account', () => {
    const { store: s, accountRoot } = store();
    fs.mkdirSync(path.join(accountRoot, 'loose'));
    expect(() => s.setProductArchived('nope', true)).toThrow(/could not be found/);
    expect(() => s.setProductArchived('loose', true)).toThrow(/could not be found/);
    expect(() => s.setProductArchived('../test-account', true)).toThrow(/could not be found/);
    expect(() => s.setProductArchived('', true)).toThrow(/could not be found/);
    expect(slugs(s.listProducts())).toEqual(['alpha', 'beta']);
  });
});

describe('the settings page model', () => {
  it('lists archived projects apart from the live ones, so the page can bring one back', () => {
    const { store: s, dir } = store();
    s.setProductArchived('beta', true);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-archive-config-'));
    const config = loadConfig(home);
    const model = readSettings({ config, supervisor: new Supervisor(config, s, home), store: s });
    expect(slugs(model.projects)).toEqual(['alpha']);
    expect(model.archivedProjects).toEqual([{ slug: 'beta', name: 'Beta', dir: dir('beta') }]);
  });
});

describe('a shared project you archived is not joined a second time', () => {
  it('still counts as on this Mac for the sync', () => {
    const { store: s } = store({
      astral: { name: 'Agentbox', team: { projectId: 'cloud-1', teamId: 't', visibility: 'team', people: [] } },
    });
    s.setProductArchived('astral', true);
    expect(listSharedProjects(s.listProducts())).toEqual([]);
    expect(listSharedProjects(s.listProducts({ includeArchived: true })).map((p) => p.projectId)).toEqual(['cloud-1']);
  });

  it('the team wiring asks for archived ones too', () => {
    expect(read('main/team/index.mjs')).toMatch(/listSharedProjects\(\s*store\.listProducts\(\{\s*includeArchived:\s*true\s*\}\)/);
  });
});

describe('the window', () => {
  const settings = read('renderer/src/components/Settings.tsx');
  const page = settings.slice(settings.indexOf('Everything here is this project only'));
  const projects = read('renderer/src/components/ProjectsPage.tsx');

  it('a project page has an Archive button that writes through the bridge', () => {
    expect(page).toMatch(/Archive this project/);
    expect(page).toMatch(/api\.archiveProject\(\{\s*product:\s*current\.slug,\s*archived:\s*true\s*\}\)/);
  });

  it('the Projects page lists archived ones and brings one back', () => {
    expect(projects).toMatch(/archived/);
    expect(projects).toMatch(/Bring back/);
    expect(settings).toMatch(/api\.archiveProject\(\{\s*product:\s*slug,\s*archived:\s*false\s*\}\)/);
  });

  it('main and the bridge carry the channel', () => {
    expect(read('main/ipc.mjs')).toMatch(/'zero:project-archive'/);
    expect(read('preload.cjs')).toMatch(/projectArchive:.*'zero:project-archive'/);
    expect(read('renderer/src/api.ts')).toMatch(/async archiveProject\(/);
  });
});
