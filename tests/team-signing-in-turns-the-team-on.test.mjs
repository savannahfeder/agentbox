// SIGNING IN TURNS THE TEAM ON, AND SIGNING OUT TURNS IT ALL THE WAY OFF.
//
// main/team/index.mjs is the one place the app becomes a team member. These
// pin what that has to mean: after sign-in every line this Mac writes carries
// the person (and the store server the supervisor starts is told who they
// are), a team that invited their email is joined, a project shared on one Mac
// shows up on the other; after sign-out nothing is stamped and nothing syncs.
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

let cloud, maya, theo;
beforeEach(() => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = aMac(cloud, signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya' }));
  theo = aMac(cloud, signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo' }));
});
afterEach(async () => {
  await maya.service.signOut();
  await theo.service.signOut();
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

  it('starts a team, invites by email, and the invited teammate is on it at sign-in', async () => {
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    await theo.service.signIn();
    expect(theo.service.state().team.name).toBe('Northwind');
    expect(theo.service.state().people.map((p) => p.name).sort()).toEqual(['Maya', 'Theo']);
  });

  // Photographed 2026-09-30 on two real copies: Theo joined after Maya had
  // signed in, and his answer reached her window as "A" from "Someone",
  // because her copy read the team's people once and never again.
  it('learns a teammate who joins after you signed in, on the next sync', async () => {
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    await theo.service.signIn();
    await maya.service.syncNow();
    expect(maya.service.state().people.map((p) => p.name).sort()).toEqual(['Maya', 'Theo']);
  });

  it('joins a team that invited you after you signed in, without signing in again', async () => {
    await theo.service.signIn();
    expect(theo.service.state().team).toBeNull();
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    await theo.service.syncNow();
    expect(theo.service.state().team?.name).toBe('Northwind');
  });

  it('refuses an invite that is not an email address, and a team with no name', async () => {
    await maya.service.signIn();
    await expect(maya.service.createTeam('  ')).rejects.toThrow(/name/);
    await maya.service.createTeam('Northwind');
    await expect(maya.service.invite('theo')).rejects.toThrow(/not an email/);
  });
});

describe('sharing a project', () => {
  it('puts it, and its rows, on the teammate\'s Mac', async () => {
    const site = path.join(maya.accountRoot, 'website');
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@northwind.test');
    disk.createWorkItem(site, { title: 'Launch video: ship Friday\'s cut?' }, { source: 'founder' });
    await maya.service.share('website', { visibility: 'team' });

    await theo.service.signIn();
    const joined = storeAt(theo.accountRoot).listProducts();
    expect(joined.map((p) => p.name)).toEqual(['Website']);
    expect(disk.readWorkItems(joined[0].dir).map((i) => i.title)).toEqual(['Launch video: ship Friday\'s cut?']);
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
