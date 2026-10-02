// A PROJECT'S SETTINGS: ONE SWITCH, AND A DOOR TO THE PAGE.
//
// w-d19d6d387c: the project-level settings were hard to understand, mostly
// unnecessary, and almost never discovered. Even with each control explained,
// the toggles did not say what they did, and project-level instructions were
// the part worth keeping. Of the five controls in "How it runs", most were
// rarely used and one could not be used at all.
//
// WHAT THIS FILE PINS, after the cut:
//
//   - The page carries ONE switch, and it is the one thing a project decides
//     for itself: whether a task an agent files here waits for her.
//   - Nothing on it names the drive, personal mode or a per-project pause,
//     because all three are deleted from the app.
//   - A project that carries a permission mode of its own can still see it and
//     put it back, and a project without one is shown nothing.
//   - "Will almost never be discovered" had a cause: measured on main at
//     d57c4da, `settingsPane` was only ever set to null or 'shortcuts', ⌘K
//     carries one Settings row on purpose, the projects left the sidebar on
//     09-18 (w-c2904cc8d9), and no file outside Settings drew a project at all.
//     So the sidebar gets one Projects row, not one per project.
//     (Taken out again later; see "the door to a project".)

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../main/config.mjs';
import { readSettings, setProjectSetting } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
const app = read('renderer/src/App.tsx');
const supervisorSrc = read('main/supervisor.mjs');

// The project page, sliced off its own lede so a match cannot come from the
// workspace panes above it.
const page = settings.slice(settings.indexOf('Everything here is this project only'));

describe('the one switch a project still has', () => {
  let dir;
  const store = {
    listItems: () => [],
    listProducts: () => [{ slug: 'acme', name: 'Acme', dir: '/tmp/acme' }],
    isDue: () => true,
    readInstructions: () => '',
  };
  const model = (config) => readSettings({
    config, supervisor: new Supervisor(config, store, dir), store,
  });

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-page-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('turns on and stays on', () => {
    const config = loadConfig(dir);
    expect(model(config).projects.find((p) => p.slug === 'acme').autonomous).toBe(false);
    setProjectSetting({ config, supervisor: new Supervisor(config, store, dir) }, {
      product: 'acme', key: 'autonomous', value: true,
    });
    expect(model(loadConfig(dir)).projects.find((p) => p.slug === 'acme').autonomous).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH, and the reason the other three went. Each of
  // these was a switch on this page; a write to any of them is now refused at
  // the boundary rather than half-honoured.
  it('refuses the three settings that were deleted', () => {
    const config = loadConfig(dir);
    const sup = new Supervisor(config, store, dir);
    for (const key of ['driven', 'personal', 'paused']) {
      expect(() => setProjectSetting({ config, supervisor: sup }, { product: 'acme', key, value: true }))
        .toThrow(/unknown project setting/);
    }
  });

  it('leaves nothing behind in the supervisor to read', () => {
    expect(supervisorSrc).not.toContain('isDriven(');
    expect(supervisorSrc).not.toContain('isPersonal(');
    expect(supervisorSrc).not.toContain('pauseProduct(');
    expect(supervisorSrc).not.toContain('spawnDrive(');
  });
});

describe('what the page says', () => {
  it('asks the question she could not answer, in words', () => {
    expect(page).toContain('Let agents start the tasks they file here');
    expect(page).toContain('Questions and reviews always wait for you either way.');
  });

  it('names none of the three that went', () => {
    expect(page).not.toContain('The drive watches this project');
    expect(page).not.toContain('"Personal"');
    expect(page).not.toContain('label="Paused"');
  });

  it('keeps the rules box, which is the thing she actually uses', () => {
    expect(page).toContain('Instructions for this project');
  });

  // A project with an override of its own can still be read and reset; a
  // project without one is shown nothing at all.
  it('offers the way back off a permission override, and only there', () => {
    expect(page).toContain("current.permission !== 'workspace'");
    expect(page).toContain('Use the workspace setting');
  });
});

describe('the door to a project', () => {
  // THE SIDEBAR ROW IS GONE, AND THAT IS HER CALL. w-6c5534a58d, 2026-09-26:
  // "I would advise replacing Closed with Projects because Projects isn't
  // really important. It's just there for no reason." Closed took its place.
  // The door that remains is Settings' own Projects entry.
  it('is no longer a row in the sidebar', () => {
    expect(nav).not.toContain('aria-label="Projects"');
    expect(nav).not.toContain('onProjects');
    expect(app).not.toContain('onProjects=');
  });

  it('is still a place inside Settings', () => {
    expect(settings).toContain("setPane('projects')");
  });

  // Nor may the sidebar ever grow a list of projects. Her reason for emptying
  // the settings column was 36 names in it (w-c2904cc8d9).
  it('is not a list of projects in the sidebar', () => {
    expect(nav).not.toContain('projects.map');
    expect(nav).not.toContain('<ProductMark');
    expect(nav).not.toContain("from './ProductMark'");
  });

  // With no Projects row, a project page lights Settings, which is where it lives.
  it('lights Settings while any project page is open', () => {
    expect(settings).toContain("pane === 'projects' || pane === 'team' ? pane");
    expect(settings).toContain("typeof pane === 'object' ? 'projects'");
    // A project page lights Settings, because `settingsPage` reports
    // `projects` for it and the only pane that lights another row is Team
    // (w-8415594d19, 2026-10-01), which Invite people is the shortcut to.
    expect(app).toContain("page={settingsOpen ? (settingsPage === 'team' ? 'invite' : 'settings') : null}");
  });

  it('titles the page it lands on', () => {
    expect(app).toContain("settingsPage === 'projects' ? 'Projects'");
  });

  it('still accepts projects as a starting page', () => {
    expect(settings).toContain("want === 'projects'");
  });
});
