// A READING WITH ROOM ENDS THE CLOUD ACCOUNT'S LIMIT (w-99a2196117).
//
// What broke (2026-11-24): five cloud runs ended within a minute on the
// cloud's Claude account at its usage limit. The line named no reset hour, so
// the account was benched for a flat 30 minutes (`limitedUntil`). The limit
// was reset within the next ten minutes and Refresh read the account afresh,
// but the fresh reading only went to `limits` and `readAt`: `limitedUntil`
// still said limited, so Settings kept saying "At its limit" and every thread
// waiting on the cloud sat out the rest of the half hour. Measured off the
// supervisor's saved state: the runs died at 1795547604045, the threads
// started again at 1795549515195, 32 minutes later.
//
// Now a reading taken after the limit was marked, with nothing in it at 100%,
// ends the mark. A reading from before the mark, or one still at 100%, leaves
// it, so a run that just died on the limit is not started again at once.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCloudLogin, markCloudLogin, cloudLoginState, cloudLoginFor, noteCloudReading } from '../main/cloud/logins.mts';
import { Supervisor } from '../main/supervisor.mts';

const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-reading-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

const NOW = Date.parse('2026-11-24T19:30:00Z');
const MIN = 60_000;
const room = [{ span: 'session', percent: 4, resetsAt: NOW + 5 * 60 * MIN }, { span: 'week', percent: 61, resetsAt: NOW + 2 * 24 * 60 * MIN }];
const full = [{ span: 'session', percent: 100, resetsAt: NOW + 3 * 60 * MIN }, { span: 'week', percent: 61, resetsAt: NOW + 2 * 24 * 60 * MIN }];

function limited(home: string, at = NOW) {
  recordCloudLogin('claude', 'acct-1', { id: 'id-1', savedAt: 1 }, { home });
  markCloudLogin('claude', 'acct-1', 'id-1', { limitedUntil: at + 30 * MIN, limitedAt: at }, { home });
}

describe('a reading taken after the limit was marked', () => {
  it('with room in it, ends the limit and the account runs again', () => {
    const home = tmp();
    limited(home);
    noteCloudReading('claude', 'acct-1', 'id-1', { org: 'org-1', limits: room, readAt: NOW + 10 * MIN }, { home });
    const rec = cloudLoginFor('claude', 'acct-1', { home })!;
    expect(rec.limitedUntil).toBeUndefined();
    expect(cloudLoginState(rec, { now: NOW + 11 * MIN })).toBe('ready');
    expect(rec.limits).toEqual(room);
    expect(rec.readAt).toBe(NOW + 10 * MIN);
  });

  it('says it lifted the limit, so the caller can start the waiting threads', () => {
    const home = tmp();
    limited(home);
    expect(noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: room, readAt: NOW + MIN }, { home })).toBe('lifted');
    expect(noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: room, readAt: NOW + 2 * MIN }, { home })).toBe('read');
  });
});

describe('what leaves the limit in place', () => {
  it('a reading still at 100%', () => {
    const home = tmp();
    limited(home);
    noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: full, readAt: NOW + 10 * MIN }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + 11 * MIN })).toBe('limited');
  });

  it('a reading begun before the limit was marked, as when a run dies mid-look', () => {
    const home = tmp();
    limited(home, NOW);
    noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: room, readAt: NOW - MIN }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + MIN })).toBe('limited');
  });

  it('a reading taken the same moment the limit was marked', () => {
    const home = tmp();
    limited(home, NOW);
    noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: room, readAt: NOW }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + MIN })).toBe('limited');
  });

  it('an empty reading, which says nothing about room', () => {
    const home = tmp();
    limited(home);
    noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: [], readAt: NOW + 10 * MIN }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + 11 * MIN })).toBe('limited');
  });

  it('a mark with no time it was made, kept from before marks said when', () => {
    const home = tmp();
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', savedAt: 1 }, { home });
    markCloudLogin('claude', 'acct-1', 'id-1', { limitedUntil: NOW + 30 * MIN }, { home });
    noteCloudReading('claude', 'acct-1', 'id-1', { org: null, limits: room, readAt: NOW + 10 * MIN }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + 11 * MIN })).toBe('limited');
  });

  it('a reading of a sign-in the account has since replaced', () => {
    const home = tmp();
    limited(home);
    expect(noteCloudReading('claude', 'acct-1', 'id-old', { org: null, limits: room, readAt: NOW + 10 * MIN }, { home })).toBe('failed');
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!, { now: NOW + 11 * MIN })).toBe('limited');
  });
});

