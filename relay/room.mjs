// ONE MAC'S ROOM ON THE RELAY, and everything the relay does with what passes
// through it, which is to pass it on. Kept free of Cloudflare so it is tested
// as it is (tests/a-phone-reaches-the-mac-through-a-relay-that-reads-nothing);
// relay/worker.mjs is the thin part that ties it to a Durable Object.
//
// The Mac holds one socket open to its room. A phone sends one sealed request
// per http POST; the room hands it to the Mac under a number, and streams back
// what the Mac sends under that number, still sealed, until the Mac says it is
// done. The room never holds a key and never opens anything.
//
// What each message on the Mac's socket is, is in shared/relay-crypto.mjs
// (TO_MAC, FROM_MAC), where the Mac's end reads it too.
import { lengthPrefixed, TO_MAC, FROM_MAC, ID_BYTES as ID, PART_BYTES, tag } from '../shared/relay-crypto.mjs';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (data) => (data instanceof Uint8Array ? data : new Uint8Array(data));

const said = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const MAC_AWAY = 'Your computer is not connected. Open Agentbox on it and keep it awake, then try again.';

export class Room {
  // 256 unanswered at once: 64 was reached by one phone on a busy computer
  // (2026-10-13), and a request waiting costs the room one entry in a map.
  constructor({ firstFrameMs = 30_000, maxPending = 256 } = {}) {
    this.mac = null;
    this.pending = new Map();
    this.firstFrameMs = firstFrameMs;
    this.maxPending = maxPending;
  }

  /** The Mac is here. A second one takes the room; the first is let go. */
  connectMac(sock) {
    if (this.mac && this.mac !== sock) {
      try { this.mac.close(4000, 'Another connection from this computer took over.'); } catch { /* already gone */ }
      this.dropAll();
    }
    this.mac = sock;
  }

  /** The Mac's socket closed. Everything waiting on it ends now, not later. */
  macGone(sock) {
    if (sock && this.mac !== sock) return;
    this.mac = null;
    this.dropAll();
  }

  dropAll() {
    for (const p of this.pending.values()) p.fail();
    this.pending.clear();
  }

  /** One message off the Mac's socket. */
  fromMac(data) {
    const bytes = bytesOf(data);
    if (bytes.length < 1 + ID) return;
    const p = this.pending.get(hex(bytes.subarray(1, 1 + ID)));
    if (!p) return;
    if (bytes[0] === FROM_MAC.FRAME) p.frame(bytes.slice(1 + ID));
    else if (bytes[0] === FROM_MAC.DONE) p.done();
    else if (bytes[0] === FROM_MAC.REFUSED) p.refused();
  }

  /** One sealed request from a phone; answers with the Mac's sealed frames. */
  fromPhone(body, signal) {
    const mac = this.mac;
    if (!mac) return Promise.resolve(said(503, MAC_AWAY));
    if (this.pending.size >= this.maxPending) return Promise.resolve(said(429, 'Too many requests at once.'));
    const id = globalThis.crypto.getRandomValues(new Uint8Array(ID));
    const key = hex(id);
    return new Promise((resolve) => {
      let controller;
      let started = false;
      let over = false;
      const end = () => {
        over = true;
        clearTimeout(timer);
        this.pending.delete(key);
      };
      const giveUp = () => {
        if (over) return;
        end();
        try { this.mac?.send(tag(TO_MAC.CANCEL, id)); } catch { /* gone */ }
      };
      const stream = new ReadableStream({ start(c) { controller = c; }, cancel: giveUp });
      const timer = setTimeout(() => {
        if (started) return;
        giveUp();
        resolve(said(504, 'Your computer did not answer in time.'));
      }, this.firstFrameMs);
      this.pending.set(key, {
        frame(sealed) {
          if (!started) {
            started = true;
            clearTimeout(timer);
            resolve(new Response(stream, { status: 200, headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } }));
          }
          try { controller.enqueue(lengthPrefixed(sealed)); } catch { /* the phone left */ }
        },
        done() {
          end();
          if (!started) resolve(said(502, 'Your computer sent an empty answer.'));
          else try { controller.close(); } catch { /* already */ }
        },
        refused() {
          end();
          if (!started) resolve(said(400, 'Your computer turned this request away.'));
          else try { controller.error(new Error('refused')); } catch { /* already */ }
        },
        fail() {
          over = true;
          clearTimeout(timer);
          if (!started) resolve(said(503, MAC_AWAY));
          else try { controller.error(new Error(MAC_AWAY)); } catch { /* already */ }
        },
      });
      signal?.addEventListener?.('abort', giveUp);
      try {
        // In pieces when it is big: a photo a phone attaches is several MB,
        // and one socket message to the Mac carries 1 MB at most.
        const all = bytesOf(body);
        let at = 0;
        while (all.length - at > PART_BYTES) {
          mac.send(tag(TO_MAC.PART, id, all.subarray(at, at + PART_BYTES)));
          at += PART_BYTES;
        }
        mac.send(tag(TO_MAC.REQUEST, id, all.subarray(at)));
      } catch {
        end();
        resolve(said(503, MAC_AWAY));
      }
    });
  }
}
