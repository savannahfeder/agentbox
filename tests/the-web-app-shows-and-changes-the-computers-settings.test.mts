// THE WEB APP SHOWS AND CHANGES THE COMPUTER'S SETTINGS.
//
// What broke (the founder, 2026-10-27, on the web app: "Also not seeing
// settings pages"): Settings on the web app had only Appearance and Account.
// The phone app already draws the computer's settings from the copy it uploads
// (phone_settings) and changes them by leaving 'setting' commands for it. The
// web app now does the same: the computer's pages appear once it has sent its
// copy, a change shows at once as waiting, the computer carries it out, and a
// refusal says why. Measured on the bridge's own pieces and the page's source,
// and in Chromium at phone size on a stand-in cloud (scripts/scratch).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { webSettingsPages, webSettingsModel, webSettingChange, lastAccountAsk, NOT_YET } from '../renderer/src/web-settings';
import { changesOn, readingOf, computerOf } from '../renderer/src/phone-settings-view';
import * as mobileView from '../mobile/src/lib/settings-view';

const NOW = Date.parse('2026-10-27T10:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const workspace = { adhdMode: false, diagnostics: true, engines: ['claude'], claude: { found: true }, codex: { found: false }, accounts: [], codexAccounts: [], memoryGate: { on: false, slots: null }, leftovers: { on: false } };
const mac = { device: 'aaaaaaaaaaaa', name: 'Studio', updated_at: iso(60_000), settings: { v: 1, version: '0.1.17', workspace, projects: [{ slug: 'alpha', name: 'Alpha', onPhone: true }] } };
const command = (payload, extra = {}) => ({ id: `c-${Math.random()}`, device: mac.device, project: null, item: null, kind: 'setting', payload, created_at: iso(30_000), claimed_at: null, taken_at: null, outcome: null, ...extra });

describe('which pages the web app offers', () => {
  it('only its own, before a computer has sent its settings', () => {
    expect([...webSettingsPages(null)]).toEqual(['appearance', 'phone']);
  });
  it('the computer\'s too once it has, Codex only where the computer has Codex', () => {
    expect([...webSettingsPages(mac)]).toEqual(['general', 'appearance', 'phone', 'alpha', 'claude', 'running', 'projects']);
    const both = { ...mac, settings: { ...mac.settings, workspace: { ...workspace, engines: ['claude', 'codex'] } } };
    expect([...webSettingsPages(both)]).toContain('codex');
  });
});

describe('what Settings reads on the web app', () => {
  it('is the computer heard from last, and the setting commands, its own just sent among them', () => {
    const older = { ...mac, device: 'bbbbbbbbbbbb', updated_at: iso(3600_000) };
    const sent = command({ scope: 'workspace', key: 'adhdMode', value: true });
    const reply = { ...command({ text: 'hi' }), kind: 'reply' };
    const model = webSettingsModel([older, mac], [reply], [sent]);
    expect(model).toMatchObject({ ok: true, workspace: null, projects: [], computer: { device: mac.device } });
    expect(model.settingCommands.map((c) => c.id)).toEqual([sent.id]);
  });
  it('says so when no computer has sent its settings', () => {
    expect(webSettingsModel([], [], [])).toMatchObject({ ok: true, computer: null });
  });
});

describe('a change', () => {
  it('becomes a command for the computer the page is about', () => {
    expect(webSettingChange(mac, { scope: 'workspace', key: 'adhdMode', value: true })).toEqual({
      ok: true, row: { device: mac.device, project: null, item: null, kind: 'setting', payload: { scope: 'workspace', key: 'adhdMode', value: true } },
    });
    expect(webSettingChange(mac, { scope: 'project', product: 'alpha', key: 'autonomous', value: true }).row.payload).toEqual({ scope: 'project', product: 'alpha', key: 'autonomous', value: true });
  });
  it('is refused here when there is no computer, or the computer would refuse it', () => {
    expect(webSettingChange(null, { scope: 'workspace', key: 'adhdMode', value: true })).toEqual({ ok: false, error: NOT_YET });
    expect(webSettingChange(mac, { scope: 'workspace', key: 'homePath', value: '/' })).toMatchObject({ ok: false });
    expect(webSettingChange(mac, { scope: 'workspace', key: 'adhdMode', value: 'yes' })).toMatchObject({ ok: false });
  });
  it('reads as waiting at once, then as the computer\'s own value', () => {
    const waiting = command({ scope: 'workspace', key: 'adhdMode', value: true });
    expect(readingOf(changesOn(mac, [waiting], NOW), 'workspace', 'adhdMode', false)).toEqual({ value: true, waiting: true, refused: null });
    const refused = { ...waiting, taken_at: iso(1000), outcome: 'refused: not a value that setting takes' };
    expect(readingOf(changesOn(mac, [refused], NOW), 'workspace', 'adhdMode', false)).toEqual({ value: false, waiting: false, refused: 'not a value that setting takes' });
  });
});

// In Chromium a refused account change left no word on any row: the refused
// reading carries the copy's value, not the account that was asked for.
describe('an account change the computer refused', () => {
  const ask = (account, engine, msAgo) => command({ scope: 'workspace', key: 'activeAccount', value: { engine, account } }, { created_at: iso(msAgo), taken_at: iso(msAgo - 1000), outcome: 'refused: that account is not on this computer' });
  it('names the account last asked for, so the refusal sits on its row', () => {
    expect(lastAccountAsk([ask('a1', 'claude', 50_000), ask('a2', 'codex', 20_000)], mac.device)).toEqual({ engine: 'codex', account: 'a2' });
  });
  it('is nobody\'s when nothing was asked of this computer', () => {
    expect(lastAccountAsk([], mac.device)).toBeNull();
    expect(lastAccountAsk([{ ...ask('a1', 'claude', 5000), device: 'bbbbbbbbbbbb' }], mac.device)).toBeNull();
    expect(lastAccountAsk([command({ scope: 'workspace', key: 'adhdMode', value: true })], mac.device)).toBeNull();
  });
});

describe('one copy of the reading rules', () => {
  it('the phone app reads the same module', () => {
    expect(mobileView.changesOn).toBe(changesOn);
    expect(mobileView.computerOf).toBe(computerOf);
  });
});

describe('the pages', () => {
  const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
  const web = settings.slice(settings.indexOf('function WebComputerPane'));
  it('are drawn from the copy in the desktop\'s words', () => {
    for (const words of ['Counts and crash reports', 'ADHD mode', 'How many run at once', 'Hold heavy work when memory is short', 'Stop programs agents leave behind', 'Show while they run', 'Permission mode', 'Let agents start the tasks they file here', 'Use the workspace setting']) {
      expect(web, words).toContain(words);
    }
    expect(settings).toContain('Projects on your phone');
    expect(settings).toContain('function WebComputerPane');
    expect(settings).toMatch(/Waiting for your computer/);
    expect(settings).toMatch(/Not changed \(/);
  });
  it('read and write through the bridge, every five seconds while open', () => {
    expect(bridge).toMatch(/settingsRead: \(\) => readWebSettings\(\)/);
    expect(bridge).toMatch(/setWorkspaceSetting: \(p: \{ key: string; value: unknown \}\) => changeSetting\(\{ scope: 'workspace'/);
    expect(bridge).toMatch(/setProjectSetting: \(p: \{ product: string; key: string; value: unknown \}\) => changeSetting\(\{ scope: 'project'/);
    expect(settings).toMatch(/if \(!onCloudPhone\(\)\) return undefined;\s*const t = setInterval\(\(\) => \{ void load\(\); \}, 5000\)/);
  });
  // In Chromium a refusal still read "Waiting" 9.6 s after the change: the
  // page's five seconds and the inbox's five seconds ran out of step.
  it('read what the computer did with a change alongside its copy, not from the inbox\'s last read', () => {
    expect(bridge).toMatch(/\[settingsRows, settingCommands\] = await Promise\.all\(\[readSettingsRows\(.*\), commands\(\)\]\)/);
    expect(bridge).toContain('return webSettingsModel(settingsRows, settingCommands, sentSettings, rows.projects);');
  });
  // In Chromium: Open on a project went straight back to the list, because the
  // desktop's own project list is empty here; and the Codex page threw
  // "Cannot read properties of null (reading 'ok')" on its usage read.
  it('open a project from the copy, and stay on it', () => {
    expect(settings).toMatch(/useEffect\(\(\) => \{\s*if \(onCloudPhone\(\)\) return;\s*if \(typeof pane !== 'string' && model && !current\) setPane\('projects'\);/);
    expect(settings).toMatch(/if \(pane === 'projects' \|\| typeof pane === 'object'\) \{/);
  });
  it('the usage read answers in its own shape, not null', async () => {
    const { EMPTY_READS } = await import('../renderer/src/cloud-bridge');
    expect(await EMPTY_READS.refreshUsage()).toMatchObject({ ok: false, error: expect.stringMatching(/computer/) });
  });
});
