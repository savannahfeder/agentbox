// YOUR COMPUTER'S SETTINGS REACH YOUR PHONE, WITHOUT ITS PATHS.
//
// The phone app's Settings showed two rows, sign out and alerts, against the
// desktop's fourteen pages ("Settings also only shows two things rather than
// the full coherent settings", 2026-10-21). Nothing of the Mac's settings
// reached the account the phone reads: shared/phone-snapshot.mjs carries
// threads only. Now the Mac sends a copy of what the phone's pages draw, and
// the phone asks for a change as a command the Mac's own handlers carry out.
//
// The Mac's settings model (main/settings.mjs readSettings) holds home paths:
// the store, every project's folder and repository, and each extra login's
// folder as its `profile`. It also holds the full text of every project's
// instructions. None of that goes to the cloud, so a login travels as the last
// part of its folder's name and the Mac turns that back into the folder.
import { describe, it, expect } from 'vitest';
import { phoneSettingsOf, checkSetting, settingRoute, accountIdOf, SETTINGS_VERSION } from '../shared/phone-settings.mjs';

const HOME = '/Users/someone';
const model = () => ({
  ok: true,
  archivedProjects: [{ slug: 'old', name: 'Old', dir: `${HOME}/docs/old` }],
  workspace: {
    phoneAll: true, agentsRunning: true, sessionsAtOnce: 4, agentsAuto: true, agentsTotal: 5, agentsNudge: 0, agentsAutoTotal: 5,
    slotsSuggested: 5, slotsMax: 12, machineNote: null,
    memoryGate: { on: true, slots: null, slotsAuto: 3, slotsMax: 8, now: 'Memory is fine. Nothing heavy running.', reading: { heavy: 0 } },
    leftovers: { on: false, now: null }, strayFolders: { note: `13 copies in ${HOME}/dev` },
    capacity: 5, running: 2, model: null,
    engine: 'claude', engineChoices: [{ id: 'claude' }, { id: 'codex' }],
    codex: { found: true, bin: `${HOME}/.local/bin/codex`, accounts: [
      { profile: 'default', email: 'a@example.com', name: 'A', plan: 'plus', planNamed: true, accountId: 'acct-1', signedIn: true, chosen: false },
      { profile: `${HOME}/.codex-2`, email: 'b@example.com', name: 'B', plan: 'pro', planNamed: true, accountId: 'acct-2', signedIn: true, chosen: true },
    ] },
    codexModels: [], codexModelDefault: null, codexModel: null, codexMode: 'auto',
    permission: 'auto', permissionArgs: ['--permission-mode', 'auto'], cloudPermission: 'bypassPermissions', cloudCodexMode: 'full-access',
    diagnostics: true, diagnosticsDestination: true, adhdMode: true, alpha: { rooms: true }, cornerTag: true, outsideAgents: 'waiting',
    accounts: [
      { profile: 'default', email: 'me@example.com', accountUuid: 'u-1', chosen: false, label: 'default', dir: null, live: true, state: 'live', trouble: null, running: 1, plan: { label: 'Max 20x', max: true } },
      { profile: `${HOME}/.claude-2`, email: 'work@example.com', accountUuid: 'u-2', chosen: true, label: '.claude-2', dir: `${HOME}/.claude-2`, live: false, state: 'limited', trouble: { cause: 'limited', note: 'Out of usage until 6:19pm.' }, running: 0, plan: null },
    ],
    accountsNote: null, storePath: `${HOME}/Zero/accounts/x`, homePath: HOME,
    claudeBin: `${HOME}/.local/bin/claude`, claudeFound: true, claudeCertain: true, claudeChosen: false,
    claudeModels: [], standingLines: 40, messageRulesLines: 12, projectsWithInstructions: 1, projectCount: 2,
  },
  projects: [
    { slug: 'agentbox', name: 'Agentbox', dir: `${HOME}/docs/agentbox`, repoPath: `${HOME}/dev/agentbox`, logo: null, autonomous: true, onPhone: true, permission: 'workspace', permissionArgs: null, codexMode: 'workspace', account: `${HOME}/.claude-2`, instructions: 'Never ship on a Friday.', running: 2 },
    { slug: 'site', name: 'Website', dir: `${HOME}/docs/site`, repoPath: null, logo: null, autonomous: false, onPhone: false, permission: 'plan', permissionArgs: ['--permission-mode', 'plan'], codexMode: 'read-only', account: 'any', instructions: '', running: 0 },
  ],
});

describe('what the phone is sent', () => {
  const sent = phoneSettingsOf(model(), { version: '1.2.3' });

  it('carries what the phone\'s pages draw', () => {
    expect(sent.v).toBe(SETTINGS_VERSION);
    expect(sent.version).toBe('1.2.3');
    expect(sent.workspace).toMatchObject({ cornerTag: true, diagnostics: true, adhdMode: true, alpha: { rooms: true }, outsideAgents: 'waiting', permission: 'auto', codexMode: 'auto', agentsAuto: true, sessionsAtOnce: 4, agentsTotal: 5, slotsMax: 12, running: 2 });
    expect(sent.workspace.memoryGate).toEqual({ on: true, slots: null, slotsAuto: 3, slotsMax: 8, now: 'Memory is fine. Nothing heavy running.' });
    expect(sent.workspace.engines).toEqual(['claude', 'codex']);
    expect(sent.workspace.claude).toEqual({ found: true });
    expect(sent.workspace.accounts.map((a) => [a.id, a.email, a.chosen, a.state])).toEqual([['default', 'me@example.com', false, 'live'], ['.claude-2', 'work@example.com', true, 'limited']]);
    expect(sent.workspace.accounts[1].note).toBe('Out of usage until 6:19pm.');
    expect(sent.workspace.codexAccounts.map((a) => [a.id, a.email, a.chosen])).toEqual([['default', 'a@example.com', false], ['.codex-2', 'b@example.com', true]]);
    expect(sent.projects).toEqual([
      { slug: 'agentbox', name: 'Agentbox', onPhone: true, autonomous: true, permission: 'workspace', codexMode: 'workspace', account: '.claude-2', running: 2 },
      { slug: 'site', name: 'Website', onPhone: false, autonomous: false, permission: 'plan', codexMode: 'read-only', account: 'any', running: 0 },
    ]);
  });

  it('leaves out every path and every instruction', () => {
    const text = JSON.stringify(sent);
    expect(text).not.toContain(HOME);
    expect(text).not.toContain('Never ship on a Friday.');
    expect(text).not.toContain('acct-');
    expect(text).not.toContain('u-1');
  });

  it('sends nothing for a model the Mac could not read', () => {
    expect(phoneSettingsOf({ ok: false, error: 'no' }, { version: '1' })).toBeNull();
    expect(phoneSettingsOf(null, { version: '1' })).toBeNull();
  });
});

