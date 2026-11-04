// When Agentbox breaks on a stranger's Mac, somebody has to find out. Today
// nothing catches anything: the window closes, they stop opening it, and the
// only trace is one more download. Her yes, 2026-08-19.
//
// What this file is: the four ways the app can die, one scrubbed report each,
// and a queue on disk. What it is NOT, deliberately: a network client. Where
// reports go is her open pick on (PostHog from the main process, or Aptabase),
// and picking it here would be an agent choosing the third party that receives
// a stranger's crashes. So `setTransport` is the seam and until something is
// passed to it, a report is written to disk and nothing leaves the machine.
// That is also the honest default for a build we have not shipped yet.
//
// Every payload is built by `shared/crash-scrub.mts`'s allowlist and then
// checked again by `findPrivate` before it is written. A report that fails the
// check is not sent minus the bad field; the whole report is dropped and a
// counter is written instead, because a scrub that quietly half-works is how a
// promise on the page turns into a lie.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPrivate, scrubError, scrubText } from '../shared/crash-scrub.mts';
import { readInstallId } from '../shared/install-id.mts';
import { NAME, nameSlug } from '../shared/product-name.mjs';

const MAX_KEPT = 50;

export interface CrashContext {
  home: string;
  username: string | null;
  appDir: string;
  dir: string;
  version: string;
  startedAt: number;
}

export type CrashPayload = {
  v: number;
  kind: string;
  ts: string;
  installId: string | null;
  app: { name: string; version: string };
  os: { platform: string; release: string; arch: string };
  [key: string]: unknown;
};

export type CrashTransport = (payload: CrashPayload) => unknown;

let ctx: CrashContext | null = null;          // { home, username, appDir, dir, version, startedAt }
let transport: CrashTransport | null = null;    // set once she picks where reports go
let installId: string | null = null;
let fired = false;       // one hard crash is one report, never a loop

// The same random per-install id the approved counts use, and it now lives in
// ONE file (`shared/install-id.mts`) because two copies of "it is not a
// fingerprint" is one copy too many. No account, no email, no machine id.

export function report(kind: string, err: unknown, extra: Record<string, unknown> = {}): string | null {
  if (!ctx) return null;
  const payload: CrashPayload = {
    v: 1,
    kind,                                   // where it died, not what was on screen
    ts: new Date().toISOString(),
    installId,
    app: { name: NAME, version: ctx.version },
    os: { platform: process.platform, release: os.release(), arch: process.arch },
    // How long it had been open. Useful (a crash at 3 seconds is a boot bug and
    // a crash at 3 hours is a leak) and carries nothing about anyone.
    upMs: Date.now() - ctx.startedAt,
    error: scrubError(err, ctx),
  };
  // Extras are scrubbed exactly like the error, and only strings and numbers
  // survive at all, so no future caller can widen this by passing an object.
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'number') payload[k] = v;
    else if (typeof v === 'string') payload[k] = scrubText(v, ctx);
  }

  const leaks = findPrivate(payload, ctx);
  if (leaks.length) {
    // The scrub failed. Say that we crashed and say nothing else.
    return write({ v: 1, kind: 'redacted', ts: payload.ts, installId, app: payload.app, os: payload.os, reason: 'scrub check failed', fields: leaks.length });
  }
  return write(payload);
}

// THE ONE KIND WHOSE PROCESS DOES NOT SURVIVE BEING REPORTED. `onUncaught`
// re-throws, by the decision three lines below where it does it, so the main
// process stops. posthog-node's `capture` only buffers (flushAt 20,
// flushInterval 10s), and the `will-quit` flush never runs for a process that
// died, so for this kind the file on disk is the only copy that can reach
// anybody. It is therefore kept even when the live send said it took the
// report: one report counted twice is a worse number, and no report at all is
// a worse app.
const DIES_REPORTING = new Set(['main-uncaught']);

