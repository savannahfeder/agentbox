// EVERY FIRST RUN IS THE SPLIT VIEW (2026-11-21). The split view had been given to
// every new install since 0.1.23, but the old first run was still in the app: an
// install that had drawn 'classic' and not finished setting up met it again, and
// the main process answered 'classic' whenever it had no word. Its owner called the
// split view the winner and asked for the other onboardings to go. Measured on main:
// armFor kept a stored 'classic', and App.tsx still drew <ClassicFirstRun>.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMS, armFor, readArm } from '../shared/onboarding-arm.mts';
import { createAnalytics } from '../main/analytics.mts';
import { sanitize } from '../shared/analytics-events.mts';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arm-'));
const real = { HOME: '/Users/someone' };
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the first run an install gets', () => {
  it('is the split view for a new install, and is written down', () => {
    const d = dir();
    expect(armFor(d, { env: real })).toBe('tour');
    expect(readArm(d)).toBe('tour');
  });
  it('is the split view for an install that drew the old one and never finished', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), 'classic');
    expect(armFor(d, { env: real })).toBe('tour');
    expect(readArm(d)).toBe('tour');
  });
  it('still reads back an install that went through the old one, so the report can count it', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), 'classic');
    expect(readArm(d)).toBe('classic');
    expect(ARMS).toEqual(['tour', 'classic']);
  });
  it('reads nothing that is not one of its words', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'onboarding-arm'), '/Users/someone/secret');
    expect(readArm(d)).toBe(null);
    expect(readArm(dir())).toBe(null);
  });
  it('keeps nothing for a test window', () => {
    const d = dir();
    expect(armFor(d, { env: { AGENTBOX_FRESH_USER: '1' } })).toBe('tour');
    expect(readArm(d)).toBe(null);
  });
});

describe('every count from an install', () => {
  it('carries its word, set by the sender and never by a caller', () => {
    const sent: Array<{ properties: Record<string, unknown> }> = [];
    const client = { capture: (e: { properties: Record<string, unknown> }) => sent.push(e) };
    const a = createAnalytics({ config: {}, version: '1.0.0', dir: dir(), client, env: real } as never);
    a.track('app_opened');
    expect(sent.at(-1)!.properties.onboarding).toBe(undefined);
    expect(a.onboardingArm()).toBe('tour');
    a.track('first_run_step', { count: 21 });
    expect(sent.at(-1)!.properties.onboarding).toBe('tour');
    expect(sanitize('task_opened', { onboarding: 'tour' })).toEqual({});
  });
});

describe('the app', () => {
  it('draws only the split view as a first run', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('{fresh && !modeDraft && <FirstRunFlow snap={snap} home={home} onDone={finishFresh}');
    expect(app).not.toMatch(/ClassicFirstRun|finishClassic|armNow|first-run-classic/);
    expect(fs.existsSync(new URL('../renderer/src/components/FirstRunClassic.tsx', import.meta.url))).toBe(false);
  });
  it('never answers the old one from the main process', () => {
    expect(read('main/ipc.mts')).toContain("ipcMain.handle('zero:onboarding-arm', () => analytics.onboardingArm?.() ?? 'tour');");
  });
  it('says what it sends in the privacy notice', () => {
    expect(read('README.md')).toContain('which first run a new install was shown');
  });
});
