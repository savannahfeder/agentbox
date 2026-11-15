// A power tester moved a working cloud thread to This Mac (2026-11-09), as the
// Runs on menu offers ("work comes back here and carries on"). The thread ended
// in Needs you: "Claude Code stopped partway through and did not finish this
// task. Auto retry at 2:27pm", with no word of the move. The move kills the
// cloud run on purpose, but its trace ended in a bare "# exited (143)", which
// the pass over stranded rows reads as a run that died.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { readDeadRunTrace, traceShowsASilentDeath, MOVED_HERE, STOPPED_ON_REQUEST } from '../shared/dead-run-trace.mts';

const RAN = '# t\n# w-1 · spawned 2026-11-09T17:00:00.000Z\n\n17:01:02  Reading the waitlist page.\n17:01:03  [Read] src/part-3.js\n';
const exited = (code: number, mark = '') => `${RAN}\n# exited (${code}) 2026-11-09T17:05:00.000Z${mark}\n`;

describe('the trace of a cloud run moved to this Mac', () => {
  it('is not a death', () => {
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(143, MOVED_HERE)))).toBe(false);
  });

  it('a Stop still is not, and a bare kill or a failure still is', () => {
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(143, STOPPED_ON_REQUEST)))).toBe(false);
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(143)))).toBe(true);
    expect(traceShowsASilentDeath(readDeadRunTrace(exited(1)))).toBe(true);
  });
});

describe('keeping a running cloud thread on this Mac', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const make = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-here-'));
    dirs.push(root);
    const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true } as never, root);
    sup._saveState = () => {};
    return sup;
  };

  it('marks the cloud run it ends as moved', () => {
    const sup = make();
    const killed: string[] = [];
    sup.sessions.set('w-1', { itemId: 'w-1', product: 'p', engine: 'claude', cloud: true, child: { kill: () => killed.push('w-1') }, tail: [] } as never);
    sup.setThreadOnMac({ 'w-1': true });
    expect(killed).toEqual(['w-1']);
    expect(sup.sessions.get('w-1')).toMatchObject({ movedHere: true, stoppedByUs: true });
  });

  it('leaves a run on this Mac alone', () => {
    const sup = make();
    sup.sessions.set('w-2', { itemId: 'w-2', product: 'p', engine: 'claude', cloud: false, child: { kill() { throw new Error('killed'); } }, tail: [] } as never);
    sup.setThreadOnMac({ 'w-2': true });
    expect(sup.sessions.get('w-2')).not.toHaveProperty('movedHere');
  });
});
