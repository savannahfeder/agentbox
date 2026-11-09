#!/usr/bin/env node
// HOW MANY PEOPLE AND AGENTS ONE LIVE DOC OR TABLE HOLDS.
//
//   node scripts/live-load-test.mjs --mode doc --steps 10,100,300,500 --seconds 30 --lag 40
//
// Starts the relay (cloud/live/server.mjs) in its own process. For each step,
// ten full copies join one fresh room here, as ten people's computers would:
// they take in every edit, and what they spend is what one person's copy
// spends. Everyone else joins from a second process as a writer that types but
// does not take in the others' edits, because on one machine a few hundred
// full copies would measure this machine, not the room.
//
// Four in five writers are people: they type a word about every second, half
// of them at one spot, and move their cursor. One in five are agents: every
// few seconds each rewrites its own section whole, applied as the change from
// the old text to the new, which is how an agent's file write lands. In a
// table, people change cells in their own row and one cell everyone fights
// over; agents fill a column of twenty cells.
//
// Measured per step: every writer's words still there at the end, every full
// copy the same, how long an edit takes to reach a full copy (probes riding
// the same frames), what one full copy spends, and what the relay spends.
// `--lag` adds that many ms each way.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { connectLive } from '../renderer/src/live/client.ts';
import { changes } from '../shared/text-merge.mts';
import { UPDATE, AWARENESS } from '../shared/live/wire.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const ROLE = arg('role', 'main');
const MODE = arg('mode', 'doc');
const SECONDS = Number(arg('seconds', 30));
const LAG = Number(arg('lag', 0));
const PORT = Number(arg('port', 54911));
const FULL = Number(arg('full', 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

/** A socket with `LAG` ms each way; a writer's drops the edits and cursors it would take in. */
function socketTo(url, { deaf = false } = {}) {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  ws.binaryType = 'arraybuffer';
  const out = { binaryType: 'arraybuffer', onopen: null, onmessage: null, onclose: null, onerror: null };
  Object.defineProperty(out, 'readyState', { get: () => ws.readyState });
  const later = (fn) => (LAG ? setTimeout(fn, LAG) : fn());
  ws.onopen = () => later(() => out.onopen?.());
  ws.onmessage = (e) => {
    const first = new Uint8Array(e.data)[0];
    if (deaf && (first === UPDATE || first === AWARENESS)) return;
    later(() => out.onmessage?.(e));
  };
  ws.onclose = (e) => later(() => out.onclose?.(e));
  ws.onerror = (e) => out.onerror?.(e);
  out.send = (b) => { const copy = new Uint8Array(b); later(() => { if (ws.readyState === 1) ws.send(copy); }); };
  out.close = () => ws.close();
  return out;
}

const para = (k) => `Section ${k}: notes go here.`;
const SEED = Array.from({ length: 9 }, (_, k) => para(k)).join('\n') + '\n';

function makeWriter(i, url, { kind, deaf, canSeed = false }) {
  const doc = new Y.Doc();
  const live = connectLive({ doc, hello: { name: `${kind} ${i}`, kind, canSave: i === 0, canSeed }, open: () => socketTo(url, { deaf }) });
  return { i, kind, doc, live, words: [], last: new Map(), seq: 0, lastAgent: null };
}

function typeDoc(w) {
  const t = w.doc.getText('t');
  const s = t.toString();
  if (w.kind === 'agent') {
    const head = `Agent ${w.i} section:`;
    const at = s.indexOf(head);
    w.seq += 1;
    const line = `${head} draft ${w.seq} of the plan, rewritten whole by the agent a${w.i}v${w.seq}.`;
    const next = at < 0 ? `${s}${line}\n` : s.slice(0, at) + line + (s.indexOf('\n', at) < 0 ? '' : s.slice(s.indexOf('\n', at)));
    w.doc.transact(() => {
      for (const c of changes(s, next).reverse()) {
        if (c.end > c.start) t.delete(c.start, c.end - c.start);
        if (c.text) t.insert(c.start, c.text);
      }
    });
    w.lastAgent = `a${w.i}v${w.seq}.`;
    return;
  }
  const word = ` p${w.i}w${w.seq++}`;
  const anchor = w.i % 2 === 0 ? para(0) : para(1 + (w.i % 8));
  const at = s.indexOf(anchor);
  if (at < 0) return;
  const end = s.indexOf('\n', at);
  t.insert(end, word);
  w.words.push(word.trim());
  w.live.awareness.setLocalStateField('at', { index: end + word.length });
}

function typeTable(w) {
  const cells = w.doc.getMap('cells');
  if (w.kind === 'agent') {
    w.doc.transact(() => {
      for (let r = 0; r < 20; r++) { const key = `a${w.i}r${r}|summary`; const value = `a${w.i}v${w.seq}`; cells.set(key, value); w.last.set(key, value); }
    });
    w.seq += 1;
    w.live.awareness.setLocalStateField('at', { cell: `a${w.i}r0|summary` });
    return;
  }
  const fight = w.i % 2 === 0 && w.seq % 3 === 0;
  const key = fight ? 'r0|c0' : `r${w.i}|c${1 + (w.seq % 4)}`;
  const value = `p${w.i}v${w.seq++}`;
  cells.set(key, value);
  if (!fight) w.last.set(key, value);
  w.live.awareness.setLocalStateField('at', { cell: key });
}

/** Every writer typing for SECONDS, each with a probe the full copies time. */
async function run(writers) {
  const timers = [];
  let edits = 0;
  const until = Date.now() + SECONDS * 1000;
  for (const w of writers) {
    const every = w.kind === 'agent' ? 3000 + Math.random() * 2000 : 700 + Math.random() * 600;
    const tick = () => {
      if (Date.now() > until) return;
      (MODE === 'doc' ? typeDoc : typeTable)(w);
      edits += 1;
      timers.push(setTimeout(tick, every));
    };
    timers.push(setTimeout(tick, Math.random() * every));
    const probe = () => {
      if (Date.now() > until) return;
      w.doc.getMap('probe').set(String(w.i), { t: Date.now(), by: w.i });
      timers.push(setTimeout(probe, 1000 + Math.random() * 500));
    };
    timers.push(setTimeout(probe, Math.random() * 1000));
  }
  await sleep(SECONDS * 1000 + 300);
  for (const t of timers) clearTimeout(t);
  return edits;
}

const kindOf = (i) => (i % 5 === 4 ? 'agent' : 'person');

if (ROLE === 'writers') {
  // The second process: writers that type and never take in the others' edits.
  const url = arg('url');
  const from = Number(arg('from'));
  const count = Number(arg('count'));
  const writers = [];
  for (let i = from; i < from + count; i++) {
    writers.push(makeWriter(i, url, { kind: kindOf(i), deaf: true }));
    if (i % 25 === 24) await sleep(40);
  }
  for (let k = 0; k < 600 && !writers.every((w) => w.live.state() === 'live'); k++) await sleep(50);
  process.stdout.write(`${JSON.stringify({ ready: true, notLive: writers.filter((w) => w.live.state() !== 'live').length })}\n`);
  const edits = await run(writers);
  await sleep(2500);
  const report = { edits, words: writers.flatMap((w) => w.words), agents: writers.filter((w) => w.lastAgent).map((w) => w.lastAgent), cells: writers.flatMap((w) => [...w.last]) };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  for (const w of writers) w.live.close();
  await sleep(300);
  process.exit(0);
}

async function relayStats() {
  const r = await fetch(`http://127.0.0.1:${PORT}/stats`, { signal: AbortSignal.timeout(5000) });
  return r.json();
}

async function step(n) {
  const room = `load-${MODE}-${n}-${Date.now()}`;
  const url = `ws://127.0.0.1:${PORT}/room/${room}`;
  const full = Math.min(FULL, n);
  const latencies = [];
  const copies = [];
  for (let i = 0; i < full; i++) {
    const w = makeWriter(i, url, { kind: kindOf(i), deaf: false, canSeed: i === 0 });
    w.doc.getMap('probe').observe((e, tr) => {
      if (tr.local) return;
      const now = Date.now();
      for (const k of e.keysChanged) { const v = w.doc.getMap('probe').get(k); if (v && v.by !== w.i) latencies.push(now - v.t); }
    });
    copies.push(w);
  }
  for (let k = 0; k < 200 && !copies.every((w) => w.live.state() === 'live'); k++) await sleep(50);
  if (MODE === 'doc') copies[0].doc.getText('t').insert(0, SEED);
  else copies[0].doc.getMap('cells').set('r0|c0', 'seed');
  await sleep(800);

  const before = await relayStats();
  let writers = null;
  let report = null;
  let readyNotLive = 0;
  const joinStart = Date.now();
  if (n > full) {
    writers = spawn(process.execPath, [fileURLToPath(import.meta.url), '--role', 'writers', '--url', url, '--from', String(full), '--count', String(n - full), '--mode', MODE, '--seconds', String(SECONDS), '--lag', String(LAG)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    await new Promise((resolve) => {
      writers.stdout.on('data', (d) => {
        buf += d;
        for (;;) {
          const nl = buf.indexOf('\n');
          if (nl < 0) break;
          const msg = JSON.parse(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (msg.ready) { readyNotLive = msg.notLive; resolve(); }
          else report = msg;
        }
      });
    });
  }
  const joinMs = Date.now() - joinStart;
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  const fullEdits = await run(copies);
  const cpu = process.cpuUsage(cpu0);
  const wallMs = Date.now() - t0;
  if (writers) await new Promise((r) => (report ? r() : writers.on('exit', r)));

  const fingerprint = (w) => (MODE === 'doc' ? w.doc.getText('t').toString() : JSON.stringify([...w.doc.getMap('cells').entries()].sort()));
  const settleStart = Date.now();
  let settleMs = 0;
  for (; settleMs < 30_000; settleMs = Date.now() - settleStart) {
    const f0 = fingerprint(copies[0]);
    if (copies.every((w) => !w.live.pending() && fingerprint(w) === f0)) break;
    await sleep(100);
  }
  const differing = copies.filter((w) => fingerprint(w) !== fingerprint(copies[0])).length;

  let lost = 0;
  let checked = 0;
  const missing = [];
  if (MODE === 'doc') {
    const text = copies[0].doc.getText('t').toString();
    const present = new Set(text.split(/\s+/));
    const words = [...copies.flatMap((w) => w.words), ...(report?.words ?? [])];
    const agents = [...copies.filter((w) => w.lastAgent).map((w) => w.lastAgent), ...(report?.agents ?? [])];
    for (const word of words) { checked += 1; if (!present.has(word)) { lost += 1; missing.push(word); } }
    for (const a of agents) { checked += 1; if (!text.includes(a)) { lost += 1; missing.push(a); } }
  } else {
    const cells = copies[0].doc.getMap('cells');
    const owned = [...copies.flatMap((w) => [...w.last]), ...(report?.cells ?? [])];
    for (const [k, v] of owned) { checked += 1; if (cells.get(k) !== v) { lost += 1; missing.push(k); } }
  }

  const after = await relayStats();
  const r = after.rooms.find((x) => x.id === room) ?? {};
  const relayWall = after.upMs - before.upMs;
  const notLive = copies.filter((w) => w.live.state() !== 'live').length + readyNotLive;
  for (const w of copies) w.live.close();
  await sleep(400);
  return {
    writers: n,
    agents: Array.from({ length: n }, (_, i) => kindOf(i)).filter((k) => k === 'agent').length,
    joinMs,
    notLive,
    editsPerSec: Math.round(((report?.edits ?? 0) + fullEdits) / SECONDS),
    latencyP50: pct(latencies, 50),
    latencyP95: pct(latencies, 95),
    latencyP99: pct(latencies, 99),
    lost,
    checked,
    missing: missing.slice(0, 3),
    copiesDiffering: differing,
    settleMs,
    cpuPerCopyPct: Math.round(((cpu.user + cpu.system) / 1000 / wallMs / full) * 1000) / 10,
    relayCpuPct: Math.round(((after.cpuMs - before.cpuMs) / relayWall) * 100),
    relayRssMb: after.rssMb,
    kbPerCopyPerSec: Math.round(((r.bytesOut ?? 0) / Math.max(1, n)) / (relayWall / 1000) / 1024 * 10) / 10,
  };
}

const relay = spawn(process.execPath, [path.join(root, 'cloud/live/server.mjs'), '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  relay.stdout.on('data', (d) => { if (String(d).includes('live relay on')) resolve(); });
  relay.on('exit', (c) => reject(new Error(`relay exited ${c}`)));
  setTimeout(() => reject(new Error('relay did not start')), 10_000);
});
try {
  for (const n of arg('steps', '10,100').split(',').map(Number)) {
    console.log(JSON.stringify({ mode: MODE, lagMs: LAG, seconds: SECONDS, ...(await step(n)) }));
  }
} finally {
  relay.kill();
}
