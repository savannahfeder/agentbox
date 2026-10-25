// A SETTING CHANGED ON THE PHONE REACHES THE MAC, AND THE MAC'S SETTINGS REACH THE PHONE.
//
// The phone app's Settings had two rows (2026-10-21): nothing of the Mac's
// settings was in the account the phone reads, and the Mac took only thread
// commands (main/phone-inbox.mjs ROUTES, ten kinds, each naming a project).
// Now each pass sends the Mac's settings as one row for this computer
// (shared/phone-settings.mjs, no paths), and a `setting` command goes through
// the window's own handler, as every other phone command does. Measured here
// with the in-memory cloud and a stand-in for the window's channels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { checkCommand } from '../shared/phone-snapshot.mjs';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const HOME = '/Users/someone';

const model = (over = {}) => ({
  ok: true,
  workspace: {
    adhdMode: true, cornerTag: true, diagnostics: true, alpha: { rooms: false }, outsideAgents: 'all', permission: 'auto',
    agentsAuto: true, sessionsAtOnce: 3, agentsTotal: 3, slotsMax: 12, running: 0, memoryGate: { on: false }, leftovers: { on: false },
    storePath: `${HOME}/Zero/accounts/x`, homePath: HOME, claudeFound: true,
    accounts: [
      { profile: 'default', label: 'default', email: 'me@example.com', chosen: true, state: 'live' },
      { profile: `${HOME}/.claude-2`, label: '.claude-2', dir: `${HOME}/.claude-2`, email: 'work@example.com', chosen: false, state: 'live' },
    ],
    codex: { found: true, accounts: [{ profile: 'default', email: 'c@example.com', signedIn: true, chosen: true }] },
    ...over,
  },
  projects: [{ slug: 'alpha', name: 'Alpha', dir: `${HOME}/docs/alpha`, repoPath: `${HOME}/dev/alpha`, autonomous: false, onPhone: true, permission: 'workspace', codexMode: 'workspace', account: 'any', instructions: 'secret words', running: 0 }],
});

function setup() {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const state = { model: model(), reads: 0, puts: 0, logs: [] };
  const calls = [];
  const channels = new Map([
    ['zero:settings-read', async () => { state.reads += 1; return state.model; }],
    ['zero:settings-set-workspace', async (_e, args) => { calls.push(['workspace', args]); state.model = model({ [args.key]: args.value }); return { ok: true }; }],
    ['zero:settings-set-project', async (_e, args) => { calls.push(['project', args]); return { ok: true }; }],
  ]);
  const put = mac.putPhoneSettings;
  mac.putPhoneSettings = async (row) => { state.puts += 1; if (state.failPut) throw new Error(state.failPut); return put(row); };
  const inbox = createPhoneInbox({
    backend: mac,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [],
    historyOf: () => [],
    apply: applyThrough(channels),
    readSettings: () => channels.get('zero:settings-read')({ sender: null }),
    version: '1.2.3',
    name: 'Studio Mac',
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-settings-')), 'phone-inbox.json'),
    home: HOME,
    now: () => clock,
    log: (line) => state.logs.push(line),
  });
  const send = (payload, extra = {}) => phone.addPhoneCommand({ device: inbox.device, project: null, item: null, kind: 'setting', payload, ...extra });
  const outcome = async (id) => (await phone.phoneCommands()).find((c) => c.id === id)?.outcome ?? null;
  const tick = (ms) => { clock += ms; };
  return { cloud, mac, phone, inbox, send, outcome, calls, state, tick };
}

