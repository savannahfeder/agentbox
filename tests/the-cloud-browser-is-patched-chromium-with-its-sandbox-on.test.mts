// THE CLOUD MACHINE'S BROWSER IS DEBIAN'S PATCHED CHROMIUM, WITH ITS SANDBOX ON.
//
// What was wrong (measured on a cloud machine, 2026-11-03): the image ran
// Playwright 1.64.1, whose bundled Chromium 156.0.8078.4 lacks four critical
// fixes Chrome shipped in 156.0.8078.73 (CVE-2026-118306 among them), and
// Playwright starts it with --no-sandbox. A bad page an agent opened could
// read the machine's Claude and Codex sign-ins. Debian bookworm-security had
// 156.0.8078.73 for arm64, and a plain `chromium.launch()` pointed at it with
// the flag dropped launched, loaded a real site and took a screenshot, with
// no --no-sandbox on any renderer.
//
// Now both of Playwright's Chromium slots in the image are links to
// cloud/sandbox/chromium.sh, which drops --no-sandbox and runs Debian's build.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SANDBOX = fileURLToPath(new URL('../cloud/sandbox/', import.meta.url));
const SETUP = fileURLToPath(new URL('../scripts/cloud-setup.mjs', import.meta.url));
const DEBIAN_CHROMIUM = '/usr/lib/chromium/chromium';

let tmp;
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

// The script with Debian's Chromium swapped for a stand-in that prints the
// arguments it was given, one per line.
function runWrapper(args) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-chromium-'));
  const stand = path.join(tmp, 'chromium');
  fs.writeFileSync(stand, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n', { mode: 0o755 });
  const text = fs.readFileSync(path.join(SANDBOX, 'chromium.sh'), 'utf8');
  expect(text.split(DEBIAN_CHROMIUM).length - 1).toBe(1);
  const wrapper = path.join(tmp, 'chromium.sh');
  fs.writeFileSync(wrapper, text.replace(DEBIAN_CHROMIUM, stand), { mode: 0o755 });
  const r = spawnSync('sh', [wrapper, ...args], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  return r.stdout.split('\n').slice(0, -1);
}

describe('the browser on the cloud machine', () => {
  it('drops the --no-sandbox Playwright adds and passes everything else on in order', () => {
    const out = runWrapper(['--disable-gpu', '--no-sandbox', '--headless', '--user-data-dir=/tmp/a b', 'about:blank']);
    expect(out).toEqual(['--disable-gpu', '--headless', '--user-data-dir=/tmp/a b', 'about:blank']);
  });

  it('drops it wherever it comes, even twice', () => {
    expect(runWrapper(['--no-sandbox', '--a', '--no-sandbox'])).toEqual(['--a']);
  });

  it('leaves flags that only look like it alone', () => {
    const out = runWrapper(['--disable-setuid-sandbox', '--no-sandbox-and-more', 'no-sandbox']);
    expect(out).toEqual(['--disable-setuid-sandbox', '--no-sandbox-and-more', 'no-sandbox']);
  });

  it('runs with no arguments at all', () => {
    expect(runWrapper([])).toEqual([]);
  });

  it('is what the image installs in both of Playwright\'s Chromium slots, beside Debian\'s Chromium', () => {
    const docker = fs.readFileSync(path.join(SANDBOX, 'Dockerfile'), 'utf8');
    expect(docker).toMatch(/apt-get install -y --no-install-recommends chromium\b/);
    expect(docker).toMatch(/COPY chromium\.sh \/opt\/agentbox\/chromium\.sh/);
    expect(docker).toContain('/opt/ms-playwright/chromium-*/chrome-linux*/chrome');
    expect(docker).toContain('/opt/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell');
    expect(docker).toMatch(/ln -s \/opt\/agentbox\/chromium\.sh "\$exe"/);
  });

  // A project's own Playwright at another version looks for its own browser
  // revision, which the image never had, so the agent would download the
  // bundled one and run it with --no-sandbox (Codex review, 2026-11-03).
  it('is what both cloud briefs tell a project\'s own Playwright to launch', () => {
    const run = fs.readFileSync(fileURLToPath(new URL('../main/cloud/run.mts', import.meta.url)), 'utf8');
    const told = run.match(/executablePath: \\'\/opt\/agentbox\/chromium\.sh\\'/g) || [];
    expect(told.length).toBe(2);
  });

  it('goes up with the image, or the build cannot find it', () => {
    expect(fs.readFileSync(SETUP, 'utf8')).toMatch(/IMAGE_FILES = \[[^\]]*'chromium\.sh'/);
  });
});
