// THE CLOUD BUTTON CHOOSES WHERE THREADS RUN: ONLY THIS MAC, WHEN THIS MAC IS
// FULL, OR EVERYTHING.
//
// Until now the only way to change it was editing `cloudRuns` in the config
// file. The founder picked the design on 2026-10-13: a square cloud button
// beside the filters button, wearing how many run in the cloud when any do,
// opening a menu built like the filters menu with three choices, the picked
// one in orange, and this month's use under them. She is about to run most of
// her own work in the cloud for a few days, so the menu also says what that
// cost, from the runs' own measurements (main/cloud/usage.mjs).
// Here: the words and numbers the menu shows, the setting it writes, and the
// supervisor's answer the snapshot carries.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';
import { appendCloudUsage } from '../main/cloud/usage.mjs';
import { CLOUD_MODES, cloudModeOf, cloudButtonCount, cloudMonthLine, pageToOpen, accountLabel } from '../renderer/src/cloud-menu';
import { recordCloudLogin, markCloudLogin } from '../main/cloud/logins.mjs';

let dir; let config; let supervisor;
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbutton-')));
  config = { home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'] };
  supervisor = new Supervisor(config, { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, readItem: () => null }, dir);
  delete process.env.AGENTBOX_CLOUD_CONFIG;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the menu\'s words', () => {
  it('offers the three choices in order, each saying what it does in one line', () => {
    expect(CLOUD_MODES.map((m) => m.id)).toEqual(['mac', 'full', 'all']);
    expect(CLOUD_MODES.map((m) => m.label)).toEqual(['This Mac only', 'When this Mac is full', 'Everything']);
    for (const m of CLOUD_MODES) expect(m.note.length).toBeLessThan(60);
  });

  it('reads the setting the way the supervisor does', () => {
    expect(cloudModeOf(false)).toBe('mac');
    expect(cloudModeOf('all')).toBe('all');
    for (const v of [null, undefined, true]) expect(cloudModeOf(v)).toBe('full');
  });

  it('wears a number only while something runs in the cloud', () => {
    expect(cloudButtonCount({ running: 0 })).toBe(null);
    expect(cloudButtonCount({ running: 3 })).toBe(3);
    expect(cloudButtonCount(null)).toBe(null);
  });

  it('says this month\'s use in agent-hours, and never a price', () => {
    expect(cloudMonthLine({ runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null })).toBe('Nothing in the cloud yet this month');
    expect(cloudMonthLine({ runs: 4, agentHours: 12.4, estimatedCost: 1.372, costPerAgentHour: 0.11 })).toBe('12.4 agent-hours');
    expect(cloudMonthLine({ runs: 1, agentHours: 0.5, estimatedCost: 0, costPerAgentHour: null })).toBe('0.5 agent-hours');
  });
});

describe('the setting', () => {
  const choose = (value) => setWorkspaceSetting({ config, supervisor }, { key: 'cloudRuns', value });
  const onDisk = () => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8')).cloudRuns;

  it('writes what the supervisor reads, and takes effect without a restart', () => {
    choose('all');
    expect(config.cloudRuns).toBe('all');
    expect(onDisk()).toBe('all');
    expect(supervisor._cloudFirst()).toBe(true);
    choose('mac');
    expect(config.cloudRuns).toBe(false);
    choose('full');
    expect(config.cloudRuns).toBe(null);
    expect(supervisor._cloudFirst()).toBe(false);
  });

  it('refuses a value it does not know', () => {
    choose('all');
    expect(() => choose('sometimes')).toThrow();
    expect(config.cloudRuns).toBe('all');
  });
});

