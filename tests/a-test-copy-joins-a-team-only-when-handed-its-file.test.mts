// A TEST COPY JOINS A TEAM ONLY WHEN IT IS HANDED THE TEAM'S FILE (w-3d0fa23ffb, 2026-10-21).
//
// The founder asked for a power tester who joins her real team room and talks
// to her in it. Power-test copies run as a fresh user (no person in the
// counts, a store of their own), and a fresh user had no team cloud at all,
// so no copy could ever be a second person in a room. Measured on
// loadCloudConfig: a fresh copy handed AGENTBOX_TEAM_CONFIG still came back
// null. A copy that is handed the file now loads that file and no other; one
// that is not handed it stays the single-person app, as the ⌘K new-user
// window must (w-9f6975906c), and an installed build never loads one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig } from '../main/team/session.mjs';
import { FRESH_USER_ENV } from '../shared/fresh-user-home.mjs';

const KEY = { url: 'https://team.test', anonKey: 'k' };
const MAC_KEY = { url: 'https://hers.test', anonKey: 'h' };

function world() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-file-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-file-app-'));
  fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agentbox', 'team.config.json'), JSON.stringify(MAC_KEY));
  const handed = path.join(home, 'handed.json');
  fs.writeFileSync(handed, JSON.stringify(KEY));
  return { home, appDir, handed };
}

describe('a fresh test copy', () => {
  it('handed the team file, loads that file', () => {
    const w = world();
    const env = { [FRESH_USER_ENV]: '1', AGENTBOX_TEAM_CONFIG: w.handed };
    expect(loadCloudConfig(w.appDir, { packaged: false, home: w.home, env })).toEqual(KEY);
  });
  it('handed a file that is not a team file, has no team, even with one on the Mac', () => {
    const w = world();
    fs.writeFileSync(w.handed, '{}');
    const env = { [FRESH_USER_ENV]: '1', AGENTBOX_TEAM_CONFIG: w.handed };
    expect(loadCloudConfig(w.appDir, { packaged: false, home: w.home, env })).toBeNull();
  });
  it('handed nothing, stays the single-person app', () => {
    const w = world();
    expect(loadCloudConfig(w.appDir, { packaged: false, home: w.home, env: { [FRESH_USER_ENV]: '1' } })).toBeNull();
  });
  it('as an installed build, never loads one', () => {
    const w = world();
    const env = { [FRESH_USER_ENV]: '1', AGENTBOX_TEAM_CONFIG: w.handed };
    expect(loadCloudConfig(w.appDir, { packaged: true, home: w.home, env })).toBeNull();
  });
});

describe('a checkout that is not a fresh copy', () => {
  it('still finds the Mac’s key', () => {
    const w = world();
    expect(loadCloudConfig(w.appDir, { packaged: false, home: w.home, env: {} })).toEqual(MAC_KEY);
  });
});
