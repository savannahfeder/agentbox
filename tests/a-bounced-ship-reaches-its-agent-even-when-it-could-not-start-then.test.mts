// A BOUNCED SHIP REACHES ITS AGENT EVEN WHEN THE AGENT COULD NOT START THEN.
//
// What broke (2026-11-23 and 2026-11-25): when a ship went red or hit a merge
// conflict, the app wrote "It did not ship, and it went back to its agent" and
// started the agent once, at that instant, with the failure. That start can be
// turned away (accounts resting, the Mac short of memory, a cloud wait, the
// Mac asleep), and a person's reply turned away goes back in the queue, but
// the failure did not: it was dropped. Two threads sat with the note and no
// run after it, one for three days and one for twenty hours, their fixes
// never reaching main. Measured on the store: both had the note as their
// newest word and no agent write after it.
//
// Now the failure is owed until the agent writes back. A pass with room hands
// it over, also after a restart, three runs at most, and a thread that is
// closed, marked to ship again, put off until later, or stopped by the person
// is left alone. A cloud run set aside on a branch goes back the same way.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const T0 = Date.parse('2026-11-25T18:40:00Z');
const realNow = Date.now;
let now: number; let root: string; let items: any[];

const row = (extra = {}) => ({
  id: 'w-bounced', product: 'p', title: 'Mend the widget', kind: 'task', status: 'open', labels: ['founder'],
  note: 'It did not ship, and it went back to its agent: 1 test failed, the first is tests/widget.test.mts',
  wrote: { result: { ts: T0 - 60_000, source: 'agent' }, note: { ts: T0, source: 'system' } },
  ...extra,
});

const FAILURE = 'Agentbox tried to ship your branch and it did not go out. Nothing was pushed.\n\nIt went red: tests/widget.test.mts';

type Start = { id: string; shipFailure: string | null | undefined };

function supervisor({ starts, room = () => true, canStart = () => true }: { starts: Start[]; room?: () => boolean; canStart?: () => boolean }) {
  const sup: any = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: (i: any, at: number) => !(i.runAt > at),
      readItem: (_p: string, id: string) => items.find((i) => i.id === id) ?? null,
    } as any,
    root, root, root,
  );
  sup.tick = async () => {};
  sup.wake = () => {};
  sup._roomFor = () => room();
  sup.spawnWorker = (item: any, opts: any = {}) => {
    if (!canStart()) return;
    starts.push({ id: item.id, shipFailure: opts.shipFailure });
    sup.sessions.set(item.id, { itemId: item.id, startedAt: now });
  };
  return sup;
}

// The run ends and its agent's last message is written on the thread.
function agentAnswers(sup: any) {
  sup.sessions.delete('w-bounced');
  now += 60_000;
  items[0].wrote = { ...items[0].wrote, result: { ts: now, source: 'agent' } };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'owed-ship-failure-'));
  now = T0;
  Date.now = () => now;
  items = [row()];
});
afterEach(() => { Date.now = realNow; });

describe('a ship failure whose hand-back was turned away', () => {
  it('reaches the agent on a later pass once there is room', () => {
    const starts: Start[] = [];
    let open = false;
    const sup = supervisor({ starts, canStart: () => open });
    sup._handBackShipFailure(items[0], FAILURE);
    expect(starts).toEqual([]);
    now += 15_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts).toEqual([]);
    open = true;
    now += 15_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts).toEqual([{ id: 'w-bounced', shipFailure: FAILURE }]);
  });

  it('is still owed after the app restarts', () => {
    const starts: Start[] = [];
    supervisor({ starts, canStart: () => false })._handBackShipFailure(items[0], FAILURE);
    const again = supervisor({ starts });
    now += 15_000;
    again.handOverOwedShipFailures(items, now);
    expect(starts).toEqual([{ id: 'w-bounced', shipFailure: FAILURE }]);
  });

  it('waits while there is no room, without starting anything', () => {
    const starts: Start[] = [];
    let open = false;
    const sup = supervisor({ starts, canStart: () => open, room: () => open });
    sup._handBackShipFailure(items[0], FAILURE);
    for (let i = 0; i < 4; i += 1) { now += 15_000; sup.handOverOwedShipFailures(items, now); }
    expect(starts).toEqual([]);
  });
});

