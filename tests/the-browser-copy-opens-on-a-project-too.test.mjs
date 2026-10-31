// A BRAND-NEW USER ON `npx agentbox-app` HAD NOWHERE TO SEND A THREAD.
//
// Measured on 2026-10-29 against a fresh store on this machine: start the
// browser copy, open the tab, and the composer reads "No project" with
// "Nowhere to send this yet. Make your first project" beside a dead Send. The
// project menu offers nothing but New project. It is the whole of w-f8d123be62
// again, on the other front door.
//
// `ensurePersonalProject` was put in main/main.mjs so a Mac with no team cloud
// got My Workspace too (tests/there-is-always-a-project-to-send-to). The
// browser copy does not boot through main.mjs: it boots through `bootHeadless`
// in main/serve.mjs, which never called it. So the call that exists to make
// "No project" unreachable was on one of the two doors.
//
// This boots the real headless app on a throwaway store and reads what is on
// disk, because that is what the window is handed.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootHeadless } from '../main/serve.mjs';
import { projectsOffered, startingProject } from '../renderer/src/threads/composer-rules';
import { noProjectYet } from '../renderer/src/compose-says';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const made = [];

afterEach(() => {
  while (made.length) fs.rmSync(made.pop(), { recursive: true, force: true });
});

/** The copy the command starts, on a store nobody has ever opened. */
async function freshCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-browser-boot-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
  return bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
}

/** The projects the window reads, as main/ipc.mjs reads them off disk. */
function productsOn(accountRoot) {
  return fs.readdirSync(accountRoot).sort().flatMap((slug) => {
    const file = path.join(accountRoot, slug, 'project.json');
    if (!fs.existsSync(file)) return [];
    const project = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [{ slug, name: project.name, practice: project.practice === true, team: project.team ?? null }];
  });
}

describe('the browser copy, started on a store nobody has opened', () => {
  it('has My Workspace to send to, before anybody signs in or makes anything', async () => {
    const { config } = await freshCopy();
    expect(productsOn(config.accountRoot).map((p) => p.name)).toContain('My Workspace');
  }, 30_000);

  it('opens the composer on it, so Send is live and the bar says nothing', async () => {
    const { config } = await freshCopy();
    const on = startingProject(projectsOffered(productsOn(config.accountRoot)), { defaultProduct: null, remembered: null });
    expect(on?.name).toBe('My Workspace');
    expect(noProjectYet(on)).toBe(null);
  }, 30_000);

  it('makes it once, so a second start does not pile up workspaces', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-browser-boot-'));
    made.push(dir);
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
    const first = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    expect(productsOn(first.config.accountRoot).filter((p) => p.name === 'My Workspace')).toHaveLength(1);
  }, 45_000);
});

describe('both front doors make it, and neither waits for the store', () => {
  // THE REGRESSION THIS GUARDS, and why it is read as source. A second door
  // added later is a second place to forget, and the forgetting has no symptom
  // on the door somebody tested. The order matters for the same reason it does
  // in main.mjs: the store reads the account root as it opens, so a project
  // made after that is a project the first snapshot does not carry.
  const serveSrc = fs.readFileSync(path.join(repoRoot, 'main', 'serve.mjs'), 'utf8');

  it('is called in bootHeadless, which is how npx starts the app', () => {
    expect(serveSrc).toMatch(/ensurePersonalProject\(/);
  });

  it('sits before the store is opened', () => {
    const makes = serveSrc.indexOf('ensurePersonalProject(');
    const opens = serveSrc.indexOf('new Store(config).init()');
    expect(makes).toBeGreaterThan(-1);
    expect(opens).toBeGreaterThan(-1);
    expect(makes).toBeLessThan(opens);
  });
});
