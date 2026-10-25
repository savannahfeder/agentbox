// THE RELAY, on Cloudflare (relay/wrangler.toml; deployed by npm run relay:deploy).
//
// A phone away from home reaches its Mac through here with nothing installed
// on either: the Mac holds a socket open out to its room, the phone posts
// sealed requests to the same room, and the room passes sealed bytes between
// them (relay/room.mjs). Nothing here holds a key or opens anything; the room
// is named by a hash the Mac proves it owns (shared/relay-crypto.mjs).
//
// Beside that it serves only the first page and the phone's service worker
// (relay/phone/), and the icon. The inbox itself comes from the Mac through
// the tunnel, so this never has to change when the app does.
import { Room } from './room.mjs';
import { macMayJoin } from '../shared/relay-crypto.mjs';
import { SW, BOOT, BOOT_SCRIPT_HASH, ICON_B64 } from './dist/assets.mjs';

const ROOM = /^[A-Za-z0-9_-]{43}$/;
// NOTHING BUT HANDLERS IS EXPORTED FROM HERE: Cloudflare refuses to start a
// worker that exports anything else (measured in `wrangler dev`: "Incorrect
// type for map entry 'MAX_REQUEST'").

/** The most one request may carry: a picture or a file attached from the phone. */
const MAX_REQUEST = 32 * 1024 * 1024;

const PLAIN = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
};

let icon = null;
const iconBytes = () => (icon ??= Uint8Array.from(atob(ICON_B64), (c) => c.charCodeAt(0)));

function firstPage(boot) {
  const html = boot === 'stale' ? BOOT.replace('<html lang="en">', '<html lang="en" data-boot="stale">') : BOOT;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'none'; script-src '${BOOT_SCRIPT_HASH}'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      ...PLAIN,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    if (parts.length === 3 && (parts[1] === 'mac' || parts[1] === 't') && ROOM.test(parts[2])) {
      return env.ROOMS.get(env.ROOMS.idFromName(parts[2])).fetch(request);
    }
    if (url.pathname === '/relay-sw.js') {
      return new Response(SW, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/', ...PLAIN } });
    }
    if (url.pathname === '/phone-icon.png' || url.pathname === '/apple-touch-icon.png') {
      return new Response(iconBytes(), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', ...PLAIN } });
    }
    // Any other page is the first page: before the phone's worker is running
    // every address lands here, and the worker takes it from there.
    if (request.method === 'GET' || request.method === 'HEAD') return firstPage(url.searchParams.get('boot'));
    return new Response('Not found', { status: 404, headers: PLAIN });
  },
};

/** One Mac's room. Its socket survives the room sleeping between messages. */
export class RelayRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = new Room();
    // The computer's "ping" is answered here by the platform, without waking
    // the room, so a link that has died is found out (main/relay-client.mjs).
    if (typeof WebSocketRequestResponsePair === 'function') {
      ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('ping', 'pong'));
    }
    // Woken with more than one socket from the computer (an old one the
    // platform has not yet seen close), the newest is the live one. Taken in
    // the order they joined, so the last to take the room is the newest and
    // the older are let go, rather than whichever the platform lists last.
    for (const ws of [...ctx.getWebSockets('mac')].sort((a, b) => joined(a) - joined(b))) this.room.connectMac(ws);
  }

  /**
   * A room left with no socket takes the newest the computer still has open.
   * Without this, a room whose socket closed said "not connected" to every
   * phone while another of the computer's sockets sat open and unused, because
   * a computer that is not asked anything sends nothing to be noticed by.
   */
  adopt(except = null) {
    if (this.room.mac) return;
    const CLOSING = 2;
    const open = this.ctx.getWebSockets('mac').filter((ws) => ws !== except && !(ws.readyState >= CLOSING));
    const newest = open.sort((a, b) => joined(b) - joined(a))[0];
    if (newest) this.room.connectMac(newest);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [, kind, name] = url.pathname.split('/');
    if (kind === 'mac') {
      if (request.headers.get('upgrade') !== 'websocket') return new Response('A Mac connects with a socket.', { status: 426 });
      if (!(await macMayJoin(name, url.searchParams.get('proof') ?? ''))) return new Response('Not this room.', { status: 403 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['mac']);
      server.serializeAttachment?.({ at: Date.now() });
      this.room.connectMac(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (kind === 't' && request.method === 'POST') {
      const size = Number(request.headers.get('content-length') ?? 0);
      if (size > MAX_REQUEST) return new Response('Too large.', { status: 413 });
      const body = new Uint8Array(await request.arrayBuffer());
      if (body.length > MAX_REQUEST) return new Response('Too large.', { status: 413 });
      this.adopt();
      return this.room.fromPhone(body, request.signal);
    }
    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws, message) {
    // Every socket here proved itself in fetch(), so an answer is passed on
    // whichever of them it came back on. Dropping answers from a socket that
    // was not the room's current one left phones waiting the full 30 s for an
    // answer the computer had already sent ("did not answer in time"); an
    // answer names its request by a random id, so it cannot reach the wrong one.
    if (!this.room.mac) this.room.connectMac(ws);
    this.room.fromMac(typeof message === 'string' ? new TextEncoder().encode(message) : message);
  }

  webSocketClose(ws) { this.room.macGone(ws); this.adopt(ws); }

  webSocketError(ws) { this.room.macGone(ws); this.adopt(ws); }
}

/** When a computer's socket joined, stamped as it was accepted. */
function joined(ws) {
  try { return ws.deserializeAttachment?.()?.at ?? 0; } catch { return 0; }
}
