// A CLOUD ACCOUNT'S LIMIT IS NOT THIS MAC'S.
//
// What broke (2026-10-16): with the cloud set to Everything, the cloud's own
// Claude account hit its session limit. Fourteen cloud runs between 3:18 and
// 3:22pm ended "You've hit your session limit · resets 12:10am (UTC)" (UTC is
// the cloud machine's clock; the Mac is in Pacific time). Each one was charged
// to the Mac account named on the session, so Settings said the Mac's
// account was "At its limit" while its own usage read 5% this session and 9%
// this week, and threads sat idle with the cloud set to Everything. Measured
// off the app's saved state and the session logs that day.
//
// Now a cloud run's limit benches the cloud account it ran on, until the hour
// the line names, and leaves every account on this Mac alone; the reply that
// hit it is not charged a try. A limit read off a cloud line keeps its zone.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { limitResetMoment } from '../shared/spawn-trouble.mjs';
import { recordCloudLogin, markCloudLogin, cloudLoginState, mayRunOn, pickCloudLogin } from '../main/cloud/logins.mjs';
import { limitInResultLine } from '../main/cloud/run.mjs';

const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-limit-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const LIMIT = "You've hit your session limit · resets 12:10am (UTC)";
const make = (root) => new Supervisor(
  { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['/Users/her/.claude-2'] },
  { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
  root,
);
const ended = (over = {}) => ({
  itemId: 'w-a', engine: 'claude', profile: '/Users/her/.claude-2',
  startedAt: Date.now() - 5000, result: LIMIT, resultIsError: true, tail: [], ...over,
});

describe('a run that ends on a limit', () => {
  it('in the cloud leaves the Mac account alone, and the reply is not charged', () => {
    const sup = make(tmp());
    const session = ended({ cloud: true });
    sup.noteExitForBackoff(session);
    expect(sup._profileTrouble?.['/Users/her/.claude-2']).toBeUndefined();
    expect(sup._profileCooldown?.['/Users/her/.claude-2'] ?? 0).toBe(0);
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(session.accountFault?.cause).toBe('at-limit');
  });

  it('on this Mac still benches the Mac account', () => {
    const sup = make(tmp());
    sup.noteExitForBackoff(ended({ cloud: false, result: "You've hit your session limit · resets 7:59pm" }));
    expect(sup._profileTrouble['/Users/her/.claude-2'].cause).toBe('at-limit');
  });

  it('a cloud run that worked does not clear a real limit on the Mac account', () => {
    const sup = make(tmp());
    sup.noteExitForBackoff(ended({ cloud: false, result: "You've hit your session limit · resets 7:59pm" }));
    sup.noteExitForBackoff(ended({ cloud: true, result: 'done', resultIsError: false }));
    expect(sup._profileTrouble['/Users/her/.claude-2'].cause).toBe('at-limit');
  });
});

describe('a limit already charged to the Mac by a cloud run', () => {
  it('is dropped when the app opens, and one the Mac printed is kept', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify({
      profileTrouble: {
        '/Users/her/.claude-2': { since: 1, at: 1, cause: 'at-limit', raw: LIMIT, resetsAt: Date.now() + 3_600_000 },
        '/Users/her/.claude-3': { since: 1, at: 1, cause: 'at-limit', raw: "You've hit your session limit · resets 7:59pm (America/Los_Angeles)", resetsAt: Date.now() + 3_600_000 },
      },
    }));
    const sup = make(root);
    const utcMac = Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC';
    expect(!!sup._profileTrouble['/Users/her/.claude-2']).toBe(utcMac);
    expect(sup._profileTrouble['/Users/her/.claude-3'].cause).toBe('at-limit');
  });
});

describe('the cloud account that hit it', () => {
  // IT SITS OUT UNTIL THE HOUR AND NOTHING TAKES ITS PLACE (w-dac993a554).
  // Runs used to go to the next cloud account, which is one person's work
  // moved onto a second subscription to get past a usage limit.
  it('sits out until the hour, and the cloud runs nothing until then', () => {
    const home = tmp();
    recordCloudLogin('claude', 'a', { id: 'id-a', savedAt: 1 }, { home });
    recordCloudLogin('claude', 'b', { id: 'id-b', savedAt: 2 }, { home });
    const until = Date.now() + 3_600_000;
    markCloudLogin('claude', 'a', 'id-a', { limitedUntil: until }, { home });
    const a = { engine: 'claude', id: 'id-a', limitedUntil: until };
    expect(cloudLoginState(a)).toBe('limited');
    expect(mayRunOn('limited')).toBe(false);
    expect(cloudLoginState(a, { now: until + 1 })).toBe('ready');
    expect(pickCloudLogin('claude', { home })).toBe(null);
    // And it is back on its own the moment the hour passes.
    expect(pickCloudLogin('claude', { home, now: until + 1 }).id).toBe('id-a');
  });
});

describe('reading the limit off the cloud run\'s output', () => {
  const now = Date.UTC(2026, 9, 16, 22, 20);
  it('takes the hour from a failed result, in the zone it names', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: LIMIT });
    expect(limitInResultLine(line, now)).toBe(Date.UTC(2026, 9, 17, 0, 10));
  });
  it('a limit with no hour benches for a while rather than not at all', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: "You've hit your usage limit" });
    expect(limitInResultLine(line, now)).toBeGreaterThan(now);
  });
  it('ignores a result that worked, whatever it says, and any other line', () => {
    expect(limitInResultLine(JSON.stringify({ type: 'result', is_error: false, result: `I read "${LIMIT}" in the log` }), now)).toBeNull();
    expect(limitInResultLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: LIMIT }] } }), now)).toBeNull();
    expect(limitInResultLine('not json', now)).toBeNull();
    expect(limitInResultLine(JSON.stringify({ type: 'result', is_error: true, result: 'Something else broke' }), now)).toBeNull();
  });
});

describe('a reset hour that names UTC', () => {
  it('is read in UTC, and one with no zone in the Mac\'s own', () => {
    const from = Date.UTC(2026, 9, 16, 22, 20);
    expect(limitResetMoment(LIMIT, from)).toBe(Date.UTC(2026, 9, 17, 0, 10));
    const local = new Date(from); local.setHours(19, 59, 0, 0);
    if (local.getTime() < from - 60_000) local.setDate(local.getDate() + 1);
    expect(limitResetMoment("You've hit your session limit · resets 7:59pm", from)).toBe(local.getTime());
  });
});
