// A RUN THAT NEVER BEGINS IS STOPPED LIKE ONE THAT HUNG.
//
// Power test round 2, issues 34 and 17, and the watcher's "a thread had no
// answer and no word from the app for 10 minutes": a thread sat on "Thinking
// 12m" after Picked Ship it, and nothing stopped it or said a word. The stand-in
// agent had hung on purpose before doing anything. The hang check
// (`reapHungSessions`) wants ten minutes of silence AND a lapsed claim, and a run
// that never claimed its row has no claim to lapse, so it could wait for ever.
// Reproduced in a live copy with [[stub:hang]]: twelve minutes in, no "went
// quiet" line in the app's log, the trace held only its header, and the thread
// still read Thinking. Measured here on the check itself.
//
// A worker's first step is to claim its row, and every step after is traced. A
// run with neither, silent for ten minutes, has not started. One that has done
// anything keeps the old rule: silence alone can be a long build.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { spoolDir } from '../main/approvals.mts';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-never-began-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const MIN = 60_000;
const NOW = 1_790_218_800_000;

function makeSupervisor() {
  const written = [];
  const store = {
    listItems: () => [],
    listProducts: () => [{ slug: 'payments', name: 'Payments', dir: path.join(tmp, 'payments') }],
    isDue: () => true,
    recordSessionResult: (slug, id, patch) => written.push({ slug, id, ...patch }),
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  return { sup, written };
}

// Its last frame `quietFor` ago, a second after it started.
function run(sup, id, { quietFor, traced = false, cloud = false, adopted = false, remoteIdle = false }) {
  const session = { itemId: id, product: 'payments', startedAt: NOW - quietFor - 1000, lastOutputAt: adopted ? undefined : NOW - quietFor, tail: [], killed: 0, traced, cloud, adopted, remoteIdle };
  session.child = { kill: () => { session.killed += 1; } };
  sup.sessions.set(id, session);
  return session;
}
const unclaimed = (id) => ({ id, product: 'payments', status: 'open', claim: null, claimExpired: false });

describe('a run that has claimed nothing and done nothing', () => {
  it('is stopped after ten minutes of silence, the way a hung one is', () => {
    const { sup, written } = makeSupervisor();
    const s = run(sup, 'w-84f7341dc7', { quietFor: 12 * MIN });
    expect(sup.reapHungSessions([unclaimed('w-84f7341dc7')], NOW)).toEqual(['w-84f7341dc7']);
    expect(s.killed).toBe(1);
    expect(s.hung).toBe(true);
    expect(written).toEqual([]);
  });

  it('is left alone before the ten minutes are up', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-slow', { quietFor: 9 * MIN });
    expect(sup.reapHungSessions([unclaimed('w-slow')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('the second time, stays stopped and says so on its row', () => {
    const { sup, written } = makeSupervisor();
    run(sup, 'w-84f7341dc7', { quietFor: 11 * MIN });
    sup.reapHungSessions([unclaimed('w-84f7341dc7')], NOW);
    sup.sessions.delete('w-84f7341dc7');
    run(sup, 'w-84f7341dc7', { quietFor: 11 * MIN });
    sup.reapHungSessions([unclaimed('w-84f7341dc7')], NOW + 20 * MIN);
    expect(written).toHaveLength(1);
    expect(written[0].status).toBe('blocked');
    expect(written[0].result).toMatch(/^\*\*Reply to start this task again\.\*\*/);
  });
});

describe('what the check still leaves alone', () => {
  it('a run that did something and then went quiet without a claim, as a long build does', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-build', { quietFor: 40 * MIN, traced: true });
    expect(sup.reapHungSessions([unclaimed('w-build')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('a run whose claim is still beating, whatever it has done', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-render', { quietFor: 40 * MIN });
    const beating = { id: 'w-render', product: 'payments', status: 'claimed', claim: { holder: 'mcp-1', leaseUntil: NOW + 3 * MIN }, claimExpired: false };
    expect(sup.reapHungSessions([beating], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  // Picked back up after the app restarted: what it did before is not in this
  // session's memory, and its first frame since may still be on its way.
  it('a run picked back up after a restart', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-adopted', { quietFor: 30 * MIN, adopted: true });
    expect(sup.reapHungSessions([unclaimed('w-adopted')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  it('a session holding its input for a turn from Remote Control', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-remote', { quietFor: 45 * MIN, remoteIdle: true });
    expect(sup.reapHungSessions([unclaimed('w-remote')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });

  // A Codex run traces nothing until a step completes, so one stopped on its
  // first permission card is silent and unclaimed while it waits for you.
  it('a run waiting on your answer to the permission card it raised', () => {
    const { sup } = makeSupervisor();
    const dir = spoolDir(tmp);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'card-1.request.json'),
      JSON.stringify({ id: 'card-1', at: NOW, product: 'payments', item: 'w-asks', tool: 'Bash', input: { command: 'npm test' } }));
    const s = run(sup, 'w-asks', { quietFor: 25 * MIN });
    const other = run(sup, 'w-hung', { quietFor: 25 * MIN });
    expect(sup.reapHungSessions([unclaimed('w-asks'), unclaimed('w-hung')], NOW)).toEqual(['w-hung']);
    expect(s.killed).toBe(0);
    expect(other.killed).toBe(1);
  });

  it('a run in the cloud, which can be quiet while its machine starts', () => {
    const { sup } = makeSupervisor();
    const s = run(sup, 'w-cloud', { quietFor: 15 * MIN, cloud: true });
    expect(sup.reapHungSessions([unclaimed('w-cloud')], NOW)).toEqual([]);
    expect(s.killed).toBe(0);
  });
});

describe('what counts as having done something', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'main/supervisor.mts'), 'utf8');
  it('is any line the run puts in its trace', () => {
    const absorb = src.slice(src.indexOf('const absorb = (...frame: unknown[]) => {'), src.indexOf('harness.subscribe(child, session, absorb);'));
    expect(absorb).toMatch(/const detail = traceOne\(\.\.\.frame\);\s*\n\s*if \(detail\) session\.traced = true;/);
  });
});
