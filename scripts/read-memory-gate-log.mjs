// What the memory gate did, read off its own records. Run it on a Mac that has
// been running the app:
//
//     node scripts/read-memory-gate-log.mjs
//     node scripts/read-memory-gate-log.mjs <grants.jsonl> <history.json>
//
// It answers two things: whether `autoSlots` is the right number, and whether a
// program record should lend `light` to an argument nobody has seen. Each
// section ends with how to read it, because both are easy to read backwards.
//
// The reading is pure and the printing is not, so the arithmetic is pinned by
// tests/the-gate-log-reading-adds-up.test.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LIGHT_LETTERS = new Set(['l', 'c']);
const isLight = (o) => LIGHT_LETTERS.has(o);
const measured = (list) => (list ?? []).filter((o) => o !== '?');

/** Where the app keeps its own files, on either platform, newest first. */
export function likelyUserDirs(home = os.homedir()) {
  return [
    path.join(home, 'Library', 'Application Support', 'Astral'),
    path.join(home, 'Library', 'Application Support', 'Agentbox'),
    path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'agentbox'),
    path.join(home, '.config', 'Astral'),
    path.join(home, '.config', 'Agentbox'),
  ];
}

export function findFile(name, dirs = likelyUserDirs()) {
  for (const dir of dirs) {
    const full = path.join(dir, name);
    try { if (fs.statSync(full).isFile()) return full; } catch { /* next */ }
  }
  return null;
}

const quantile = (list, p) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/**
 * The slot question. `entries` are parsed grant lines.
 *
 * `slotPressedWaitMs` is the whole of the answer: time spent queueing for a
 * slot while the Mac itself was fine. Waiting under `tight` is reported apart
 * from it and must not be added in.
 */
export function summariseGrants(entries) {
  const out = {
    lines: entries.length,
    byClass: {},
    refusals: { total: 0, underNormal: 0, underTight: 0, commands: [] },
    slotPressedWaitMs: 0,
    tightWaitMs: 0,
    waitedAtAllUnderNormal: 0,
    waits: { medianMs: null, p90Ms: null, maxMs: null },
    peaks: { heldSlotMedianMb: null, heldSlotP90Mb: null, heldSlotMaxMb: null, sharedDropped: 0, neverMeasured: 0 },
    span: { fromMs: null, toMs: null },
  };
  const waitsUnderNormal = [];
  const slotPeaks = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const cls = typeof e.cls === 'string' ? e.cls : 'unrecorded';
    out.byClass[cls] = (out.byClass[cls] ?? 0) + 1;
    if (Number.isFinite(e.t)) {
      out.span.fromMs = out.span.fromMs === null ? e.t : Math.min(out.span.fromMs, e.t);
      out.span.toMs = out.span.toMs === null ? e.t : Math.max(out.span.toMs, e.t);
    }
    const wait = Number.isFinite(e.waitMs) ? e.waitMs : 0;
    // A light command needs no slot, so its waiting is the light lane filling
    // up, not the slots. Keep the two apart or the answer is wrong.
    const wantedASlot = cls === 'heavy' || cls === 'unknown';
    if (wantedASlot && wait > 0) {
      if (e.pressure === 'tight' || e.pressure === 'critical') {
        out.tightWaitMs += wait;
      } else {
        out.slotPressedWaitMs += wait;
        out.waitedAtAllUnderNormal++;
        waitsUnderNormal.push(wait);
      }
    }
    if (e.refused) {
      out.refusals.total++;
      if (e.pressure === 'tight' || e.pressure === 'critical') out.refusals.underTight++;
      else out.refusals.underNormal++;
      if (out.refusals.commands.length < 25) out.refusals.commands.push({ waitMs: wait, pressure: e.pressure ?? null, cmd: e.cmd ?? '' });
    }
    if (wantedASlot && !e.refused) {
      if (e.shared) out.peaks.sharedDropped++;
      else if (Number.isFinite(e.peakMb)) slotPeaks.push(e.peakMb);
      else out.peaks.neverMeasured++;
    }
  }
  out.waits.medianMs = quantile(waitsUnderNormal, 0.5);
  out.waits.p90Ms = quantile(waitsUnderNormal, 0.9);
  out.waits.maxMs = waitsUnderNormal.length ? Math.max(...waitsUnderNormal) : null;
  out.peaks.heldSlotMedianMb = quantile(slotPeaks, 0.5);
  out.peaks.heldSlotP90Mb = quantile(slotPeaks, 0.9);
  out.peaks.heldSlotMaxMb = slotPeaks.length ? Math.max(...slotPeaks) : null;
  return out;
}

