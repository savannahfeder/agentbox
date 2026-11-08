#!/usr/bin/env node
// THE LIVE RELAY: one room per open file (room.mjs) behind a
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
import { createRoom } from './room.mjs';

const ROOM_ID = /^[A-Za-z0-9_.:-]{8,200}$/;
const ALLOW_DEADLINE_MS = 10_000;

const TEAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Who a hosted relay lets in: a socket whose sign-in (`?t=`) the team cloud
 * knows, belonging to someone on the team the room's id starts with. Any
 * failure, or no answer inside `deadlineMs`, is a no.
 */
export function supabaseAllow({ url, anonKey, fetchImpl = fetch, deadlineMs = 8000 }) {
  const base = String(url).replace(/\/+$/, '');
  return async (req, roomId) => {
    const token = new URL(req.url ?? '', 'http://relay').searchParams.get('t');
    const team = String(roomId).split('.')[0];
    if (!token || !TEAM_ID.test(team)) return false;
    const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
    try {
      const who = await fetchImpl(`${base}/auth/v1/user`, { headers, signal: AbortSignal.timeout(deadlineMs) });
      if (!who.ok) return false;
      const { id } = await who.json();
      if (!id) return false;
      const member = await fetchImpl(`${base}/rest/v1/team_members?select=person_id&team_id=eq.${team}&person_id=eq.${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(deadlineMs) });
      if (!member.ok) return false;
      const rows = await member.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  };
}

/** Rooms on an http server's upgrades to /room/<id>. */
export function attachLiveRooms(server, { tickMs = 40, allow = null } = {}) {
  const rooms = new Map();
  const roomFor = (id) => {
    let room = rooms.get(id);
    if (!room) {
      room = createRoom({ tickMs, onEmpty: () => { if (rooms.get(id) === room) rooms.delete(id); } });
      rooms.set(id, room);
    }
    return room;
  };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', async (req, socket, head) => {
    const id = /^\/room\/([^/?#]+)/.exec(req.url ?? '')?.[1];
    const roomId = id ? decodeURIComponent(id) : '';
    if (!ROOM_ID.test(roomId)) { socket.destroy(); return; }
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
  return { rooms, close: () => { for (const room of rooms.values()) room.close(); wss.close(); } };
}

export function startLiveRelay({ port = 0, host = '127.0.0.1', tickMs = 40, allow = null } = {}) {
  const startedCpu = process.cpuUsage();
  const startedAt = Date.now();
  let live = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    if (req.url === '/stats' && (req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1')) {
      const cpu = process.cpuUsage(startedCpu);
      const body = {
        rooms: [...live.rooms].map(([id, r]) => ({ id, ...r.stats() })),
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
  live = attachLiveRooms(server, { tickMs, allow });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const at = server.address().port;
      resolve({
        port: at,
        url: `ws://${host}:${at}`,
        rooms: live.rooms,
        close: () => new Promise((r) => { live.close(); server.close(() => r()); server.closeAllConnections?.(); }),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
  const host = arg('host', '127.0.0.1');
  const supabaseUrl = arg('supabase-url', process.env.LIVE_SUPABASE_URL);
  const anonKey = arg('anon-key', process.env.LIVE_SUPABASE_ANON_KEY);
  const allow = supabaseUrl && anonKey ? supabaseAllow({ url: supabaseUrl, anonKey }) : null;
  // Rooms carry people's words: off this machine, nobody joins without the team check.
  if (!allow && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    console.error('the live relay listens beyond this machine only with --supabase-url and --anon-key, so it can check who joins');
    process.exit(1);
  }
  const relay = await startLiveRelay({ port: Number(arg('port', 54910)), host, tickMs: Number(arg('tick', 40)), allow });
  console.log(`live relay on ${relay.url}`);
}
