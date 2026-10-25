// THE MAC'S END OF THE RELAY (relay/worker.mjs is the middle, relay/phone/ the
// far end). With phones let in from "Anywhere", the Mac holds one socket open
// out to the relay, so nothing has to reach in to it: no port opened, no
// router touched, nothing installed on the phone.
//
// Each request that arrives is opened with the key only the Mac and the phone
// have (shared/relay-crypto.mjs), checked for a replay, and then asked of this
// Mac's own phone server on 127.0.0.1, exactly as a phone on the Wi-Fi would
// ask it. So the token, the files and every channel are guarded by the same
// code either way. The answer goes back sealed, a frame at a time, so the
// live event stream and a large picture both work.
import {
  relayIds, relayKeys, open, seal, unpackRequest, FRAME, frameAad, TO_MAC, FROM_MAC, ID_BYTES, tag,
} from '../shared/relay-crypto.mjs';

/** How far a phone's clock may be from this Mac's before a request is stale. */
const SKEW_MS = 5 * 60_000;
/** One sealed frame's most. Cloudflare takes up to 1MB per socket message. */
const CHUNK = 256 * 1024;
/** The most one request may carry, as the relay allows (relay/worker.mjs). */
const MAX_REQUEST = 32 * 1024 * 1024;
/** What a phone's request may carry on to the phone server. */
const PASS = ['accept', 'content-type', 'range', 'user-agent', 'if-none-match', 'x-agentbox-token', 'x-agentbox-device'];
/**
 * How often a slow answer says "still working" (FRAME.WAIT), well inside the
 * 30 s the room gives a Mac to start answering (relay/room.mjs).
 */
const WAIT_MS = 10_000;
/**
 * THE LINK IS CHECKED, NOT TRUSTED (tests/the-computer-notices-a-dead-relay-link-and-reconnects).
 * A socket that carries nothing cannot tell this end it has died: a laptop that
 * slept or changed networks kept one it believed open while the relay had let
 * it go, and phones were told the computer was not connected. So this end says
 * "ping" this often and the relay answers "pong" without waking the room.
 */
export const PING_MS = 25_000;
/** How long past a ping's turn a missing pong is allowed before the link is called dead. */
export const PONG_GRACE_MS = 10_000;
/** What the platform sends as text on the socket. Never a request: those are bytes. */
const PING = 'ping';
const PONG = 'pong';
/** What the phone does not want back: the relay's stream is its own framing. */
const DROP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding']);

