// A HUNDRED WRITERS IN ONE LIVE DOC ALL KEEP THEIR WORDS.
//
// Before live rooms, a document was a chain of whole-file saves merged three
// ways. Measured on 2026-11-06 by replaying N saves through that merge
// (shared/text-merge.mjs): two people typing at the same spot kept one person's words, ten
// writers to a paragraph kept 10 of 50 and 10 of 200 edits, and a table kept one
// edit out of any number. A live room merges every keystroke, so this holds the
// line at every writer count, at the same spot, and for the case that must not
// match: a writer who deleted words does not get them back.
import { describe, it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createRoom } from '../cloud/live/room.mjs';
import { connectLive } from '../renderer/src/live/client.ts';
import { pairedSockets } from './helpers/live-sockets.mts';

const rooms = [];
afterEach(() => { for (const r of rooms.splice(0)) r.close(); });

function setUp(n, { seedText = 'Start.' } = {}) {
  const room = createRoom({ tickMs: 5 });
  rooms.push(room);
  const writers = Array.from({ length: n }, (_, i) => {
    const doc = new Y.Doc();
    const live = connectLive({
      doc,
      hello: { name: `Writer ${i}`, kind: i % 5 === 0 ? 'agent' : 'person', canSave: i === 0 },
      open: () => pairedSockets(room),
      flushMs: 5,
      awarenessMs: 5,
      applyMs: 0,
    });
    return { doc, live, text: () => doc.getText('t') };
  });
  return { room, writers, seedText };
}

const settle = async (writers, room) => {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 10));
    const all = writers.every((w) => w.live.state() === 'live' && !w.live.pending());
    const same = writers.every((w) => w.text().toString() === writers[0].text().toString());
    if (all && same && !room.pending()) return;
  }
};

describe('a live doc', () => {
  for (const n of [2, 10, 100, 200]) {
    it(`keeps every word of ${n} writers typing at the same spot`, async () => {
      const { room, writers } = setUp(n);
      await settle(writers, room);
      writers[0].text().insert(0, 'Start.');
      await settle(writers, room);
      writers.forEach((w, i) => w.text().insert(w.text().length, ` W${i}X`));
      await settle(writers, room);
      const end = writers[0].text().toString();
      for (let i = 0; i < n; i++) expect(end).toContain(`W${i}X`);
      for (const w of writers) expect(w.text().toString()).toBe(end);
      expect(end.match(/Start\./g)).toHaveLength(1);
    }, 20_000);
  }

  it('does not bring back words a writer deleted', async () => {
    const { room, writers } = setUp(3);
    await settle(writers, room);
    writers[0].text().insert(0, 'keep drop keep');
    await settle(writers, room);
    writers[1].text().delete(5, 5);
    writers[2].text().insert(writers[2].text().length, ' more');
    await settle(writers, room);
    expect(writers[0].text().toString()).toBe('keep keep more');
    expect(writers[2].text().toString()).toBe('keep keep more');
  });

  it('hands seeding to exactly one writer of an empty room, and keeping to one who can save', async () => {
    const { room, writers } = setUp(5);
    await settle(writers, room);
    expect(writers.filter((w) => w.live.room().seed)).toHaveLength(1);
    expect(writers.map((w) => w.live.room().keeper)).toEqual([true, false, false, false, false]);
  });

  it('asks a copy holding the file to fill an empty room, not one that joined first without it', async () => {
    const room = createRoom({ tickMs: 5 });
    rooms.push(room);
    const make = (hello) => connectLive({ doc: new Y.Doc(), hello: { name: 'x', ...hello }, open: () => pairedSockets(room), flushMs: 5 });
    const watcher = make({ canSeed: false });
    await new Promise((r) => setTimeout(r, 30));
    const holder = make({});
    await new Promise((r) => setTimeout(r, 60));
    expect([watcher.room().seed, holder.room().seed]).toEqual([false, true]);
  });

  it('passes keeping on when the keeper leaves, and to nobody who cannot save', async () => {
    const room = createRoom({ tickMs: 5 });
    rooms.push(room);
    const make = (canSave) => connectLive({ doc: new Y.Doc(), hello: { name: 'x', canSave }, open: () => pairedSockets(room), flushMs: 5 });
    const a = make(true); const b = make(false); const c = make(true);
    await new Promise((r) => setTimeout(r, 60));
    expect([a.room().keeper, b.room().keeper, c.room().keeper]).toEqual([true, false, false]);
    a.close();
    await new Promise((r) => setTimeout(r, 60));
    expect([b.room().keeper, c.room().keeper]).toEqual([false, true]);
  });

  it('gives keeping to the file owner over a teammate who joined first', async () => {
    const room = createRoom({ tickMs: 5 });
    rooms.push(room);
    const make = (hello) => connectLive({ doc: new Y.Doc(), hello: { name: 'x', ...hello }, open: () => pairedSockets(room), flushMs: 5 });
    const mate = make({ canSave: true });
    await new Promise((r) => setTimeout(r, 30));
    const owner = make({ canSave: true, owner: true });
    await new Promise((r) => setTimeout(r, 60));
    expect([mate.room().keeper, owner.room().keeper]).toEqual([false, true]);
  });

  it('tells everyone who is in the room, and forgets someone who left', async () => {
    const { room, writers } = setUp(4);
    await settle(writers, room);
    writers[1].live.awareness.setLocalStateField('at', { cell: 'r1|c2' });
    await new Promise((r) => setTimeout(r, 80));
    const seen = () => [...writers[0].live.awareness.getStates().values()].map((s) => s.who?.name).filter(Boolean).sort();
    expect(seen()).toEqual(['Writer 0', 'Writer 1', 'Writer 2', 'Writer 3']);
    expect([...writers[0].live.awareness.getStates().values()].find((s) => s.who?.name === 'Writer 1').at).toEqual({ cell: 'r1|c2' });
    writers[3].live.close();
    await new Promise((r) => setTimeout(r, 80));
    expect(seen()).toEqual(['Writer 0', 'Writer 1', 'Writer 2']);
  });
});