describe('a change asked for on the phone', () => {
  it('goes through the window\'s own handler', async () => {
    const t = setup();
    const a = await t.send({ scope: 'workspace', key: 'adhdMode', value: false });
    const b = await t.send({ scope: 'project', product: 'alpha', key: 'autonomous', value: true });
    await t.inbox.syncOnce();
    expect(t.calls).toEqual([
      ['workspace', { key: 'adhdMode', value: false }],
      ['project', { product: 'alpha', key: 'autonomous', value: true }],
    ]);
    expect([await t.outcome(a.id), await t.outcome(b.id)]).toEqual(['done', 'done']);
  });

  it('names a login the way the phone saw it, and the Mac uses its folder', async () => {
    const t = setup();
    await t.send({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '.claude-2' } });
    await t.inbox.syncOnce();
    expect(t.calls).toEqual([['workspace', { key: 'activeAccount', value: { engine: 'claude', profile: `${HOME}/.claude-2` } }]]);
  });

  it('is refused, and says why, for a key the phone has no page for or a login the Mac does not have', async () => {
    const t = setup();
    const a = await t.send({ scope: 'workspace', key: 'claudeBin', value: '/tmp/x' });
    const b = await t.send({ scope: 'workspace', key: 'activeAccount', value: { engine: 'claude', account: '.claude-9' } });
    await t.inbox.syncOnce();
    expect(t.calls).toEqual([]);
    expect(await t.outcome(a.id)).toBe('refused: not a setting your phone can change');
    expect(await t.outcome(b.id)).toBe('refused: that account is not on this computer');
  });

  it('names no project or thread, which the cloud and the Mac both hold to', async () => {
    const t = setup();
    await expect(t.send({ scope: 'workspace', key: 'adhdMode', value: false }, { project: 'alpha' })).rejects.toThrow();
    const opts = { projects: ['alpha'], hasItem: () => true };
    const payload = { scope: 'workspace', key: 'adhdMode', value: false };
    expect(checkCommand({ kind: 'setting', project: null, item: null, payload }, opts)).toBeNull();
    expect(checkCommand({ kind: 'setting', project: 'alpha', item: null, payload }, opts)).toBe('a setting names no project or thread');
    expect(checkCommand({ kind: 'setting', project: null, item: 'w-1', payload }, opts)).toBe('a setting names no project or thread');
    expect(checkCommand({ kind: 'setting', project: null, item: null, payload: { scope: 'workspace', key: 'model', value: 'x' } }, opts)).toBe('not a setting your phone can change');
  });

  it('is left alone when it was sent to another computer', async () => {
    const t = setup();
    const other = await t.phone.addPhoneCommand({ device: '0f0e0d0c0b0a', project: null, item: null, kind: 'setting', payload: { scope: 'workspace', key: 'adhdMode', value: false } });
    await t.inbox.syncOnce();
    expect(t.calls).toEqual([]);
    expect(await t.outcome(other.id)).toBeNull();
  });
});

describe('the settings the Mac sends', () => {
  it('are one row for this computer, with no path and no instructions in it', async () => {
    const t = setup();
    await t.inbox.syncOnce();
    const rows = await t.phone.phoneSettings();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ device: t.inbox.device, name: 'Studio Mac', settings: { v: 1, version: '1.2.3', workspace: { adhdMode: true } } });
    const text = JSON.stringify(rows[0].settings);
    expect(text).not.toContain(HOME);
    expect(text).not.toContain('secret words');
  });

  it('are read at most once a minute, and sent again only when they change or the heartbeat is due', async () => {
    const t = setup();
    await t.inbox.syncOnce();
    expect([t.state.reads, t.state.puts]).toEqual([1, 1]);
    t.tick(5_000);
    await t.inbox.syncOnce();
    expect([t.state.reads, t.state.puts]).toEqual([1, 1]);
    t.tick(60_000);
    await t.inbox.syncOnce();
    expect([t.state.reads, t.state.puts]).toEqual([2, 1]);
    t.state.model = model({ outsideAgents: 'off' });
    t.tick(60_000);
    await t.inbox.syncOnce();
    expect(t.state.puts).toBe(2);
    expect((await t.phone.phoneSettings())[0].settings.workspace.outsideAgents).toBe('off');
    t.tick(5 * 60_000);
    await t.inbox.syncOnce();
    expect(t.state.puts).toBe(3);
  });

  it('go again at once after the phone changed one', async () => {
    const t = setup();
    await t.inbox.syncOnce();
    await t.send({ scope: 'workspace', key: 'adhdMode', value: false });
    t.tick(5_000);
    await t.inbox.syncOnce();
    expect((await t.phone.phoneSettings())[0].settings.workspace.adhdMode).toBe(false);
  });

  it('that the cloud will not take do not stop the pass, are said once, and wait a minute before the next try', async () => {
    const t = setup();
    t.state.failPut = 'relation "phone_settings" does not exist';
    const a = await t.send({ scope: 'workspace', key: 'adhdMode', value: false });
    await t.inbox.syncOnce();
    expect(await t.outcome(a.id)).toBe('done');
    t.tick(5_000);
    await t.inbox.syncOnce();
    t.tick(60_000);
    await t.inbox.syncOnce();
    expect(t.state.puts).toBe(2);
    expect(t.state.logs.filter((l) => l.includes('phone_settings'))).toHaveLength(1);
    t.state.failPut = null;
    t.tick(60_000);
    await t.inbox.syncOnce();
    expect(await t.phone.phoneSettings()).toHaveLength(1);
  });
});
