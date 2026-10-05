// A TESTER ON A NEW ACCOUNT HAD NOWHERE TO SEND A THREAD (w-f8d123be62).
//
// They opened New thread, the project chip read "No project", they typed a
// message, and Send did nothing. Nothing on screen said why. They only got out
// of it by going to Settings → Projects and making one by hand.
//
// Two things were wrong and both are held here.
//
// MY WORKSPACE WAS MADE ONLY WHEN SOMEBODY SIGNED IN. `ensurePersonalProject`
// had exactly one caller, inside `signedIn()` in main/team/index.mjs, so a Mac
// with no team cloud at all — the single-person app — never called it and
// opened on no projects whatsoever. Approved 2026-10-05: My Workspace exists
// for everyone, so there is never a "No project" state. It is made at boot now,
// before the store reads the account root, which is why the source test below
// cares WHERE the call sits and not just that it exists.
//
// AND WHEN THERE IS STILL NO PROJECT, THE CARD SAYS SO. Making the folder can
// fail — a full disk, a permission — and that was swallowed into a log line.
// Approved wording: "Nowhere to send this yet." with "Make your first project"
// beside it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePersonalProject } from '../main/team/projects.mjs';
import { projectsOffered, startingProject } from '../renderer/src/threads/composer-rules';
import { noProjectYet, NO_PROJECT_REASON, NO_PROJECT_ACTION } from '../renderer/src/compose-says';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function freshAccount() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-noproject-'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// What main.mjs hands the window: the projects on disk, as the card reads them.
function productsOn(accountRoot) {
  return fs.readdirSync(accountRoot).sort().flatMap((slug) => {
    const file = path.join(accountRoot, slug, 'project.json');
    if (!fs.existsSync(file)) return [];
    const project = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [{ slug, name: project.name, team: project.team ?? null }];
  });
}

describe('a brand-new account has somewhere to send a thread', () => {
  it('opens the card on My Workspace, with nobody signed in and no team cloud', () => {
    const accountRoot = freshAccount();
    // This is the whole of what boot does: no session, no team service.
    ensurePersonalProject(accountRoot);

    const offered = projectsOffered(productsOn(accountRoot));
    const on = startingProject(offered, { defaultProduct: null, remembered: null });
    expect(on?.name).toBe('My Workspace');
    // And so the card has nothing to complain about.
    expect(noProjectYet(on)).toBe(null);
  });

  it('makes it once, so a second launch does not pile up workspaces', () => {
    const accountRoot = freshAccount();
    ensurePersonalProject(accountRoot);
    ensurePersonalProject(accountRoot);
    expect(productsOn(accountRoot).map((p) => p.name)).toEqual(['My Workspace']);
  });

  it('leaves a project somebody already made alone, and still offers theirs', () => {
    const accountRoot = freshAccount();
    fs.mkdirSync(path.join(accountRoot, 'kestrel'));
    fs.writeFileSync(path.join(accountRoot, 'kestrel', 'project.json'), JSON.stringify({ id: 'kestrel', name: 'Kestrel' }));
    ensurePersonalProject(accountRoot);

    const offered = projectsOffered(productsOn(accountRoot));
    expect(offered.map((p) => p.name).sort()).toEqual(['Kestrel', 'My Workspace']);
  });
});

describe('the card says why Send is off when there is still no project', () => {
  it('names what is missing and offers the way out', () => {
    expect(noProjectYet(null)).toEqual({ reason: NO_PROJECT_REASON, action: NO_PROJECT_ACTION });
    expect(NO_PROJECT_REASON).toBe('Nowhere to send this yet.');
    expect(NO_PROJECT_ACTION).toBe('Make your first project');
  });

  it('says nothing at all once there is a project, practice included', () => {
    expect(noProjectYet({ slug: 'kestrel', name: 'Kestrel' })).toBe(null);
    // The practice project has its own refusal (`practiceRefusal`), and two
    // sentences about the same Send is the noise this round exists to remove.
    expect(noProjectYet({ slug: 'practice', name: 'Practice', practice: true })).toBe(null);
  });

  it('says nothing when the thread is a message to a person, which needs no project', () => {
    expect(noProjectYet(null, { person: true })).toBe(null);
  });
});

describe('My Workspace is made at boot, not behind signing in', () => {
  const mainSrc = fs.readFileSync(path.join(root, 'main', 'main.mjs'), 'utf8');

  it('is called in main.mjs, so a Mac with no team cloud gets one too', () => {
    expect(mainSrc).toMatch(/ensurePersonalProject\(/);
  });

  // THE REGRESSION THIS GUARDS. The call used to live inside `signedIn()`, and
  // the team service is only built at all when there is a cloud config, so
  // anything downstream of `cloudConfig` is behind a sign-in again.
  it('sits before the team service is built, not inside it', () => {
    const made = mainSrc.indexOf('ensurePersonalProject(');
    const team = mainSrc.indexOf('createTeamService(');
    expect(made).toBeGreaterThan(-1);
    expect(team).toBeGreaterThan(-1);
    expect(made).toBeLessThan(team);
  });

  it('is not called from the team service any more', () => {
    const teamSrc = fs.readFileSync(path.join(root, 'main', 'team', 'index.mjs'), 'utf8');
    expect(teamSrc).not.toMatch(/ensurePersonalProject\(/);
  });
});
