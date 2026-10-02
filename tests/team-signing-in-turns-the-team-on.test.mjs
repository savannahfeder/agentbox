// SIGNING IN TURNS THE TEAM ON, AND SIGNING OUT TURNS IT ALL THE WAY OFF.
//
// main/team/index.mjs is the one place the app becomes a team member. These
// pin what that has to mean: after sign-in every line this Mac writes carries
// the person (and the store server the supervisor starts is told who they
// are), a team that invited their email is offered and joined on their yes, a
// project shared on one Mac shows up on the other; after sign-out nothing is
// stamped and nothing syncs.
//
// Since a review on 2026-10-01 an invite is never taken up on its own and a
// Mac never leaves the team it is in: the app used to join every team that
// invited you at each start and then pick the oldest, so a team with a
// backdated created_at and one invite moved your work into it.
import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { teamOf } from '../main/team/projects.mjs';

// The slice of the store the service reads: the products in an account folder.
function storeAt(accountRoot) {
  return {
    listProducts() {
      return fs.readdirSync(accountRoot).flatMap((slug) => {
        const dir = path.join(accountRoot, slug);
        try {
          const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
          return [{ slug, dir, name: project.name, team: teamOf(project) }];
        } catch { return []; }
      });
    },
  };
}

function aMac(cloud, personId) {
  const accountRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-mac-'));
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store: storeAt(accountRoot),
    disk,
    accountRoot,
    stateFile: path.join(accountRoot, '.team-sync.json'),
    intervalMs: 60_000,
  });
  return { accountRoot, service, personId };
}

