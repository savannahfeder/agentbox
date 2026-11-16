// REFRESH ASKS CODEX FOR THE LIVE USAGE, AND NOTHING ELSE DOES.
//
// What broke (QA, 2026-11-15): Settings › Codex showed "Week 67%, Checked 42
// hours ago" on a computer that had not run Codex for two days, while the same
// login had worked elsewhere. Refresh only re-read Codex's session logs on
// disk, so it changed nothing; the first Codex run then reported 83%. The only
// place the live figure exists is OpenAI, which Codex's app-server asks with
// `account/rateLimits/read`. The person agreed to that call on Refresh only.
//
// Measured here: a fake app-server's request log (what was asked) and the
// reading Settings gets back after a press.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askCodexForUsage, ASK_DEADLINE_MS } from '../main/codex-usage-on-refresh.mts';
import { CodexUsage } from '../main/codex-usage.mts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const code = (p: string) => readFileSync(join(root, p), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const LIVE = {
  rateLimits: {
    limitId: 'codex',
    primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1794790000 },
    secondary: { usedPercent: 83, windowDurationMins: 10080, resetsAt: 1795000000 },
  },
};
const OLD_LOG = {
  snapshot: {
    primary: { used_percent: 40, window_minutes: 300, resets_at: 1794700000 },
    secondary: { used_percent: 67, window_minutes: 10080, resets_at: 1795000000 },
  },
};

describe('a press of Refresh', () => {
  it('asks the app-server for the rate limits, once, and the live figure replaces a 42 hour old one', async () => {
    const now = 1794775000000;
    const usage = new CodexUsage({ home: () => '/h', now: () => now, readLog: () => ({ ...OLD_LOG, at: now - 42 * 3600_000 }) });
    expect(usage.read()!.limits.map((l) => l.percent)).toEqual([40, 67]);

    const asked: string[] = [];
    const answer = await askCodexForUsage(async (method) => { asked.push(method); return LIVE; });
    usage.took(answer, '/h');

    expect(asked).toEqual(['account/rateLimits/read']);
    const reading = usage.read()!;
    expect(reading.limits.map((l) => l.percent)).toEqual([12, 83]);
    expect(reading.at).toBe(now);
  });

  it('gives up at its deadline instead of holding the button', async () => {
    const started = Date.now();
    await expect(askCodexForUsage(() => new Promise(() => {}), { deadlineMs: 30 })).rejects.toThrow(/did not answer/);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ASK_DEADLINE_MS).toBeLessThanOrEqual(30_000);
  });

  it('keeps the older reading when Codex answers with an error or no window', async () => {
    const now = 1794775000000;
    const usage = new CodexUsage({ home: () => '/h', now: () => now, readLog: () => ({ ...OLD_LOG, at: now - 3600_000 }) });
    await expect(askCodexForUsage(async () => { throw new Error('codex account authentication required to read rate limits'); })).rejects.toThrow(/authentication/);
    usage.took({ rateLimits: {} }, '/h');
    usage.took(null, '/h');
    expect(usage.read()!.limits.map((l) => l.percent)).toEqual([40, 67]);
  });

  it('is not taken for a login that is not the one the page is about', () => {
    const usage = new CodexUsage({ home: () => '/one', readLog: () => null });
    expect(usage.took(LIVE, '/two')).toBe(false);
    expect(usage.read()).toBe(null);
  });
});

describe('nothing but the press asks', () => {
  it('names the request in the asking file alone', () => {
    for (const file of ['main/codex-usage.mts', 'shared/codex-usage.mts', 'main/supervisor.mts', 'main/ipc.mts', 'main/codex-app-server.mts']) {
      expect(code(file)).not.toContain('account/rateLimits/read');
    }
    expect(code('main/codex-usage-on-refresh.mts')).toContain("'account/rateLimits/read'");
  });

  it('is reached only when the main process is told the person pressed it', () => {
    const ipc = code('main/ipc.mts');
    expect(ipc).toMatch(/ask \? await supervisor\.askCodexUsage\(\) : supervisor\.refreshCodexUsage\(\)/);
    expect(code('main/supervisor.mts').match(/askCodexForUsage\(/g)).toHaveLength(1);
  });

  it('is asked by the button and not by opening the page', () => {
    const settings = code('renderer/src/components/Settings.tsx');
    expect(settings).toContain("refreshCodex(true)");
    expect(settings).toContain("if (pane !== 'codex') return; void refreshCodex();");
  });
});
