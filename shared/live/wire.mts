// The frames a live room and its copies send each other: one type byte, then
// the payload. Updates and awareness are Yjs's own bytes, passed through.

export const HELLO = 0; // copy -> room: json { name, kind, canSave, person, color }
export const SYNC = 1; // copy -> room: the copy's state vector
export const SYNC_REPLY = 2; // room -> copy: what the copy lacks, then the room's state vector
export const UPDATE = 3; // both ways: a Yjs update, merged per tick
export const AWARENESS = 4; // both ways: a y-protocols awareness update
export const ROOM = 5; // room -> copy: json { seed, keeper, people }

export type LiveFrame =
  | { type: typeof HELLO | typeof ROOM; body: unknown }
  | { type: typeof SYNC_REPLY; update: Uint8Array; stateVector: Uint8Array }
  | { type: typeof SYNC | typeof UPDATE | typeof AWARENESS; body: Uint8Array };

const enc = new TextEncoder();
const dec = new TextDecoder();

export function frame(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 1);
  out[0] = type;
  out.set(payload, 1);
  return out;
}

export const jsonFrame = (type: number, value: unknown): Uint8Array => frame(type, enc.encode(JSON.stringify(value)));

export function syncReply(update: Uint8Array, stateVector: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 4 + update.length + stateVector.length);
  out[0] = SYNC_REPLY;
  new DataView(out.buffer).setUint32(1, update.length);
  out.set(update, 5);
  out.set(stateVector, 5 + update.length);
  return out;
}

/** { type, body } for any frame, with SYNC_REPLY split and json parsed. Null when it is not one. */
export function readFrame(data: Uint8Array | ArrayBuffer): LiveFrame | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!bytes.length) return null;
  const type = bytes[0];
  const body = bytes.subarray(1);
  if (type === HELLO || type === ROOM) {
    try { return { type, body: JSON.parse(dec.decode(body)) as unknown }; } catch { return null; }
  }
  if (type === SYNC_REPLY) {
    if (body.length < 4) return null;
    const n = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0);
    return { type, update: body.subarray(4, 4 + n), stateVector: body.subarray(4 + n) };
  }
  if (type === SYNC || type === UPDATE || type === AWARENESS) return { type, body };
  return null;
}
