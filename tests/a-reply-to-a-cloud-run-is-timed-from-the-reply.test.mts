// A REPLY TO A CLOUD RUN IS TIMED FROM THE REPLY, NOT FROM THE RUN'S FIRST START.
//
// Reported 2026-11-09 with a screenshot: a reply sent 10 minutes earlier sat
// over "53m in the cloud". A cloud session stays open between turns
// (`WAIT_FOR_NEXT_REPLY_MS`), so the reply went into a session that had first
// started about 43 minutes before it, and every timer read `startedAt`, the
// session's first start. `_nextTurn` already kept `turnStartedAt`; nothing
// drew it. `startedAt` stays as it is because it names the run's log file.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mts';
import { Supervisor, WAIT_FOR_NEXT_REPLY_MS } from '../main/supervisor.mts';
import { Name } from '../shared/product-name.mjs';
import { liveLine, runningSince } from '../renderer/src/live-line';
import { bylineFacts } from '../renderer/src/byline';

const MIN = 60_000;

describe('the timer under a running thread', () => {
  const now = 1_791_900_000_000;
  const item = { id: 'w-1', product: 'p', title: 't', status: 'claimed', kind: 'directive', labels: ['founder'], createdAt: now - 2 * 3600e3, updatedAt: now - MIN };
  const session = (extra = {}) => ({ itemId: 'w-1', product: 'p', startedAt: now - 53 * MIN, tail: [], where: 'cloud', ...extra });

  it('counts from the reply on a cloud run that took one between turns', () => {
    const s = session({ turnStartedAt: now - 10 * MIN });
    expect(runningSince(s)).toBe(now - 10 * MIN);
    expect(bylineFacts(item, { session: s, inProgress: true, now }).span).toBe('10m');
    expect(liveLine(item, { session: s, now }).line).toBe('The agent is working, 10 minutes in.');
  });

  it('says just started when the reply went in seconds ago, however old the run', () => {
    const s = session({ turnStartedAt: now - 20_000 });
    expect(bylineFacts(item, { session: s, inProgress: true, now }).span).toBe('just now');
    expect(liveLine(item, { session: s, now }).line).toBe('The agent just started on this.');
  });

  it('counts from the run\'s start on its first turn', () => {
    const s = session();
    expect(runningSince(s)).toBe(now - 53 * MIN);
    expect(bylineFacts(item, { session: s, inProgress: true, now }).span).toBe('53m');
  });
});

describe('what the supervisor hands the window and the phone', () => {
  let tmp;
  afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

  function fakeChild() {
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stdin = { writable: true, write: () => true, end: () => { c.stdin.writable = false; }, on: () => {} };
    return c;
  }

  function setUp() {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-timer-'));
    const row = { id: 'w-r', product: 'p', status: 'claimed', epoch: 3, labels: ['founder'], title: 'r', wrote: {} };
    const store = {
      listItems: () => [row],
      listProducts: () => [{ slug: 'p', name: Name, dir: path.join(tmp, 'p') }],
      isDue: () => true,
      readItem: () => row,
      recordSessionResult: () => {},
      releaseRunClaim: () => {},
      settleAnswer: () => {},
    };
    const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
    sup._saveState = () => {};
    sup.storeMcpCommand = () => '/bin/agentbox-mcp.sh';
    const child = attachClaudeInput(fakeChild());
    child.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
    const s = { child, itemId: row.id, product: 'p', startedAt: Date.now() - 43 * MIN, tail: [], cloud: true, engine: 'claude', ranOn: { model: null, effort: null } };
    sup.sessions.set(row.id, s);
    return { sup, row, s };
  }

  it('gives the reply\'s start beside the run\'s, and the phone the reply\'s', () => {
    const { sup, row, s } = setUp();
    s.result = 'First answer.';
    sup._turnOver(row, s, { continuation: false, answerAtSpawn: null });
    sup._nextTurn(s);
    const [running] = sup.status().running;
    expect(running.startedAt).toBe(s.startedAt);
    expect(running.turnStartedAt).toBe(s.turnStartedAt);
    expect(sup.liveFor('p', 'w-r').since).toBe(s.turnStartedAt);
    expect(s.turnStartedAt - s.startedAt).toBeGreaterThanOrEqual(43 * MIN);
  });

  it('gives only the run\'s start on a first turn', () => {
    const { sup, s } = setUp();
    const [running] = sup.status().running;
    expect(running.turnStartedAt).toBeUndefined();
    expect(sup.liveFor('p', 'w-r').since).toBe(s.startedAt);
  });
});
