// WHAT MAY LEAVE THIS MACHINE, AND WHAT STOPS IT.
//
// Her yes on 2026-08-19 was for eight counts and crash reports, under her rule
// from 08-18: no code, no prompts, no keys, no paths. `legal/privacy.html` in
// the Agentbox store is the promise those words became, and these are the tests
// that fail the build when the code stops keeping it.
//
// The four the reviewer should look at first:
//   · a browser analytics SDK never appears under renderer/, because it would
//     autocapture the text of what was clicked, and here that text is titles;
//   · an event nobody approved is refused, and a string property is dropped
//     rather than scrubbed, because a type is a promise and a regex is a guess;
//   · with her switch off, nothing is sent from that moment, not from the next
//     launch;
//   · a crash report that still looks private is dropped WHOLE.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyticsKey, createAnalytics, diagnosticsOn } from '../main/analytics.mjs';
import { EVENTS, EVENT_NAMES, sanitize } from '../shared/analytics-events.mjs';
import { Name } from '../shared/product-name.mjs';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-analytics-'));

// A client that records instead of sending. Nothing in this file opens a socket.
function fakeClient() {
  const sent = [];
  return { sent, capture: (payload) => sent.push(payload), flush: async () => {}, shutdown: async () => {} };
}

describe('the renderer cannot send anything', () => {
  it('has no analytics SDK in it at all', () => {
    const root = new URL('../renderer/', import.meta.url).pathname;
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      // Build output is not source: renderer/.gitignore already declares dist-*/ scratch
      // builds, and a bundled library with the word "amplitude" in it is not an SDK we ship.
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('dist-')) return [];
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
    const offenders = walk(root)
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|html)$/.test(f))
      .filter((f) => /posthog-js|from ['"]posthog|amplitude|mixpanel|@sentry/i.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('does not carry the key into the window either', () => {
    const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
    expect(preload).not.toMatch(/posthogKey|ASTRAL_POSTHOG_KEY/);
    // The bridge sends a NAME and nothing else.
    expect(preload).toMatch(/track: \(name\) => ipcRenderer\.invoke\('zero:track', \{ name \}\)/);
  });
});

describe('the list of what may be sent', () => {
  it('is her seven and no more', () => {
    expect(Object.values(EVENTS)).toEqual([
      `${Name} was opened`,
      'First run finished',
      'A repo was connected',
      'An agent was seen',
      'A task was opened',
      'A reply was sent',
      'A task finished',
    ]);
  });

  it('refuses an event nobody approved', () => {
    expect(sanitize('task_opened')).toEqual({});
    expect(sanitize('prompt_sent')).toBeNull();
    expect(sanitize('task_opened_with_title')).toBeNull();
  });

  it('drops a string property rather than trying to clean it', () => {
    const out = sanitize('task_opened', {
      title: 'Rewrite the pricing page',      // a prompt, in Agentbox
      repo: '/Users/you/Desktop/dev/acme',
      seconds: 12,
      fromAgent: true,
      count: 3,
    });
    expect(out).toEqual({ seconds: 12, fromAgent: true, count: 3 });
    expect(JSON.stringify(out)).not.toContain('acme');
    expect(JSON.stringify(out)).not.toContain('pricing');
  });

  it('keeps kind only when it is one of the closed list', () => {
    expect(sanitize('task_finished', { kind: 'question' })).toEqual({ kind: 'question' });
    expect(sanitize('task_finished', { kind: 'the acme teardown' })).toEqual({});
  });
});

describe('nothing is sent without a destination', () => {
  it('sends nothing, and builds no client, when no key is configured', () => {
    const a = createAnalytics({ config: {}, dir: tmpdir(), version: '1.2.3' });
    expect(a.hasDestination).toBe(false);
    expect(a.enabled).toBe(false);
    expect(a.reason).toBe('has nowhere to send to');
    expect(a.track('app_opened')).toBe(false);
  });
});

