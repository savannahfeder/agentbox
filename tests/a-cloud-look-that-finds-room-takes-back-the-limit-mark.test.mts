// A CLOUD LOOK THAT FINDS ROOM TAKES BACK THE LIMIT MARK.
//
// What broke (2026-11-24): a cloud run hit the main Claude login's limit and
// marked that cloud login limited until 11:43. The person reset their limits,
// pressed Refresh, and at 11:23 the cloud's look read the week at 0%. The look
// saved the 0% and kept the mark, so Settings still called the login full and
// work was moved off it onto another login until the mark ran out. Measured
// from ~/.agentbox/cloud-logins.json: readAt 11:23:46, week 0%, limitedUntil
// 11:43:15.
//
// The rule itself is `noteCloudReading`'s (see
// a-reading-with-room-ends-the-cloud-accounts-limit); this holds the whole
// look, from the cloud's reading to the login's state.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudLoginFor, cloudLoginState, lookAtCloudLogin, markCloudLogin, recordCloudLogin } from '../main/cloud/logins.mts';

const transportSaying = (event: Record<string, unknown>) => ({
  invoke: async (_id: string, p: { action: string }) => (p.action === 'events' ? { ok: true, events: [{ seq: 1, kind: 'signin', ...event }] } : { ok: true }),
  stop: async () => {},
});
const storage = { getUrl: async () => 'https://example.test/login', putUrl: async () => 'https://example.test/put' };

describe('a cloud look and the limit mark on that login', () => {
  let home: string;
  const NOW = 1_800_000_000_000;
  const MARK = NOW + 20 * 60_000;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-look-limit-'));
    recordCloudLogin('claude', 'acct-1', { id: 'id-1' }, { home });
    markCloudLogin('claude', 'acct-1', 'id-1', { limitedUntil: MARK, limitedAt: NOW - 3 * 60_000 }, { home });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const look = (limits: unknown[]) => lookAtCloudLogin({
    transport: transportSaying({ state: 'saved', org: 'org-1', limits }) as never, storage: storage as never, key: 'acct-1', home, now: NOW,
  });
  const state = () => cloudLoginState(cloudLoginFor('claude', 'acct-1', { home }), { now: NOW });

  it('their case: the week reads 0% after a reset, so the login is ready again', async () => {
    expect(state()).toBe('limited');
    await look([{ span: 'week', percent: 0, resetsAt: NOW + 5 * 86_400_000 }]);
    expect(cloudLoginFor('claude', 'acct-1', { home })?.limitedUntil).toBeUndefined();
    expect(state()).toBe('ready');
  });

  it('99% on every limit is still room', async () => {
    await look([{ span: 'session', percent: 99, resetsAt: NOW + 3_600_000 }, { span: 'week', percent: 40, resetsAt: NOW + 86_400_000 }]);
    expect(state()).toBe('ready');
  });

  it('must NOT take the mark back when any limit reads 100%', async () => {
    await look([{ span: 'session', percent: 12, resetsAt: NOW + 3_600_000 }, { span: 'week', percent: 100, resetsAt: NOW + 86_400_000 }]);
    expect(cloudLoginFor('claude', 'acct-1', { home })?.limitedUntil).toBe(MARK);
    expect(state()).toBe('limited');
  });

  it('must NOT take the mark back when the look read no limits', async () => {
    await look([]);
    expect(state()).toBe('limited');
  });

  it('must NOT touch the mark when the look failed', async () => {
    await lookAtCloudLogin({ transport: transportSaying({ state: 'failed' }) as never, storage: storage as never, key: 'acct-1', home, now: NOW });
    expect(state()).toBe('limited');
  });
});