describe('a change the phone may ask for', () => {
  const ok = (p) => expect(checkSetting(p)).toBeNull();
  const refused = (p) => expect(checkSetting(p)).toEqual(expect.any(String));

  it('takes the switches and pickers its pages draw', () => {
    ok({ scope: 'workspace', key: 'adhdMode', value: false });
    ok({ scope: 'workspace', key: 'sessionsAtOnce', value: 3 });
    ok({ scope: 'workspace', key: 'memoryGateSlots', value: null });
    ok({ scope: 'workspace', key: 'outsideAgents', value: 'off' });
    ok({ scope: 'workspace', key: 'permission', value: 'plan' });
    ok({ scope: 'workspace', key: 'codexMode', value: 'full-access' });
    ok({ scope: 'workspace', key: 'agentsFeltSlow', value: 'reset' });
    ok({ scope: 'workspace', key: 'phoneProjects', value: { all: true, except: ['site'] } });
    ok({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '.claude-2' } });
    ok({ scope: 'workspace', key: 'activeAccount', value: { engine: 'codex', account: null } });
    ok({ scope: 'project', product: 'site', key: 'autonomous', value: true });
    ok({ scope: 'project', product: 'site', key: 'permission', value: 'workspace' });
    ok({ scope: 'project', product: 'site', key: 'account', value: 'any' });
  });

  it('refuses a key it has no page for, however the window would take it', () => {
    refused({ scope: 'workspace', key: 'claudeBin', value: '/tmp/evil' });
    refused({ scope: 'workspace', key: 'model', value: 'opus' });
    refused({ scope: 'workspace', key: 'cloudRuns', value: 'all' });
    refused({ scope: 'project', product: 'site', key: 'agents', value: ['x'] });
    refused({ scope: 'team', key: 'adhdMode', value: true });
    refused(null);
  });

  it('refuses a value in the wrong shape', () => {
    refused({ scope: 'workspace', key: 'adhdMode', value: 'yes' });
    refused({ scope: 'workspace', key: 'sessionsAtOnce', value: 0 });
    refused({ scope: 'workspace', key: 'sessionsAtOnce', value: 2.5 });
    refused({ scope: 'workspace', key: 'permission', value: 'everything' });
    refused({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '../../etc' } });
    refused({ scope: 'workspace', key: 'phoneProjects', value: { all: 'yes', except: [] } });
    refused({ scope: 'project', key: 'autonomous', value: true });
    refused({ scope: 'project', product: '../x', key: 'autonomous', value: true });
  });
});

describe('the Mac carrying out the change', () => {
  it('goes through the window\'s own handler', () => {
    expect(settingRoute({ scope: 'workspace', key: 'adhdMode', value: false }, model())).toEqual(['zero:settings-set-workspace', { key: 'adhdMode', value: false }]);
    expect(settingRoute({ scope: 'project', product: 'site', key: 'autonomous', value: true }, model())).toEqual(['zero:settings-set-project', { product: 'site', key: 'autonomous', value: true }]);
  });

  it('turns a login\'s name back into the folder the Mac knows it by', () => {
    expect(settingRoute({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '.claude-2' } }, model()))
      .toEqual(['zero:settings-set-workspace', { key: 'activeAccount', value: { engine: 'claude', profile: `${HOME}/.claude-2` } }]);
    expect(settingRoute({ scope: 'workspace', key: 'activeAccount', value: { engine: 'codex', account: 'default' } }, model()))
      .toEqual(['zero:settings-set-workspace', { key: 'activeAccount', value: { engine: 'codex', profile: 'default' } }]);
    expect(settingRoute({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: null } }, model()))
      .toEqual(['zero:settings-set-workspace', { key: 'activeAccount', value: { engine: 'claude', profile: null } }]);
    expect(settingRoute({ scope: 'project', product: 'site', key: 'account', value: '.claude-2' }, model()))
      .toEqual(['zero:settings-set-project', { product: 'site', key: 'account', value: `${HOME}/.claude-2` }]);
    expect(settingRoute({ scope: 'project', product: 'site', key: 'account', value: 'any' }, model()))
      .toEqual(['zero:settings-set-project', { product: 'site', key: 'account', value: 'any' }]);
  });

  it('refuses a login this computer does not have', () => {
    expect(() => settingRoute({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '.claude-9' } }, model())).toThrow(/not on this computer/);
  });

  it('names a login by the end of its folder', () => {
    expect(accountIdOf('default')).toBe('default');
    expect(accountIdOf(`${HOME}/.claude-2`)).toBe('.claude-2');
    expect(accountIdOf('C:\\Users\\x\\.codex-3')).toBe('.codex-3');
  });
});
