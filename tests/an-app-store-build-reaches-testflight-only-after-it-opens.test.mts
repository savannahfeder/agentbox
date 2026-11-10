// AN APP STORE BUILD REACHES TESTFLIGHT ONLY AFTER IT OPENS.
//
// The store build (EXPO_PUBLIC_STORE_BUILD=1, no group chat, no Alpha features)
// is the one App Review gets. On 2026-11-08 it was first started with
// `eas build --profile store --auto-submit`, which sends to TestFlight
// without opening the app, the path that let builds 11 to 15 reach testers
// dead at launch (tests/no-iphone-build-reaches-testflight-without-opening-first).
// It was cancelled. Now the store build has its own release workflow, the same
// shape as release-ios.yml: a Release simulator build with the store switch
// set, opened by the Maestro flow, and the store build sent only if it opened.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const mobile = path.join(import.meta.dirname, '..', 'mobile');
const eas = JSON.parse(fs.readFileSync(path.join(mobile, 'eas.json'), 'utf8'));
const jobs = yaml.load(fs.readFileSync(path.join(mobile, '.eas/workflows/release-ios-store.yml'), 'utf8')).jobs;
const byType = (t) => Object.entries(jobs).filter(([, j]) => j.type === t);

describe('the store launch test build', () => {
  const p = eas.build['store-launch-test'];
  it('is the launch test build with the store switch set', () => {
    expect(p.extends).toBe('launch-test');
    expect(p.env.EXPO_PUBLIC_STORE_BUILD).toBe(eas.build.store.env.EXPO_PUBLIC_STORE_BUILD);
  });
});

describe('the store release workflow', () => {
  it('builds the store build and its simulator twin', () => {
    expect(byType('build').map(([, j]) => j.params.profile).sort()).toEqual(['store', 'store-launch-test']);
  });
  it('opens the simulator twin with the flow that opens the app', () => {
    const [[, test]] = byType('maestro');
    const sim = byType('build').find(([, j]) => j.params.profile === 'store-launch-test')[0];
    expect(test.needs).toEqual([sim]);
    expect(test.params.build_id).toBe(`\${{ needs.${sim}.outputs.build_id }}`);
    expect([].concat(test.params.flow_path)).toContain('.maestro/opens.yml');
  });
  it('sends the store build, and only after the app opened', () => {
    const [[, submit]] = byType('submit');
    const test = byType('maestro')[0][0];
    const store = byType('build').find(([, j]) => j.params.profile === 'store')[0];
    expect(submit.needs).toEqual(expect.arrayContaining([test, store]));
    expect(submit.params.build_id).toBe(`\${{ needs.${store}.outputs.build_id }}`);
  });
});
