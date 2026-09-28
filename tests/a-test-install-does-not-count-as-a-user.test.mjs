// HER OWN FIRST-RUN TESTS ARE NOT STRANGERS WHO BOUNCED.
//
// The defect was two ordinary things meeting. `npm run fresh` and the ⌘K row
// launch Agentbox inside a throwaway home, which is a throwaway userData, so
// `readInstallId` found no file and wrote a new random one. And the copy they
// launch is the PACKAGED app, which carries the baked PostHog key. So every
// test opened Agentbox once under a brand new id and was never seen again, which
// is indistinguishable from a real download that did not stick.
//
// The two tests worth reading first:
//   · two throwaway homes send under the SAME id, because one test install
//     appearing twice is the whole of what she was shown;
//   · a real install still mints a NEW id per install, because
//     `legal/privacy.html` 5.2 promises exactly that in public and the fix must
//     not have bought its quiet by breaking it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnalytics } from '../main/analytics.mjs';
import { readInstallId } from '../shared/install-id.mjs';
import {
  FRESH_INSTALL_ID,
  FRESH_USER_ENV,
  HOMES,
  freshEnv,
  runningAsAFreshUser,
} from '../shared/fresh-user-home.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-test-install-'));

// A client that records instead of sending. Nothing in this file opens a socket.
function fakeClient() {
  const sent = [];
  return { sent, capture: (payload) => sent.push(payload), flush: async () => {}, shutdown: async () => {} };
}

const realEnv = { PATH: '/usr/bin', HOME: os.homedir(), CFFIXED_USER_HOME: os.homedir() };

describe('knowing a throwaway home when it sees one', () => {
  it('believes the mark freshEnv sets', () => {
    const env = freshEnv(path.join(HOMES, '2026-08-31T14-53-00'), realEnv);
    expect(env[FRESH_USER_ENV]).toBe('1');
    expect(runningAsAFreshUser(env)).toBe(true);
  });

  // The fallback. A launch route written after this one, or a copy relaunching
  // itself, can lose the mark; the home it is living in cannot lie.
  it('believes the home even with the mark stripped off', () => {
    const home = path.join(HOMES, '2026-08-31T14-53-00');
    expect(runningAsAFreshUser({ HOME: home })).toBe(true);
    expect(runningAsAFreshUser({ CFFIXED_USER_HOME: home })).toBe(true);
  });

  it('says no to a real person, and to an empty environment', () => {
    expect(runningAsAFreshUser(realEnv)).toBe(false);
    expect(runningAsAFreshUser({})).toBe(false);
    // A folder that merely starts with the same letters is not inside it.
    expect(runningAsAFreshUser({ HOME: `${HOMES}-elsewhere` })).toBe(false);
  });
});

describe('the id a throwaway install sends under', () => {
  it('is the fixed one, and no id file is left behind', () => {
    const dir = tmpdir();
    const env = freshEnv(path.join(HOMES, '2026-08-31T14-53-00'), realEnv);
    expect(readInstallId(dir, env)).toBe(FRESH_INSTALL_ID);
    expect(fs.existsSync(path.join(dir, 'install-id'))).toBe(false);
  });

  // THE ONE SHE WAS SHOWN. Two first-run tests used to be two strangers.
  it('is the same for two different throwaway homes', () => {
    const one = readInstallId(tmpdir(), freshEnv(path.join(HOMES, 'first'), realEnv));
    const two = readInstallId(tmpdir(), freshEnv(path.join(HOMES, 'second'), realEnv));
    expect(one).toBe(two);
    expect(one).toBe(FRESH_INSTALL_ID);
  });

  it('names itself, so a report that misses the exclusion still reads as a robot', () => {
    // `scripts/her-installs.mjs` NOT_PEOPLE and `scripts/game-stats.mjs`
    // ROBOT_ID both carry it, but a human reading a raw list should not need
    // either of them to see this is not a person.
    // The name is READ rather than typed, so the id follows a rename instead of
    // going stale under it. What must not change is the shape: the app's own
    // name and then what this install is, so a raw list reads as a robot.
    expect(FRESH_INSTALL_ID).toBe(`${nameSlug}-fresh-user`);
    expect(FRESH_INSTALL_ID.startsWith(`${nameSlug}-`)).toBe(true);
  });
});

describe('a real install is untouched', () => {
  it('still mints a new random id per installation, and keeps it', () => {
    const one = tmpdir();
    const two = tmpdir();
    const first = readInstallId(one, realEnv);
    const second = readInstallId(two, realEnv);
    expect(first).not.toBe(second);
    expect(first).not.toBe(FRESH_INSTALL_ID);
    expect(fs.readFileSync(path.join(one, 'install-id'), 'utf8').trim()).toBe(first);
    // And it is stable across reads, which is the whole purpose of the file.
    expect(readInstallId(one, realEnv)).toBe(first);
  });
});

describe('what actually leaves a throwaway install', () => {
  it('sends the counts under the fixed id', () => {
    const client = fakeClient();
    const env = freshEnv(path.join(HOMES, '2026-08-31T14-53-00'), realEnv);
    const a = createAnalytics({ config: {}, dir: tmpdir(), version: '1.2.3', client, env });
    expect(a.track('app_opened')).toBe(true);
    expect(client.sent[0].distinctId).toBe(FRESH_INSTALL_ID);
  });

  // Crash reports read the same file, on purpose, so that a crash and the
  // counts around it are one story. A test crash must not become a stranger's.
  it('sends its crashes under it too', () => {
    const client = fakeClient();
    const env = freshEnv(path.join(HOMES, '2026-08-31T14-53-00'), realEnv);
    const a = createAnalytics({ config: {}, dir: tmpdir(), version: '1.2.3', client, env });
    expect(a.crashTransport({ v: 1, kind: 'main-uncaught', ts: '2026-08-31T14:53:00.000Z', upMs: 10 })).toBe(true);
    expect(client.sent[0].distinctId).toBe(FRESH_INSTALL_ID);
  });

  it('still sends nothing at all when her switch is off', () => {
    const client = fakeClient();
    const env = freshEnv(path.join(HOMES, '2026-08-31T14-53-00'), realEnv);
    const a = createAnalytics({ config: { diagnostics: false }, dir: tmpdir(), version: '1.2.3', client, env });
    expect(a.track('app_opened')).toBe(false);
    expect(client.sent).toHaveLength(0);
  });

  // Her real Agentbox is the control. Same code, same call, different answer.
  it('and her own copy still sends under its own id', () => {
    const client = fakeClient();
    const dir = tmpdir();
    const a = createAnalytics({ config: {}, dir, version: '1.2.3', client, env: realEnv });
    expect(a.track('app_opened')).toBe(true);
    expect(client.sent[0].distinctId).not.toBe(FRESH_INSTALL_ID);
    expect(client.sent[0].distinctId).toBe(fs.readFileSync(path.join(dir, 'install-id'), 'utf8').trim());
  });
});
