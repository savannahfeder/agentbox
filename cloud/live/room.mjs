// ONE FILE'S LIVE ROOM, as the relay holds it. Every copy of the file that is
// open sends its edits here and gets everyone's back.
//
// Edits and cursors are gathered and sent once per tick, merged into one frame,
// rather than once per keystroke per person: with n people each typing, a
// frame per keystroke is n² frames, and a tick keeps it to n per tick.
//
// The room picks two copies: the one that fills an empty room from its file
// (`seed`), so two copies opening at once do not put the text in twice, and the
// one that writes versions back to disk (`keeper`), so a hundred people make one
// version, not a hundred. Both pass on when that copy leaves.
import * as Y from 'yjs';
import * as aw from 'y-protocols/awareness';
import { AWARENESS, HELLO, ROOM, SYNC, UPDATE, frame, jsonFrame, readFrame, syncReply } from '../../shared/live/wire.mts';

const MAX_FRAME = 8 * 1024 * 1024;

export function createRoom({ tickMs = 40, onEmpty = () => {} } = {}) {
  const doc = new Y.Doc();
  const awareness = new aw.Awareness(doc);
  awareness.setLocalState(null);
  const seats = [];
  let seeder = null;
  let keeper = null;
  let updates = [];
  const changed = new Set();
  let timer = null;
  let closed = false;
  const stats = { framesIn: 0, framesOut: 0, bytesIn: 0, bytesOut: 0, updatesIn: 0, ticks: 0, mostPeople: 0 };

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const seat = seats.includes(origin) ? origin : null;
    for (const id of added) { seat?.ids.add(id); changed.add(id); }
    for (const id of updated) changed.add(id);
    for (const id of removed) { seat?.ids.delete(id); changed.add(id); }
    soon();
  });

  const send = (seat, bytes) => {
    try { seat.conn.send(bytes); stats.framesOut += 1; stats.bytesOut += bytes.length; } catch { /* its close follows */ }
  };

  const empty = () => doc.store.clients.size === 0 && updates.length === 0;

  function roles() {
    const ready = seats.filter((s) => s.hello);
    // Only a copy holding the file can fill an empty room from it.
    const fillers = ready.filter((s) => s.hello.canSeed !== false);
    const nextSeeder = empty() ? (fillers.includes(seeder) ? seeder : fillers[0] ?? null) : null;
    // The owner's copy writes straight onto the file; anyone else's goes through the owner.
    const nextKeeper = ready.find((s) => s.hello.canSave && s.hello.owner) ?? ready.find((s) => s.hello.canSave) ?? null;
    seeder = nextSeeder;
    keeper = nextKeeper;
    for (const s of ready) {
      const now = { seed: s === seeder, keeper: s === keeper };
      if (s.told && s.told.seed === now.seed && s.told.keeper === now.keeper) continue;
      s.told = now;
      send(s, jsonFrame(ROOM, now));
    }
  }

  function tick() {
    timer = null;
    if (closed) return;
    stats.ticks += 1;
    const out = [];
    if (updates.length) {
      out.push(frame(UPDATE, updates.length === 1 ? updates[0] : Y.mergeUpdates(updates)));
      updates = [];
    }
    if (changed.size) {
      out.push(frame(AWARENESS, aw.encodeAwarenessUpdate(awareness, [...changed])));
      changed.clear();
    }
    for (const s of seats) if (s.synced) for (const f of out) send(s, f);
  }

  function soon() {
    if (timer || closed) return;
    timer = setTimeout(tick, tickMs);
  }

  function join(conn) {
    if (closed) { conn.close(); return { receive() {}, leave() {} }; }
    const seat = { conn, hello: null, ids: new Set(), synced: false, told: null };
    seats.push(seat);
    stats.mostPeople = Math.max(stats.mostPeople, seats.length);

    const receive = (data) => {
      if (closed || !seats.includes(seat)) return;
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      stats.framesIn += 1;
      stats.bytesIn += bytes.length;
      if (bytes.length > MAX_FRAME) { conn.close(); return; }
      const f = readFrame(bytes);
      if (!f) return;
      try {
        if (f.type === HELLO) {
          seat.hello = f.body && typeof f.body === 'object' ? f.body : {};
          roles();
        } else if (f.type === SYNC) {
          send(seat, syncReply(Y.encodeStateAsUpdate(doc, f.body), Y.encodeStateVector(doc)));
          seat.synced = true;
          const ids = [...awareness.getStates().keys()];
          if (ids.length) send(seat, frame(AWARENESS, aw.encodeAwarenessUpdate(awareness, ids)));
        } else if (f.type === UPDATE) {
          Y.applyUpdate(doc, f.body, seat);
          stats.updatesIn += 1;
          updates.push(f.body);
          if (seeder) roles();
          soon();
        } else if (f.type === AWARENESS) {
          aw.applyAwarenessUpdate(awareness, f.body, seat);
        }
      } catch {
        // A frame that does not apply is a copy we cannot trust to be in step.
        conn.close();
      }
    };

    const leave = () => {
      const at = seats.indexOf(seat);
      if (at < 0) return;
      seats.splice(at, 1);
      if (seat.ids.size) aw.removeAwarenessStates(awareness, [...seat.ids], 'leave');
      roles();
      if (!seats.length) { close(); onEmpty(); }
    };
    return { receive, leave };
  }

  function close() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    for (const s of seats.splice(0)) { try { s.conn.close(); } catch { /* gone */ } }
    awareness.destroy();
    doc.destroy();
  }

  return {
    join,
    close,
    pending: () => timer !== null,
    people: () => seats.length,
    stats: () => ({ ...stats, people: seats.length }),
    text: (name = 't') => doc.getText(name).toString(),
    doc,
  };
}
