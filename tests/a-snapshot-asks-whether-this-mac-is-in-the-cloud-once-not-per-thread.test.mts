// A sampling heap profile of the running app on 2026-11-15 put 155 MB of
// every two minutes' garbage in main under one question: is this Mac signed in
// to the cloud. The window's snapshot asks the supervisor for every thread's
// status, and for each waiting thread that asked again from scratch, reading
// the cloud's config, every Claude login and the cloud's login files.
//
// Now one status pass answers it once for all its threads. A call outside a
// pass reads afresh, as before, so a sign-in is still seen on the next ask.
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function aMac() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-once-'));
  vi.stubEnv('AGENTBOX_CLOUD_CONFIG', path.join(home, '.agentbox', 'cloud.json'));
  const sup = Object.assign(Object.create(Supervisor.prototype), { config: { home, cloudRuns: true } });
  const reads = () => (fs.readFileSync as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(([p]) => String(p).startsWith(home)).length;
  vi.spyOn(fs, 'readFileSync');
  return { home, sup, reads };
}

it('reads the cloud config once in a pass, however many threads ask', () => {
  const { sup, reads } = aMac();
  const answers = sup._inOnePass(() => Array.from({ length: 50 }, () => sup._cloudSignedInAtAll('claude')));
  expect(new Set(answers)).toEqual(new Set([false]));
  expect(reads()).toBe(1);
});

it('keeps each engine its own answer within a pass', () => {
  const { sup, reads } = aMac();
  sup._inOnePass(() => { sup._cloudSignedInAtAll('claude'); sup._cloudSignedInAtAll('codex'); sup._cloudSignedInAtAll('claude'); });
  expect(reads()).toBe(2);
});

it('reads afresh outside a pass, and in each new pass', () => {
  const { sup, reads } = aMac();
  sup._cloudSignedInAtAll('claude');
  sup._cloudSignedInAtAll('claude');
  expect(reads()).toBe(2);
  sup._inOnePass(() => sup._cloudSignedInAtAll('claude'));
  sup._inOnePass(() => sup._cloudSignedInAtAll('claude'));
  expect(reads()).toBe(4);
});

it('forgets the pass when it ends, even if it threw', () => {
  const { sup } = aMac();
  expect(() => sup._inOnePass(() => { throw new Error('boom'); })).toThrow('boom');
  expect(sup._pass).toBeNull();
});

it('runs status and the cloud button inside a pass', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '../main/supervisor.mts'), 'utf8');
  expect(src).toMatch(/\n {2}status\(handed\?: WorkItem\[\]\) \{\n {4}return this\._inOnePass\(/);
  expect(src).toMatch(/\n {2}cloudStatus\(handed\?: WorkItem\[\]\) \{\n {4}return this\._inOnePass\(/);
});
