// EVERY CRASH NUMBER SINCE THE LAUNCH WAS COUNTING SOME CRASHES TWICE, AND
// FILING SOME OF THEM AGAINST THE WRONG VERSION AND THE WRONG DAY.
//
// Measured in PostHog on 2026-10-08, by grouping `crash_report` on
// `properties.happened_at`, which is the moment the report was BUILT rather
// than the moment it was sent. 21 events since the Oct 6 launch, of which 6
// pairs share a `happened_at`: 14 real crashes sent as 21 events.
//
// WHY. `write` in main/crash-report.mjs puts the report on disk and then hands
// it to the live transport, and it never removed the file afterwards. So the
// queue on disk, which exists for a report written by a process too far gone to
// send it, also held every report that HAD been sent, and the next launch's
// `drainCrashes` sent the lot again. The console line at that call site even
// says "from a previous launch", which is what it was built to be.
//
// AND THE SECOND HALF, which is worse than a double count because it points at
// the wrong release. `crashTransport` stamps every event with the running
// app's `app_version`, so a report drained on a later launch carries the
// version that drained it. Three of the six "renderer errors on 0.1.12" in the
// launch report are 0.1.11 crashes, re-sent at 04:37 on Oct 8 by an install
// that had updated overnight. 0.1.12 was being asked to answer for them.
//
// THE ONE REPORT THAT MUST STILL BE KEPT after a live send: `main-uncaught`.
// `onUncaught` re-throws, so that process is about to stop, and posthog-node's
// `capture` only buffers (flushAt 20, flushInterval 10s, and
// `analytics.flush()` on `will-quit` never runs for a process that died). For
// that one kind the file on disk is the only copy that can survive, so a
// duplicate is the right trade and losing the report is not.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnalytics } from '../main/analytics.mjs';
import { installCrashReports, setTransport } from '../main/crash-report.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-one-crash-')); });
afterEach(() => {
  setTransport(null);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

const queued = () => fs.readdirSync(dir).filter((f) => f.startsWith('crash-'));

// A transport that answers the way `crashTransport` does: true when it took the
// report, false when the switch is off or there is nowhere to send.
function transport({ accepts = true } = {}) {
  const took = [];
  setTransport((payload) => { took.push(payload); return accepts; });
  return took;
}

const install = () => installCrashReports({ appDir: process.cwd(), dir, version: '0.1.12' });

describe('a report the live send took is not left for the next launch', () => {
  // THE REPORTED ONE. Six crashes, twelve events.
  it('leaves nothing queued after a window error is sent', () => {
    const took = transport();
    const { report } = install();

    report('renderer-error', new Error('boom'));

    expect(took).toHaveLength(1);
    expect(queued()).toEqual([]);
  });

  it('leaves nothing queued after a main-process rejection is sent', () => {
    transport();
    const { report } = install();

    report('main-rejection', new Error('net::ERR_CONNECTION_RESET'));

    expect(queued()).toEqual([]);
  });

  // THE BOUNDARY ON ONE SIDE. A send that was refused keeps its file, because
  // the queue is what it was built to be: the copy for a report that has not
  // gone yet.
  it('keeps the file when the live send was refused', () => {
    const took = transport({ accepts: false });
    const { report } = install();

    report('renderer-error', new Error('boom'));

    expect(took).toHaveLength(1);
    expect(queued()).toHaveLength(1);
  });

  // THE BOUNDARY ON THE OTHER. No transport at all is a copy of the app run
  // from source, which sends nothing and keeps everything.
  it('keeps the file when there is nowhere to send at all', () => {
    const { report } = install();

    report('renderer-error', new Error('boom'));

    expect(queued()).toHaveLength(1);
  });

  // AND THE CASE THAT MUST NOT CHANGE, for the reason in the header: this
  // process is about to stop and a buffered capture will not survive it.
  it('keeps a fatal main-process error even though the live send took it', () => {
    const took = transport();
    const { report } = install();

    report('main-uncaught', new Error('boom'));

    expect(took).toHaveLength(1);
    expect(queued()).toHaveLength(1);
  });

  // The file the caller is handed is still a file, because two existing tests
  // read the report back off it to check the scrub.
  it('still answers with a readable file when nothing was sent', () => {
    const { report } = install();
    const file = report('renderer-error', new Error('boom'));

    expect(JSON.parse(fs.readFileSync(file, 'utf8')).kind).toBe('renderer-error');
  });
});

describe('a report says which version it crashed on, not which one sent it', () => {
  const fakeClient = () => {
    const sent = [];
    return { sent, capture: (e) => sent.push(e), flush: async () => {}, shutdown: async () => {} };
  };

  const crashedOn = {
    v: 1,
    kind: 'renderer-error',
    ts: '2026-10-07T15:47:45.665Z',
    upMs: 489_000,
    app: { name: 'Agentbox', version: '0.1.11' },
    error: { name: 'Error', code: null, syscall: null, message: 'boom', site: null, frames: [], framesDropped: 0 },
  };

  // THE REPORTED ONE: an install that crashed on 0.1.11 and drained the queue
  // after updating to 0.1.12 filed it against 0.1.12.
  it('keeps the crashed version when a later launch drains the queue', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    expect(a.crashTransport(crashedOn)).toBe(true);
    expect(client.sent[0].properties.app_version).toBe('0.1.11');
  });

  // The ordinary case, where they are the same, has to keep saying so.
  it('says the running version when that is the one that crashed', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.11', client });

    a.crashTransport(crashedOn);
    expect(client.sent[0].properties.app_version).toBe('0.1.11');
  });

  // AND THE CASE THAT MUST NOT BREAK: a report with no version on it at all,
  // which is what a `redacted` one carries if the scrub check ever drops the
  // app block. The running version is the only answer left, and it beats none.
  it('falls back to the running version when the report carries none', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.crashTransport({ ...crashedOn, app: undefined });
    expect(client.sent[0].properties.app_version).toBe('0.1.12');
  });

  // Every other event is untouched by this: the running version is the right
  // answer for anything that is not a report about the past.
  it('still stamps an ordinary count with the running version', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '0.1.12', client });

    a.track('app_opened');
    expect(client.sent[0].properties.app_version).toBe('0.1.12');
  });
});