// THE DOWNLOAD HAS TO CARRY ONE. This is the bug of: the key came only from
// the operator's own zero.config.json, which is in no download, so a
// stranger's copy sent nothing and the first real user could not be counted.
describe('the key the download carries', () => {
  it('uses the baked key when the user has none of their own', () => {
    expect(analyticsKey({}, 'phc_baked')).toBe('phc_baked');
  });

  it('lets the user own file win over the baked one', () => {
    expect(analyticsKey({ posthogKey: 'phc_theirs' }, 'phc_baked')).toBe('phc_theirs');
  });

  it('is still nothing when neither exists, which is a copy run from source', () => {
    expect(analyticsKey({}, null)).toBe(null);
  });

  it('does not let a baked key defeat her switch', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: { diagnostics: false, posthogKey: 'phc_baked' }, dir: tmpdir(), version: '1.2.3', client });
    expect(a.enabled).toBe(false);
    expect(a.track('app_opened')).toBe(false);
    expect(client.sent).toHaveLength(0);
  });

  it('is not committed to the repo: this checkout ships no key of its own', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.bakedPosthogKey).toBeUndefined();
  });

  // The other half of the same bug, and the half a unit test cannot see: the
  // build has to actually put a key in. A signed release without one now stops
  // rather than shipping another blind download.
  it('the release script bakes it in and refuses to sign a build without one', () => {
    const release = fs.readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8');
    expect(release).toContain('-c.extraMetadata.bakedPosthogKey=');
    expect(release).toContain('a new user would be invisible');
  });
});

describe('her switch', () => {
  it('is on for a config she has never touched', () => {
    expect(diagnosticsOn({})).toBe(true);
    expect(diagnosticsOn({ diagnostics: true })).toBe(true);
    expect(diagnosticsOn({ diagnostics: false })).toBe(false);
  });

  it('sends the count with the versions and the install id, and no more', () => {
    const client = fakeClient();
    const dir = tmpdir();
    const a = createAnalytics({ config: {}, dir, version: '1.2.3', client });
    expect(a.track('task_opened', { seconds: 4 })).toBe(true);
    expect(client.sent).toHaveLength(1);
    const [one] = client.sent;
    expect(one.event).toBe('task_opened');
    expect(one.distinctId).toBe(fs.readFileSync(path.join(dir, 'install-id'), 'utf8').trim());
    expect(one.properties.app_version).toBe('1.2.3');
    expect(one.properties.os_release).toBe(os.release());
    expect(one.properties.seconds).toBe(4);
    // Nothing of hers rides along. The whole payload is checked, not one field.
    expect(JSON.stringify(one)).not.toContain(os.homedir());
  });

  it('stops sending FROM THAT MOMENT, not from the next launch', () => {
    const client = fakeClient();
    const config = {};
    const a = createAnalytics({ config, dir: tmpdir(), version: '1.2.3', client });
    expect(a.track('app_opened')).toBe(true);
    // This is what setWorkspaceSetting('diagnostics', false) does to the live
    // config object: saveConfig writes the file AND mutates it in place.
    config.diagnostics = false;
    expect(a.enabled).toBe(false);
    expect(a.reason).toBe('turned off');
    expect(a.track('app_opened')).toBe(false);
    expect(a.crashTransport({ kind: 'main-uncaught', upMs: 10 })).toBe(false);
    expect(client.sent).toHaveLength(1);
    // And back on again without a restart.
    config.diagnostics = true;
    expect(a.track('app_opened')).toBe(true);
    expect(client.sent).toHaveLength(2);
  });
});