// A session the team app started carries its person's AGENTBOX_PERSON_ID, and
// "before anyone signs in" would then see lines stamped "by" that no Mac here
// wrote (red on every run from inside the team app, 2026-10-01). The tests start
// from nobody and put back whatever the shell had.
const shellPersonId = process.env.AGENTBOX_PERSON_ID;
let cloud, maya, theo;
beforeEach(() => {
  delete process.env.AGENTBOX_PERSON_ID;
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = aMac(cloud, signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' }));
  theo = aMac(cloud, signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo' }));
});
afterEach(async () => {
  await maya.service.signOut();
  await theo.service.signOut();
  if (shellPersonId === undefined) delete process.env.AGENTBOX_PERSON_ID;
  else process.env.AGENTBOX_PERSON_ID = shellPersonId;
});

describe('before anyone signs in', () => {
  it('is configured but signed out, and writes plain lines', async () => {
    await maya.service.start();
    expect(maya.service.state()).toMatchObject({ configured: true, signedIn: false, me: null });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
    disk.createWorkItem(dir, { title: 'x' });
    expect(fs.readFileSync(disk._internals.ledgerPath(dir), 'utf8')).not.toContain('"by"');
  });
});

describe('signing in', () => {
  it('names the person, stamps their lines, and tells the store server who they are', async () => {
    await maya.service.signIn();
    expect(maya.service.state().me.name).toBe('Maya');
    expect(process.env.AGENTBOX_PERSON_ID).toBe(maya.personId);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamped-'));
    const item = disk.createWorkItem(dir, { title: 'x' });
    expect(disk.readWorkItem(dir, item.id).createdBy).toBe(maya.personId);
  });

  it('starts a team, invites by email, and the invited teammate is asked at sign-in and on it after a yes', async () => {
    await maya.service.signIn();
    const northwind = (await maya.service.createTeam('Northwind')).team;
    await maya.service.invite('theo@northwind.test');
    await theo.service.signIn();
    expect(theo.service.state().team).toBeNull();
    expect(theo.service.state().invites).toEqual([{ teamId: northwind.id, teamName: 'Northwind', invitedBy: maya.personId, invitedByName: 'Maya' }]);
    await theo.service.acceptInvite(northwind.id);
    expect(theo.service.state().team.name).toBe('Northwind');
    expect(theo.service.state().invites).toEqual([]);
    expect(theo.service.state().people.map((p) => p.name).sort()).toEqual(['Maya', 'Theo']);
  });

  // Found 2026-09-30 with two copies of the app: a teammate who joined after
  // the first person had signed in had their answer drawn as "A" from
  // "Someone", because the first copy read the team's people once and never
  // again.
  it('learns a teammate who joins after you signed in, on the next sync', async () => {
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(maya.service.state().team.id);
    await maya.service.syncNow();
    expect(maya.service.state().people.map((p) => p.name).sort()).toEqual(['Maya', 'Theo']);
  });

  it('offers a team that invited you after you signed in, without signing in again, and joins nothing on its own', async () => {
    await theo.service.signIn();
    expect(theo.service.state().team).toBeNull();
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    await theo.service.syncNow();
    expect(theo.service.state().team).toBeNull();
    expect(theo.service.state().invites.map((i) => i.teamName)).toEqual(['Northwind']);
    await theo.service.acceptInvite(theo.service.state().invites[0].teamId);
    expect(theo.service.state().team?.name).toBe('Northwind');
  });

  it('never moves a Mac out of its team, for an invite or for an older team, across a restart', async () => {
    await maya.service.signIn();
    const northwind = (await maya.service.createTeam('Northwind')).team;
    await maya.service.invite('theo@northwind.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(northwind.id);
    // A stranger's team, made "before" Northwind, invites Theo, and Theo ends
    // up on it as well (as an older build that joined every invite would).
    const jun = memoryBackend(cloud, signUpMemory(cloud, { email: 'jun@elsewhere.test', name: 'Jun' }));
    const backdated = await jun.createTeam('Backdated');
    cloud.teams.get(backdated.id).made = -1;
    await jun.invite(backdated.id, 'theo@northwind.test');
    await theo.service.syncNow();
    expect(theo.service.state().team.id).toBe(northwind.id);
    await expect(theo.service.acceptInvite(backdated.id)).rejects.toThrow(/already in Northwind/);
    cloud.members.push({ teamId: backdated.id, personId: theo.personId, role: 'member' });
    await theo.service.signOut();
    const again = createTeamService({
      session: memorySession(() => memoryBackend(cloud, theo.personId)), store: storeAt(theo.accountRoot), disk,
      accountRoot: theo.accountRoot, stateFile: path.join(theo.accountRoot, '.team-sync.json'), intervalMs: 60_000,
    });
    await again.signIn();
    expect(again.state().team.id).toBe(northwind.id);
    await again.signOut();
  });

  it('refuses an invite that is not an email address, and a team with no name', async () => {
    await maya.service.signIn();
    await expect(maya.service.createTeam('  ')).rejects.toThrow(/name/);
    await maya.service.createTeam('Northwind');
    await expect(maya.service.invite('theo')).rejects.toThrow(/not an email/);
  });
});

describe('sharing a project', () => {
  it('puts it on the teammate\'s Mac', async () => {
    const site = path.join(maya.accountRoot, 'website');
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    disk.createWorkItem(site, { title: 'Launch video: ship Friday\'s cut?' }, { source: 'founder' });
    await maya.service.share('website', { visibility: 'team' });

    await theo.service.signIn();
    await theo.service.acceptInvite(maya.service.state().team.id);
    const joined = storeAt(theo.accountRoot).listProducts();
    expect(joined.map((p) => p.name)).toEqual(['Website']);
    // A row's words stay on the Mac they were written on (review 2026-10-01,
    // shared/team-rules.mjs whatATeammateMaySet); its summary is what travels.
    expect(disk.readWorkItems(joined[0].dir)).toEqual([]);
  });
});

describe('signing out', () => {
  it('stops stamping and forgets the person', async () => {
    await maya.service.signIn();
    await maya.service.signOut();
    expect(maya.service.state()).toMatchObject({ signedIn: false, me: null, team: null });
    expect(process.env.AGENTBOX_PERSON_ID).toBeUndefined();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'after-'));
    disk.createWorkItem(dir, { title: 'x' });
    expect(fs.readFileSync(disk._internals.ledgerPath(dir), 'utf8')).not.toContain('"by"');
  });
});