describe('a reading of the same account taken on this Mac', () => {
  // The usage corner reads the account in use every few minutes, and the
  // cloud runs on that account, so nobody has to press Refresh.
  const her = { profile: '/Users/her/.claude-2', email: 'her@example.com', org: 'org-1' };
  const make = (home: string) => {
    const s = new Supervisor(
      { storeRoot: home, home, maxConcurrentSessions: 3, authProfiles: [her.profile] },
      { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, recordSessionResult() {} } as never,
      home,
    );
    s._cloudLoginOf = (p: string) => (p === her.profile ? { ...cloudLoginFor('claude', 'acct-1', { home })!, key: 'acct-1' } : null);
    let woke = 0;
    s.wake = () => { woke += 1; };
    return { s, woke: () => woke };
  };

  it('with room in it, ends the cloud account\'s limit and starts the waiting threads', () => {
    const home = tmp();
    limited(home, Date.now() - 5 * MIN);
    const { s, woke } = make(home);
    s.noteUsageReading(her.profile, { at: Date.now(), limits: [{ percent: 3 }, { percent: 60 }] });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!)).toBe('ready');
    expect(woke()).toBeGreaterThan(0);
  });

  it('still at 100%, or read before the limit was marked, leaves it', () => {
    const home = tmp();
    limited(home, Date.now() - 5 * MIN);
    const { s, woke } = make(home);
    s.noteUsageReading(her.profile, { at: Date.now(), limits: [{ percent: 100 }, { percent: 60 }] });
    s.noteUsageReading(her.profile, { at: Date.now() - 10 * MIN, limits: [{ percent: 3 }] });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-1', { home })!)).toBe('limited');
    expect(woke()).toBe(0);
  });
});

describe('Try again on a thread the cloud account\'s limit holds', () => {
  const thread = { id: 'w-held', product: 'p', status: 'open', kind: 'directive', labels: ['founder'], priority: 2, createdAt: 1, updatedAt: 1, claim: null };
  const make = (state: string) => {
    const s = new Supervisor(
      { storeRoot: '/nonexistent-zero-root', home: '/nonexistent-home', maxConcurrentSessions: 1, authProfiles: ['default'] },
      { listItems: () => [thread], listProducts: () => [], isDue: () => true, settleAnswer() {}, answerItem: () => thread } as never,
      '/nonexistent-app',
    );
    s._saveState = () => {};
    s._roomFor = () => false;
    s._cloudInUseState = () => state;
    const looks: unknown[] = [];
    s.lookAtCloudLogins = async (o: unknown) => { looks.push(o); };
    return { s, looks };
  };

  it('reads the account afresh rather than only queueing the thread', () => {
    const { s, looks } = make('limited');
    expect(s.resumeItems(['w-held'])).toMatchObject({ queued: 1 });
    expect(looks).toEqual([{ force: true }]);
  });

  it('leaves the account alone when the cloud is not at its limit', () => {
    for (const state of ['ready', 'none', 'refused']) {
      const { s, looks } = make(state);
      s.resumeItems(['w-held']);
      expect(looks).toEqual([]);
    }
  });
});

describe('where the pieces meet', () => {
  const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

  it('a cloud run that ends on the limit says when it marked it', () => {
    expect(read('../main/cloud/run-cli.mts')).toMatch(/onLimit: \(\{ until \}\) => \{ if \(rec\) markCloudLogin\(engine, dir!, rec\.id, \{ limitedUntil: until, limitedAt: Date\.now\(\) \}\); \}/);
  });

  it('a look at the account saves its reading through the same rule', () => {
    expect(read('../main/cloud/logins.mts')).toMatch(/return noteCloudReading\('claude', key, rec\.id, \{ org: end\.org \?\? null, limits: end\.limits \?\? \[\], readAt: now \}, \{ home \}\)/);
  });

  it('a lifted limit starts the waiting threads without waiting for the next tick', () => {
    expect(read('../main/supervisor.mts')).toMatch(/if \(await lookAtCloudLogin\([\s\S]{0,300}\) === 'lifted'\) lifted = true;[\s\S]{0,400}if \(lifted\) \{[\s\S]{0,200}this\._cloudInUseSeen\?\.delete\(DEFAULT_ENGINE\);[\s\S]{0,100}this\.wake\?\.\(\);/);
  });
});
