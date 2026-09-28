// A SESSION THAT DIES WITHOUT EXITING IS STOPPED, SO HER ROW MOVES AGAIN.
//
// w-3a14ab56d6, 2026-09-23. A Codex turn logged its last line at 19:10:56 and
// its store heartbeats stopped the same minute. The turn never ended, so the
// exit handler never ran, the row stayed in `sessions`, and every check that
// could have noticed skips a row with a live session. She waited 50 minutes on
// a row reading In progress and then typed "stuck?".
//
// The rule is both signals at once: silent for ten minutes AND the claim's
// lease lapsed. A long render is silent but still heartbeating; a session that
// never claimed has no lease to lapse. Neither of those is touched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-hung-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const MIN = 60_000;
const NOW = 1_790_218_800_000;

function makeSupervisor() {
  const written = [];
  const store = {
    listItems: () => [],
    listProducts: () => [{ slug: 'astral', name: Name, dir: path.join(tmp, 'astral') }],
    isDue: () => true,
    recordSessionResult: (slug, id, patch) => written.push({ slug, id, ...patch }),
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  return { sup, written };
}

function liveSession(sup, id, { quietFor }) {
  const session = { itemId: id, product: 'astral', startedAt: NOW - 60 * MIN, lastOutputAt: NOW - quietFor, tail: [], killed: 0 };
  session.child = { kill: () => { session.killed += 1; } };
  sup.sessions.set(id, session);
  return session;
}

const row = (id, { lapsed }) => ({
  id, product: 'astral', status: lapsed ? 'open' : 'claimed',
  claim: { holder: 'mcp-47927', leaseUntil: lapsed ? NOW - 45 * MIN : NOW + 3 * MIN },
  claimExpired: lapsed,
});

describe('a session that dies without exiting', () => {
  it('is stopped once it is silent and its claim has lapsed', () => {
    const { sup, written } = makeSupervisor();
    const s = liveSession(sup, 'w-3a14ab56d6', { quietFor: 50 * MIN });
    expect(sup.reapHungSessions([row('w-3a14ab56d6', { lapsed: true })], NOW)).toEqual(['w-3a14ab56d6']);
    expect(s.killed).toBe(1);
    expect(s.stoppedByUs).toBe(true);
    // The first time it is restarted quietly, not reported.
    expect(written).toEqual([]);
  });

  it('leaves a silent session alone while its claim is still beating', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-render', { quietFor: 40 * MIN });
    expect(sup.reapHungSessions([row('w-render', { lapsed: false })], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('leaves a lapsed claim alone while the session is still talking', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-talking', { quietFor: 2 * MIN });
    expect(sup.reapHungSessions([row('w-talking', { lapsed: true })], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('leaves a session that never claimed its row alone', () => {
    const { sup } = makeSupervisor();
    const s = liveSession(sup, 'w-personal', { quietFor: 90 * MIN });
    expect(sup.reapHungSessions([{ id: 'w-personal', product: 'astral', status: 'open' }], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('stops retrying and tells her on the second hang', () => {
    const { sup, written } = makeSupervisor();
    liveSession(sup, 'w-3a14ab56d6', { quietFor: 20 * MIN });
    sup.reapHungSessions([row('w-3a14ab56d6', { lapsed: true })], NOW);
    sup.sessions.delete('w-3a14ab56d6');
    const again = liveSession(sup, 'w-3a14ab56d6', { quietFor: 12 * MIN });
    sup.reapHungSessions([row('w-3a14ab56d6', { lapsed: true })], NOW + 30 * MIN);
    expect(again.killed).toBe(1);
    expect(written).toHaveLength(1);
    expect(written[0].status).toBe('blocked');
    expect(written[0].result).toMatch(/^\*\*Reply to start this task again\.\*\*/);
    expect(written[0].result).not.toMatch(/—/);
  });
});
