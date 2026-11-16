// EVERY NEW INSTALL GETS THE NEW FIRST RUN NOW IT IS APPROVED (w-1e52420829, 2026-11-14).
//
// The new first run (components/FirstRun.tsx and the walkthrough after it) was being
// tried against the old one, half of new installs each. On launch day it was not
// approved, so the share that got it was set to 0 and every new install met the old
// one. Its owner then went through it in a new user's window and said "it's good,
// ready to ship", "shipped as new onboarding". So the share is 1: every new install.
// An install part-way through the old one keeps it, the old one is still what shows
// when no word comes back, and a half restarts the test.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMS, TOUR_SHARE, armFor, readArm } from '../shared/onboarding-arm.mts';
import { createAnalytics } from '../main/analytics.mts';
import { sanitize } from '../shared/analytics-events.mts';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arm-'));
const real = { HOME: '/Users/someone' };

describe('which first run a new install gets', () => {
  it('is one of two words', () => {
    expect(ARMS).toEqual(['tour', 'classic']);
  });
  it('gives every new install the new one', () => {
    expect(TOUR_SHARE).toBe(1);
  });
  it('is the new one on a real install whatever the draw', () => {
    for (const r of [0, 0.001, 0.2, 0.5, 0.7, 0.999]) {
      const d = dir();
      expect(armFor(d, { env: real, random: () => r })).toBe('tour');
      expect(readArm(d)).toBe('tour');
    }
  });
  it('is the old one for every new install when the share is put back to none', () => {
    for (const r of [0, 0.5, 0.999]) expect(armFor(dir(), { env: real, random: () => r, share: 0 })).toBe('classic');
  });
  it('still splits close to half when the share is put back at a half', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const got = Array.from({ length: 2000 }, () => armFor(dir(), { env: real, random, share: 0.5 }));
    const tours = got.filter((a) => a === 'tour').length;
    expect(tours).toBeGreaterThan(900);
    expect(tours).toBeLessThan(1100);
  });
  // An install that began the old one before this and has not finished it is not moved mid-way.
  it('keeps a kept old one', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), 'classic');
    expect(armFor(d, { env: real, random: () => 0.1 })).toBe('classic');
    expect(armFor(d, { env: real, random: () => 0.1, share: 0.5 })).toBe('classic');
    expect(readArm(d)).toBe('classic');
  });
  it('does not show a kept new one while the share is 0, and stores the old one instead', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), 'tour');
    expect(armFor(d, { env: real, random: () => 0.1, share: 0 })).toBe('classic');
    expect(readArm(d)).toBe('classic');
  });
  it('keeps a kept new one once the share is above 0 again', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), 'tour');
    expect(armFor(d, { env: real, random: () => 0.9, share: 0.5 })).toBe('tour');
  });
  it('is nothing for an install that never asked, which is every install set up before', () => {
    expect(readArm(dir())).toBe(null);
  });
  it('ignores a file holding anything but the two words', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), '/Users/someone/secret');
    expect(readArm(d)).toBe(null);
    expect(armFor(d, { env: real, random: () => 0.1 })).toBe('tour');
    expect(readArm(d)).toBe('tour');
  });
  it('can be named for a real install, either way', () => {
    expect(armFor(dir(), { env: { ...real, AGENTBOX_ONBOARDING: 'tour' }, random: () => 0.9 })).toBe('tour');
    expect(armFor(dir(), { env: { ...real, AGENTBOX_ONBOARDING: 'classic' }, random: () => 0.1, share: 1 })).toBe('classic');
  });
  it('is the new one in a throwaway test home unless one is named, and is not stored there', () => {
    const d = dir();
    expect(armFor(d, { env: { AGENTBOX_FRESH_USER: '1' }, random: () => 0.9 })).toBe('tour');
    expect(readArm(d)).toBe(null);
    expect(armFor(d, { env: { AGENTBOX_FRESH_USER: '1', AGENTBOX_ONBOARDING: 'classic' } })).toBe('classic');
  });
});

describe('every count from an install in the test', () => {
  const sent = [];
  const client = { capture: (e) => sent.push(e) };
  it('carries its word, set by the sender and never by a caller', () => {
    const d = dir();
    const a = createAnalytics({ config: {}, version: '1.0.0', dir: d, client, env: real });
    a.track('app_opened');
    expect(sent.at(-1).properties.onboarding).toBe(undefined);
    expect(a.onboardingArm({ random: () => 0.1 })).toBe('tour');
    a.track('first_run_step', { count: 21 });
    expect(sent.at(-1).properties.onboarding).toBe('tour');
    expect(sanitize('task_opened', { onboarding: 'tour' })).toEqual({});
  });
});

describe('the app', () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  it('asks for the word only as a first run starts', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("void armNow().then((a) => { setArm(a); setFresh(true); });");
  });
  it('draws the old first run or the new one by the word', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("{fresh && !modeDraft && arm === 'classic' && <ClassicFirstRun snap={snap} home={home} onDone={finishClassic} />}");
    expect(app).toContain("{fresh && !modeDraft && arm === 'tour' && <FirstRunFlow snap={snap} home={home} onDone={finishFresh}");
  });
  it('never waits for the word for long', () => {
    expect(read('renderer/src/App.tsx')).toContain('ARM_WAIT_MS');
  });
  it('falls back to the old one when no word comes back, in the window and in the main process', () => {
    const app = read('renderer/src/App.tsx');
    const armNow = app.slice(app.indexOf('async function armNow'), app.indexOf('type Modal'));
    expect(armNow).toContain("return word === 'tour' ? 'tour' : 'classic';");
    expect(armNow).toContain("catch { return 'classic'; }");
    expect(armNow).not.toMatch(/return 'tour'/);
    const ipc = read('main/ipc.mts');
    expect(ipc).toContain("ipcMain.handle('zero:onboarding-arm', () => analytics.onboardingArm?.() ?? 'classic');");
  });
  it('says so in the privacy notice', () => {
    expect(read('README.md')).toContain('which of two first runs a new install was shown');
  });
});