describe('what the snapshot carries', () => {
  it('says the cloud is not set up on a Mac without its setup, so no button is drawn', () => {
    expect(supervisor.cloudStatus()).toMatchObject({ setUp: false });
  });

  it('says the mode, how many run there now, and this month\'s use', () => {
    const cfg = path.join(dir, 'cloud.json');
    fs.writeFileSync(cfg, JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' }));
    process.env.AGENTBOX_CLOUD_CONFIG = cfg;
    config.cloudRuns = 'all';
    supervisor.sessions.set('w-c', { itemId: 'w-c', engine: 'claude', cloud: true, tail: [] });
    supervisor.sessions.set('w-l', { itemId: 'w-l', engine: 'claude', cloud: false, tail: [] });
    appendCloudUsage({ runId: 'r', item: 'w-1', engine: 'claude', exitCode: 0, usage: { wallSeconds: 7200, cpuSeconds: 600, peakMemoryBytes: 1024 ** 3 } }, { home: dir });
    const s = supervisor.cloudStatus();
    expect(s).toMatchObject({ setUp: true, mode: 'all', running: 1 });
    expect(s.month.agentHours).toBe(2);
    expect(s.month.runs).toBe(1);
  });
});

// THE CLOUD'S ACCOUNTS ARE THE ONES SHE ADDS (2026-10-14: "we shouldn't
// predefine which accounts to sign up with ... Give people the option"). The
// setup is its own screen: tests/the-cloud-is-set-up-on-its-own-screen.
describe('the accounts she added', () => {
  const acct = (extra) => ({ engine: 'claude', key: 'acct-1', name: null, ready: true, state: 'ready', ...extra });

  it('are called by their email, or counted when the vendor would not say', () => {
    const a = acct({ name: 'work@example.com' });
    const b = acct({ key: 'acct-2' });
    const c = acct({ key: 'acct-3' });
    const x = acct({ engine: 'codex', key: 'acct-4' });
    const all = [a, b, c, x];
    expect(accountLabel(a, all)).toBe('work@example.com');
    expect(accountLabel(b, all)).toBe('Claude account 2');
    expect(accountLabel(c, all)).toBe('Claude account 3');
    expect(accountLabel(x, all)).toBe('Codex account');
  });

  it('open the page again for the next sign-in even when it shows the same link (Codex\'s review, finding 8)', () => {
    const url = 'https://auth.openai.com/codex/device';
    const first = pageToOpen({ engine: 'codex', key: 'acct-a', state: 'waiting', url, code: 'X', message: null, attempt: 's1' });
    const second = pageToOpen({ engine: 'codex', key: 'acct-b', state: 'waiting', url, code: 'Y', message: null, attempt: 's2' });
    expect(first.key).not.toBe(second.key);
    expect(pageToOpen({ engine: 'claude', key: 'acct-a', state: 'starting', url: null, code: null, message: null })).toBe(null);
  });
});

describe('the supervisor\'s side of it', () => {
  const setUp = () => {
    const cfg = path.join(dir, 'cloud.json');
    fs.writeFileSync(cfg, JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' }));
    process.env.AGENTBOX_CLOUD_CONFIG = cfg;
  };

  it('lists the accounts she added for the cloud, not this Mac\'s, and none on a Mac not set up', () => {
    recordCloudLogin('claude', 'acct-w', { id: 'L1', savedAt: 1, email: 'work@example.com' }, { home: dir });
    expect(supervisor.cloudStatus().accounts).toEqual([]);
    setUp();
    recordCloudLogin('codex', 'acct-p', { id: 'L2', savedAt: 2, expiresAt: Date.now() + 200 * 3600_000 }, { home: dir });
    const accounts = supervisor.cloudStatus().accounts;
    expect(accounts.map((a) => [a.engine, a.key, a.name, a.ready])).toEqual([['claude', 'acct-w', 'work@example.com', true], ['codex', 'acct-p', null, true]]);
  });

  it('runs a thread of an engine in the cloud while any of that engine\'s cloud accounts works, whichever account the thread uses here', () => {
    setUp();
    supervisor._liveProfilesFor = () => ['default'];
    expect(supervisor._hasCloudSignIn('claude')).toBe(false);
    recordCloudLogin('claude', 'acct-w', { id: 'L1' }, { home: dir });
    expect(supervisor._hasCloudSignIn('claude')).toBe(true);
    expect(supervisor._hasCloudSignIn('codex')).toBe(false);
    markCloudLogin('claude', 'acct-w', 'L1', { broken: 'refused' }, { home: dir });
    expect(supervisor._hasCloudSignIn('claude')).toBe(false);
  });

  it('starts a sign-in only for a known engine, and acts on no account that is not one of hers', async () => {
    await expect(supervisor.cloudSignIn('start', 'gemini')).rejects.toThrow();
    await expect(supervisor.cloudSignIn('erase', 'claude', 'acct-x')).rejects.toThrow();
    await expect(supervisor.cloudSignIn('start', 'claude', 'acct-not-hers')).rejects.toThrow();
    await expect(supervisor.cloudSignIn('remove', 'claude', '../etc')).rejects.toThrow();
  });

  it('takes a cloud run whose sign-in failed as a transport fault that strikes nothing here, and only that', () => {
    const cloudRun = { cloud: true };
    supervisor._noteCloudLoginExit(cloudRun, 77, null);
    expect(cloudRun).toMatchObject({ transportFault: true, cloudLoginTrouble: true });
    const struck = [];
    supervisor._strikeProfile = (...a) => struck.push(a);
    supervisor._noteProfileTrouble = (...a) => struck.push(a);
    supervisor.noteExitForBackoff({ ...cloudRun, engine: 'claude', profile: 'default', startedAt: Date.now(), tail: [] });
    expect(struck).toEqual([]);
    // A local run with the same code, and a cloud run that failed otherwise, are not this.
    const local = { cloud: false };
    supervisor._noteCloudLoginExit(local, 77, null);
    expect(local.cloudLoginTrouble).toBeUndefined();
    const other = { cloud: true };
    supervisor._noteCloudLoginExit(other, 1, null);
    expect(other.cloudLoginTrouble).toBeUndefined();
  });

  it('says the cloud could not be reached when it is not set up, instead of hanging', async () => {
    const { key } = await supervisor.cloudSignIn('start', 'claude');
    expect(key).toMatch(/^acct-/);
    expect(supervisor.cloudStatus().signIns).toEqual([]);
    expect(supervisor._cloudSignIns.get(`claude|${key}`).status()).toMatchObject({ state: 'failed' });
  });
});
