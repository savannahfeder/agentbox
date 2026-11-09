// EVERY CHANNEL THE SCREEN ASKS FOR HAS AN ANSWER IN A BROWSER TAB.
//
// What broke: `npx agentbox-app` opened a tab that hammered the server with
// about five thousand failing requests a second. Four channels in
// shared/bridge-map.mts (badge, bootInfo, notify, crash) were only ever
// registered by main/main.mts, inside the desktop window, so the browser server
// answered each with 404. The screen turned the failed `badge` into an uncaught
// error, reported it on `crash`, which also failed, which was reported on
// `crash` again: 33,385 requests in six seconds, measured on 2026-10-07 by
// installing the packed tarball into an empty folder and loading the tab in a
// headless Chrome.
//
// The test that would have caught it compares the phone book with what the
// browser server actually answers, so a channel added to the desktop alone
// fails here rather than in somebody's tab.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mts';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

let dir, booted;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-every-channel-'));
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
}, 30_000);

afterAll(() => {
  booted?.host.app.quit();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// Read the way main/serve.mts reads it: nothing returned goes out as null.
const ask = async (channel, payload) => (await booted.channels.get(channel)({ sender: null }, payload)) ?? null;

describe('a browser tab, asking for what the desktop window asks for', () => {
  it('finds a handler behind every channel in the phone book', () => {
    const missing = Object.entries(REQUEST_CHANNELS)
      .filter(([, channel]) => !booted.channels.has(channel))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('says a tab opening is a fresh launch, not a reload', async () => {
    const info = await ask('zero:boot-info');
    expect(info.reloaded).toBe(false);
    expect(info).toHaveProperty('recovered');
  });

  it('takes a badge count, a notification and a crash report without throwing', async () => {
    // The server sends back whatever a handler returns, and a tab has no dock,
    // no Notification Center and (yet) no crash queue, so nothing is the answer.
    expect(await ask('zero:badge', 3)).toBeNull();
    expect(await ask('zero:notify', { arrivals: [{ id: 'w-x', title: 'x' }] })).toBeNull();
    expect(await ask('zero:crash', { name: 'Error', message: 'boom', stack: '' })).toBeNull();
  });

  it('takes a crash report with nothing in it, which is what a bare throw sends', async () => {
    expect(await ask('zero:crash')).toBeNull();
  });
});

describe('the screen reporting its own crash', () => {
  it('never lets a failed report become a new crash', () => {
    // The report call returns a promise. A try/catch around it does not catch
    // that promise failing, so the failure arrived as an unhandled rejection,
    // which this same listener reported, which failed again.
    const main = fs.readFileSync(path.join(repoRoot, 'renderer', 'src', 'main.tsx'), 'utf8');
    const sender = main.slice(main.indexOf('const sendCrash'), main.indexOf('window.addEventListener'));
    expect(sender).toMatch(/\.catch\(/);
  });
});