describe('a ship failure handed over', () => {
  it('is handed over once: not again while its run is on, nor after the agent wrote back', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    sup._handBackShipFailure(items[0], FAILURE);
    expect(starts).toHaveLength(1);
    now += 15_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts).toHaveLength(1);
    agentAnswers(sup);
    sup.handOverOwedShipFailures(items, now);
    now += 15_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts).toHaveLength(1);
  });

  it('goes again when the run died before its agent wrote a word', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    sup._handBackShipFailure(items[0], FAILURE);
    sup.sessions.delete('w-bounced');
    now += 15_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts.map((s) => s.shipFailure)).toEqual([FAILURE, FAILURE]);
  });
});

describe('a ship that bounced before failures were kept', () => {
  it('is handed to its agent from the note the thread already shows', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    now += 3 * 24 * 3_600_000;
    sup.handOverOwedShipFailures(items, now);
    expect(starts).toHaveLength(1);
    expect(starts[0].shipFailure).toContain('tests/widget.test.mts');
    expect(starts[0].shipFailure).toContain('add the label');
  });

  it('is left alone when the agent or the person wrote after the note', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    items = [
      row({ id: 'w-answered', wrote: { result: { ts: T0 + 1, source: 'agent' }, note: { ts: T0, source: 'system' } } }),
      row({ id: 'w-replied', wrote: { answer: { ts: T0 + 1, source: 'founder' }, note: { ts: T0, source: 'system' } } }),
    ];
    sup.handOverOwedShipFailures(items, now + 15_000);
    expect(starts).toEqual([]);
  });

  it('is left alone when the note is over a week old, or is not the bounce', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    items = [row({ id: 'w-old' }), row({ id: 'w-other', note: 'Shipped as abc1234.' })];
    sup.handOverOwedShipFailures(items, T0 + 8 * 24 * 3_600_000);
    items = [row({ id: 'w-other', note: 'Shipped as abc1234.' })];
    sup.handOverOwedShipFailures(items, T0 + 15_000);
    expect(starts).toEqual([]);
  });
});

describe('a ship failure whose runs keep ending without a word', () => {
  it('is handed over three times at most, then left for the person', () => {
    const starts: Start[] = [];
    const sup = supervisor({ starts });
    sup._handBackShipFailure(items[0], FAILURE);
    for (let i = 0; i < 6; i += 1) {
      sup.sessions.delete('w-bounced');
      now += 15_000;
      sup.handOverOwedShipFailures(items, now);
    }
    expect(starts).toHaveLength(3);
  });
});

describe('a thread the failure is no longer owed to', () => {
  const leftAlone = (change: () => void) => {
    const starts: Start[] = [];
    const sup = supervisor({ starts, canStart: () => starts.length < 0 });
    sup._handBackShipFailure(items[0], FAILURE);
    change();
    now += 15_000;
    sup.spawnWorker = (item: any, opts: any) => starts.push({ id: item.id, shipFailure: opts?.shipFailure });
    sup.handOverOwedShipFailures(items, now);
    return starts;
  };

  it('is not started once it is closed', () => {
    expect(leftAlone(() => { items[0].status = 'done'; })).toEqual([]);
  });

  it('is not started once it is marked to ship again', () => {
    expect(leftAlone(() => { items[0].labels = ['founder', 'ship']; })).toEqual([]);
  });

  it('is not started while it is put off until later', () => {
    expect(leftAlone(() => { items[0].runAt = now + 3_600_000; })).toEqual([]);
  });

  it('is not started after the person stopped it', () => {
    expect(leftAlone(() => {
      items[0].status = 'blocked';
      items[0].wrote = { ...items[0].wrote, status: { ts: now, source: 'founder' } };
    })).toEqual([]);
  });
});
