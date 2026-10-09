// THE ONE THING A `renderer-gone` REPORT IS FOR, AND IT WAS THE ONE THING IT
// DID NOT CARRY.
//
// `installCrashReports` listens for Electron's `render-process-gone` and
// `child-process-gone` and passes `details.reason` and `details.exitCode`
// through as extras, with a comment saying why they are safe: `reason` is
// Electron's own closed vocabulary (`clean-exit`, `abnormal-exit`, `killed`,
// `crashed`, `oom`, `launch-failed`, `integrity-failure`) and carries nothing
// of anyone's. `report` scrubs them and writes them to disk.
//
// And then `crashTransport` in main/analytics.mjs listed the five properties it
// sends by hand, and those were not among them. Measured in PostHog on
// 2026-10-08 by listing the keys on every `renderer-gone` event since the Oct 6
// launch: app_version, crash_kind, error, happened_at, os_*, report_version,
// up_ms. No reason, no exit code. So the launch report's one dead window says
// `render process gone` and nothing else, and whether that install ran out of
// memory after three and a half hours or took a hard fault is unanswerable
// from the data.
//
// `oom` and `crashed` are different bugs with different fixes, and the field
// that tells them apart was already being collected and thrown away at the
// last step.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnalytics } from '../main/analytics.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-why-died-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

function fakeClient() {
  const sent = [];
  return { sent, capture: (e) => sent.push(e), flush: async () => {}, shutdown: async () => {} };
}

// What `report('renderer-gone', ...)` leaves on disk, extras and all.
const windowGone = (extra) => ({
  v: 1,
  kind: 'renderer-gone',
  ts: '2026-10-07T03:09:21.920Z',
  upMs: 13_543_000,
  app: { name: 'Agentbox', version: '0.1.11' },
  error: { name: 'Error', code: null, syscall: null, message: 'render process gone', site: 'app:main/crash-report.mjs:140', frames: [], framesDropped: 0 },
  ...extra,
});

describe('what a dead window reports', () => {
  // THE REPORTED ONE: the launch week report that says only "render process
  // gone". Out of memory is a leak and a different fix from a hard fault.
  it('carries the reason Electron gave', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport(windowGone({ reason: 'oom', exitCode: -1 }));

    expect(client.sent[0].properties.crash_reason).toBe('oom');
    expect(client.sent[0].properties.exit_code).toBe(-1);
  });

  // The boundary either side of it: the other reason, which is the same field
  // meaning the opposite thing about what to fix.
  it('tells a hard fault apart from running out of memory', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport(windowGone({ reason: 'crashed', exitCode: 133 }));

    expect(client.sent[0].properties.crash_reason).toBe('crashed');
    expect(client.sent[0].properties.exit_code).toBe(133);
  });

  // A dead child process also names WHICH kind of child, which is the
  // difference between the GPU falling over and a utility process doing so.
  it('names which kind of child process went', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport({ ...windowGone({ reason: 'crashed', exitCode: 5, processType: 'GPU' }), kind: 'child-gone' });

    expect(client.sent[0].properties.crash_kind).toBe('child-gone');
    expect(client.sent[0].properties.process_type).toBe('GPU');
  });

  // THE CASE THAT MUST NOT MATCH. Every other kind has no extras at all, and
  // they may not arrive as empty strings and nulls that read as real answers
  // in a chart.
  it('sends no reason for a crash that has none', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport({ ...windowGone(), kind: 'main-rejection' });

    const { properties } = client.sent[0];
    expect('crash_reason' in properties).toBe(false);
    expect('exit_code' in properties).toBe(false);
    expect('process_type' in properties).toBe(false);
  });

  // AND THE RULE THAT OUTRANKS ALL OF IT. These are three more strings leaving
  // the machine, so they are three more strings the scrub check covers: a
  // report that fails it is still dropped WHOLE rather than trimmed, and a
  // reason is not a hole in that.
  it('still drops the whole report when an extra looks private', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport(windowGone({ reason: `${os.homedir()}/Desktop/dev/acme`, exitCode: -1 }));

    expect(client.sent[0].properties.crash_kind).toBe('redacted');
    expect(JSON.stringify(client.sent[0])).not.toContain('acme');
    expect(JSON.stringify(client.sent[0])).not.toContain(os.homedir());
  });

  // A reason is a word from a closed list, so a long one is a bug somewhere
  // upstream rather than a reason, and it is not sent as if it were.
  it('refuses a reason that is not one of Electron’s words', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport(windowGone({ reason: 'x'.repeat(400), exitCode: -1 }));

    expect(client.sent[0].properties.crash_reason).toBeUndefined();
  });
});
