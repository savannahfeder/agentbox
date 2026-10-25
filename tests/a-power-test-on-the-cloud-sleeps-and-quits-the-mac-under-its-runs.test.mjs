// A POWER TEST ON THE CLOUD SLEEPS AND QUITS THE MAC UNDER ITS RUNS (w-4465054f04, 2026-10-22).
//
// Asked for: "very thoroughly test our cloud system ... for long periods of
// time with lots of things running at once, including interruptions and app
// restarts". A power test on real tools could not do it, for four reasons
// found by reading it against the cloud code:
//   - A copy built from the same commit as the person's own app hashes to the
//     same cloud relay socket in the same temp folder
//     (agentbox-cloud-501-bfc39bb599a4.sock for this checkout and her app
//     folder, both at 3400eeef), so its runs would have been served by HER
//     app's relay, and freezing or killing the copy's would have hit hers.
//   - Its freeze stopped the app's process group only. The relay is started
//     detached, in a group of its own, so the cloud never saw the Mac go away.
//   - The watcher counted every cloud stand-in as a worker on this Mac, so ten
//     cloud runs read as "more agents running than the app allows (2)".
//   - On real tools the clock restarted the app once and froze it once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chaosPlan, CLOUD_AWAY_MS } from '../.claude/skills/power-test/scripts/plan.mjs';
import { instanceProcesses, sleepTargets } from '../.claude/skills/power-test/scripts/watch.mjs';
import { cloudTmpFor, copyConfig } from '../.claude/skills/verify-agentbox/scripts/live.mjs';

const HOUR = 3_600_000;

describe('the day a cloud power test lays out', () => {
  const plan = chaosPlan('normal', 3 * HOUR, { real: true, cloud: true });

  it('quits, sleeps, shuts and crashes the app again and again, in order, inside the test', () => {
    expect(plan.map((e) => e.kind)).toEqual(['restart', 'sleep', 'closed', 'crash', 'restart', 'sleep']);
    for (const e of plan) {
      expect(e.at).toBeGreaterThan(0);
      expect(e.at + (e.ms ?? 0)).toBeLessThan(3 * HOUR);
      expect(e.says).toBeTruthy();
    }
  });

  it('sleeps the whole Mac, its cloud relay too, for longer than the cloud waits before calling it away', () => {
    for (const e of plan.filter((x) => x.kind === 'sleep')) {
      expect(e.whole).toBe(true);
      expect(e.ms).toBeGreaterThan(CLOUD_AWAY_MS);
    }
    for (const total of [20 * 60_000, HOUR, 8 * HOUR]) {
      for (const e of chaosPlan('normal', total, { real: true, cloud: true }).filter((x) => x.kind === 'sleep')) expect(e.ms).toBeGreaterThan(CLOUD_AWAY_MS);
    }
  });

  it('keeps the app shut for minutes, not seconds, and opens it again well before the end', () => {
    const shut = plan.find((e) => e.kind === 'closed');
    expect(shut.ms).toBeGreaterThanOrEqual(3 * 60_000);
    expect(shut.ms).toBeLessThanOrEqual(15 * 60_000);
    expect(shut.at + shut.ms).toBeLessThan(0.6 * 3 * HOUR);
  });

  it('has a lighter and a heavier day, and never a login running out, which real tools cannot be told to do', () => {
    const light = chaosPlan('light', 3 * HOUR, { real: true, cloud: true }).map((e) => e.kind);
    const heavy = chaosPlan('heavy', 3 * HOUR, { real: true, cloud: true }).map((e) => e.kind);
    expect(light).toEqual(['restart', 'sleep']);
    expect(heavy.length).toBeGreaterThan(plan.length);
    for (const kinds of [light, heavy, plan.map((e) => e.kind)]) {
      for (const k of ['agents', 'login-out', 'codex-out', 'all-out']) expect(kinds).not.toContain(k);
    }
  });

  it('leaves a test without the cloud exactly as it was', () => {
    expect(chaosPlan('heavy', HOUR, { real: true }).map((e) => e.kind)).toEqual(['restart', 'sleep', 'crash']);
    expect(chaosPlan('none', HOUR, { real: true, cloud: true })).toEqual([]);
  });

  it('measures "away" by the same 90 seconds the relay asks the cloud for', () => {
    const run = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'cloud', 'run.mjs'), 'utf8');
    expect(Number(/const OFFLINE_AFTER_MS = ([\d_]+);/.exec(run)[1].replace(/_/g, ''))).toBe(CLOUD_AWAY_MS);
  });
});

