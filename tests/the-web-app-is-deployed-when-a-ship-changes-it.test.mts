// THE WEB APP IS DEPLOYED WHEN A SHIP CHANGES IT, AND SAYS WHICH BUILD IT IS.
//
// What broke (measured 2026-10-26): the live web app at agentbox-phone.pages.dev
// carried none of the work of 2026-10-23 and 2026-10-24 (its bundle has no
// `claimed_by`, no "Replies carry on in Agentbox Cloud"), so with the computer
// shut it could only say "What you send waits for it". It is only ever put up
// by hand with `npm run phone:deploy`, and nothing said it had fallen behind.
// Now each build stamps its commit into the page, and a ship deploys the web
// app whenever what it is built from changed since the build that is live.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';
import { SITE_PATHS, siteChanged, liveBuildOf, deployWebApp } from '../scripts/lib/web-app-deploy.mjs';
import { readBuildStamp } from '../renderer/src/cloud-bridge';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const OLD = 'fedcba9876543210fedcba9876543210fedcba98';

describe('the build says which commit it is', () => {
  let dir, dist, out, configFile, icon;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-stamp-'));
    dist = path.join(dir, 'dist'); out = path.join(dir, 'out'); configFile = path.join(dir, 'team.config.json'); icon = path.join(dir, 'icon.png');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Agentbox</title></head><body></body></html>');
    fs.writeFileSync(icon, 'png');
    fs.writeFileSync(configFile, JSON.stringify({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' }));
  });

  it('stamps the commit and when it was built', () => {
    buildPhoneSite({ dist, out, configFile, icon, stamp: { sha: SHA, at: '2026-10-26T12:00:00.000Z' } });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    expect(html).toContain(`<meta name="agentbox-build" content="${SHA} 2026-10-26T12:00:00.000Z">`);
    expect(liveBuildOf(html)).toBe(SHA);
  });

  it('leaves out a stamp that is not a commit', () => {
    buildPhoneSite({ dist, out, configFile, icon, stamp: { sha: '"><script>', at: 'x' } });
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).not.toContain('agentbox-build');
  });

  it('is read back by the page for its Account page', () => {
    const doc = { querySelector: () => ({ getAttribute: () => `${SHA} 2026-10-26T12:00:00.000Z` }) };
    expect(readBuildStamp(doc)).toEqual({ sha: SHA.slice(0, 7), at: Date.parse('2026-10-26T12:00:00.000Z') });
    expect(readBuildStamp({ querySelector: () => null })).toBeNull();
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/Web app version/);
  });
});

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('what the web app is built from', () => {
  it('is the screens, the shared code, its legal pages, its build and its icon', () => {
    expect(siteChanged(['renderer/src/App.tsx'])).toBe(true);
    expect(siteChanged(['shared/phone-snapshot.mts'])).toBe(true);
    expect(siteChanged(['phone-legal/privacy.html', 'scripts/build-phone-site.mjs'])).toBe(true);
    expect(siteChanged(['main/phone-icon.png'])).toBe(true);
    expect(SITE_PATHS).toContain('renderer/');
  });
  it('is not the computer\'s own code, the tests or the docs', () => {
    expect(siteChanged(['main/supervisor.mts', 'tests/x.test.mjs', 'docs/cloud/PLAN.md', 'renderer-notes.md'])).toBe(false);
    expect(siteChanged([])).toBe(false);
  });
});

