// A WORKDAY LEAVES A REPORT AND A REASON, WHATEVER STOPS IT (w-e4d49a1539).
//
// The night of 2026-11-02 three Codex testers ran three stretches and logged 38
// issues with 100 screenshots. At 00:05 the Codex 5-hour window was full, the
// workday sat waiting it out, and by morning it was gone: no report.md, and its
// log ended mid-wait. It carried its starting run's task tag, and the app's
// leftover sweeper (cleanupLeftovers, on) stops a finished run's programs with
// SIGTERM when memory is tight. The report was written only at the very end, so
// the whole night read as nothing.
//
// Now a detached workday is marked AGENTBOX_KEEP, the sweeper's own rule for a
// program meant to outlive its run (it still ends at --hours); it waits before
// a stretch while memory is tight instead; it rewrites report.md after every
// stretch; and a signal writes the report and says what stopped it.

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detachedEnv, stretchMayStart } from '../.claude/skills/product-loop/scripts/workday.mjs';
import { stripTypesFlags } from '../main/strip-types.mts';

const WORKDAY = path.resolve(__dirname, '../.claude/skills/product-loop/scripts/workday.mjs');

describe('a detached workday', () => {
  it('is marked as kept, so the leftover sweeper leaves it to end at its own --hours', () => {
    expect(detachedEnv({ PATH: '/bin', ZERO_ITEM: 'w-1' })).toEqual({ PATH: '/bin', ZERO_ITEM: 'w-1', AGENTBOX_KEEP: '1' });
  });
});

describe('whether a stretch may start', () => {
  it('yes while memory is normal', () => expect(stretchMayStart('normal')).toBe(true));
  it('no while it is tight', () => expect(stretchMayStart('tight')).toBe(false));
  it('no while it is critical', () => expect(stretchMayStart('critical')).toBe(false));
});

describe('a workday stopped mid-day', () => {
  it('writes its report and says what stopped it', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-stopped-'));
    const bin = path.join(out, 'bin');
    fs.mkdirSync(bin);
    // A Codex that can sandbox and never finishes a stretch, so the day is mid-stretch when the signal lands.
    fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n[ "$1" = sandbox ] && exit 0\nexec sleep 20\n', { mode: 0o755 });
    try {
      const child = spawn(process.execPath, [...stripTypesFlags(), WORKDAY, '--who', 'founder', '--engine', 'codex', '--codex-home', out, '--pace', '--hours', '1',
        '--url', 'http://127.0.0.1:9/', '--out', out], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      let said = '';
      child.stdout.on('data', (d) => { said += d; });
      const until = Date.now() + 15_000;
      while (!said.includes('Evidence:') && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 500));
      child.kill('SIGTERM');
      await new Promise((r) => child.on('exit', r));

      expect(said).toContain('stopped by SIGTERM');
      const report = fs.readFileSync(path.join(out, 'report.md'), 'utf8');
      expect(report).toContain('Stopped by SIGTERM');
      expect(report).toContain('Nobody logged an issue.');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 30_000);
});
