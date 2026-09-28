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
// Every payload is built by `shared/crash-scrub.mjs`'s allowlist and then
// checked again by `findPrivate` before it is written. A report that fails the
// check is not sent minus the bad field; the whole report is dropped and a
// counter is written instead, because a scrub that quietly half-works is how a
// promise on the page turns into a lie.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPrivate, scrubError, scrubText } from '../shared/crash-scrub.mjs';
import { readInstallId } from '../shared/install-id.mjs';
import { NAME, nameSlug } from '../shared/product-name.mjs';

const MAX_KEPT = 50;

let ctx = null;          // { home, username, appDir, dir, version, startedAt }
let transport = null;    // set once she picks where reports go
let installId = null;
let fired = false;       // one hard crash is one report, never a loop

// The same random per-install id the approved counts use, and it now lives in
// ONE file (`shared/install-id.mjs`) because two copies of "it is not a
// fingerprint" is one copy too many. No account, no email, no machine id.

export function report(kind, err, extra = {}) {
  if (!ctx) return null;
  const payload = {
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

function write(payload) {
  try {
    fs.mkdirSync(ctx.dir, { recursive: true });
    const file = path.join(ctx.dir, `crash-${payload.ts.replace(/[:.]/g, '-')}-${Math.floor(Math.random() * 1e6)}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    prune();
    // No await, no retry, no queue drain here: this runs while the process is
    // dying. Delivery is the transport's problem, on the next boot if it has to be.
    if (transport) { try { transport(payload); } catch {} }
    return file;
  } catch { return null; }
}

function prune() {
  try {
    const files = fs.readdirSync(ctx.dir).filter((f) => f.startsWith('crash-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_KEPT))) {
      fs.unlinkSync(path.join(ctx.dir, f));
    }
  } catch {}
}

// Her pick on lands here and nowhere else.
export function setTransport(fn) { transport = typeof fn === 'function' ? fn : null; }

export function pending() {
  try {
    return fs.readdirSync(ctx.dir).filter((f) => f.startsWith('crash-')).map((f) => path.join(ctx.dir, f));
  } catch { return []; }
}

export function installCrashReports({ app, appDir, dir, version, crashReporter } = {}) {
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

  const onUncaught = (err) => {
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

  const onRejection = (reason) => {
    report('main-rejection', reason instanceof Error ? reason : new Error(String(reason)));
  };
  process.on('unhandledRejection', onRejection);

  if (app?.on) {
    // The window's process died. `details.reason` is Electron's own vocabulary
    // (`crashed`, `oom`, `killed`) and carries nothing of theirs.
    app.on('render-process-gone', (_e, _wc, details = {}) => {
      report('renderer-gone', new Error('render process gone'), { reason: String(details.reason || 'unknown'), exitCode: Number(details.exitCode ?? -1) });
    });
    app.on('child-process-gone', (_e, details = {}) => {
      report('child-gone', new Error('child process gone'), { reason: String(details.reason || 'unknown'), processType: String(details.type || 'unknown'), exitCode: Number(details.exitCode ?? -1) });
    });
  }
  return { report, pending, dir: ctx.dir };
}

// The renderer's uncaught errors arrive here over IPC. They are the ones most
// likely to carry a task title inside the message, which is why they go through
// exactly the same scrub as everything else and get no shortcut of their own.
export function reportFromRenderer(payload = {}) {
  return report('renderer-error', {
    name: typeof payload.name === 'string' ? payload.name : 'Error',
    message: typeof payload.message === 'string' ? payload.message : 'renderer error',
    stack: typeof payload.stack === 'string' ? payload.stack : '',
  });
}
