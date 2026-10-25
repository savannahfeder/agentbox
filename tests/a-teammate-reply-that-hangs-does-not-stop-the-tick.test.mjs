// The tick that wakes teammates hands your chat message to a run that is
// already going (w-4bd7b5548b). That hand-off waits on the run, and the tick
// is the supervisor's: a run that never took the message would have stopped
// every teammate and every other thread from starting, without a word. It
// has a deadline now, and past it the page says the message has not landed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const make = (teammates) => new Supervisor(
  { storeRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-hang-')), maxConcurrentSessions: 2, teammateReplyDeadlineMs: 50, alphaTeammates: true },
  { listItems: () => [], listProducts: () => [], isDue: () => true, teammates },
  '/tmp',
);

describe('a reply to a running teammate', () => {
  it('that never lands is given up on by the tick, and said', async () => {
    const troubles = [];
    const outs = [];
    const teammates = {
      tick: async ({ deliver }) => { outs.push(await deliver('p', 'w-1', 'The checkout page')); return []; },
      noteTrouble: (t) => troubles.push(t),
    };
    const sup = make(teammates);
    sup.sessions.set('w-1', { product: 'p', child: { steer: () => new Promise(() => {}) } });
    const started = Date.now();
    await sup.serveTeammates();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(outs).toEqual(['late']);
    expect(troubles.join(' ')).toMatch(/taking a while to land/);
  });

  it('that lands in time is not called trouble', async () => {
    const troubles = [];
    const teammates = { tick: async ({ deliver }) => { await deliver('p', 'w-2', 'yes'); return []; }, noteTrouble: (t) => troubles.push(t) };
    const sup = make(teammates);
    sup.store.answerItem = () => ({ id: 'w-2' });
    sup.sessions.set('w-2', { product: 'p', child: { steer: async () => {} } });
    await sup.serveTeammates();
    expect(troubles).toEqual([]);
  });
});
