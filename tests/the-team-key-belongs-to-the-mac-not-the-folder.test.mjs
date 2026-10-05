// THE TEAM KEY BELONGS TO THE MAC, NOT TO THE FOLDER THE APP RUNS FROM.
//
// Asked for on 2026-10-04 (w-2fce569057): "we want to run the team version and
// i need to see my team!"
//
// WHAT IT COST. cloud/team.config.json is what makes this the team version;
// without it the app is the single-person app, with no team, no teammates and
// no conversations, and it says nothing about why (App.tsx hands TeamPage no
// pane at all when team.configured is false). It is deliberately not in the
// repository, so every copy of the app has to be given one by hand, and the one
// that matters got missed.
//
// MEASURED on one Mac on 2026-10-04, while a message to a teammate was being
// hunted for an hour: the only Agentbox running was a copy out of a task
// folder, and it had no key. Neither did the folder the Dock launches. The only
// folder on the machine that had one was a checkout, and nothing was running
// from it. So there was never a window open that COULD show a teammate, and
// every answer about the message was beside the point.
//
// A key per folder is the wrong unit. A person has one team, their Mac holds
// the key to it once, and whichever copy they open is the team version: the
// checkout, a worktree, or the app in the Dock.
//
// WHAT STAYS SHUT. A review on 2026-10-01 found AGENTBOX_TEAM_CONFIG honoured
// in an installed build, so anything that could set an environment variable
// could point the app at another server. The per-Mac path is therefore read off
// the real home directory and never off AGENTBOX_HOME, which is an environment
// variable and would reopen exactly that door.
import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig, teamConfigOnThisMac } from '../main/team/session.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `team-key-${name}-`));
const KEY = { url: 'https://hers.test', anonKey: 'anon' };

// A Mac whose home holds the key, and a folder the app is run from.
function aMac({ inHome = null, inFolder = null } = {}) {
  const home = tmp('home');
  const appDir = tmp('app');
  if (inHome) {
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    fs.writeFileSync(path.join(home, '.agentbox', 'team.config.json'), JSON.stringify(inHome));
  }
  if (inFolder) {
    fs.mkdirSync(path.join(appDir, 'cloud'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'cloud', 'team.config.json'), JSON.stringify(inFolder));
  }
  return { home, appDir };
}

// THIS MAC'S OWN SETTINGS ARE CLEARED, NOT READ. Any session the app starts
// carries AGENTBOX_TEAM_CONFIG and AGENTBOX_HOME pointing at the real team and
// the real store, so a test that left them alone would measure her cloud
// instead of its own fixture, and would pass or fail depending on whose Mac ran
// it (tests/no-test-reads-this-macs-sign-in.test.mjs is the rule).
const was = process.env.AGENTBOX_TEAM_CONFIG;
const wasHome = process.env.AGENTBOX_HOME;
beforeEach(() => {
  delete process.env.AGENTBOX_TEAM_CONFIG;
  delete process.env.AGENTBOX_HOME;
});
afterEach(() => {
  if (was === undefined) delete process.env.AGENTBOX_TEAM_CONFIG; else process.env.AGENTBOX_TEAM_CONFIG = was;
  if (wasHome === undefined) delete process.env.AGENTBOX_HOME; else process.env.AGENTBOX_HOME = wasHome;
});

describe('a folder with no key of its own', () => {
  // THE CASE THAT WAS HIT: the folder the app is launched from has no cloud/.
  it('still runs the team version when the Mac has the key', () => {
    const { home, appDir } = aMac({ inHome: KEY });
    expect(loadCloudConfig(appDir, { packaged: false, home })?.url).toBe('https://hers.test');
  });

  it('runs the team version in the app from the Dock too, which is the whole point', () => {
    const { home, appDir } = aMac({ inHome: KEY });
    expect(loadCloudConfig(appDir, { packaged: true, home })?.url).toBe('https://hers.test');
  });

  // THE CASE EITHER SIDE: no key anywhere is still the single-person app, which
  // is what a public checkout must stay.
  it('is the single-person app when the Mac has no key either', () => {
    const { home, appDir } = aMac();
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
    expect(loadCloudConfig(appDir, { packaged: false, home })).toBeNull();
  });

  // A file that is there but says nothing usable is no key.
  it('is the single-person app when the Mac\'s key is missing its address or its anon key', () => {
    const { home, appDir } = aMac({ inHome: { url: 'https://hers.test' } });
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });
});

describe('a folder that has its own key', () => {
  // HER CHECKOUT KEEPS BEHAVING EXACTLY AS IT DOES NOW: the folder's own key is
  // the one it runs on, so a worktree set up for another team is not quietly
  // moved onto hers.
  it('runs on its own, not the Mac\'s', () => {
    const { home, appDir } = aMac({ inHome: KEY, inFolder: { url: 'https://this-folder.test', anonKey: 'k' } });
    expect(loadCloudConfig(appDir, { packaged: true, home }).url).toBe('https://this-folder.test');
    expect(loadCloudConfig(appDir, { packaged: false, home }).url).toBe('https://this-folder.test');
  });
});

// THE DOOR THAT STAYS SHUT (review 2026-10-01). An installed build ignores
// AGENTBOX_TEAM_CONFIG, and the per-Mac path is never taken from an environment
// variable, so setting one cannot point the app at another server.
describe('an installed build', () => {
  it('still ignores AGENTBOX_TEAM_CONFIG', () => {
    const { home, appDir } = aMac({ inHome: KEY });
    const other = path.join(tmp('other'), 'other.json');
    fs.writeFileSync(other, JSON.stringify({ url: 'https://theirs.test', anonKey: 'k' }));
    process.env.AGENTBOX_TEAM_CONFIG = other;
    expect(loadCloudConfig(appDir, { packaged: true, home }).url).toBe('https://hers.test');
    // From a checkout it is still honoured, which is what tests run on.
    expect(loadCloudConfig(appDir, { packaged: false, home }).url).toBe('https://theirs.test');
  });

  it('does not let AGENTBOX_HOME say where the Mac\'s key is', () => {
    const { home } = aMac({ inHome: KEY });
    const elsewhere = tmp('elsewhere');
    fs.mkdirSync(path.join(elsewhere, '.agentbox'), { recursive: true });
    fs.writeFileSync(path.join(elsewhere, '.agentbox', 'team.config.json'), JSON.stringify({ url: 'https://theirs.test', anonKey: 'k' }));
    process.env.AGENTBOX_HOME = elsewhere;
    expect(teamConfigOnThisMac(home)).toBe(path.join(home, '.agentbox', 'team.config.json'));
    expect(teamConfigOnThisMac(home)).not.toContain(elsewhere);
  });
});
