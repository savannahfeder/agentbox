// A COPY'S END OF A LIVE ROOM (cloud/live/room.mjs). It keeps a Yjs document
// and its cursors in step with everyone else's through one socket.
//
// Edits are gathered for `flushMs` and sent as one frame, and the cursor is sent
// at most every `awarenessMs`, so typing fast with a hundred people in the room
// costs the room one frame per tick from each of them.
//
// A dropped socket is tried again on a growing wait, a fixed number of times,
// then the copy says it is off. Edits made meanwhile stay in the document and
// go up with the next sync, because the sync sends whatever the room lacks.
import * as Y from 'yjs';
import * as aw from 'y-protocols/awareness';
import { AWARENESS, HELLO, ROOM, SYNC, SYNC_REPLY, UPDATE, frame, jsonFrame, readFrame } from '../../../shared/live/wire.mts';

const RETRY_WAITS_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000, 30000];
const FROM_ROOM = 'live-room';

export type LiveState = 'connecting' | 'live' | 'offline' | 'off';
export interface LiveRoomRoles { seed: boolean; keeper: boolean }
export interface LiveConnection {
  awareness: aw.Awareness;
  state(): LiveState;
  room(): LiveRoomRoles;
  pending(): boolean;
  stats(): Record<string, number>;
  hold(on: boolean): void;
  again(): void;
  close(): void;
}
export interface LiveHello { name?: string; kind?: string; color?: string | null; person?: string | null; [field: string]: unknown }
interface AwarenessChange { added: number[]; updated: number[]; removed: number[] }

