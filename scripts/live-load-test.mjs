#!/usr/bin/env node
// HOW MANY PEOPLE AND AGENTS ONE LIVE DOC OR TABLE HOLDS.
//
//   node scripts/live-load-test.mjs --mode doc --steps 10,50,100,200 --seconds 30 --lag 40
//
// Starts the relay (cloud/live/server.mjs) in its own process, then for each
// step joins that many writers to one fresh room over real sockets. Four in
// five are people: they type a word about every second, half of them at the
// same spot, and move their cursor as they go. One in five are agents: every
// few seconds each rewrites its own section whole, applied as the change from
// the old text to the new, which is how an agent's file write lands.
//
// Measured per step: every writer's words still there at the end, every copy
// the same, how long an edit takes to reach the others (from probes riding the
// same frames), and what the relay spent. `--lag` adds that many ms each way.
import { spawn } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { connectLive } from '../renderer/src/live/client.mjs';
import { changes } from '../shared/text-merge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg('mode', 'doc');
const STEPS = arg('steps', '10,50,100').split(',').map(Number);
const SECONDS = Number(arg('seconds', 30));
const LAG = Number(arg('lag', 0));
const PORT = Number(arg('port', 54911));
const AGENT_SHARE = Number(arg('agents', 0.2));
const OBSERVERS = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

function laggedSocket(url) {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  if (!LAG) return ws;
  const out = { binaryType: 'arraybuffer', onopen: null, onmessage: null, onclose: null, onerror: null };
  Object.defineProperty(out, 'readyState', { get: () => ws.readyState });
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => setTimeout(() => out.onopen?.(), LAG);
  ws.onmessage = (e) => setTimeout(() => out.onmessage?.(e), LAG);
  ws.onclose = (e) => setTimeout(() => out.onclose?.(e), LAG);
  ws.onerror = (e) => out.onerror?.(e);
  out.send = (b) => { const copy = new Uint8Array(b); setTimeout(() => { if (ws.readyState === 1) ws.send(copy); }, LAG); };
  out.close = () => ws.close();
  return out;
}

async function relayStats() {
  const r = await fetch(`http://127.0.0.1:${PORT}/stats`, { signal: AbortSignal.timeout(5000) });
  return r.json();
}

function makeWriter(i, roomUrl, kind, latencies, observer) {
  const doc = new Y.Doc();
  const live = connectLive({
    doc,
    hello: { name: `${kind} ${i}`, kind, canSave: i === 0 },
    open: () => laggedSocket(roomUrl),
  });
  const probe = doc.getMap('probe');
  if (observer) {
    probe.observe((e, tr) => {
      if (tr.local) return;
      const now = Date.now();
      for (const k of e.keysChanged) { const v = probe.get(k); if (v && v.by !== i) latencies.push(now - v.t); }
    });
  }
  return { i, kind, doc, live, words: [], last: new Map(), seq: 0 };
}

const para = (k) => `Section ${k}: notes go here.`;

// ---- what a person and an agent do in a doc
function personTypesDoc(w, sameSpot) {
  const t = w.doc.getText('t');
  const s = t.toString();
  const word = ` p${w.i}w${w.seq++}`;
  const anchor = sameSpot ? para(0) : para(1 + (w.i % 8));
  const at = s.indexOf(anchor);
  const end = at < 0 ? s.length : (s.indexOf('\n', at) < 0 ? s.length : s.indexOf('\n', at));
  t.insert(end, word);
  w.words.push(word.trim());
  w.live.awareness.setLocalStateField('at', { index: end + word.length });
}
function agentRewritesDoc(w) {
  const t = w.doc.getText('t');
  const s = t.toString();
  const head = `Agent ${w.i} section:`;
  const at = s.indexOf(head);
  const line = `${head} draft ${w.seq++} of the plan, rewritten whole by the agent a${w.i}v${w.seq}.`;
  const next = at < 0 ? `${s}${line}\n` : s.slice(0, at) + line + (s.indexOf('\n', at) < 0 ? '' : s.slice(s.indexOf('\n', at)));
  // The write is the whole file; what lands is the change from the old text to it.
  w.doc.transact(() => {
    for (const c of changes(s, next).reverse()) {
      if (c.end > c.start) t.delete(c.start, c.end - c.start);
      if (c.text) t.insert(c.start, c.text);
    }
  });
  w.lastAgent = `a${w.i}v${w.seq}`;
}

// ---- and in a table: cells keyed row|col, rows and columns as id lists
function personTypesTable(w, sameSpot) {
  const cells = w.doc.getMap('cells');
  const key = sameSpot ? 'r0|c0' : `r${w.i}|c${1 + (w.seq % 4)}`;
  const value = `p${w.i}v${w.seq++}`;
  if (!sameSpot && w.seq === 1) w.doc.getArray('rows').push([`r${w.i}`]);
  cells.set(key, value);
  if (!sameSpot) w.last.set(key, value);
  w.live.awareness.setLocalStateField('at', { cell: key });
}
function agentFillsTable(w) {
  const cells = w.doc.getMap('cells');
  w.doc.transact(() => {
    for (let r = 0; r < 20; r++) {
      const key = `a${w.i}r${r}|summary`;
      const value = `a${w.i}v${w.seq}`;
      cells.set(key, value);
      w.last.set(key, value);
    }
  });
  w.seq += 1;
  w.live.awareness.setLocalStateField('at', { cell: `a${w.i}r0|summary` });
}

