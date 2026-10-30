// THE BROWSER COPY IS COUNTED LIKE THE DESKTOP.
//
// `npx agentbox-app` sent no counts at all. Measured 2026-10-29: the published
// package (npm pack agentbox-app@0.1.19) carried no `bakedPosthogKey`, and
// `bootHeadless` never built the counting in the first place, so a key would
// have reached nothing either. The Mac app had reported 127 installs since
// launch; the copy the README offers on every platform had reported none.
//
// The cases:
//   · a booted browser copy counts that it was opened and used today, and its
//     counts say they came from the browser copy and carry its version;
//   · the tab's own counts and the agents' runs reach the same counter;
//   · something done in the tab on a new day counts that day, and twice on the
//     same day counts it once;
//   · stopping the copy counts the quit;
//   · with no key, which is what a checkout has, nothing is set up to send;
//   · the desktop's counts say they came from the desktop.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootHeadless } from '../main/serve.mjs';
import { createAnalytics } from '../main/analytics.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

// Records instead of sending. Nothing in this file opens a socket.
function fakeClient() {
  const sent = [];
  return { sent, capture: (p) => sent.push(p), flush: async () => {}, shutdown: async () => {} };
}

const made = [];
async function boot(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-browser-counts-'));
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store'), ...opts.config }));
  const booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir, ...opts.boot });
  made.push({ dir, booted });
  return booted;
}
const names = (client) => client.sent.map((p) => p.event);

afterEach(async () => {
  for (const { dir, booted } of made.splice(0)) {
    await booted?.supervisor?.stopAll?.().catch?.(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('the browser copy is counted like the desktop', () => {
  it('counts that it was opened and used today, as the browser copy, on its own version', async () => {
    const client = fakeClient();
    await boot({ boot: { countClient: client } });
    expect(names(client)).toEqual(['app_opened', 'day_active']);
    for (const p of client.sent) {
      expect(p.properties.app_kind).toBe('browser');
      expect(p.properties.app_version).toBe(version);
      expect(typeof p.distinctId).toBe('string');
    }
  });

  it('counts what the tab sends and what the agents do', async () => {
    const client = fakeClient();
    const booted = await boot({ boot: { countClient: client } });
    await booted.channels.get('zero:track')({}, { name: 'task_opened' });
    booted.supervisor.count('run_started', { engine: 'claude' });
    expect(names(client)).toContain('task_opened');
    expect(client.sent.find((p) => p.event === 'run_started').properties.engine).toBe('claude');
  });

  it('counts a new day when the tab is used on it, and only once that day', async () => {
    const client = fakeClient();
    let clock = Date.parse('2026-10-28T10:00:00');
    const booted = await boot({ boot: { countClient: client, now: () => clock } });
    const track = booted.channels.get('zero:track');
    await track({}, { name: 'task_opened' });
    expect(names(client).filter((n) => n === 'day_active')).toHaveLength(1);
    clock = Date.parse('2026-10-29T09:00:00');
    await track({}, { name: 'task_opened' });
    await track({}, { name: 'reply_sent' });
    expect(names(client).filter((n) => n === 'day_active')).toHaveLength(2);
  });

  it('does not count a day for a name nobody approved', async () => {
    const client = fakeClient();
    let clock = Date.parse('2026-10-28T10:00:00');
    const booted = await boot({ boot: { countClient: client, now: () => clock } });
    clock = Date.parse('2026-10-29T09:00:00');
    await booted.channels.get('zero:track')({}, { name: 'not_on_the_list' });
    expect(names(client).filter((n) => n === 'day_active')).toHaveLength(1);
  });

  it('counts the quit', async () => {
    const client = fakeClient();
    const booted = await boot({ boot: { countClient: client } });
    booted.host.app.quit();
    expect(names(client)).toContain('app_quit');
  });

  it('sends nothing with no key, as a checkout has none', async () => {
    const booted = await boot();
    expect(booted.analytics.hasDestination).toBe(false);
    expect(booted.analytics.enabled).toBe(false);
  });

  it('sends nothing with the switch off, even with somewhere to send', async () => {
    const client = fakeClient();
    await boot({ config: { diagnostics: false }, boot: { countClient: client } });
    expect(client.sent).toHaveLength(0);
  });
});

describe('the desktop says it is the desktop', () => {
  it('marks its counts as the desktop app', () => {
    const client = fakeClient();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-desktop-counts-'));
    const a = createAnalytics({ config: {}, version: '1.2.3', dir, client });
    a.track('app_opened');
    expect(client.sent[0].properties.app_kind).toBe('desktop');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
