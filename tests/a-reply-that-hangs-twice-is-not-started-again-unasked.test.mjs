// A REPLY THAT HANGS TWICE IS NOT STARTED AGAIN UNASKED.
//
// The second time a run went quiet with its claim lapsed, `reapHungSessions`
// wrote "the agent stopped responding twice ... is not restarting it on its
// own" and stopped it. On a run carrying her reply, the kill counted as ours,
// so `settleDelivery` put the reply back in the queue and a third run started
// anyway, under a row that said none would: a loop with a sentence saying
// there was no loop. Measured by driving the reap and the settle on one reply:
// after the second hang the reply was owed again.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-hung-reply-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const MIN = 60_000;
const NOW = 1_790_218_800_000;

function makeSupervisor() {
  const written = [];
  const store = {
    listItems: () => [],
    listProducts: () => [{ slug: 'astral', name: 'Astral', dir: path.join(tmp, 'astral') }],
    isDue: () => true,
    recordSessionResult: (slug, id, patch) => written.push({ slug, id, ...patch }),
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  return { sup, written };
}

const item = {
  id: 'w-reply', product: 'astral', status: 'open', answer: 'please carry on',
  wrote: { answer: { ts: NOW - 70 * MIN, source: 'founder' } },
  claim: { holder: 'mcp-1', leaseUntil: NOW - 45 * MIN }, claimExpired: true,
};

// A run carrying her reply, started (so the reply is marked delivered) and
// then silent for `quietFor`.
function startHungRun(sup, quietFor) {
  sup._handledAnswers.add(sup._answerKey(item, item.answer));
  const session = { itemId: item.id, product: 'astral', startedAt: NOW - 60 * MIN, lastOutputAt: NOW - quietFor, tail: [], result: null };
  session.child = { kill: () => {} };
  sup.sessions.set(item.id, session);
  return session;
}

function hangAndExit(sup, now) {
  const session = startHungRun(sup, 20 * MIN);
  sup.reapHungSessions([item], now);
  sup.sessions.delete(item.id);
  return sup.settleDeliveryAndSay(item, item.answer, session, 'SIGTERM');
}

describe('a run carrying her reply that hangs', () => {
  it('the first time, goes back in the queue and nothing is written', () => {
    const { sup, written } = makeSupervisor();
    hangAndExit(sup, NOW);
    expect(sup._answerDelivered(item)).toBe(false);
    expect(written).toEqual([]);
  });

  it('the second time, stays stopped: the reply is not owed again and only the one sentence is written', () => {
    const { sup, written } = makeSupervisor();
    hangAndExit(sup, NOW);
    hangAndExit(sup, NOW + 30 * MIN);
    expect(sup._answerDelivered(item)).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0].result).toMatch(/not restarting it on its own/);
    expect(written[0].status).toBe('blocked');
  });

  it('a second hang long after the first is a first hang again', () => {
    const { sup, written } = makeSupervisor();
    hangAndExit(sup, NOW);
    hangAndExit(sup, NOW + 5 * 60 * MIN);
    expect(sup._answerDelivered(item)).toBe(false);
    expect(written).toEqual([]);
  });
});