/**
 * The chain-learned-light question. `raw` is a parsed memory-gate-history.json.
 *
 * `programs.wouldStopLending` is the cost of requiring direct evidence before a
 * program lends `light` to an argument nobody has seen: the records that pass
 * that test today and would not.
 */
export function summariseProvenance(raw) {
  const out = {
    keys: { total: 0, lightToday: 0, lightOnChainEvidenceOnly: 0 },
    programs: { total: 0, lendsLightToday: 0, wouldStopLending: 0, names: [] },
    letters: { l: 0, c: 0, m: 0, h: 0, '?': 0 },
    carriesProvenance: false,
  };
  const keys = new Map(Array.isArray(raw?.keys) ? raw.keys : []);
  const programs = new Map(Array.isArray(raw?.programs) ? raw.programs : []);
  const count = (list) => { for (const o of list ?? []) if (o in out.letters) out.letters[o]++; };

  for (const [, obs] of keys) {
    out.keys.total++;
    count(obs);
    const recent = measured(obs?.slice(-5));
    // The rule in `_classifyKey`: light on two or more, all light.
    if (recent.length >= 2 && recent.every(isLight)) {
      out.keys.lightToday++;
      if (recent.every((o) => o === 'c')) out.keys.lightOnChainEvidenceOnly++;
    }
  }
  for (const [name, obs] of programs) {
    out.programs.total++;
    count(obs);
    const recent = measured(obs?.slice(-10));
    // The rule in `_classifyKey`: a program lends light on five or more, all light.
    if (recent.length >= 5 && recent.every(isLight)) {
      out.programs.lendsLightToday++;
      const direct = recent.filter((o) => o === 'l');
      if (direct.length < 5) {
        out.programs.wouldStopLending++;
        if (out.programs.names.length < 30) {
          out.programs.names.push({ name, obs: (obs ?? []).join(''), direct: direct.length });
        }
      }
    }
  }
  out.carriesProvenance = out.letters.c > 0;
  return out;
}

