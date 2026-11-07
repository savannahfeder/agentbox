#!/usr/bin/env node
// THE LIVE RELAY: one room per open file (shared/live/room.mjs) behind a
// WebSocket at /room/<id>. Runs for the stand-in team cloud and the load test,
// and is what a hosted relay runs.
//
//   node cloud/live/server.mjs --port 54910
//
// `allow(request, roomId)` decides who may join; without one, everyone may,
// which is only for loopback.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRoom } from '../../shared/live/room.mjs';

const ROOM_ID = /^[A-Za-z0-9_.:-]{8,200}$/;
const ALLOW_DEADLINE_MS = 10_000;

export function startLiveRelay({ port = 0, host = '127.0.0.1', tickMs = 40, allow = null } = {}) {
  const rooms = new Map();
  const startedCpu = process.cpuUsage();
  const startedAt = Date.now();
  const roomFor = (id) => {
    let room = rooms.get(id);
    if (!room) {
      room = createRoom({ tickMs, onEmpty: () => { if (rooms.get(id) === room) rooms.delete(id); } });
      rooms.set(id, room);
    }
    return room;
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    if (req.url === '/stats' && (req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1')) {
      const cpu = process.cpuUsage(startedCpu);
      const body = {
        rooms: [...rooms].map(([id, r]) => ({ id, ...r.stats() })),
        cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        upMs: Date.now() - startedAt,
        rssMb: Math.round(process.memoryUsage().rss / 1e6),
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', async (req, socket, head) => {
    const id = /^\/room\/([^/?#]+)/.exec(req.url ?? '')?.[1];
    if (!id || !ROOM_ID.test(decodeURIComponent(id))) { socket.destroy(); return; }
    const roomId = decodeURIComponent(id);
    let ok = !allow;
    if (allow) {
      ok = await Promise.race([
        Promise.resolve().then(() => allow(req, roomId)).catch(() => false),
        new Promise((r) => setTimeout(() => r(false), ALLOW_DEADLINE_MS)),
      ]);
    }
    if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const seat = roomFor(roomId).join({ send: (bytes) => ws.send(bytes), close: () => ws.close() });
      ws.on('message', (data) => seat.receive(data));
      ws.on('close', () => seat.leave());
      ws.on('error', () => ws.close());
    });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const at = server.address().port;
      resolve({
        port: at,
        url: `ws://${host}:${at}`,
        rooms,
        close: () => new Promise((r) => { for (const room of rooms.values()) room.close(); wss.close(); server.close(() => r()); server.closeAllConnections?.(); }),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
  const relay = await startLiveRelay({ port: Number(arg('port', 54910)), host: arg('host', '127.0.0.1'), tickMs: Number(arg('tick', 40)) });
  console.log(`live relay on ${relay.url}`);
}
