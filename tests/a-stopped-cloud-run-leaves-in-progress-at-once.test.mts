// A power tester pressed Stop on a working cloud thread (2026-11-09): the toast
// said "Agent stopped", but the thread stayed IN PROGRESS with Stop still
// offered, its activity moving from part-4 to part-5 "in the cloud", once for
// twelve minutes. A cloud run winds down for minutes after the kill (its events,
// the work coming home), and until its process exited it stayed in the list
// In progress and the activity line are drawn from.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

function make() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stopped-cloud-'));
  dirs.push(root);
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [], isDue: () => true } as never,
    root,
  );
  for (const id of ['w-stop', 'w-other']) {
    sup.sessions.set(id, { itemId: id, product: 'p', engine: 'claude', cloud: true, startedAt: Date.now(), child: { kill() {} }, tail: [] } as never);
  }
  return sup;
}
const going = (sup: Supervisor) => sup.runsGoing().map((s) => s.itemId);

describe('a cloud run the person stopped', () => {
  it('leaves In progress the moment Stop is pressed, though its process is still winding down', () => {
    const sup = make();
    expect(sup.stopSession('w-stop')).toBe(true);
    expect(sup.sessions.has('w-stop')).toBe(true);
    expect(going(sup)).toEqual(['w-other']);
    expect(sup.cloudStatus().running).toBe(1);
  });

  it('still holds its cloud slot until it has gone', () => {
    const sup = make();
    sup.stopSession('w-stop');
    expect(sup._cloudLoad()).toBe(2);
  });

  it('a run the app stopped to move it is still going', () => {
    const sup = make();
    sup._kill(sup.sessions.get('w-stop') as never);
    expect(going(sup)).toEqual(['w-stop', 'w-other']);
  });
});
