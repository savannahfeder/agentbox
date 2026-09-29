// A SECOND CLAUDE ACCOUNT IS ONE PRESS, THE WAY A CODEX ONE ALREADY WAS.
//
// She asked on w-3498e0cad2, 2026-09-22: "I see clearly how to add accounts to
// Codex, but not sure how to do the same for Claude (I sometimes, not now but
// sometimes, have a work and personal account active)". There was no way,
// deliberately: on 2026-08-30 she had asked us not to encourage multi
// accounting while this was a product we sold. She withdrew that on the same
// row: "we're no longer offering this as a commercially viable product... The
// rules have changed so I think you should allow multi-accounting."
//
// So the Claude card has the Codex card's door, and the three parts of it are
// the three parts that flow was already built from: main makes the folder,
// main registers the profile, and the built-in terminal runs the sign in.
//
// MEASURED ON THIS MAC, 2026-09-22, because the whole design rests on it:
// `CLAUDE_CONFIG_DIR=<a fresh folder> claude auth status` answers
// `"loggedIn": false`. A new home folder is genuinely a new sign in and does
// not inherit the first login, which is what makes two live accounts possible
// at all. `claude auth login` is Claude Code's own command for filling it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeLoginCommand, makeClaudeHome, SHARED_DIRS } from '../main/account-tooling.mjs';
import { discoverProfiles, effectiveProfiles, forgetDiscovery } from '../main/account-discovery.mjs';
import { addClaudeAccount } from '../main/settings.mjs';

const root = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const freshHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'claude-home-'));

describe('the folder for the next login', () => {
  it('is made, rather than named and hoped for', () => {
    const home = freshHome();
    const made = makeClaudeHome({ home });
    expect(fs.existsSync(made.home)).toBe(true);
    expect(fs.statSync(made.home).isDirectory()).toBe(true);
  });

  // PRESSING ADD TWICE MUST NOT HAND THE SECOND LOGIN THE FIRST ONE'S FOLDER,
  // which would sign one account in over another and lose the first.
  it('counts rather than guesses, so a second press gets a second folder', () => {
    const home = freshHome();
    const first = makeClaudeHome({ home });
    const second = makeClaudeHome({ home });
    expect(second.home).not.toBe(first.home);
    expect(fs.existsSync(first.home)).toBe(true);
  });

  it('steps over a folder that is already there', () => {
    const home = freshHome();
    fs.mkdirSync(path.join(home, '.claude-2'));
    expect(makeClaudeHome({ home }).home).toBe(path.join(home, '.claude-3'));
  });

  // THE PROFILE IS THE PATH, which is what every entry in `authProfiles` but
  // the first one is, and what the fleet spawns CLAUDE_CONFIG_DIR on.
  it('hands back a profile the fleet can spawn on', () => {
    const made = makeClaudeHome({ home: freshHome() });
    expect(made.profile).toBe(made.home);
  });

  // THE NAME IS THE SHAPE DISCOVERY LOOKS FOR, so a folder made here is found
  // again on its own even if the config entry is deleted by hand later.
  it('is named the shape main/account-discovery.mjs already hunts for', () => {
    const home = freshHome();
    const made = makeClaudeHome({ home });
    expect(path.basename(made.home).startsWith('.claude-')).toBe(true);
    fs.writeFileSync(path.join(made.home, '.claude.json'), JSON.stringify({
      oauthAccount: { emailAddress: 'work@example.com', accountUuid: 'work-1' },
    }));
    forgetDiscovery();
    expect(discoverProfiles({ home }).map((p) => p.dir)).toContain(made.home);
  });
});

describe('the command it hands the terminal', () => {
  // NO TILDE. `CLAUDE_CONFIG_DIR=~/x` is not expanded the same way by every
  // shell inside a variable assignment, and the folder is already known in full.
  it('spells the folder out and uses Claude Code’s own login command', () => {
    expect(claudeLoginCommand('/Users/x/.claude-2')).toBe('CLAUDE_CONFIG_DIR=/Users/x/.claude-2 claude auth login');
    expect(claudeLoginCommand('/Users/x/.claude-2')).not.toContain('~');
  });
});