describe('the copy on the cloud', () => {
  it('has a temp folder of its own, outside its instance, short enough for a socket', () => {
    const a = cloudTmpFor('/tmp/agentbox-verify/instances/power-startup-engineer');
    const b = cloudTmpFor('/tmp/agentbox-verify/instances/power-cto');
    expect(a).not.toBe(b);
    expect(cloudTmpFor('/tmp/agentbox-verify/instances/power-startup-engineer')).toBe(a);
    expect(a.startsWith('/tmp/agentbox-verify/instances/')).toBe(false);
    // macOS caps a socket's path at 104 bytes: the relay's is <tmp>/agentbox-cloud-<uid>-<12 hex>.sock.
    expect(`${a}/agentbox-cloud-501-bfc39bb599a4.sock`.length).toBeLessThan(104);
  });

  it('sends everything to the cloud, and a copy off the cloud is left to the Mac\'s own setting', () => {
    const base = { storeRoot: '/s', engine: 'real' };
    expect(copyConfig({ ...base, cloud: true }).cloudRuns).toBe('all');
    expect('cloudRuns' in copyConfig(base)).toBe(false);
  });

  // The menu drew "When this Mac is full" on a copy sending everything to the
  // cloud: it reads cloudWhenOn, which the app's own buttons always write.
  it('has its cloud menu say Everything, as the app\'s own button would have', () => {
    expect(copyConfig({ storeRoot: '/s', engine: 'real', cloud: true }).cloudWhenOn).toBe('all');
  });

  it('keeps a tester\'s own cloud choice through a restart', () => {
    const state = { storeRoot: '/s', engine: 'real', cloud: true };
    const off = copyConfig(state, { cloudRuns: false, cloudWhenOn: 'all' });
    expect('cloudRuns' in off).toBe(false);
    expect('cloudWhenOn' in off).toBe(false);
  });
});

describe('the copy\'s processes when its threads run in the cloud', () => {
  const sock = '/tmp/agentbox-pt-1a2b3c4d/agentbox-cloud-501-bfc39bb599a4.sock';
  const hers = '/var/folders/x/T/agentbox-cloud-501-bfc39bb599a4.sock';
  const state = { pid: 10, instance: '/tmp/i', cloudTmp: '/tmp/agentbox-pt-1a2b3c4d' };
  const table = [
    { pid: 10, ppid: 1, rss: 100, command: 'node bin/agentbox.mjs --dir /tmp/i/data' },
    { pid: 11, ppid: 10, rss: 5, command: `/usr/bin/perl /repo/scripts/cloud-shim.pl ${sock} -p --output-format stream-json --permission-prompt-tool mcp__zero-approvals__approval_prompt` },
    { pid: 12, ppid: 10, rss: 5, command: `/usr/bin/perl /repo/scripts/cloud-shim.pl ${sock} --agentbox-codex app-server` },
    { pid: 13, ppid: 10, rss: 70, command: '/home/u/.local/share/claude/versions/2.1.302 -p --output-format stream-json --permission-prompt-tool mcp__zero-approvals__approval_prompt' },
    { pid: 14, ppid: 1, rss: 90, command: `/repo/node_modules/electron/dist/Electron /repo/main/cloud/host.mjs ${sock}` },
    { pid: 15, ppid: 10, rss: 20, command: 'node /repo/mcp/server.mjs --store /tmp/i/store' },
    { pid: 20, ppid: 1, rss: 300, command: 'claude -p You are Maya --output-format stream-json' },
    { pid: 30, ppid: 1, rss: 400, command: '/opt/chrome --user-data-dir=/tmp/i/chrome-profile' },
    { pid: 40, ppid: 1, rss: 280, command: `/Users/x/app/node_modules/electron/dist/Electron /Users/x/app/main/cloud/host.mjs ${hers}` },
    { pid: 41, ppid: 1, rss: 5, command: `/usr/bin/perl /Users/x/app/scripts/cloud-shim.pl ${hers} -p --permission-prompt-tool mcp__zero-approvals__approval_prompt` },
  ];

  it('counts a cloud run as a cloud run, not as one more agent on this Mac', () => {
    const p = instanceProcesses(state, table);
    expect(p.workers).toBe(1);
    expect(p.cloudRuns).toBe(2);
  });

  it('a sleep stops the app, its workers, its cloud relay and every stand-in, and nothing of the tester\'s or of her own app', () => {
    const stop = sleepTargets(state, table).sort((x, y) => x - y);
    expect(stop).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('a copy off the cloud has no relay of its own to stop', () => {
    const stop = sleepTargets({ pid: 10, instance: '/tmp/i' }, table);
    expect(stop).not.toContain(14);
    expect(stop).not.toContain(40);
  });
});
