// AN ACCOUNT CARD NEVER SAYS "AT ITS LIMIT" AGAINST ITS OWN NEWER NUMBERS.
//
// What broke (2026-11-01, w-e3f619dc81): on the Claude Code page a second
// account read "Max 20x · At its limit" over a Week meter at 13%, checked three
// minutes before, while the account that really was full (Week 100%) said
// nothing of the kind. The words came from a mark filed when a run on that
// login died at a limit; the meters came from the cloud's reading of the same
// account. A local reading taken after the mark clears it
// (`Supervisor#noteUsageReading`), but a cloud reading never did, so the mark
// stayed for good and the card contradicted itself.
//
// The fix: a reading taken after the mark wins on the card, and a cloud reading
// clears a limit mark the way a local one does. A mark newer than every reading
// still says so, with the hour it is back when the mark knows it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';
import { Supervisor } from '../main/supervisor.mts';

const NOW = new Date(2026, 10, 1, 15, 30).getTime();
const MIN = 60_000;
const at = (h, m = 0) => new Date(2026, 10, 1, h, m).getTime();
const AT_LIMIT = 'At its limit. Agents start again on their own when it resets.';
const week = (percent) => ({ span: 'week', qualifier: 'all models', name: 'This week', percent, resetsText: null, resetsOn: null, resetsAt: new Date(2026, 10, 5, 9).getTime(), zone: null });
const session = (percent) => ({ ...week(percent), span: 'session', qualifier: null, name: 'This session', resetsAt: at(17, 10) });

const here = (extra = {}) => ({ profile: 'p2', email: 'second@example.test', plan: 'Max 20x', chosen: false, signedIn: true, trouble: AT_LIMIT, atLimit: true, limitAt: NOW - 10 * MIN, limitResetsAt: null, dir: '/Users/x/.claude-2', ...extra });
const account = (extra = {}) => ({ key: 'p2', name: 'second@example.test', plan: 'Max 20x', here: here(), cloud: null, limits: [week(13)], checkedAt: NOW - 3 * MIN, usageError: null, ...extra });
const tile = (a) => accountTile(a, { many: true, now: NOW, onUse: vi.fn() });
const draw = (t) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [t], now: NOW }));

describe('the card', () => {
  it('the reported case: a reading after the mark at 13% says nothing about a limit', () => {
    const t = tile(account());
    expect(t.about).toEqual([]);
    expect(draw(t)).not.toContain('At its limit');
  });

  it('a reading taken the same minute as the mark wins too', () => {
    expect(tile(account({ checkedAt: NOW - 10 * MIN })).about).toEqual([]);
  });

  it('a mark newer than the reading still says so, with the hour it is back', () => {
    const t = tile(account({ here: here({ limitAt: NOW - MIN, limitResetsAt: at(17, 10) }) }));
    expect(t.about).toEqual(['At its limit, back at 5:10pm']);
  });

  it('a limit that resets on another day names the day', () => {
    const t = tile(account({ here: here({ limitAt: NOW - MIN, limitResetsAt: new Date(2026, 10, 5, 9).getTime() }) }));
    expect(t.about).toEqual(['At its limit, back Thu 9am']);
  });

  it('a newer mark with no hour in it says it plainly', () => {
    expect(tile(account({ here: here({ limitAt: NOW - MIN }) })).about).toEqual(['At its limit']);
  });

  it('a mark whose hour has gone by does not name a past hour', () => {
    expect(tile(account({ here: here({ limitAt: NOW - MIN, limitResetsAt: at(15) }) })).about).toEqual(['At its limit']);
  });

  it('must NOT say it beside a full meter, which already does', () => {
    expect(tile(account({ limits: [session(100), week(13)] })).about).toEqual([]);
    expect(tile(account({ limits: [session(100)], here: here({ limitAt: NOW - MIN }) })).about).toEqual([]);
  });

  it('must NOT drop a mark that came with no time on it', () => {
    expect(tile(account({ here: here({ limitAt: null }) })).about).toEqual(['At its limit']);
  });
});

describe('a cloud reading of the same account', () => {
  const LIMIT = "You've hit your session limit";
  const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
  let root;
  let second;
  let sup;
  const deadOnArrival = (words, profile) => ({
    itemId: 'w-test', product: 'agentbox', profile, startedAt: Date.now() - 2_000,
    tail: [`stderr: ${words}`, 'session exited (1)'],
  });
  const cloudSays = (percents, readAt, profile = second) => {
    sup._cloudAccounts = () => [{ engine: 'claude', key: 'c1', profile, readAt, limits: percents.map((p, i) => (i ? week(p) : session(p))) }];
    return sup._noteCloudReadings();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-cloud-proof-'));
    second = path.join(root, 'home', '.claude-2');
    fs.mkdirSync(second, { recursive: true });
    sup = new Supervisor(
      { home: path.join(root, 'home'), storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default', second] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    sup.noteExitForBackoff(deadOnArrival(LIMIT, second));
  });

  afterEach(() => {
    try { sup.stop?.(); } catch {}
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the reported case: read after the mark with nothing full, the limit mark goes', () => {
    expect(sup._profileTrouble[second].cause).toBe('at-limit');
    expect(cloudSays([5, 13], NOW + MIN)).toBe(true);
    expect(sup._profileTrouble[second]).toBeUndefined();
  });

  it('must NOT clear it when the cloud reads a full limit', () => {
    expect(cloudSays([100, 13], NOW + MIN)).toBe(false);
    expect(sup._profileTrouble[second].cause).toBe('at-limit');
  });

  it('must NOT clear it with a reading from before the mark', () => {
    expect(cloudSays([5, 13], NOW - MIN)).toBe(false);
    expect(sup._profileTrouble[second].cause).toBe('at-limit');
  });

  it('must NOT clear a signed-out mark: the cloud signs in with its own login', () => {
    sup._clearProfileTrouble(second);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, second));
    expect(cloudSays([5, 13], NOW + MIN)).toBe(false);
    expect(sup._profileTrouble[second].cause).toBe('signed-out');
  });

  it('must NOT touch a folder the cloud login is not paired with', () => {
    expect(cloudSays([5, 13], NOW + MIN, null)).toBe(false);
    expect(sup._profileTrouble[second].cause).toBe('at-limit');
  });
});
