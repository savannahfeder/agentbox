// A LIVE COPY THAT CANNOT REACH ITS ROOM SAYS SO AND STOPS.
//
// Nothing retries for ever and nothing fails in silence (CLAUDE.md). A copy
// whose relay is gone tries again on a growing wait, a fixed number of times,
// then reads "off", which the window takes as editing the file the old way.
// The edits made while it was away are kept and go up with the next sync.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { connectLive } from '../renderer/src/live/client.ts';
import { createRoom } from '../cloud/live/room.mjs';
import { pairedSockets } from './helpers/live-sockets.mts';

afterEach(() => { vi.useRealTimers(); });

const deadSocket = () => {
  const s = { readyState: 0, binaryType: 'arraybuffer' };
  s.send = () => {};
  s.close = () => {};
  setTimeout(() => { s.readyState = 3; s.onclose?.({ code: 1006 }); }, 0);
  return s;
};

describe('a copy whose relay is gone', () => {
  it('tries a fixed number of times, then is off', async () => {
    vi.useFakeTimers();
    let opens = 0;
    const live = connectLive({ doc: new Y.Doc(), open: () => { opens += 1; return deadSocket(); } });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(live.state()).toBe('off');
    expect(opens).toBe(9);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(opens).toBe(9);
  });

  it('is offline, not off, while it still has tries left', async () => {
    vi.useFakeTimers();
    const live = connectLive({ doc: new Y.Doc(), open: deadSocket });
    await vi.advanceTimersByTimeAsync(2000);
    expect(live.state()).toBe('offline');
    live.close();
  });

  it('holds others\' edits while a press places the cursor, then takes them all in', async () => {
    const room = createRoom({ tickMs: 5 });
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = connectLive({ doc: mine, open: () => pairedSockets(room), flushMs: 5, applyMs: 0 });
    const them = connectLive({ doc: theirs, open: () => pairedSockets(room), flushMs: 5, applyMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    me.hold(true);
    theirs.getText('t').insert(0, 'typed during the click');
    await new Promise((r) => setTimeout(r, 60));
    expect(mine.getText('t').toString()).toBe('');
    me.hold(false);
    expect(mine.getText('t').toString()).toBe('typed during the click');
    me.close(); them.close(); room.close();
  });

  it('sends what was typed while away once it is back', async () => {
    const room = createRoom({ tickMs: 5 });
    let up = false;
    const doc = new Y.Doc();
    const live = connectLive({ doc, open: () => (up ? pairedSockets(room) : deadSocket()), flushMs: 5 });
    doc.getText('t').insert(0, 'typed while away');
    await new Promise((r) => setTimeout(r, 50));
    expect(live.state()).toBe('offline');
    up = true;
    live.again();
    await new Promise((r) => setTimeout(r, 100));
    expect(live.state()).toBe('live');
    expect(room.text()).toBe('typed while away');
    live.close();
    room.close();
  });
});
