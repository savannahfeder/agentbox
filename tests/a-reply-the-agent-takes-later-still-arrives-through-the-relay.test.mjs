// A REPLY THE AGENT TAKES LATER STILL ARRIVES THROUGH THE RELAY (2026-10-13).
//
// "There have been several instances where I send a message on mobile then go
// back a bit later and the message isn't there."
//
// A reply to an agent that is working is answered when the agent TAKES it, at
// its next break (main/claude-input.mjs, steer), and a break can be minutes
// away. Measured in the code: the relay's room gives a Mac 30 seconds to start
// answering (relay/room.mjs, firstFrameMs) and then tells the phone "Your
// computer did not answer in time" and the Mac to stop. The phone read that as
// a failed send: it took the message off the screen and put the words back in
// the reply box, while the Mac went on and delivered it anyway. So every phone
// reply to a busy agent vanished at 30 seconds.
//
// Now a phone that understands it asks the Mac to say "still working" while
// it waits, as a sealed frame of its own; the room counts that as the answer
// starting, and the phone skips it. A phone from before this asks nothing and
// gets exactly what it got before, so the relay and the Mac can update in
// either order.
//
// This test then went red on main itself (2026-10-17), on a macOS runner
// taking 10.6 minutes where it usually takes 8. Nothing was wrong with the
// relay: the clock below was the real one scaled down 100x, which left the
// slack at 200 ms, and a stall that long before the Mac saw the request was
// enough. Measured by stalling the Mac's socket by a known amount: red at
// 200 ms for the reply and 300 ms for the quick answer, against 1200 ms for
// both once the clock below was widened.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createHandler, newToken } from '../main/serve.mjs';
import { relayIds, relayKeys, macMayJoin } from '../shared/relay-crypto.mjs';
import { Room } from '../relay/room.mjs';
import { createRelayClient } from '../main/relay-client.mjs';
import { tunnelFetch } from '../relay/phone/tunnel.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(10); } return false; };

function socketTo(room) {
  return class FakeSocket {
    constructor(url) {
      this.readyState = 0;
      const self = this;
      this.peer = { send: (bytes) => { if (self.readyState === 1) self.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }); }, close: () => self.close() };
      queueMicrotask(async () => {
        const u = new URL(url);
        const [, , roomName] = u.pathname.split('/');
        if (!(await macMayJoin(roomName, u.searchParams.get('proof')))) { this.readyState = 3; this.onclose?.({ code: 4001 }); return; }
        this.readyState = 1;
        room.connectMac(this.peer);
        this.onopen?.();
      });
    }
    send(data) { room.fromMac(new Uint8Array(data)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; room.macGone(this.peer); this.onclose?.({ code: 1000 }); }
  };
}

// The room gives up on a silent Mac after 1200 ms here (30 s on Cloudflare),
// the agent takes the reply after 2000 ms, and the Mac says it is still
// working every 120 ms (10 s for real). Wider than an even scaling down, to
// keep about a second of slack rather than 200 ms.
const FIRST_FRAME_MS = 1200;
const AGENT_TAKES_MS = 2000;
const STILL_WORKING_MS = 120;
const SLOWLY = 15_000;

let server, key, room, client, ctx, taken;

beforeAll(async () => {
  key = newToken();
  taken = [];
  const channels = new Map([
    ['zero:answer', async (_e, p) => { await wait(AGENT_TAKES_MS); taken.push(p.answer); return { ok: true }; }],
    ['zero:snapshot', async () => ({ items: [] })],
  ]);
  server = http.createServer(createHandler({ channels, token: () => key, listeners: new Set() }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  room = new Room({ firstFrameMs: FIRST_FRAME_MS });
  client = createRelayClient({ relayUrl: 'https://relay.test', key: () => key, port: () => port, WebSocketImpl: socketTo(room), waitMs: STILL_WORKING_MS, log: { warn() {}, info() {} } });
  client.start();
  // A Mac that never joined turns every case below into the room's 503, which
  // reads like the bug this test is about. Fail here instead.
  expect(await until(() => client.state().connected)).toBe(true);
  ctx = { room: (await relayIds(key)).room, keys: await relayKeys(key) };
});
afterAll(() => { client?.stop(); server?.close(); });

const phoneFetch = async (_url, init) => room.fromPhone(new Uint8Array(await new Response(init.body).arrayBuffer()), init.signal);
const reply = (answer, opts) => tunnelFetch(new Request('https://relay.test/api/zero:answer', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': key }, body: JSON.stringify({ product: 'p', id: 'w-1', answer }),
}), ctx, phoneFetch, opts);

describe('a reply the agent takes after the relay would have given up', () => {
  it('reaches the phone as sent, not as a failure', async () => {
    const res = await reply('please also fix the header');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(taken).toContain('please also fix the header');
  }, SLOWLY);

  it('and a quick answer is unchanged: no waiting frame gets in front of it', async () => {
    const res = await tunnelFetch(new Request('https://relay.test/api/zero:snapshot', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': key }, body: '{}',
    }), ctx, phoneFetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });
});

describe('a phone from before this', () => {
  it('asks for no waiting frames, so it gets what it always got: the room gives up at its limit', async () => {
    const res = await reply('an old phone', { wait: false });
    expect(res.status).toBe(504);
  }, SLOWLY);
});
