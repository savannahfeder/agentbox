// KEEPING A THREAD ON THIS MAC STOPS A CLOUD RUN THE APP PICKED UP AFTER A RESTART.
//
// What they saw (w-a81175a837, 2026-10-24): they set a thread to "This Mac
// only", and six minutes later its run was still going in the cloud, 19
// minutes into one command, with the row still wearing the cloud. Measured by
// reading the code: `setThreadOnMac` stopped only a run in `sessions`. A cloud
// run that carried on while the app restarted is followed in `_comingHome`
// instead (`_followComingHome`), so the choice was saved and that run was left
// going. Stop already reached it (`stopSession`); this did not.
//
// Now keeping a thread here cancels that run too, the way its Stop would but
// without saying the person stopped it, and arms the sweep that brings it back
// here. Letting a thread go to the cloud, or keeping another one, leaves it be.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const product = { slug: 'p', repoPath: '/r' };
const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-onmac-joined-'));
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
};
const joined = (sup, id, stops) => {
  const view = { itemId: id, product: 'p', cloud: true, tail: [], stop: () => stops.push(id) };
  (sup._comingHome ??= new Map()).set(id, view);
  return view;
};

describe('a cloud run picked back up after a restart', () => {
  it('is cancelled when its thread is kept on this Mac, and the sweep is armed to bring it here', () => {
    const sup = make();
    const stops = [];
    const view = joined(sup, 'w-a', stops);
    sup._recoverPending = false;
    sup.setThreadOnMac({ 'w-a': true });
    expect(stops).toEqual(['w-a']);
    expect(sup._recoverPending).toBe(true);
    // It is moving, not stopped on request: it carries on here.
    expect(view.stoppedOnRequest).toBeFalsy();
  });

  it('is left going when its thread is let go to the cloud', () => {
    const sup = make();
    const stops = [];
    joined(sup, 'w-a', stops);
    sup.setThreadOnMac({ 'w-a': null });
    sup.setThreadOnMac({ 'w-a': false });
    expect(stops).toEqual([]);
  });

  it('is left going when a different thread is kept on this Mac', () => {
    const sup = make();
    const stops = [];
    joined(sup, 'w-a', stops);
    sup.setThreadOnMac({ 'w-b': true });
    expect(stops).toEqual([]);
  });

  it('is stopped once, through its session, where a session of ours also holds the thread', () => {
    const sup = make();
    const stops = [];
    const signals = [];
    joined(sup, 'w-a', stops);
    sup.sessions.set('w-a', { itemId: 'w-a', product: 'p', cloud: true, child: { kill: (s) => signals.push(s ?? 'SIGTERM') } });
    sup.setThreadOnMac({ 'w-a': true });
    expect(signals).toEqual(['SIGTERM']);
    expect(stops).toEqual([]);
  });
});
