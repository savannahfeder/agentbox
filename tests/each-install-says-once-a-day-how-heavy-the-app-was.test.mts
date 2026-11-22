// NOTHING SAID HOW HEAVY AGENTBOX WAS ON THE MACS OF THE PEOPLE USING IT.
//
// Real users are being set up, and the only machine anyone could measure was
// the person's own: its memory log stays on the computer that wrote it. Read
// from PostHog for the week to 2026-11-22: 56 installs were used, 54 of them
// Macs, and the only signs of a heavy app were 3 installs whose agents were
// held for memory and 3 that sent crash reports. Nothing said how much memory
// or CPU the app itself took, or how often it froze.
//
// So once a day, with the other counts and under the same switch, an install
// sends one more: how heavy the app was on the last day it was open, as nine
// numbers read from its own memory and freeze logs. No names, no paths, and
// the day itself is never sent twice.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENTS, sanitize } from '../shared/analytics-events.mts';
import { summarizeHealthDay, sendLastDaysHealth } from '../main/health-day.mts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'health-')); dirs.push(d); return d; };
const lines = (dir: string, file: string, rows: object[]) => fs.writeFileSync(path.join(dir, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const own = (mb: number, main: number, cpu: number | null, wakeups = 0) => ({ mb, cpu, wakeups, main: { mb: main, cpu, wakeups }, windows: { mb: 0, cpu: 0, wakeups: 0 }, gpu: { mb: 0, cpu: 0, wakeups: 0 }, helpers: { mb: 0, cpu: 0, wakeups: 0 } });

function aDay(dir: string, day: string) {
  lines(dir, `memory-${day}.jsonl`, [
    { at: `${day}T09:00:00Z`, pressure: 'normal', running: 0, own: own(500, 200, null), app: { mb: 640 } },
    { at: `${day}T09:01:00Z`, pressure: 'normal', running: 0, own: own(520, 210, 1.0, 90) },
    { at: `${day}T09:02:00Z`, pressure: 'tight', running: 2, own: own(900, 400, 8.0, 300), app: { mb: 1100 } },
    { at: `${day}T09:03:00Z`, pressure: 'critical', running: 1, own: own(3100, 2900, 6.0, 200) },
    { at: `${day}T09:04:00Z`, pressure: 'normal', running: 0, own: own(700, 300, 2.0, 110) },
    // The memory recorder's heap line shares the file and is not a minute.
    { at: `${day}T09:04:30Z`, upMin: 4, heapMb: 31 },
  ]);
  lines(dir, `freeze-${day}.jsonl`, [{ at: `${day}T09:02:10Z`, ms: 620 }, { at: `${day}T09:03:10Z`, ms: 2400 }]);
}

describe('how heavy the app was on a day', () => {
  it('is a count on the approved list, and only numbers go', () => {
    expect(EVENTS.app_health).toBe('How heavy the app was on a day');
    const props = { appMb: 3100, mainMb: 2900, idleCpu: 1.5, busyCpu: 7, wakeups: 100, freezes: 2, freezeSeconds: 2.4, tightMinutes: 2, hours: 0.1 };
    expect(sanitize('app_health', props)).toEqual(props);
    expect(sanitize('app_health', { appMb: '3 GB', name: 'a-repo', mainMb: 10 })).toEqual({ mainMb: 10 });
  });

  it('reads the day from the memory and freeze logs', () => {
    const dir = tmp();
    aDay(dir, '2026-11-21');
    expect(summarizeHealthDay(dir, '2026-11-21')).toEqual({
      appMb: 3100, mainMb: 2900, idleCpu: 1.5, busyCpu: 7, wakeups: 100, freezes: 2, freezeSeconds: 2.4, tightMinutes: 2, hours: 0.1,
    });
  });

  it('falls back to the whole listing on a day logged before the app read its own use', () => {
    const dir = tmp();
    lines(dir, 'memory-2026-11-20.jsonl', [{ at: '2026-11-20T09:00:00Z', pressure: 'normal', running: 0, app: { mb: 800 } }]);
    expect(summarizeHealthDay(dir, '2026-11-20')).toEqual({ appMb: 800, freezes: 0, tightMinutes: 0, hours: 0 });
  });

  it('has nothing to say for a day the app was not open', () => {
    expect(summarizeHealthDay(tmp(), '2026-11-19')).toBeNull();
  });
});

describe('sending it', () => {
  const NOW = new Date(2026, 10, 22, 9, 30).getTime();
  const local = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  it('sends the last day the app was open, once, and never today', () => {
    const dir = tmp();
    aDay(dir, local(2026, 11, 22));
    aDay(dir, local(2026, 11, 20));
    const sent: [string, Record<string, unknown>][] = [];
    const track = (name: string, props: Record<string, unknown>) => { sent.push([name, props]); return true; };
    sendLastDaysHealth({ dir, now: NOW, track });
    sendLastDaysHealth({ dir, now: NOW + 3_600_000, track });
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe('app_health');
    expect(sent[0][1]).toMatchObject({ appMb: 3100, freezes: 2 });
  });

  it('sends the next day in its turn', () => {
    const dir = tmp();
    aDay(dir, local(2026, 11, 21));
    const sent: string[] = [];
    sendLastDaysHealth({ dir, now: NOW, track: () => { sent.push('yesterday'); return true; } });
    aDay(dir, local(2026, 11, 22));
    sendLastDaysHealth({ dir, now: NOW + 24 * 3_600_000, track: () => { sent.push('today'); return true; } });
    expect(sent).toEqual(['yesterday', 'today']);
  });

  it('tries again later when the count was not sent, as with the switch off', () => {
    const dir = tmp();
    aDay(dir, local(2026, 11, 21));
    let on = false;
    const sent: number[] = [];
    const track = () => { if (on) sent.push(1); return on; };
    sendLastDaysHealth({ dir, now: NOW, track });
    on = true;
    sendLastDaysHealth({ dir, now: NOW + 60_000, track });
    expect(sent).toHaveLength(1);
  });

  it('sends nothing when no earlier day was logged', () => {
    const dir = tmp();
    aDay(dir, local(2026, 11, 22));
    let called = false;
    sendLastDaysHealth({ dir, now: NOW, track: () => { called = true; return true; } });
    expect(called).toBe(false);
  });
});
