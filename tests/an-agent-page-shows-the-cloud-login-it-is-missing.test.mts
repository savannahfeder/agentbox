// An agent's Settings page did not show that its login was missing from the cloud.
//
// Overnight Cloud test (2026-11-16, round five): with Cloud on, Settings > Codex
// marked this Mac's login In use and at its limit, and said "Codex is here but
// not working", while every thread ran in the cloud on another login whose card
// said nothing. And with only a login on this Mac, Cloud's switch was the only
// sign of the cloud, though the app runs that agent's threads here (Supervisor
// `_hasCloudSignIn`). The approved fix: an empty Cloud card beside the logins
// when the agent has none in the cloud, with Add to cloud; and, with a cloud
// login, In use on the login that takes the threads.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { cloudSlotWords, inUseWhere, showsCloudSlot } from '../renderer/src/cloud-places';
import { cloudWhenLine } from '../renderer/src/cloud-menu';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('the empty cloud card', () => {
  it('shows when the cloud is set up and the agent has no login in it', () => {
    expect(showsCloudSlot({ setUp: true, cloudLogins: 0 })).toBe(true);
  });

  it('does not show once a login is in the cloud, or when the cloud is not set up', () => {
    expect(showsCloudSlot({ setUp: true, cloudLogins: 1 })).toBe(false);
    expect(showsCloudSlot({ setUp: false, cloudLogins: 0 })).toBe(false);
  });

  it('names the agent and where its threads run', () => {
    expect(cloudSlotWords('Codex')).toEqual({ title: 'No Codex account in the cloud', line: 'Codex threads run on this computer.' });
    expect(cloudSlotWords('Claude Code')).toEqual({ title: 'No Claude Code account in the cloud', line: 'Claude Code threads run on this computer.' });
  });

  it('is drawn on the agent page, and its button starts that agent\'s cloud sign-in', () => {
    expect(settings).toMatch(/showsCloudSlot\(/);
    expect(app).toMatch(/api\.cloudSignIn\(\{ action: 'start', engine, key \}\)/);
  });
});

describe('which login says In use', () => {
  const both = { chosenHere: true, isCloudInUse: true, cloudCanRun: true };

  it('is the cloud login alone when the cloud takes every thread', () => {
    expect(inUseWhere({ ...both, mode: 'all' })).toEqual({ here: false, cloud: true });
  });

  it('is both when the cloud takes only what this computer cannot', () => {
    expect(inUseWhere({ ...both, mode: 'full' })).toEqual({ here: true, cloud: true });
  });

  it('is this computer\'s alone with the cloud off', () => {
    expect(inUseWhere({ ...both, mode: 'mac' })).toEqual({ here: true, cloud: false });
  });

  it('stays on this computer when the cloud login cannot run, since its threads run here', () => {
    expect(inUseWhere({ ...both, cloudCanRun: false, mode: 'all' })).toEqual({ here: true, cloud: false });
  });

  it('is never a login that is not the chosen one', () => {
    expect(inUseWhere({ chosenHere: false, isCloudInUse: false, cloudCanRun: true, mode: 'all' })).toEqual({ here: false, cloud: false });
  });
});

describe('the not working card', () => {
  it('is left out when the limit is only this computer\'s and the cloud takes every thread', () => {
    expect(settings).toMatch(/limitIsHereOnly = mode === 'all' && cloudCanRun/);
    expect(settings).toMatch(/agent\.trouble === engineTroubleNote\('at-limit', agent\.name\)/);
    expect(settings).toMatch(/\(agent\.trouble && !limitIsHereOnly\)/);
  });
});

describe('the Use the cloud line', () => {
  it('says when threads go there without naming an account it does not have', () => {
    expect(cloudWhenLine('all')).toBe('Threads start there first.');
    expect(cloudWhenLine('full')).toBe('Threads start there when this computer is full.');
    expect(cloudWhenLine('mac')).toBe('Every thread runs on this computer.');
  });
});
