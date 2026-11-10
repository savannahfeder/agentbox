// THE PHONE TURNS THE CLOUD ON AND SETS HOW CLOUD RUNS ASK, WHERE THE DESKTOP DOES.
//
// The desktop's Claude Code and Codex pages have "Use the cloud" and an "In the
// cloud" permission mode once the computer is set up for the cloud
// (renderer/src/components/Settings.tsx `cloudHere`). The phone had neither:
// checkSetting refused `cloudRuns`, `cloudPermission` and `cloudCodexMode`
// (measured 2026-11-08), and the computer's copy said nothing about the cloud.
// The screens are React Native, so their rules are tested here and the
// screens are read as source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { checkSetting, settingRoute, phoneSettingsOf } from '../shared/phone-settings.mts';
import { CODEX_MODE_ORDER } from '../shared/codex-modes.mts';
import { cloudRunsLine } from '../renderer/src/cloud-menu';
import { sameAsHere } from '../renderer/src/cloud-permission-words';

const ws = (key, value) => checkSetting({ scope: 'workspace', key, value });
const HOME = '/Users/someone';
const model = (cloud, over = {}) => ({
  ok: true,
  cloud,
  workspace: {
    permission: 'auto', codexMode: 'auto', cloudPermission: 'bypassPermissions', cloudCodexMode: 'same', memoryGate: {}, leftovers: {},
    accounts: [{ profile: 'default', email: 'me@example.com', chosen: true, state: 'live' }],
    codex: { found: true, accounts: [{ profile: `${HOME}/.codex-2`, email: 'c@example.com', signedIn: true, chosen: true }] },
    ...over,
  },
  projects: [],
});
const setUp = (accounts, more = {}) => ({ setUp: true, mode: 'full', whenOn: 'full', accounts, keys: [{ name: 'STRIPE_KEY', savedAt: 1 }], ...more });

describe('what the phone may ask', () => {
  it('takes where threads run, in the three words the computer knows', () => {
    for (const v of ['mac', 'full', 'all']) expect(ws('cloudRuns', v)).toBeNull();
    for (const v of ['on', true, null, 'cloud', undefined]) expect(ws('cloudRuns', v)).not.toBeNull();
  });

  it('takes the cloud\'s Claude Code mode, or the same as this computer', () => {
    for (const v of ['same', 'plan', 'bypassPermissions', 'default']) expect(ws('cloudPermission', v)).toBeNull();
    for (const v of ['custom', 'full-access', null, 7]) expect(ws('cloudPermission', v)).not.toBeNull();
  });

  it('takes the cloud\'s Codex mode, or the same as this computer', () => {
    for (const v of ['same', ...CODEX_MODE_ORDER]) expect(ws('cloudCodexMode', v)).toBeNull();
    for (const v of ['bypassPermissions', null, '']) expect(ws('cloudCodexMode', v)).not.toBeNull();
  });

  it('is handed to the window\'s own workspace handler unchanged', () => {
    expect(settingRoute({ scope: 'workspace', key: 'cloudRuns', value: 'all' }, model(null))).toEqual(['zero:settings-set-workspace', { key: 'cloudRuns', value: 'all' }]);
    expect(settingRoute({ scope: 'workspace', key: 'cloudCodexMode', value: 'same' }, model(null))).toEqual(['zero:settings-set-workspace', { key: 'cloudCodexMode', value: 'same' }]);
  });
});

describe('the copy the computer sends', () => {
  it('says where threads run and which agents the cloud has an account for', () => {
    const w = phoneSettingsOf(model(setUp([{ engine: 'claude', key: 'k1', name: 'me@example.com', inUse: true, state: 'ready' }])), { version: '1' }).workspace;
    expect(w.cloud).toMatchObject({ mode: 'full', whenOn: 'full', engines: ['claude'], inUse: { claude: 'me@example.com', codex: null } });
    expect(w.cloudPermission).toBe('bypassPermissions');
    expect(w.cloudCodexMode).toBe('same');
  });

  it('is no cloud at all on a computer that is not set up for it', () => {
    expect(phoneSettingsOf(model(null), { version: '1' }).workspace.cloud).toBeNull();
    expect(phoneSettingsOf(model({ setUp: false, mode: 'mac', accounts: [] }), { version: '1' }).workspace.cloud).toBeNull();
  });

  it('names no agent the cloud has no account for, so neither page draws the rows', () => {
    expect(phoneSettingsOf(model(setUp([])), { version: '1' }).workspace.cloud.engines).toEqual([]);
    const dup = setUp([{ engine: 'codex', key: 'k2', name: null, state: 'duplicate' }, { engine: 'codex', key: 'k3', name: null, state: 'ready' }]);
    expect(phoneSettingsOf(model(dup), { version: '1' }).workspace.cloud.engines).toEqual(['codex']);
  });

  // The cloud's own addresses ride since the phone lists its accounts
  // (tests/the-phone-lists-the-clouds-accounts-as-the-desktop-does).
  it('carries no cloud key', () => {
    const copy = phoneSettingsOf(model(setUp([{ engine: 'claude', key: 'k1', name: 'stranger@example.com', inUse: true }])), { version: '1' });
    expect(JSON.stringify(copy)).not.toMatch(/STRIPE_KEY|k1/);
  });
});

describe('the Claude Code and Codex pages on the phone', () => {
  const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
  it('draw Use the cloud and In the cloud only where the cloud has that agent', () => {
    expect(src).toMatch(/label="Use the cloud"/);
    expect(src).toMatch(/cloudRunsLine\(/);
    expect(src).toMatch(/cloudToggleTarget\(/);
    expect(src).toMatch(/label="In the cloud"/);
    expect(src).toMatch(/w\.cloud\?\.engines\.includes\(engine\)/);
    for (const key of ['cloudRuns', 'cloudPermission', 'cloudCodexMode']) expect(src).toContain(`'${key}'`);
  });

  it('say "your computer", where the desktop says "this computer"', () => {
    expect(cloudRunsLine('mac', null, 'your computer')).toBe('Every thread runs on your computer.');
    expect(cloudRunsLine('full', null, 'your computer')).toBe('Threads start there when your computer is full, on your cloud account.');
    expect(cloudRunsLine('full', null)).toBe('Threads start there when this computer is full, on your cloud account.');
    expect(sameAsHere('your computer')).toBe('The same as on your computer.');
    expect(src).toMatch(/const COMPUTER = 'your computer'/);
  });
});
