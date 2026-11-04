// A WORKDAY STOPPED MIDWAY STILL LEAVES ITS REPORT (r-00a452c588-20261103).
//
// 2026-11-02: three testers ran three stretches and logged 38 issues, then the
// workday waited for the Codex 5-hour window and its process was gone 23
// minutes later, with no line in workday.log. report.md was only written when
// the day ended, so the next morning's run found no report and counted the day
// as failed. The report is now rewritten after every stretch, and a stop by
// signal is logged and rewrites it once more.

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeReport } from '../.claude/skills/product-loop/scripts/workday.mjs';
import { stripTypesFlags } from '../main/strip-types.mts';

const WORKDAY = path.resolve(__dirname, '../.claude/skills/product-loop/scripts/workday.mjs');

function dayWith(issues) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-report-'));
  const dir = path.join(root, 'founder');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'diary.jsonl'), issues.map((i) => JSON.stringify({ kind: 'issue', shots: [], ...i })).join('\n') + (issues.length ? '\n' : ''));
  return { root, people: [{ name: 'Ana Ruiz', slug: 'founder' }], dirs: { founder: dir } };
}

describe('the report a workday writes', () => {
  it('ranks what the diaries hold so far and says the day is still going', () => {
    const day = dayWith([
      { severity: 'confusing', title: 'Reset time has no day' },
      { severity: 'broken', title: 'Mention opens a blank screen', shots: ['blank.png'] },
    ]);
    try {
      writeReport(day.root, { ...day, stretch: 1, minutes: 30, engine: 'codex', state: 'running' });
      const report = fs.readFileSync(path.join(day.root, 'report.md'), 'utf8');
      expect(report).toContain('1 stretch of 30 minutes');
      expect(report.indexOf('[broken] Mention opens a blank screen')).toBeLessThan(report.indexOf('[confusing] Reset time has no day'));
      expect(report).toContain(path.join(day.dirs.founder, 'blank.png'));
      expect(report).toMatch(/still going/i);
    } finally { fs.rmSync(day.root, { recursive: true, force: true }); }
  });

  it('says what stopped the day when a signal did', () => {
    const day = dayWith([{ severity: 'wrong', title: 'Later starts it now' }]);
    try {
      writeReport(day.root, { ...day, stretch: 3, minutes: 30, engine: 'codex', state: 'SIGTERM' });
      const report = fs.readFileSync(path.join(day.root, 'report.md'), 'utf8');
      expect(report).toContain('3 stretches');
      expect(report).toMatch(/stopped by SIGTERM/i);
      expect(report).not.toMatch(/still going/i);
    } finally { fs.rmSync(day.root, { recursive: true, force: true }); }
  });

  it('says nobody logged an issue on a finished day with none, and nothing about stopping', () => {
    const day = dayWith([]);
    try {
      writeReport(day.root, { ...day, stretch: 1, minutes: 30, engine: 'codex', state: 'done' });
      const report = fs.readFileSync(path.join(day.root, 'report.md'), 'utf8');
      expect(report).toContain('Nobody logged an issue.');
      expect(report).not.toMatch(/still going|stopped by/i);
    } finally { fs.rmSync(day.root, { recursive: true, force: true }); }
  });
});

/** A Codex home whose last reading has the 5-hour window full for another hour, as on 2026-11-02. */
function fullWindowHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-codex-home-'));
  const now = new Date();
  const day = path.join(home, 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
  fs.mkdirSync(day, { recursive: true });
  const s = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path.join(day, 'rollout-test.jsonl'), `${JSON.stringify({
    timestamp: now.toISOString(), type: 'event_msg',
    payload: { type: 'token_count', rate_limits: {
      primary: { used_percent: 100, window_minutes: 300, resets_at: s + 3600 },
      secondary: { used_percent: 10, window_minutes: 10080, resets_at: s + 6 * 86400 },
    } },
  })}\n`);
  return home;
}

describe('a workday that is stopped', () => {
  it('logs the signal and leaves a report behind while it waits for the Codex window', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-stopped-'));
    const home = fullWindowHome();
    try {
      fs.mkdirSync(path.join(out, 'founder'));
      fs.writeFileSync(path.join(out, 'founder', 'diary.jsonl'), `${JSON.stringify({ kind: 'issue', severity: 'broken', title: 'Blank screen', shots: [] })}\n`);
      const child = spawn(process.execPath, [...stripTypesFlags(), WORKDAY, '--who', 'founder', '--pace', '--hours', '3', '--codex-home', home,
        '--url', 'http://127.0.0.1:9/', '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] });
      let said = '';
      child.stdout.on('data', (d) => { said += d; });
      const until = Date.now() + 20_000;
      while (!/pace: wait/.test(said) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
      expect(said).toMatch(/pace: wait/);
      const ended = new Promise((r) => child.on('exit', r));
      child.kill('SIGTERM');
      await ended;
      expect(said).toMatch(/stopped by SIGTERM/);
      expect(fs.readFileSync(path.join(out, 'report.md'), 'utf8')).toContain('[broken] Blank screen');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 40_000);
});