const mins = (ms) => `${(ms / 60_000).toFixed(1)} min`;
const secs = (ms) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`);
const day = (ms) => (ms === null ? 'n/a' : new Date(ms).toISOString().slice(0, 16).replace('T', ' '));

function printGrants(s) {
  console.log(`\n=== IS TWO HEAVY SLOTS THE RIGHT NUMBER ===`);
  console.log(`${s.lines} grant lines, ${day(s.span.fromMs)} to ${day(s.span.toMs)}`);
  const days = s.span.fromMs && s.span.toMs ? (s.span.toMs - s.span.fromMs) / 86_400_000 : 0;
  console.log(`that is ${days.toFixed(1)} days of readings${days < 5 ? '  <-- thin; the row asked for a week' : ''}`);
  console.log(`by class: ${Object.entries(s.byClass).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`\nTHE DECIDING FIGURE`);
  console.log(`  waiting for a slot while pressure was NORMAL: ${mins(s.slotPressedWaitMs)} across ${s.waitedAtAllUnderNormal} commands`);
  console.log(`    median ${secs(s.waits.medianMs)}, p90 ${secs(s.waits.p90Ms)}, worst ${secs(s.waits.maxMs)}`);
  console.log(`  waiting while pressure was TIGHT (says nothing about the count): ${mins(s.tightWaitMs)}`);
  console.log(`\nWHAT WAS HELD, in MB at its peak`);
  console.log(`  median ${s.peaks.heldSlotMedianMb ?? 'n/a'}, p90 ${s.peaks.heldSlotP90Mb ?? 'n/a'}, worst ${s.peaks.heldSlotMaxMb ?? 'n/a'}`);
  console.log(`  readings dropped as shared: ${s.peaks.sharedDropped}; never measured: ${s.peaks.neverMeasured}`);
  console.log(`\nREFUSALS: ${s.refusals.total} (${s.refusals.underNormal} under normal, ${s.refusals.underTight} under tight)`);
  for (const r of s.refusals.commands) {
    console.log(`  ${secs(r.waitMs).padStart(8)}  ${String(r.pressure).padEnd(8)} ${r.cmd.slice(0, 80).replace(/\n/g, ' ')}`);
  }
  console.log(`\nREAD IT LIKE THIS. If the waiting under normal is small and refusals under`);
  console.log(`normal are nil, two slots is enough and the row closes without a new number.`);
  console.log(`If it is large, raise autoSlots, but check the peaks first: two commands of`);
  console.log(`1.5 GB is already most of a 16 GB Mac once the agents themselves are counted.`);
}

function printProvenance(s) {
  console.log(`\n=== SHOULD A PROGRAM LEND light TO AN UNSEEN ARGUMENT ===`);
  if (!s.carriesProvenance) {
    console.log(`This history carries no 'c' at all, so it was written before the`);
    console.log(`provenance change or nothing has run since. Nothing can be said yet:`);
    console.log(`let the app run on it and come back.`);
  }
  console.log(`letters across every record: ${Object.entries(s.letters).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  l is a run measured on its own; c is one measured only inside a chain.`);
  console.log(`\ncommand keys: ${s.keys.total}`);
  console.log(`  classified light today: ${s.keys.lightToday}`);
  console.log(`  of those, resting ONLY on chain-learned runs: ${s.keys.lightOnChainEvidenceOnly}`);
  console.log(`\nprogram records: ${s.programs.total}`);
  console.log(`  lending light to unseen arguments today: ${s.programs.lendsLightToday}`);
  console.log(`  would STOP lending if five direct runs were required: ${s.programs.wouldStopLending}`);
  for (const p of s.programs.names) {
    console.log(`    ${p.name.padEnd(16)} ${p.obs.padEnd(11)} direct: ${p.direct}`);
  }
  console.log(`\nREAD IT LIKE THIS. The ones listed are what a stricter rule would cost: every`);
  console.log(`unseen argument of those programs starts waiting for a slot instead. Weigh that`);
  console.log(`against what it buys, which is that a never-seen build stops being called light.`);
}

function main(argv) {
  const grantsPath = argv[0] ?? findFile('memory-gate-grants.jsonl');
  const historyPath = argv[1] ?? findFile('memory-gate-history.json');
  let any = false;

  if (!grantsPath) {
    console.log(`\nNo memory-gate-grants.jsonl found. Looked in:`);
    for (const d of likelyUserDirs()) console.log(`  ${d}`);
    console.log(`The gate writes it from w-0af52d5c86 onwards, so a build older than that`);
    console.log(`wrote nothing, and the slot question cannot be answered yet.`);
  } else {
    const entries = [];
    for (const line of fs.readFileSync(grantsPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch { /* a half-written last line */ }
    }
    console.log(`grants: ${grantsPath}`);
    printGrants(summariseGrants(entries));
    any = true;
  }

  if (!historyPath) {
    console.log(`\nNo memory-gate-history.json found, so nothing can be said about chain-learned light.`);
  } else {
    console.log(`\nhistory: ${historyPath}`);
    printProvenance(summariseProvenance(JSON.parse(fs.readFileSync(historyPath, 'utf8'))));
    any = true;
  }
  if (!any) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
