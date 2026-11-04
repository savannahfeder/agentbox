// THE MACOS TEST JOB HAS ROOM PAST ITS SLOWEST RUN.
//
// w-2351330171, 2026-11-01. The macOS `vitest` job had a 20 minute limit. Over
// the 40 runs on main before that day it took between 5 and 20 minutes for
// the same suite, because GitHub's macOS runners were short of capacity, and
// on 1c49055b it finished in 19 min 59 s. One more slow runner and a green
// suite shows a red cross for running out of time. The Linux job took 7 to
// 10 minutes on every one of those runs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/tests.yml', 'utf8');

function job(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

const minutes = (text) => Number(text.match(/timeout-minutes: (\d+)/)?.[1]);

describe('the test jobs', () => {
  it('give the macOS job at least half again its slowest measured run', () => {
    expect(job('vitest')).toContain('runs-on: macos-latest');
    expect(minutes(job('vitest'))).toBeGreaterThanOrEqual(30);
  });

  it('still stop a stuck macOS run within the hour', () => {
    expect(minutes(job('vitest'))).toBeLessThanOrEqual(60);
  });

  it('leave the Linux job its own limit', () => {
    expect(job('vitest-linux')).toContain('runs-on: ubuntu-latest');
    expect(minutes(job('vitest-linux'))).toBeGreaterThanOrEqual(20);
  });
});
