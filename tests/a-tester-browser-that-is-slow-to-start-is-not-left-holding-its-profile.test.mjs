// A TESTER BROWSER THAT IS SLOW TO START IS NOT LEFT HOLDING ITS PROFILE
// (w-3d0fa23ffb, 2026-10-21).
//
// The power tester in the founder's room lost her browser at 15:59 and could not
// get it back for the rest of her stretch: every `app open` failed with "chrome
// never printed a devtools url". On a loaded Mac Chrome took longer than the
// launcher's 20 seconds. The launcher gave up but left that Chrome running, and
// it held the profile's lock, so each later Chrome on the profile handed off to
// it and exited without a word. One stray Chrome from 16:01 was found holding
// the profile; stopping it was the only cure. The launcher now stops the Chrome
// it started when it gives up, and says at once when one exits instead.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChrome, holdersOf } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const dirs = [];
function fakeChrome(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-chrome-'));
  dirs.push(dir);
  const bin = path.join(dir, 'chrome');
  fs.writeFileSync(bin, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { bin, profile: path.join(dir, 'profile') };
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

it('a Chrome that never prints its address is stopped when the launcher gives up', async () => {
  const { bin, profile } = fakeChrome('echo $$ > "$(dirname "$0")/pid"; exec sleep 30');
  await expect(launchChrome({ bin, profile, detached: true, waitMs: 1500 })).rejects.toThrow(/never printed a devtools url/);
  const pid = Number(fs.readFileSync(path.join(path.dirname(bin), 'pid'), 'utf8'));
  await new Promise((r) => setTimeout(r, 200));
  expect(alive(pid)).toBe(false);
});

it('a Chrome that exits before printing its address is reported at once, naming the profile', async () => {
  const { bin, profile } = fakeChrome('exit 0');
  const started = Date.now();
  await expect(launchChrome({ bin, profile, waitMs: 10_000 })).rejects.toThrow(new RegExp(`exited before.*${profile}`));
  expect(Date.now() - started).toBeLessThan(5_000);
});

it('a Chrome that prints its address is handed back running', async () => {
  const { bin, profile } = fakeChrome('echo "DevTools listening on ws://127.0.0.1:9/devtools/browser/x" >&2; exec sleep 30');
  const { chrome, wsUrl } = await launchChrome({ bin, profile, waitMs: 5_000 });
  expect(wsUrl).toBe('ws://127.0.0.1:9/devtools/browser/x');
  expect(alive(chrome.pid)).toBe(true);
  chrome.kill('SIGKILL');
});

// The same afternoon a copy's Chrome was alive but would not answer its
// address, and every reopen exited behind it. Opening the tester's browser
// first stops any Chrome still started on that profile, and only on that one.
it('finds the Chrome started on this profile, and nothing else', () => {
  const app = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profile = '/tmp/agentbox-verify/instances/x-power/chrome-profile';
  const list = () => [
    { pid: 1, command: `${app} --headless=new --remote-debugging-port=0 --user-data-dir=${profile} --hide-scrollbars about:blank` },
    { pid: 2, command: `${app.replace('MacOS/Google Chrome', 'Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper')} --type=gpu-process --user-data-dir=${profile}` },
    { pid: 3, command: `${app} --headless=new --user-data-dir=${profile}2 about:blank` },
    { pid: 4, command: `${app}` },
    { pid: 5, command: `grep --user-data-dir=${profile}` },
  ];
  expect(holdersOf(profile, list, app)).toEqual([1, 2]);
});

it('on Linux, the Chromium the copy runs, helpers included', () => {
  const chromium = '/opt/ms-playwright/chromium-1248/chrome-linux-arm64/chrome';
  const profile = '/tmp/agentbox-verify/instances/x-power/chrome-profile';
  const list = () => [
    { pid: 7, command: `${chromium} --headless=new --user-data-dir=${profile} about:blank` },
    { pid: 8, command: `${chromium} --type=renderer --user-data-dir=${profile}` },
    { pid: 9, command: `/usr/bin/google-chrome --user-data-dir=${profile}` },
  ];
  expect(holdersOf(profile, list, chromium)).toEqual([7, 8]);
});

it("the tester's browser frees its profile before it opens", () => {
  const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');
  const launch = browse.slice(browse.indexOf('async function launch()'), browse.indexOf('async function tab()'));
  expect(launch.indexOf('freeProfile(profile)')).toBeGreaterThan(-1);
  expect(launch.indexOf('freeProfile(profile)')).toBeLessThan(launch.indexOf('launchChrome('));
});