export function connectLive({ doc, hello = {}, open, flushMs = 50, awarenessMs = 100, applyMs = 100, onRoom = () => {}, onState = () => {} }: {
  doc: Y.Doc;
  hello?: LiveHello;
  open: () => WebSocket;
  flushMs?: number;
  awarenessMs?: number;
  applyMs?: number;
  onRoom?: (room: LiveRoomRoles) => void;
  onState?: (state: LiveState) => void;
}): LiveConnection {
  const awareness = new aw.Awareness(doc);
  awareness.setLocalStateField('who', { name: hello.name ?? 'Someone', kind: hello.kind ?? 'person', color: hello.color ?? null, person: hello.person ?? null });
  let sock: WebSocket | null = null;
  let state: LiveState = 'connecting';
  let room: LiveRoomRoles = { seed: false, keeper: false };
  let queue: Uint8Array[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  let awarenessOwed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let tries = 0;
  let closed = false;
  const stats = { framesOut: 0, bytesOut: 0, framesIn: 0, bytesIn: 0, reconnects: 0 };

  const setState = (s: LiveState) => { if (s !== state) { state = s; onState(s); } };
  const put = (bytes: Uint8Array): boolean => {
    if (!sock || sock.readyState !== 1) return false;
    try { sock.send(bytes); stats.framesOut += 1; stats.bytesOut += bytes.length; return true; } catch { return false; }
  };

  function flush() {
    flushTimer = null;
    if (state !== 'live' || !queue.length) return;
    const merged = queue.length === 1 ? queue[0] : Y.mergeUpdates(queue);
    if (put(frame(UPDATE, merged))) queue = [];
  }
  function sendAwareness() {
    awarenessTimer = null;
    if (!awarenessOwed || state !== 'live') return;
    awarenessOwed = false;
    put(frame(AWARENESS, aw.encodeAwarenessUpdate(awareness, [doc.clientID])));
    awarenessTimer = setTimeout(sendAwareness, awarenessMs);
  }

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === FROM_ROOM) return;
    queue.push(update);
    flushTimer ??= setTimeout(flush, flushMs);
  };
  doc.on('update', onDocUpdate);
  const onAwareness = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin === FROM_ROOM) return;
    if (![...added, ...updated, ...removed].includes(doc.clientID)) return;
    awarenessOwed = true;
    awarenessTimer ??= setTimeout(sendAwareness, 0);
  };
  awareness.on('update', onAwareness);

  // A busy room's edits are taken in at most every `applyMs`, so a window
  // redraws ten times a second rather than once per relay tick; a quiet
  // room's first edit is taken in the moment it lands.
  let incoming: Uint8Array[] = [];
  let applyTimer: ReturnType<typeof setTimeout> | null = null;
  let appliedAt = 0;
  function applyIncoming() {
    applyTimer = null;
    if (!incoming.length) return;
    const merged = incoming.length === 1 ? incoming[0] : Y.mergeUpdates(incoming);
    incoming = [];
    appliedAt = Date.now();
    Y.applyUpdate(doc, merged, FROM_ROOM);
  }
  let holding = false;
  function takeIn(update: Uint8Array) {
    incoming.push(update);
    if (applyTimer || holding) return;
    const wait = appliedAt + applyMs - Date.now();
    if (wait <= 0) applyIncoming();
    else applyTimer = setTimeout(applyIncoming, wait);
  }

  function forgetOthers() {
    const others = [...awareness.getStates().keys()].filter((id) => id !== doc.clientID);
    if (others.length) aw.removeAwarenessStates(awareness, others, FROM_ROOM);
  }

  function connect() {
    retryTimer = null;
    if (closed) return;
    setState(tries ? 'offline' : 'connecting');
    let s: WebSocket;
    try { s = open(); } catch { retry(); return; }
    sock = s;
    s.binaryType = 'arraybuffer';
    s.onopen = () => {
      put(jsonFrame(HELLO, hello));
      put(frame(SYNC, Y.encodeStateVector(doc)));
    };
    s.onmessage = (e: MessageEvent) => {
      const data: Uint8Array | ArrayBuffer = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
      stats.framesIn += 1;
      stats.bytesIn += data.byteLength ?? 0;
      const f = readFrame(data);
      if (!f) return;
      if (f.type === SYNC_REPLY) {
        Y.applyUpdate(doc, f.update, FROM_ROOM);
        queue = [];
        const lacks = Y.encodeStateAsUpdate(doc, f.stateVector);
        if (lacks.length > 2) put(frame(UPDATE, lacks));
        tries = 0;
        setState('live');
        awarenessOwed = true;
        sendAwareness();
      } else if (f.type === UPDATE) {
        takeIn(f.body);
      } else if (f.type === AWARENESS) {
        aw.applyAwarenessUpdate(awareness, f.body, FROM_ROOM);
      } else if (f.type === ROOM) {
        const body = (f.body ?? {}) as { seed?: unknown; keeper?: unknown };
        room = { seed: !!body.seed, keeper: !!body.keeper };
        onRoom(room);
      }
    };
    s.onclose = () => {
      if (sock !== s) return;
      sock = null;
      forgetOthers();
      if (closed) return;
      room = { seed: false, keeper: false };
      onRoom(room);
      retry();
    };
    s.onerror = () => {};
  }

  function retry() {
    if (closed) return;
    if (tries >= RETRY_WAITS_MS.length) { setState('off'); return; }
    setState('offline');
    stats.reconnects += 1;
    retryTimer = setTimeout(connect, RETRY_WAITS_MS[tries]);
    tries += 1;
  }

  connect();

  return {
    awareness,
    state: () => state,
    room: () => room,
    pending: () => queue.length > 0 || flushTimer !== null || incoming.length > 0,
    stats: () => ({ ...stats }),
    /** Holds others' edits while a press is placing the cursor, so one landing mid-click cannot move it back. */
    hold(on: boolean) {
      holding = !!on;
      if (!holding && incoming.length && !applyTimer) applyIncoming();
    },
    /** Tries again now, for a copy that said it was off. */
    again() { if (closed || sock) return; if (retryTimer) clearTimeout(retryTimer); tries = 0; connect(); },
    close() {
      if (closed) return;
      flush();
      closed = true;
      for (const t of [flushTimer, awarenessTimer, retryTimer, applyTimer]) if (t) clearTimeout(t);
      doc.off('update', onDocUpdate);
      awareness.off('update', onAwareness);
      const s = sock;
      sock = null;
      try { s?.close(); } catch { /* gone */ }
      awareness.destroy();
      setState('off');
    },
  };
}