async function step(n) {
  const room = `load-${MODE}-${n}-${Date.now()}`;
  const url = `ws://127.0.0.1:${PORT}/room/${room}`;
  const latencies = [];
  const before = await relayStats();
  const writers = [];
  const joinStart = Date.now();
  for (let i = 0; i < n; i++) {
    const kind = i % Math.round(1 / AGENT_SHARE) === 0 && i > 0 ? 'agent' : 'person';
    writers.push(makeWriter(i, url, kind, latencies, i < OBSERVERS));
    if (i % 25 === 24) await sleep(50);
  }
  for (let k = 0; k < 400 && !writers.every((w) => w.live.state() === 'live'); k++) await sleep(50);
  const joinMs = Date.now() - joinStart;
  const notLive = writers.filter((w) => w.live.state() !== 'live').length;

  // Writer 0 fills the empty room from "the file".
  const seedText = Array.from({ length: 9 }, (_, k) => para(k)).join('\n') + '\n';
  if (MODE === 'doc') writers[0].doc.getText('t').insert(0, seedText);
  await sleep(1000);

  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const timers = [];
  let edits = 0;
  const runFor = SECONDS * 1000;
  const until = Date.now() + runFor;
  for (const w of writers) {
    const every = w.kind === 'agent' ? 3000 + Math.random() * 2000 : 700 + Math.random() * 600;
    const sameSpot = w.kind === 'person' && w.i % 2 === 0;
    const tick = () => {
      if (Date.now() > until) return;
      if (MODE === 'doc') (w.kind === 'agent' ? agentRewritesDoc : personTypesDoc)(w, sameSpot);
      else (w.kind === 'agent' ? agentFillsTable : personTypesTable)(w, sameSpot);
      edits += 1;
      timers.push(setTimeout(tick, every));
    };
    timers.push(setTimeout(tick, Math.random() * every));
    const probeEvery = () => {
      if (Date.now() > until) return;
      w.doc.getMap('probe').set(String(w.i), { t: Date.now(), by: w.i });
      timers.push(setTimeout(probeEvery, 1000 + Math.random() * 500));
    };
    timers.push(setTimeout(probeEvery, Math.random() * 1000));
  }
  await sleep(runFor + 200);
  for (const t of timers) clearTimeout(t);
  loop.disable();

  // Settle: everyone idle and the same, or give up after 30 s.
  const fingerprint = (w) => (MODE === 'doc' ? w.doc.getText('t').toString() : JSON.stringify([...w.doc.getMap('cells').entries()].sort()));
  let settleMs = 0;
  const settleStart = Date.now();
  for (; settleMs < 30_000; settleMs = Date.now() - settleStart) {
    const f0 = fingerprint(writers[0]);
    if (writers.every((w) => !w.live.pending() && fingerprint(w) === f0)) break;
    await sleep(100);
  }
  const f0 = fingerprint(writers[0]);
  const differing = writers.filter((w) => fingerprint(w) !== f0).length;

  let lost = 0;
  const missing = [];
  let total = 0;
  if (MODE === 'doc') {
    const text = writers[0].doc.getText('t').toString();
    const present = new Set(text.split(/\s+/));
    for (const w of writers) {
      if (w.kind === 'person') for (const word of w.words) { total += 1; if (!present.has(word)) { lost += 1; missing.push(word); } }
      else if (w.lastAgent) { total += 1; if (!text.includes(`${w.lastAgent}.`)) { lost += 1; missing.push(w.lastAgent); } }
    }
    if (missing.length && process.env.SHOW_LOST) {
      for (const m of missing.slice(0, 5)) {
        const near = m.replace(/\d+$/, '');
        console.error(`lost ${m}; text has: ${text.split(/\s+/).filter((x) => x.startsWith(near)).slice(-3).join(' ')}`);
        const at = text.indexOf(m.slice(0, -1));
        console.error(`  around: ${JSON.stringify(text.slice(Math.max(0, at - 80), at + 120))}`);
      }
    }
  } else {
    const cells = writers[0].doc.getMap('cells');
    for (const w of writers) for (const [k, v] of w.last) { total += 1; if (cells.get(k) !== v) lost += 1; }
  }

  const after = await relayStats();
  const r = after.rooms.find((x) => x.id === room) ?? {};
  const wallMs = after.upMs - before.upMs;
  const relayCpu = Math.round(((after.cpuMs - before.cpuMs) / wallMs) * 100);
  for (const w of writers) w.live.close();
  await sleep(500);
  return {
    writers: n,
    people: writers.filter((w) => w.kind === 'person').length,
    agents: writers.filter((w) => w.kind === 'agent').length,
    joinMs,
    notLive,
    editsPerSec: Math.round(edits / SECONDS),
    latencyP50: pct(latencies, 50),
    latencyP95: pct(latencies, 95),
    latencyP99: pct(latencies, 99),
    lost,
    checked: total,
    copiesDiffering: differing,
    settleMs,
    relayCpuPct: relayCpu,
    relayRssMb: after.rssMb,
    relayFramesOutPerSec: Math.round((r.framesOut ?? 0) / (wallMs / 1000)),
    kbPerCopyPerSec: Math.round(((r.bytesOut ?? 0) / Math.max(1, n)) / (wallMs / 1000) / 1024 * 10) / 10,
    testerLoopLagP99Ms: Math.round(loop.percentile(99) / 1e6),
  };
}

const relay = spawn(process.execPath, [path.join(root, 'cloud/live/server.mjs'), '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  relay.stdout.on('data', (d) => { if (String(d).includes('live relay on')) resolve(); });
  relay.on('exit', (c) => reject(new Error(`relay exited ${c}`)));
  setTimeout(() => reject(new Error('relay did not start')), 10_000);
});
const results = [];
try {
  for (const n of STEPS) {
    const res = await step(n);
    results.push(res);
    console.log(JSON.stringify({ mode: MODE, lagMs: LAG, seconds: SECONDS, ...res }));
  }
} finally {
  relay.kill();
}