function write(payload: CrashPayload): string | null {
  try {
    fs.mkdirSync(ctx!.dir, { recursive: true });
    const file = path.join(ctx!.dir, `crash-${payload.ts.replace(/[:.]/g, '-')}-${Math.floor(Math.random() * 1e6)}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    prune();
    // ON DISK FIRST, ALWAYS, because this can run while the process is dying
    // and there is no time to wait on a socket. No await, no retry.
    //
    // AND THEN TAKEN BACK OFF IT IF IT WENT. The queue is for a report nobody
    // has sent yet; a report that HAS been sent and stays in it is sent a
    // second time by the next launch's `drainCrashes`, which is 6 of the 21
    // crash events since the Oct 6 launch being 6 crashes counted twice, and
    // three of them filed against the version that drained them rather than
    // the one they happened on (PostHog, 2026-10-08).
    if (transport) {
      let took = false;
      try { took = transport(payload) !== false; } catch { took = false; }
      if (took && !DIES_REPORTING.has(payload.kind)) {
        try { fs.unlinkSync(file); } catch {}
      }
    }
    return file;
  } catch { return null; }
}

function prune(): void {
  try {
    const files = fs.readdirSync(ctx!.dir).filter((f) => f.startsWith('crash-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_KEPT))) {
      fs.unlinkSync(path.join(ctx!.dir, f));
    }
  } catch {}
}

// Her pick on lands here and nowhere else.
export function setTransport(fn?: CrashTransport | null): void { transport = typeof fn === 'function' ? fn : null; }

export function pending(): string[] {
  try {
    return fs.readdirSync(ctx!.dir).filter((f) => f.startsWith('crash-')).map((f) => path.join(ctx!.dir, f));
  } catch { return []; }
}

export interface CrashReportOptions {
  app?: { on(event: string, listener: (...args: never[]) => void): unknown } | null;
  appDir?: string;
  dir?: string;
  version?: string;
  crashReporter?: { start(options: Record<string, unknown>): unknown } | null;
}

export function installCrashReports({ app, appDir, dir, version, crashReporter }: CrashReportOptions = {}) {
  ctx = {
    home: os.homedir(),
    username: (() => { try { return os.userInfo().username; } catch { return null; } })(),
    // realpath, because macOS hands `/tmp` back as `/private/tmp` and a stack
    // frame written the other way then reads as somebody else's code and gets
    // dropped. The frames inside our bundle are the entire point of the report.
    appDir: (() => { const d = appDir || process.cwd(); try { return fs.realpathSync(d); } catch { return d; } })(),
    dir: dir || path.join(os.tmpdir(), `${nameSlug}-crash-reports`),
    version: version || '0.0.0',
    startedAt: Date.now(),
  };
  installId = readInstallId(ctx.dir);

  // Native crashes (the renderer's own process dying, a GPU fault) leave a
  // minidump rather than a JS stack. `uploadToServer: false` is not a setting
  // that could be flipped by accident: with no destination decided there is no
  // submit URL to flip it to, so the dumps sit in the app's own folder.
  if (crashReporter) {
    try { crashReporter.start({ uploadToServer: false, compress: true, ignoreSystemCrashHandler: false }); } catch {}
  }

  const onUncaught = (err: unknown): void => {
    if (fired) return;
    fired = true;
    report('main-uncaught', err);
    // Put the default back rather than living on in a state Electron never
    // designed for. A reporter that silently swallows a fatal error turns "it
    // crashed" into "it froze", which is worse for the person holding the Mac.
    process.removeListener('uncaughtException', onUncaught);
    throw err;
  };
  process.on('uncaughtException', onUncaught);

  const onRejection = (reason: unknown): void => {
    report('main-rejection', reason instanceof Error ? reason : new Error(String(reason)));
  };
  process.on('unhandledRejection', onRejection);

  if (app?.on) {
    // The window's process died. `details.reason` is Electron's own vocabulary
    // (`crashed`, `oom`, `killed`) and carries nothing of theirs.
    app.on('render-process-gone', (_e: unknown, _wc: unknown, details: { reason?: unknown; exitCode?: unknown } = {}) => {
      report('renderer-gone', new Error('render process gone'), { reason: String(details.reason || 'unknown'), exitCode: Number(details.exitCode ?? -1) });
    });
    app.on('child-process-gone', (_e: unknown, details: { reason?: unknown; type?: unknown; exitCode?: unknown } = {}) => {
      report('child-gone', new Error('child process gone'), { reason: String(details.reason || 'unknown'), processType: String(details.type || 'unknown'), exitCode: Number(details.exitCode ?? -1) });
    });
  }
  return { report, pending, dir: ctx.dir };
}

// The renderer's uncaught errors arrive here over IPC. They are the ones most
// likely to carry a task title inside the message, which is why they go through
// exactly the same scrub as everything else and get no shortcut of their own.
export function reportFromRenderer(payload: { name?: unknown; message?: unknown; stack?: unknown } = {}) {

  return report('renderer-error', {
    name: typeof payload.name === 'string' ? payload.name : 'Error',
    message: typeof payload.message === 'string' ? payload.message : 'renderer error',
    stack: typeof payload.stack === 'string' ? payload.stack : '',
  });
}