describe('what a press writes down', () => {
  /** A config the real `saveConfig` can write, and a supervisor that only has
   *  to notice. Both are the smallest thing `addClaudeAccount` touches. */
  const bench = () => {
    const home = freshHome();
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-conf-'));
    const changes = [];
    return { home, config: { home, appDir }, supervisor: { onChange: () => changes.push(1) }, changes };
  };

  it('registers the new login beside the first one', () => {
    const { config, supervisor, home } = bench();
    const made = addClaudeAccount({ config, supervisor });
    // 'default' is ~/.claude, which is the account every other one is a second
    // of, and it has to stay in the list or adding a second would replace the
    // first rather than join it.
    expect(config.authProfiles).toEqual(['default', made.profile]);
    expect(effectiveProfiles(config.authProfiles, { home })).toContain(made.profile);
  });

  it('keeps every profile she configured herself, in her order', () => {
    const { config, supervisor } = bench();
    config.authProfiles = ['default', '/somewhere/.claude-work'];
    const made = addClaudeAccount({ config, supervisor });
    expect(config.authProfiles).toEqual(['default', '/somewhere/.claude-work', made.profile]);
  });

  it('tells the supervisor, so the fleet uses it without a restart', () => {
    const { config, supervisor, changes } = bench();
    addClaudeAccount({ config, supervisor });
    expect(changes.length).toBe(1);
  });

  // HER SKILLS ARE THERE WHEN SHE SIGNS IN. `linkAccountTooling` otherwise runs
  // at the first spawn, and the first thing to happen in this folder is her own
  // session in the settings terminal, not a spawn.
  it('links her skills, commands and agents into the new folder', () => {
    const { config, supervisor, home } = bench();
    for (const name of SHARED_DIRS) fs.mkdirSync(path.join(home, '.claude', name), { recursive: true });
    const made = addClaudeAccount({ config, supervisor });
    for (const name of SHARED_DIRS) {
      expect(fs.lstatSync(path.join(made.home, name)).isSymbolicLink()).toBe(true);
    }
  });

  it('hands back the line the terminal has to run', () => {
    const { config, supervisor } = bench();
    const made = addClaudeAccount({ config, supervisor });
    expect(made.command).toBe(`CLAUDE_CONFIG_DIR=${made.home} claude auth login`);
  });
});

describe('the door on the screen', () => {
  const settings = read('renderer/src/components/Settings.tsx');

  it('is one Add account row drawn for whichever agent the card is', () => {
    expect(settings).not.toContain("{agent.engine === 'codex' && (");
    expect(settings).toContain('className="ac-item ac-item-add" onClick={() => onAdd(agent)}');
  });

  it('asks main for the right kind of account', () => {
    expect(settings).toContain("a.engine === 'codex' ? await api.addCodexAccount() : await api.addClaudeAccount()");
  });

  // A HEADING THAT SAID CODEX OVER A CLAUDE SIGN IN would be the screen telling
  // her something untrue about her own machine.
  it('names the agent she pressed on in the sign-in panel', () => {
    expect(settings).not.toContain("'Sign in to Codex'");
    expect(settings).toContain('Sign in to ${adding.name');
  });

  it('carries the bridge end to end, so no press lands on a missing channel', () => {
    expect(read('preload.cjs')).toContain("claudeAddAccount: () => ipcRenderer.invoke('zero:claude-add-account')");
    expect(read('main/ipc.mjs')).toContain("ipcMain.handle('zero:claude-add-account'");
    expect(read('renderer/src/api.ts')).toContain('async addClaudeAccount(');
  });

  // THE SAME GUARD THE CODEX HANDLER HAS: a shell left over from a previous add
  // is holding the previous folder, and it would sign the new account into the
  // old one.
  it('ends the previous sign-in shell', () => {
    const ipc = read('main/ipc.mjs');
    const handler = ipc.slice(
      ipc.indexOf("ipcMain.handle('zero:claude-add-account'"),
      ipc.indexOf("ipcMain.handle('zero:settings-set-project'"),
    );
    expect(handler).toContain('terminals.close(JSON.stringify(SETTINGS_TERMINAL))');
  });
});
