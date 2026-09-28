// THE ONLY PLACE ANYTHING WE RECEIVE LEAVES THIS MACHINE. One file, the main
// process, and a list of seven counts it will refuse to grow past.
//
// IT IS NOT THE ONLY TRAFFIC ANY MORE, and the header said so until 2026-08-29.
// `main/updater.mjs` asks github.com a few times a day whether a newer Agentbox
// has been released, which reaches us not at all and is nothing to do with this
// file. `legal/privacy.html` 5.5 is where that is written down.
//
// Her yes: "yes to posthog, go ahead", on the eight counts she approved the
// same day and under her rule from 08-18: no code, no prompts, no keys, no
// paths. `legal/privacy.html` sections 4, 5 and 10 are the promise this file
// has to keep, so read them before changing anything here.
//
// FIVE THINGS ABOUT THE SHAPE, each of them load-bearing:
//
// 1. NEVER `posthog-js`, AND NEVER IN THE RENDERER. The browser SDK autocaptures
//    the text of whatever was clicked, and in Agentbox that text is task titles
//    and repo names. `posthog-node` takes only what it is handed. A test fails
//    the build if `posthog-js` ever appears under `renderer/`.
// 2. The renderer cannot send. It hands a NAME over IPC and this file decides
//    whether that name is one of hers (`shared/analytics-events.mjs`).
// 3. NOTHING IS SENT WITHOUT A DESTINATION AND THE SWITCH. No key configured
//    means no client is ever constructed. The shipped app carries a key baked
//    into its own package.json at build time; a copy run from source carries
//    none and so sends nothing at all, which is still the honest default.
// 4. THE SWITCH IS READ AT EVERY SEND, never captured at boot. Section 10 of
//    the privacy page says turning it off "stops sending from that moment", and
//    an `enabled` flag read once at startup would keep sending until the app
//    was restarted, which is that sentence being false for as long as she left
//    the window open.
// 5. Crash reports come through the seam in `main/crash-report.mjs`, already
//    scrubbed, and they are checked AGAIN here before they go. Two checks, on
//    purpose: the first one runs while the process is dying.

import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { sanitize } from '../shared/analytics-events.mjs';
import { findPrivate } from '../shared/crash-scrub.mjs';
import { readInstallId } from '../shared/install-id.mjs';
import { readEnv } from '../shared/product-name.mjs';

// PostHog's own default host. Kept here rather than left to the config so a
// typo cannot silently point a stranger's crashes somewhere else; `posthogHost`
// exists only for a self-hosted instance.
const DEFAULT_HOST = 'https://us.i.posthog.com';

// ONE SETTING, ON WHEN YOU INSTALL AGENTBOX (privacy page, section 10). Stored as
// an opt-OUT so that a config she has never touched means on, and so turning it
// off is a real, visible key in her own file rather than an absence.
export function diagnosticsOn(config) {
  return config?.diagnostics !== false;
}

// THE KEY THE DOWNLOAD CARRIES. Baked into the packaged `package.json` by
// `scripts/release.mjs` at build time (electron-builder's `extraMetadata`), so a
// stranger's install has somewhere to send and a copy run from source still does
// not. It is a PostHog project key, which is write-only by design: it can add an
// event and it cannot read one back, which is why it may sit inside a file
// anybody can unzip. The one that reads, `phx_`, never goes near a build.
//
// Measured 2026-08-21: before this, the key came only from the user's own
// `zero.config.json`, which no download contains, so every install but hers
// sent nothing and the north star could not be counted.
function bakedKey() {
  try {
    const pkg = createRequire(import.meta.url)('../package.json');
    return pkg?.bakedPosthogKey ?? null;
  } catch {
    return null;
  }
}

const BAKED = bakedKey();