describe('after a ship', () => {
  const world = (over = {}) => {
    const ran = [];
    const said = [];
    const base = {
      site: 'https://agentbox-phone.pages.dev',
      head: SHA,
      tip: SHA,
      live: `<meta name="agentbox-build" content="${OLD} 2026-10-22T00:00:00.000Z">`,
      changed: ['renderer/src/App.tsx'],
      deployOk: true,
      ...over,
    };
    return {
      ran, said,
      opts: {
        site: base.site,
        head: () => base.head,
        mainTip: () => base.tip,
        fetchPage: async () => { if (base.live instanceof Error) throw base.live; return base.live; },
        changedSince: (from) => (from === OLD ? base.changed : ['renderer/src/App.tsx']),
        known: (sha) => sha === OLD,
        deploy: () => { ran.push('deploy'); return base.deployOk ? { ok: true } : { ok: false, why: 'wrangler is not signed in' }; },
        log: (line) => said.push(line),
      },
    };
  };

  it('deploys when the screens changed since the live build', async () => {
    const w = world();
    expect(await deployWebApp(w.opts)).toMatchObject({ deployed: true });
    expect(w.ran).toEqual(['deploy']);
    expect(w.said.join('\n')).toMatch(/web app updated/i);
  });

  it('does nothing when nothing it is built from changed', async () => {
    const w = world({ changed: ['main/supervisor.mts'] });
    expect(await deployWebApp(w.opts)).toMatchObject({ deployed: false });
    expect(w.ran).toEqual([]);
  });

  it('deploys when the live build carries no stamp, or one this checkout does not know', async () => {
    const plain = world({ live: '<html><head></head></html>' });
    expect(await deployWebApp(plain.opts)).toMatchObject({ deployed: true });
    const stranger = world({ live: `<meta name="agentbox-build" content="${'a'.repeat(40)} x">` });
    expect(await deployWebApp(stranger.opts)).toMatchObject({ deployed: true });
  });

  it('leaves it to the newer ship when main moved past this one', async () => {
    const w = world({ tip: OLD });
    expect(await deployWebApp(w.opts)).toMatchObject({ deployed: false });
    expect(w.ran).toEqual([]);
    expect(w.said.join('\n')).toMatch(/newer/);
  });

  it('says so, and does not fail the ship, when the deploy does not work', async () => {
    const w = world({ deployOk: false });
    expect(await deployWebApp(w.opts)).toMatchObject({ deployed: false });
    expect(w.said.join('\n')).toMatch(/web app was not updated: wrangler is not signed in/i);
  });

  it('says so when this computer has nowhere to deploy it', async () => {
    const w = world({ site: null });
    expect(await deployWebApp(w.opts)).toMatchObject({ deployed: false });
    expect(w.ran).toEqual([]);
    expect(w.said.join('\n')).toMatch(/not updated.*phoneSite/i);
  });

  it('runs from the ship, after the push, and ends before the ship queue stops the ship', () => {
    const ship = read('scripts/ship.mjs');
    const pushed = ship.indexOf("say(`shipped ${sha}.`)");
    const deploy = ship.indexOf('await deployAfterShip({ root, say, until: shipEndsBy })');
    expect(pushed).toBeGreaterThan(0);
    expect(deploy).toBeGreaterThan(pushed);
    const queue = read('main/ship-queue.mts');
    const queueStops = Number(/const SHIP_MS = (\d+) \* 60 \* 1000/.exec(queue)[1]);
    const shipEnds = Number(/let shipEndsBy = began \+ (\d+) \* 60_000/.exec(ship)[1]);
    expect(shipEnds).toBeLessThan(queueStops);
    // A push the hook runs every test for gets the queue's longer deadline.
    const queueStopsLater = Number(/WHOLE_SUITE_SHIP_MS = (\d+) \* 60 \* 1000/.exec(queue)[1]);
    const shipEndsLater = Number(/\n\s+shipEndsBy = began \+ (\d+) \* 60_000/.exec(ship)[1]);
    expect(shipEndsLater).toBeLessThan(queueStopsLater);
    expect(shipEndsLater).toBeGreaterThan(shipEnds);
    expect(read('scripts/lib/web-app-deploy.mjs')).toMatch(/until - Date\.now\(\) < DEPLOY_NEEDS_MS\) return \{ ok: false, why: 'the ship ran long/);
  });
});