const enc = new TextEncoder();
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function createRelayClient({
  relayUrl, key, port, WebSocketImpl = globalThis.WebSocket, fetchImpl = (...a) => globalThis.fetch(...a),
  log = console, onChange = () => {}, waitMs = WAIT_MS, pingMs = PING_MS, graceMs = PONG_GRACE_MS,
}) {
  let ws = null;
  let pinger = null;
  /** When the relay last answered a ping on this link; null until it ever has. */
  let ponged = null;
  /** When the ping timer last ran, to tell a sleep from a slow tick. */
  let ticked = 0;
  let want = false;
  let connected = false;
  let error = null;
  let retry = 1000;
  let timer = null;
  let gen = 0;
  let forKey = null;
  let ids = null;
  let keys = null;
  /** Requests answered lately, by nonce, so a recorded one sent again is refused. */
  const answered = new Map();
  /** Answers being sent, so a phone that gives up stops them. */
  const live = new Map();
  /** Pieces of requests too big for one message, until their last piece. */
  const parts = new Map();

  async function ready() {
    const k = key();
    if (k === forKey) return;
    ids = await relayIds(k);
    keys = await relayKeys(k);
    forKey = k;
    answered.clear();
  }

  function fresh(head) {
    const now = Date.now();
    for (const [n, at] of answered) if (now - at > 2 * SKEW_MS) answered.delete(n);
    if (typeof head?.nonce !== 'string' || head.nonce.length < 16) return false;
    if (!Number.isFinite(head.ts) || Math.abs(now - head.ts) > SKEW_MS) return false;
    if (answered.has(head.nonce)) return false;
    answered.set(head.nonce, now);
    return true;
  }

  const send = (sock, bytes) => { try { sock.send(bytes); } catch { /* the socket went; the phone hears from the relay */ } };

  async function answer(sock, id, sealed) {
    const k = keys;
    let head;
    let body;
    try {
      ({ head, body } = unpackRequest(await open(k.up, sealed, 'req')));
    } catch {
      send(sock, tag(FROM_MAC.REFUSED, id));
      return;
    }
    if (!fresh(head) || typeof head.path !== 'string' || !head.path.startsWith('/')) {
      send(sock, tag(FROM_MAC.REFUSED, id));
      return;
    }
    const ctl = new AbortController();
    const idh = hex(id);
    live.set(idh, ctl);
    let seq = 0;
    // One at a time, in order: each frame's number is sealed into it, and a
    // "still working" frame from the timer must not overtake the head.
    let queue = Promise.resolve();
    const frame = (type, payload) => (queue = queue.then(async () => {
      const plain = new Uint8Array(1 + payload.length);
      plain[0] = type;
      plain.set(payload, 1);
      send(sock, tag(FROM_MAC.FRAME, id, await seal(k.down, plain, frameAad(head.nonce, seq++))));
    }));
    // Until the answer starts, a phone that asked for it hears "still working".
    let waiting = head.wait ? setInterval(() => { frame(FRAME.WAIT, new Uint8Array(0)).catch(() => {}); }, waitMs) : null;
    const answering = () => { if (waiting) clearInterval(waiting); waiting = null; };
    let sentHead = false;
    try {
      const headers = { 'x-agentbox-relay': '1', 'x-forwarded-for': 'relay' };
      for (const name of PASS) if (head.headers?.[name]) headers[name] = String(head.headers[name]);
      const method = String(head.method || 'GET').toUpperCase();
      const res = await fetchImpl(`http://127.0.0.1:${port()}${head.path}`, {
        method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: ctl.signal,
      });
      answering();
      const out = {};
      res.headers.forEach((v, name) => { if (!DROP.has(name)) out[name] = v; });
      sentHead = true;
      await frame(FRAME.HEAD, enc.encode(JSON.stringify({ status: res.status, headers: out })));
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (let i = 0; i < value.length; i += CHUNK) await frame(FRAME.DATA, value.subarray(i, i + CHUNK));
        }
      }
      await frame(FRAME.END, new Uint8Array(0));
      send(sock, tag(FROM_MAC.DONE, id));
    } catch (err) {
      answering();
      if (ctl.signal.aborted) return;
      log.warn?.('[relay] answering failed:', err?.message ?? err);
      try {
        await queue.catch(() => {});
        if (!sentHead) {
          await frame(FRAME.HEAD, enc.encode(JSON.stringify({ status: 502, headers: { 'content-type': 'application/json' } })));
          await frame(FRAME.DATA, enc.encode(JSON.stringify({ error: 'Your computer could not answer that.' })));
        }
        await frame(FRAME.END, new Uint8Array(0));
      } catch { /* nothing more to say */ }
      send(sock, tag(FROM_MAC.DONE, id));
    } finally {
      answering();
      live.delete(idh);
    }
  }

  async function onMessage(sock, data) {
    if (typeof data === 'string') {
      if (data === PONG) ponged = Date.now();
      return;
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
      : data instanceof Uint8Array ? data
        : new Uint8Array(await data.arrayBuffer());
    if (bytes.length < 1 + ID_BYTES) return;
    const id = bytes.slice(1, 1 + ID_BYTES);
    const idh = hex(id);
    if (bytes[0] === TO_MAC.CANCEL) {
      live.get(idh)?.abort();
      live.delete(idh);
      parts.delete(idh);
    } else if (bytes[0] === TO_MAC.PART) {
      // A big request comes in pieces (relay/room.mjs); keep them until the
      // last, within a limit, so a stream of pieces cannot fill memory.
      const held = parts.get(idh) ?? { chunks: [], size: 0 };
      held.chunks.push(bytes.slice(1 + ID_BYTES));
      held.size += bytes.length - 1 - ID_BYTES;
      if (held.size > MAX_REQUEST) { parts.delete(idh); send(sock, tag(FROM_MAC.REFUSED, id)); return; }
      parts.set(idh, held);
    } else if (bytes[0] === TO_MAC.REQUEST) {
      const held = parts.get(idh);
      parts.delete(idh);
      const last = bytes.slice(1 + ID_BYTES);
      if (!held) { await answer(sock, id, last); return; }
      const whole = new Uint8Array(held.size + last.length);
      let at = 0;
      for (const c of held.chunks) { whole.set(c, at); at += c.length; }
      whole.set(last, at);
      await answer(sock, id, whole);
    }
  }

  // Two ways a link is known dead without waiting on the operating system: a
  // relay that has answered pings stops answering, or this timer ran far too
  // late, which is a laptop waking from sleep with every socket gone under it.
  // A relay that never answers (one deployed before pings) is only ever judged
  // by the second, so an old relay is not mistaken for a dead link.
  function startPinging(sock) {
    stopPinging();
    ponged = null;
    ticked = Date.now();
    pinger = setInterval(() => {
      const now = Date.now();
      const slept = now - ticked > pingMs * 2;
      ticked = now;
      const silent = ponged !== null && now - ponged > pingMs + graceMs;
      if (slept || silent) {
        log.info?.(`[relay] the link went quiet (${slept ? 'woke from sleep' : 'no answer to ping'}); reconnecting`);
        replace(sock);
        return;
      }
      send(sock, PING);
    }, pingMs);
  }

  function stopPinging() {
    if (pinger) clearInterval(pinger);
    pinger = null;
  }

  /** Let a dead link go and open a new one now, not after the backoff. */
  function replace(sock) {
    if (ws !== sock) return;
    stopPinging();
    ws = null;
    connected = false;
    for (const c of live.values()) c.abort();
    live.clear();
    try { sock.close(4002, 'No answer; reconnecting.'); } catch { /* already gone */ }
    if (timer) { clearTimeout(timer); timer = null; }
    retry = 1000;
    onChange();
    void connect();
  }

  function schedule() {
    if (!want || timer) return;
    timer = setTimeout(() => { timer = null; void connect(); }, retry);
    retry = Math.min(retry * 2, 30_000);
  }

  async function connect() {
    const mine = ++gen;
    try { await ready(); } catch (err) { error = String(err?.message ?? err); onChange(); schedule(); return; }
    if (!want || mine !== gen) return;
    const url = `${relayUrl.replace(/^http/, 'ws').replace(/\/+$/, '')}/mac/${ids.room}?proof=${encodeURIComponent(ids.proof)}`;
    let sock;
    try { sock = new WebSocketImpl(url); } catch (err) { error = `Could not reach the relay: ${err?.message ?? err}`; onChange(); schedule(); return; }
    ws = sock;
    sock.binaryType = 'arraybuffer';
    sock.onopen = () => {
      if (ws !== sock) return;
      connected = true;
      error = null;
      retry = 1000;
      startPinging(sock);
      onChange();
    };
    sock.onmessage = (event) => { if (ws === sock) void onMessage(sock, event.data); };
    sock.onerror = () => { if (ws === sock && !connected) error = 'Could not reach the relay.'; };
    sock.onclose = (event) => {
      if (ws !== sock) return;
      stopPinging();
      ws = null;
      const was = connected;
      connected = false;
      for (const c of live.values()) c.abort();
      live.clear();
      if (event?.code === 4001) error = 'The relay turned this computer away.';
      else if (was) error = null;
      onChange();
      schedule();
    };
  }

  return {
    start() {
      if (want) return;
      want = true;
      retry = 1000;
      void connect();
    },
    stop() {
      want = false;
      gen += 1;
      stopPinging();
      if (timer) { clearTimeout(timer); timer = null; }
      const sock = ws;
      ws = null;
      connected = false;
      for (const c of live.values()) c.abort();
      live.clear();
      try { sock?.close(1000, 'Phones from anywhere turned off.'); } catch { /* already */ }
      onChange();
    },
    /** The key was reset: the room is a new one. */
    restart() {
      if (!want) return;
      this.stop();
      this.start();
    },
    state: () => ({ connected, error, connecting: want && !connected && !error }),
  };
}
