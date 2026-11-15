// A WORKDAY KEEPS GOING AFTER THE RUN THAT STARTED IT ENDS (w-e4d49a1539).
//
// The daily product-loop run starts a ten-hour workday and finishes; the next
// day's run reads the report. Started with a plain `nohup … &`, the workday sat
// in the run's process group, so anything that ended that group ended the day
// with it, and its output went wherever the run's shell pointed. Measured
// 2026-11-02: workday.mjs had no way to start in the background at all.
// `--detach` now starts it in a session of its own, logs to workday.log beside
// report.md, prints where, and returns at once.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detachedArgv } from '../.claude/skills/product-loop/scripts/workday.mjs';
import { stripTypesFlags } from '../main/strip-types.mts';

const WORKDAY = path.resolve(__dirname, '../.claude/skills/product-loop/scripts/workday.mjs');

describe('what the detached workday is started with', () => {
  it('drops --detach and keeps every other flag', () => {
    expect(detachedArgv(['--detach', '--who', 'founder', '--pace'], '/tmp/day'))
      .toEqual(['--who', 'founder', '--pace', '--out', '/tmp/day']);
  });

  it('names the folder it chose when none was given, so the log and report land together', () => {
    expect(detachedArgv(['--detach'], '/tmp/day')).toEqual(['--out', '/tmp/day']);
  });

  it('keeps an --out that was given rather than adding a second', () => {
    expect(detachedArgv(['--out', '/tmp/mine', '--detach'], '/tmp/mine')).toEqual(['--out', '/tmp/mine']);
  });

  it('leaves a run without --detach as it was', () => {
    expect(detachedArgv(['--who', 'cto'], '/tmp/day')).toEqual(['--who', 'cto', '--out', '/tmp/day']);
  });
});

describe('a detached workday', () => {
  it('returns at once, runs in its own process group, and writes its report after the starter has gone', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-detach-'));
    try {
      const said = execFileSync(process.execPath, [...stripTypesFlags(), WORKDAY, '--detach', '--who', 'founder', '--engine', 'external',
        '--url', 'http://127.0.0.1:9/', '--stretches', '0', '--out', out], { encoding: 'utf8', timeout: 20_000 });
      const pid = Number(said.match(/pid (\d+)/)?.[1]);
      expect(pid).toBeGreaterThan(0);
      expect(said).toContain(path.join(out, 'report.md'));

      let pgid = null;
      try { pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { /* already finished */ }
      if (pgid !== null) expect(pgid).toBe(pid);

      const report = path.join(out, 'report.md');
      const until = Date.now() + 15_000;
      while (!fs.existsSync(report) && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
      expect(fs.readFileSync(report, 'utf8')).toContain('Nobody logged an issue.');
      expect(fs.readFileSync(path.join(out, 'workday.log'), 'utf8')).toContain('report:');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 30_000);
});