describe('crash reports', () => {
  const scrubbed = {
    v: 1,
    kind: 'main-uncaught',
    ts: '2026-08-19T19:00:00.000Z',
    upMs: 4321,
    app: { name: Name, version: '1.2.3' },
    error: { name: 'Error', code: 'ENOENT', syscall: 'open', message: 'could not read <~+4>', stack: 'app:main/store.mjs:142' },
  };

  it('sends the scrubbed report through the same switch', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir: tmpdir(), version: '1.2.3', client });
    expect(a.crashTransport(scrubbed)).toBe(true);
    const [one] = client.sent;
    expect(one.event).toBe('crash_report');
    expect(one.properties.crash_kind).toBe('main-uncaught');
    expect(one.properties.up_ms).toBe(4321);
    expect(one.properties.error.syscall).toBe('open');
  });

  it('drops a report that still looks private WHOLE, and says only that it did', () => {
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir: tmpdir(), version: '1.2.3', client });
    // A bug upstream of here leaves a real home directory in the message.
    a.crashTransport({ ...scrubbed, error: { ...scrubbed.error, message: `could not read ${os.homedir()}/Desktop/dev/acme/notes.md` } });
    const [one] = client.sent;
    expect(one.properties.crash_kind).toBe('redacted');
    expect(JSON.stringify(one)).not.toContain('acme');
    expect(JSON.stringify(one)).not.toContain(os.homedir());
    expect(one.properties.error).toBeUndefined();
  });

  it('drains the queue the dying process left, and clears it', () => {
    const dir = tmpdir();
    const file = path.join(dir, 'crash-2026-08-19T19-00-00-000Z-1.json');
    fs.writeFileSync(file, JSON.stringify(scrubbed));
    const client = fakeClient();
    const a = createAnalytics({ config: {}, dir, version: '1.2.3', client });
    expect(a.drainCrashes([file])).toBe(1);
    expect(fs.existsSync(file)).toBe(false);
    expect(client.sent).toHaveLength(1);
  });

  it('leaves the queue alone when she has turned it off', () => {
    const dir = tmpdir();
    const file = path.join(dir, 'crash-2026-08-19T19-00-00-000Z-2.json');
    fs.writeFileSync(file, JSON.stringify(scrubbed));
    const client = fakeClient();
    const a = createAnalytics({ config: { diagnostics: false }, dir, version: '1.2.3', client });
    expect(a.drainCrashes([file])).toBe(0);
    expect(fs.existsSync(file)).toBe(true);
    expect(client.sent).toHaveLength(0);
  });
});

describe('the door the renderer knocks on', () => {
  it('accepts only the approved names', () => {
    const src = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/ipcMain\.handle\('zero:track'/);
    // The handler checks the name against the shared list before anything else.
    expect(src).toMatch(/if \(!EVENT_NAMES\.includes\(name\)\) return false;/);
    expect(EVENT_NAMES).toContain('task_opened');
  });
});

// THE README IS THE PRIVACY NOTICE NOW, so it is held to the code the way any
// other promise here is. Her decision, 2026-09-27: "The privacy sentence should
// probably live in the README. And then also say, 'The events can be turned
// off,' kind of thing."
//
// There is no page to keep in step any more: the terms went, because with no
// account, no payment and nothing hosted there is nothing for terms to govern,
// and the licence is the whole of what somebody may do with this.
//
// A DOCUMENT NOBODY CHECKS GOES STALE AT THE FIRST NEW EVENT, and the way that
// happens is not malice, it is an eighth event added by somebody who never
// opened the README. So the list up there is compared against `EVENTS` itself.
describe('the README, which is where the privacy notice lives', () => {
  const readme = () => fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  it('says out loud that the events can be turned off, and how', () => {
    const text = readme();
    expect(text).toContain('The events can be turned off');
    // Both switches, because either one on its own is enough and she should not
    // have to open the app to find that out.
    expect(text).toContain('Counts and crash reports');
    expect(text).toContain('"diagnostics": false');
  });

  it('describes every event that exists, so an eighth cannot arrive unannounced', () => {
    const text = readme().toLowerCase();
    // The sentence each event is written as, rather than its code name: the
    // README is read by people. `app_opened` is "the app was opened".
    const said = Object.values(EVENTS).map((sentence) => sentence
      .toLowerCase()
      .replace(Name.toLowerCase(), 'the app'));
    const missing = said.filter((sentence) => !text.includes(sentence));
    expect(missing).toEqual([]);
    expect(text).toContain('seven things');
    expect(EVENT_NAMES).toHaveLength(7);
  });

  it('promises no content leaves, which is what sanitize enforces', () => {
    expect(readme()).toContain('No file contents, no prompts');
    // The promise and the enforcement, side by side: a string property that is
    // not `kind` is dropped rather than cleaned.
    expect(sanitize('task_opened', { title: 'her private row', count: 3 })).toEqual({ count: 3 });
  });
});