// Where it would go, if it went anywhere. A missing key is not an error and not
// a warning: it is a copy of Agentbox with nowhere to send to, which is a build
// run from source.
//
// HER OWN FILE STILL WINS. A `posthogKey` in `zero.config.json` outranks the
// baked one, so pointing a copy at a different project stays a one-line edit,
// and `diagnostics: false` still turns all of it off at every send.
export function analyticsKey(config, baked = BAKED) {
  const key = config?.posthogKey ?? readEnv('POSTHOG_KEY') ?? baked ?? null;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function createAnalytics({ config, version, dir, client, env = process.env } = {}) {
  const key = analyticsKey(config);
  const hasDestination = !!key || !!client;
  // BOTH HALVES, AT EVERY SEND. See note 4 above.
  const on = () => hasDestination && diagnosticsOn(config);

  // `env` is here for ONE reason: a copy launched into a throwaway home is a
  // first-run test of hers and sends under a fixed id rather than a fresh
  // random one. The decision lives in `shared/install-id.mjs` with the
  // identifier itself, because two copies of it is how the counts and the
  // crash reports start telling different stories.
  const installId = dir ? readInstallId(dir, env) : null;
  // The version pair from section 5.1, on every event, set here and never by a
  // caller. `os.release` is the kernel release, which is what the page means by
  // the version of macOS and carries nothing about the machine or its owner.
  const base = {
    app_version: version || '0.0.0',
    os_platform: process.platform,
    os_release: os.release(),
    os_arch: process.arch,
  };
  // What the second scrub check is run against. Cheap, and it is the only thing
  // standing between a bug in the first check and her promise.
  const ctx = {
    home: os.homedir(),
    username: (() => { try { return os.userInfo().username; } catch { return null; } })(),
  };

  let posthog = client ?? null;
  const load = () => {
    if (posthog) return posthog;
    try {
      // Required lazily, so a machine with no key and every test in this repo
      // never constructs a client and never opens a socket.
      const { PostHog } = createRequire(import.meta.url)('posthog-node');
      posthog = new PostHog(key, { host: config?.posthogHost || DEFAULT_HOST, flushAt: 20, flushInterval: 10000 });
    } catch (err) {
      console.warn('zero: analytics could not start:', err.message);
      posthog = null;
    }
    return posthog;
  };

  const send = (event, properties) => {
    if (!on()) return false;
    const ph = load();
    if (!ph) return false;
    try {
      ph.capture({ distinctId: installId, event, properties: { ...base, ...properties } });
      return true;
    } catch (err) {
      // A failed send is never allowed to be a failed app.
      console.warn('zero: analytics send failed:', err.message);
      return false;
    }
  };

  return {
    get enabled() { return on(); },
    get reason() {
      if (!hasDestination) return 'has nowhere to send to';
      return diagnosticsOn(config) ? 'on' : 'turned off';
    },
    hasDestination,
    installId,

    // ONE DOOR. `name` must be one of hers, and the properties are filtered to
    // numbers, booleans and one closed enum. Anything else is dropped rather
    // than sent, because the caller is often the renderer.
    track(name, props) {
      if (!on()) return false;
      const clean = sanitize(name, props);
      if (!clean) return false;
      return send(name, clean);
    },

    // Handed to `setTransport` in `main/crash-report.mjs`. The payload arrives
    // already scrubbed and already checked; it is checked once more here, and a
    // report that fails is dropped whole rather than trimmed, which is the rule
    // the scrub itself follows.
    crashTransport(payload) {
      if (!on()) return false;
      if (!payload || typeof payload !== 'object') return false;
      const leaks = findPrivate(payload, ctx);
      if (leaks.length) {
        return send('crash_report', { crash_kind: 'redacted', dropped_fields: leaks.length });
      }
      return send('crash_report', {
        crash_kind: String(payload.kind ?? 'unknown'),
        up_ms: Number(payload.upMs ?? 0),
        report_version: Number(payload.v ?? 1),
        error: payload.error ?? null,
        happened_at: String(payload.ts ?? ''),
      });
    },

    // A report is written while the process is dying, so delivery cannot be
    // synchronous: the queue on disk is drained on the NEXT launch. A file is
    // removed only once its send has been accepted, and a file that will not
    // parse is removed rather than retried forever.
    drainCrashes(files = []) {
      if (!on()) return 0;
      let sent = 0;
      for (const file of files) {
        let payload = null;
        try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { payload = null; }
        if (!payload) { try { fs.unlinkSync(file); } catch {} continue; }
        if (this.crashTransport(payload)) {
          sent += 1;
          try { fs.unlinkSync(file); } catch {}
        }
      }
      return sent;
    },

    async flush() { try { await posthog?.flush?.(); } catch {} },
    async shutdown() { try { await posthog?.shutdown?.(); } catch {} },
  };
}
