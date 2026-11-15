// NO IPHONE BUILD REACHES TESTFLIGHT WITHOUT OPENING FIRST.
//
// What broke (w-a68a52a026): iPhone builds 11 to 15 all died at launch and
// went to TestFlight anyway, because nothing opened a build before testers
// got it. Found only when the founder's phone showed "Crashed", days later.
// A release now goes through one EAS workflow: a Release build for the iPhone
// simulator, a Maestro flow that opens it and waits for the sign-in screen,
// and only then the TestFlight submit. This pins that order.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const mobile = path.join(import.meta.dirname, '..', 'mobile');
const read = (p) => yaml.load(fs.readFileSync(path.join(mobile, p), 'utf8'));
const eas = JSON.parse(fs.readFileSync(path.join(mobile, 'eas.json'), 'utf8'));

describe('the launch test build', () => {
  const profile = eas.build['launch-test'];

  it('is a Release build for the simulator, as a store build runs, not a development build', () => {
    expect(profile.ios).toEqual({ simulator: true, buildConfiguration: 'Release' });
    expect(profile.developmentClient).toBeUndefined();
    expect(profile.withoutCredentials).toBe(true);
  });

  it('carries the same cloud settings as the TestFlight build', () => {
    expect(profile.environment).toBe(eas.build.production.environment);
  });
});

describe('the release workflow', () => {
  const flow = read('.eas/workflows/release-ios.yml');
  const jobs = flow.jobs;

  it('sends to TestFlight only after the launch test passes, with the production build', () => {
    const submit = Object.entries(jobs).find(([, j]) => j.type === 'submit');
    expect(submit).toBeTruthy();
    const [, s] = submit;
    const test = Object.entries(jobs).find(([, j]) => j.type === 'maestro')[0];
    const prod = Object.entries(jobs).find(([, j]) => j.type === 'build' && j.params.profile === 'production')[0];
    expect(s.needs).toEqual(expect.arrayContaining([test, prod]));
    expect(s.params.build_id).toBe(`\${{ needs.${prod}.outputs.build_id }}`);
  });

  it('tests the simulator build, with the flow that opens the app', () => {
    const [, test] = Object.entries(jobs).find(([, j]) => j.type === 'maestro');
    const sim = Object.entries(jobs).find(([, j]) => j.type === 'build' && j.params.profile === 'launch-test')[0];
    expect(test.needs).toEqual([sim]);
    expect(test.params.build_id).toBe(`\${{ needs.${sim}.outputs.build_id }}`);
    for (const f of [].concat(test.params.flow_path)) expect(fs.existsSync(path.join(mobile, f))).toBe(true);
  });

  it('the launch-only workflow runs the same two steps and sends nothing', () => {
    const only = read('.eas/workflows/launch-test-ios.yml').jobs;
    expect(Object.values(only).map((j) => j.type).sort()).toEqual(['build', 'maestro']);
  });
});

describe('the flow that opens the app', () => {
  const [head, steps] = fs.readFileSync(path.join(mobile, '.maestro/opens.yml'), 'utf8').split(/^---$/m).map((s) => yaml.load(s));

  it('opens the app that the build makes', () => {
    expect(head.appId).toBe('now.astral.agentbox');
    expect(steps[0]).toEqual({ launchApp: { clearState: true } });
  });

  it('waits for words the sign-in screen really shows', () => {
    const src = fs.readFileSync(path.join(mobile, 'src/app/sign-in.tsx'), 'utf8');
    const wait = steps.find((s) => s.extendedWaitUntil).extendedWaitUntil.visible;
    expect(src).toMatch(/Use the account from/);
    expect(wait).toMatch(/^Use the account from/);
  });

  it('fails a build made without the cloud’s address', () => {
    const src = fs.readFileSync(path.join(mobile, 'src/app/sign-in.tsx'), 'utf8');
    const absent = steps.filter((s) => s.assertNotVisible).map((s) => s.assertNotVisible);
    expect(src).toContain("This build was made without the cloud's address");
    expect(absent.some((t) => /without the cloud/.test(t))).toBe(true);
  });
});
