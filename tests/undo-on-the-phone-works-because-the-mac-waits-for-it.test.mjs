// UNDO ON THE PHONE WORKS, BECAUSE THE MAC WAITS FOR IT.
//
// What broke (2026-10-29, from the phone app): "Undo isn't working". The phone
// can only take a send back while her Mac has not claimed it, and her Mac
// looked every five seconds and claimed on sight, while the Undo stayed up for
// six. So Undo lost the race most of the time and read "Your computer already
// has it". Now the Mac leaves anything Undo can take back alone for eight
// seconds (shared/phone-undo.mjs), and takes it on the first pass after.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { heldForUndo, PHONE_UNDO_HOLD_MS, PHONE_UNDO_MS } from '../shared/phone-undo.mjs';
import { TOAST_GOES_MS } from '../mobile/src/lib/overlays';

const T0 = Date.parse('2026-10-29T12:00:00Z');
const at = (ms) => new Date(ms).toISOString();

describe('which phone sends wait out the Undo', () => {
  it('a reply, a new thread, a close, a snooze and a schedule, while young', () => {
    for (const kind of ['reply', 'new', 'close', 'snooze', 'schedule']) {
      expect(heldForUndo({ kind, createdAt: at(T0) }, T0 + 1000)).toBe(true);
    }
  });

  it('let go on the boundary and after it', () => {
    expect(heldForUndo({ kind: 'reply', createdAt: at(T0) }, T0 + PHONE_UNDO_HOLD_MS - 1)).toBe(true);
    expect(heldForUndo({ kind: 'reply', createdAt: at(T0) }, T0 + PHONE_UNDO_HOLD_MS)).toBe(false);
  });

  it('never a stop, a run-now or a permission answer, which have no Undo', () => {
    for (const kind of ['stop', 'run-now', 'approve', 'move-to-cloud', 'setting']) {
      expect(heldForUndo({ kind, createdAt: at(T0) }, T0)).toBe(false);
    }
  });

  it('not when this computer\'s clock is far behind the cloud, nor with no time at all', () => {
    expect(heldForUndo({ kind: 'reply', createdAt: at(T0) }, T0 - 5000)).toBe(true);
    expect(heldForUndo({ kind: 'reply', createdAt: at(T0) }, T0 - 120_000)).toBe(false);
    expect(heldForUndo({ kind: 'reply' }, T0)).toBe(false);
  });

  it('the Mac waits longer than the phone shows Undo', () => {
    expect(TOAST_GOES_MS).toBe(PHONE_UNDO_MS);
    expect(PHONE_UNDO_HOLD_MS).toBeGreaterThan(PHONE_UNDO_MS);
  });
});

describe('the Mac and an Undo pressed in time', () => {
  function setup(holdMs) {
    let clock = T0;
    const cloud = createMemoryCloud();
    cloud.now = () => clock;
    const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    const applied = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-undo-'));
    const inbox = createPhoneInbox({
      backend: mac,
      projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [{ id: 'w-1', title: 'Thread', status: 'open', updatedAt: T0 - 1000, createdAt: T0 - 5000 }],
      historyOf: () => [],
      apply: async (cmd) => { applied.push(cmd); },
      stateFile: path.join(dir, 'phone-inbox.json'),
      home: '/Users/someone',
      now: () => clock,
      ...(holdMs === undefined ? {} : { undoHoldMs: holdMs }),
    });
    return { cloud, mac, phone, inbox, applied, tick: (ms) => { clock += ms; } };
  }

  it('leaves a reply for the Undo window, then takes it', async () => {
    const t = setup(PHONE_UNDO_HOLD_MS);
    await t.phone.addPhoneCommand({ device: t.inbox.device, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' } });
    await t.inbox.syncOnce();
    expect(t.applied).toHaveLength(0);
    const [waiting] = t.cloud.phoneCommands;
    expect(waiting.claimedAt).toBeNull();
    t.tick(5000);
    await t.inbox.syncOnce();
    expect(t.applied).toHaveLength(0);
    t.tick(PHONE_UNDO_HOLD_MS);
    await t.inbox.syncOnce();
    expect(t.applied.map((c) => c.kind)).toEqual(['reply']);
  });

  it('a stop still goes at once', async () => {
    const t = setup(PHONE_UNDO_HOLD_MS);
    await t.phone.addPhoneCommand({ device: t.inbox.device, project: 'alpha', item: 'w-1', kind: 'stop', payload: {} });
    await t.inbox.syncOnce();
    expect(t.applied.map((c) => c.kind)).toEqual(['stop']);
  });
});
