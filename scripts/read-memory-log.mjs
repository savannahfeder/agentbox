// Who held the memory, day by day, read off the app's own minute log and
// freeze log. Run it on a computer that has been running the app:
//
//     node scripts/run.mjs scripts/read-memory-log.mjs
//     node scripts/run.mjs scripts/read-memory-log.mjs <memory-log folder> --days 3 --ram-gb 16
//
// A count of short minutes says nothing about whose they were. This splits
// them: Agentbox over its allowance (main/memory-allowance.mts), other
// programs leaving the allowance at its floor, both, or neither, with the
// seconds the app froze in each and the tasks and programs behind them.
//
// The reading is pure and the printing is not, so the arithmetic is pinned by
// tests/the-memory-log-reading-says-who-held-the-memory.test.mts.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { CEILING_SHARE, FLOOR_SHARE, standing } from '../main/memory-allowance.mts';
import { likelyUserDirs } from './read-memory-gate-log.mjs';

const CAUSES = ['agentbox', 'both', 'others', 'neither', 'unlisted'];
const sum = (list) => list.reduce((n, x) => n + (Number(x) || 0), 0);
const short = (line) => line.pressure === 'tight' || line.pressure === 'critical';

/** Whether a minute's listing has the app and its agents over their allowance. */
function isOver(line, ramMb) {
  if (typeof line.allowance?.over === 'boolean') return line.allowance.over;
  return !!standing({ ramMb, appMb: line.app.mb, tasksMb: sum((line.tasks ?? []).map((t) => t.mb)), othersMb: sum((line.others ?? []).map((o) => o.mb)) })?.over;
}

/**
 * Who held the memory in one minute: `agentbox` over its allowance, `others`
 * when the biggest other programs leave the allowance at its floor, `both`,
 * `neither`, or `unlisted` for a minute with no process listing.
 */
export function causeOf(line, ramMb) {
  if (!line?.app) return 'unlisted';
  const over = isOver(line, ramMb);
  const othersBig = sum((line.others ?? []).map((o) => o.mb)) >= ramMb * (CEILING_SHARE - FLOOR_SHARE);
  if (over) return othersBig ? 'both' : 'agentbox';
  return othersBig ? 'others' : 'neither';
}

function ranked(rows) {
  const by = new Map();
  for (const [name, mb] of rows) {
    const e = by.get(name) ?? { name, minutes: 0, mb: 0 };
    e.minutes += 1;
    e.mb += mb;
    by.set(name, e);
  }
  return [...by.values()].sort((a, b) => b.mb - a.mb).map((e) => ({ name: e.name, minutes: e.minutes, meanMb: Math.round(e.mb / e.minutes) }));
}

/**
 * One day's minute lines and freeze lines as counts. `over` is every minute
 * Agentbox was over its allowance; `causes` splits the short minutes;
 * `freezeS` is the seconds the app's main thread was held in each kind of
 * minute; `tasks` and `programs` are behind the minutes over the allowance,
 * `others` behind the short minutes other programs had a hand in.
 */
export function summariseDay(lines, freezes = [], { ramMb }) {
  const minutes = (lines ?? []).filter((l) => l && 'pressure' in l);
  const frozen = new Map();
  for (const f of freezes ?? []) {
    if (!Number.isFinite(f?.ms)) continue;
    const key = Math.floor(Date.parse(f.at) / 60_000);
    frozen.set(key, (frozen.get(key) ?? 0) + f.ms);
  }
  const causes = Object.fromEntries(CAUSES.map((c) => [c, 0]));
  const freezeMs = { ...causes, normal: 0 };
  const out = { minutes: minutes.length, short: 0, critical: 0, swapping: 0, over: 0, overBeforeShort: 0 };
  const overRows = { tasks: [], programs: [] };
  const otherRows = [];
  for (const line of minutes) {
    const cause = causeOf(line, ramMb);
    const over = cause === 'agentbox' || cause === 'both';
    const held = frozen.get(Math.floor(Date.parse(line.at) / 60_000)) ?? 0;
    if (line.pressure === 'critical') out.critical += 1;
    if ((line.swapInMbps ?? 0) >= 4) out.swapping += 1;
    if (over) {
      out.over += 1;
      if (!short(line)) out.overBeforeShort += 1;
      for (const t of line.tasks ?? []) {
        overRows.tasks.push([t.item, t.mb]);
        for (const p of t.top ?? []) overRows.programs.push([p.name, p.mb]);
      }
    }
    if (!short(line)) { freezeMs.normal += held; continue; }
    out.short += 1;
    causes[cause] += 1;
    freezeMs[cause] += held;
    if (cause === 'others' || cause === 'both') for (const o of line.others ?? []) otherRows.push([o.name, o.mb]);
  }
  return {
    ...out,
    causes,
    freezeS: Object.fromEntries(Object.entries(freezeMs).map(([k, ms]) => [k, Math.round(ms / 100) / 10])),
    tasks: ranked(overRows.tasks),
    programs: ranked(overRows.programs),
    others: ranked(otherRows),
  };
}

function readLines(file) {
  let text;
  try {
    const buf = fs.readFileSync(file);
    text = (file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');
  } catch { return []; }
  return text.split('\n').flatMap((raw) => { try { return raw.trim() ? [JSON.parse(raw)] : []; } catch { return []; } });
}

function main(argv) {
  const flag = (name, fallback) => { const at = argv.indexOf(name); return at === -1 ? fallback : argv[at + 1]; };
  const days = Number(flag('--days', 7));
  const ramMb = Number(flag('--ram-gb', os.totalmem() / 1024 ** 3)) * 1024;
  const named = argv.find((a, i) => !a.startsWith('--') && !['--days', '--ram-gb'].includes(argv[i - 1]));
  const dir = named ?? likelyUserDirs().map((d) => path.join(d, 'memory-log')).find((d) => fs.existsSync(d));
  if (!dir) { console.error('No memory-log folder found. Give its path.'); return 1; }
  const names = fs.readdirSync(dir).filter((n) => /^memory-\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$/.test(n)).sort().slice(-days);
  const gb = (mb) => (mb / 1024).toFixed(1);
  const top = (list, n = 4) => list.slice(0, n).map((e) => `${e.name} ${gb(e.meanMb)} GB x${e.minutes}`).join(', ') || 'none';
  console.log(`${dir}, judged as a ${Math.round(ramMb / 1024)} GB computer\n`);
  for (const name of names) {
    const day = name.slice(7, 17);
    const d = summariseDay(readLines(path.join(dir, name)), readLines(path.join(dir, name.replace('memory-', 'freeze-'))), { ramMb });
    console.log(`${day}: ${d.minutes} minutes, ${d.short} short (${d.critical} critical, ${d.swapping} swapping hard)`);
    console.log(`  Agentbox over its allowance: ${d.over} minutes, ${d.overBeforeShort} of them before the computer said short`);
    console.log(`  short minutes by who held the memory: Agentbox ${d.causes.agentbox}, both ${d.causes.both}, other programs ${d.causes.others}, neither ${d.causes.neither}, no listing ${d.causes.unlisted}`);
    console.log(`  seconds frozen: Agentbox ${d.freezeS.agentbox}, both ${d.freezeS.both}, other programs ${d.freezeS.others}, neither ${d.freezeS.neither}, normal minutes ${d.freezeS.normal}`);
    if (d.over) console.log(`  tasks behind the minutes over: ${top(d.tasks)}\n  their programs: ${top(d.programs)}`);
    if (d.others.length) console.log(`  other programs behind theirs: ${top(d.others)}`);
    console.log('');
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) process.exit(main(process.argv.slice(2)));
