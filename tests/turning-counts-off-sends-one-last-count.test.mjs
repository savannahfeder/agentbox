// TURNING COUNTS OFF SENDS ONE LAST COUNT SAYING SO, THEN NOTHING.
//
// Switching "Counts and crash reports" off stopped every send at once, so an
// install that opted out went silent and the daily report read it as someone
// who stopped using the app: out of daily use, and "did not come back" in
// retention. There was no way to tell the two apart (asked 2026-10-16). Now the
// switch going off sends `counts_turned_off` first, and the report leaves that
// install out of retention from then on.
//
// The cases:
//   · the count is on the approved list and carries nothing;
//   · only the switch going OFF is counted: on, other keys and no key are not;
//   · it is sent and flushed before the switch is saved, because once saved
//     nothing more leaves;
//   · after it, nothing else is sent.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { EVENTS, sanitize } from '../shared/analytics-events.mjs';
import { createAnalytics } from '../main/analytics.mjs';
import { countsTurnedOff } from '../main/settings.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('the last count', () => {
  it('is on the approved list and carries nothing', () => {
    expect(EVENTS.counts_turned_off).toBe('Counts were turned off');
    expect(sanitize('counts_turned_off', { title: 'her row' })).toEqual({});
  });

  it('is sent only when the switch goes off', () => {
    expect(countsTurnedOff({ key: 'diagnostics', value: false })).toBe(true);
    expect(countsTurnedOff({ key: 'diagnostics', value: true })).toBe(false);
    expect(countsTurnedOff({ key: 'cornerTag', value: false })).toBe(false);
    expect(countsTurnedOff({})).toBe(false);
    expect(countsTurnedOff(undefined)).toBe(false);
  });

  it('is sent and flushed before the switch is saved', () => {
    const ipc = read('main/ipc.mjs');
    const at = ipc.indexOf("ipcMain.handle('zero:settings-set-workspace',");
    const body = ipc.slice(at, at + 600);
    const told = body.indexOf("if (countsTurnedOff(payload)) { analytics.track('counts_turned_off'); analytics.flush(); }");
    expect(told).toBeGreaterThan(-1);
    expect(told).toBeLessThan(body.indexOf('setWorkspaceSetting('));
  });

  it('is the last thing sent', () => {
    const sent = [];
    const client = { capture: (p) => sent.push(p.event), flush: async () => {}, shutdown: async () => {} };
    const config = {};
    const analytics = createAnalytics({ config, version: '0.1.15', client });
    analytics.track('counts_turned_off');
    config.diagnostics = false;
    analytics.track('task_opened');
    analytics.track('counts_turned_off');
    expect(sent).toEqual(['counts_turned_off']);
  });
});
