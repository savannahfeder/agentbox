// The founder asked for the first run that starts on real work (components/FirstRun.tsx
// and the tutorial on the inbox) to be tried against the one on main before it, on
// new installs only, half each, compared every day on activation and retention.
// So each new install is given one of two words once, keeps it, and every count it
// sends carries it; an install that set up before this has none and is left out.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMS, armFor, readArm } from '../shared/onboarding-arm.mjs';
import { createAnalytics } from '../main/analytics.mjs';
import { sanitize } from '../shared/analytics-events.mjs';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arm-'));
const real = { HOME: '/Users/someone' };

describe('which first run a new install gets', () => {
  it('is one of two words', () => {
    expect(ARMS).toEqual(['tour', 'classic']);
  });
  it('is drawn at random, half each', () => {
    expect(armFor(dir(), { env: real, random: () => 0.2 })).toBe('tour');
    expect(armFor(dir(), { env: real, random: () => 0.7 })).toBe('classic');
  });
  it('splits close to half over many installs', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const got = Array.from({ length: 2000 }, () => armFor(dir(), { env: real, random }));
    const tours = got.filter((a) => a === 'tour').length;
    expect(tours).toBeGreaterThan(900);
    expect(tours).toBeLessThan(1100);
  });
  it('is kept, so a restart never moves an install to the other half', () => {
    const d = dir();
    expect(armFor(d, { env: real, random: () => 0.9 })).toBe('classic');
    expect(armFor(d, { env: real, random: () => 0.1 })).toBe('classic');
    expect(readArm(d)).toBe('classic');
  });
  it('is nothing for an install that never asked, which is every install set up before', () => {
    expect(readArm(dir())).toBe(null);
  });
  it('ignores a file holding anything but the two words', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), '/Users/someone/secret');
    expect(readArm(d)).toBe(null);
    expect(armFor(d, { env: real, random: () => 0.1 })).toBe('tour');
  });
  it('can be chosen for a test window, which is how either one is looked at', () => {
    expect(armFor(dir(), { env: { ...real, AGENTBOX_ONBOARDING: 'classic' }, random: () => 0.1 })).toBe('classic');
  });
  it('is the new one in a throwaway test home unless one is named, and is not stored there', () => {
    const d = dir();
    expect(armFor(d, { env: { AGENTBOX_FRESH_USER: '1' }, random: () => 0.9 })).toBe('tour');
    expect(readArm(d)).toBe(null);
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
    expect(a.onboardingArm({ random: () => 0.7 })).toBe('classic');
    a.track('first_run_step', { count: 21 });
    expect(sent.at(-1).properties.onboarding).toBe('classic');
    expect(sanitize('task_opened', { onboarding: 'tour' })).toEqual({});
  });
});

describe('the app', () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  it('asks for the word only as a first run starts', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("void armNow().then((a) => { setArm(a); setFresh(true); });");
  });
  it('draws the first run on main for one half and the new one for the other', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("{fresh && !modeDraft && arm === 'classic' && <ClassicFirstRun snap={snap} home={home} onDone={finishClassic} />}");
    expect(app).toContain("{fresh && !modeDraft && arm === 'tour' && <FirstRunFlow snap={snap} home={home} onDone={finishFresh} />}");
  });
  it('never waits for the word for long', () => {
    expect(read('renderer/src/App.tsx')).toContain('ARM_WAIT_MS');
  });
  it('says so in the privacy notice', () => {
    expect(read('README.md')).toContain('which of two first runs a new install was shown');
  });
});
