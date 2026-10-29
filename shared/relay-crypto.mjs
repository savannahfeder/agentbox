// THE RELAY'S LOCKS (relay/worker.mjs, main/relay-client.mts, relay/phone/).
//
// A phone away from home reaches the Mac through a relay we run. Everything
// that crosses it is sealed on one end and opened on the other with keys made
// from the phone's key, which is in the QR code and nowhere else: it never
// leaves the Mac except into the code, and the phone keeps it in the address's
// fragment, which a browser never sends. So the relay can pass messages and
// cannot read, alter or forge one.
//
// What the relay does see: a room name, and the Mac's proof that it may hold
// that room. The room is a hash of the proof, so the relay can check a Mac
// against it, and neither one tells it the key.
//
// Plain WebCrypto, so this one file runs on the Mac (Node), on Cloudflare, and
// in the phone's service worker.

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;
const SALT = enc.encode('agentbox-relay-v1');

export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function bits(key, info, length = 256) {
  const ikm = await subtle().importKey('raw', enc.encode(String(key)), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) }, ikm, length));
}

async function roomOf(proof) {
  return b64u(new Uint8Array(await subtle().digest('SHA-256', enc.encode(`agentbox-room:${proof}`))));
}

/** The room the relay knows this pair by, and the Mac's proof that it is the Mac's. */
export async function relayIds(key) {
  const proof = b64u(await bits(key, 'mac-proof'));
  return { room: await roomOf(proof), proof };
}

/** Is `proof` the proof for `room`? The relay asks this of every Mac. */
export async function macMayJoin(room, proof) {
  if (typeof room !== 'string' || typeof proof !== 'string' || !proof) return false;
  const want = await roomOf(proof);
  if (want.length !== room.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ room.charCodeAt(i);
  return diff === 0;
}

const aes = async (raw) => subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/** One key for each direction, so nothing sealed one way opens the other. */
export async function relayKeys(key) {
  return { up: await aes(await bits(key, 'phone-to-mac')), down: await aes(await bits(key, 'mac-to-phone')) };
}

/**
 * Seal `bytes` for the other end. `aad` names what it is (a request, or the
 * n-th frame of the answer to one request), so a frame cannot be passed off
 * as another. Out: 12 bytes of nonce, then the sealed bytes.
 */
export async function seal(key, bytes, aad) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

/** Open what `seal` made, or throw if a single bit of it was changed. */
export async function open(key, sealed, aad) {
  if (!(sealed instanceof Uint8Array) || sealed.length < 28) throw new Error('Too short to be sealed.');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12), additionalData: enc.encode(aad) }, key, sealed.subarray(12));
  return new Uint8Array(pt);
}

/* ------------------------------------------------------------- the wire */

// A request, phone to Mac, before it is sealed: four bytes giving the length of
// a json head, the head, then the body. The head carries a time and a random
// nonce, so the Mac can turn away one it has already answered.
export function packRequest(head, body = new Uint8Array(0)) {
  const h = enc.encode(JSON.stringify(head));
  const out = new Uint8Array(4 + h.length + body.length);
  new DataView(out.buffer).setUint32(0, h.length);
  out.set(h, 4);
  out.set(body, 4 + h.length);
  return out;
}

export function unpackRequest(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
  return { head, body: bytes.subarray(4 + n) };
}

// An answer, Mac to phone, is a run of frames, each sealed on its own: a head
// (status and headers), the body in pieces, and an end. The end is sealed too,
// so an answer cut short by anyone in between is seen to be cut short.
//
// WAIT comes before the head and says only "still working". A reply to an
// agent mid-step is answered when the agent takes it, which can be minutes,
// and the room gives a Mac 30 seconds to start answering. A phone that asks
// for these (`wait` in its request's head) skips them; one that does not
// never gets one.
export const FRAME = Object.freeze({ HEAD: 0, DATA: 1, END: 2, WAIT: 3 });

export const frameAad = (nonce, seq) => `res:${nonce}:${seq}`;

// ON THE MAC'S SOCKET TO THE RELAY one byte says what a message is, then eight
// bytes of request number, then whatever it carries:
//   to the Mac     0x01 a request (the sealed bytes)   0x02 the phone gave up
//                  0x03 a piece of a request too big for one message; the
//                       0x01 that follows carries the last piece
//   from the Mac   0x10 one sealed frame of the answer  0x11 done
//                  0x12 refused: it would not open, or it was a replay
export const TO_MAC = Object.freeze({ REQUEST: 0x01, CANCEL: 0x02, PART: 0x03 });
/** The most the relay puts in one socket message to the Mac. Cloudflare's limit is 1 MB. */
export const PART_BYTES = 512 * 1024;
export const FROM_MAC = Object.freeze({ FRAME: 0x10, DONE: 0x11, REFUSED: 0x12 });
export const ID_BYTES = 8;

export function tag(type, id, rest = new Uint8Array(0)) {
  const out = new Uint8Array(1 + ID_BYTES + rest.length);
  out[0] = type;
  out.set(id, 1);
  out.set(rest, 1 + ID_BYTES);
  return out;
}

// Between the relay and either end each sealed piece goes with its length in
// front, so one stream of bytes can carry many.
export function lengthPrefixed(bytes) {
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

/** Split a stream (or a reader of one) of length-prefixed pieces back into the pieces. */
export async function* pieces(source) {
  const reader = typeof source.getReader === 'function' ? source.getReader() : source;
  let buf = new Uint8Array(0);
  try {
    for (;;) {
      while (buf.length >= 4) {
        const n = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0);
        if (buf.length < 4 + n) break;
        yield buf.slice(4, 4 + n);
        buf = buf.subarray(4 + n);
      }
      const { value, done } = await reader.read();
      if (done) return;
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf, 0);
      next.set(value, buf.length);
      buf = next;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* cancelled under us */ }
  }
}
