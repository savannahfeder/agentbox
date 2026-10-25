#!/usr/bin/env node
// THE TESTER'S DIARY, WRITTEN AS IT GOES, SO A TESTER STOPPED MID-ACTION LOSES NOTHING.
//
//   node diary.mjs note "<what you did, what you expected, how it felt>"
//   node diary.mjs issue --severity broken|wrong|slow|confusing --title "…" --steps "…" --expected "…" --actual "…" [--shot name]
//   node diary.mjs again <issue number> "<what you saw this time>"
//   node diary.mjs time
//
// Appends to $POWER_OUT/diary.jsonl. `time` reads clock.json beside it, which
// power-test.mjs rewrites at the start of every stretch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEVERITIES = ['broken', 'wrong', 'slow', 'confusing'];

export function readDiary(file) {
  let entries = [];
  try {
    entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* no diary yet */ }
  const issues = [];
  for (const e of entries) {
    if (e.kind === 'issue') issues.push({ ...e, n: issues.length + 1, seen: 1, agains: [] });
    if (e.kind === 'again') {
      const i = issues[e.n - 1];
      if (i) { i.seen++; i.agains.push(e); }
    }
  }
  return { entries, notes: entries.filter((e) => e.kind === 'note'), issues };
}

/** An issue from `--flag value` pairs, or the sentence saying what is missing. */
export function issueFrom(args) {
  const issue = { shots: [] };
  for (let i = 0; i < args.length; i++) {
    const flag = /^--(severity|title|steps|expected|actual|shot)$/.exec(args[i])?.[1];
    if (!flag) continue;
    const value = String(args[++i] ?? '').trim();
    if (flag === 'shot') { if (value) issue.shots.push(value.endsWith('.png') ? value : `${value}.png`); } else issue[flag] = value;
  }
  if (!issue.title) return { error: 'An issue needs --title "what went wrong, in a line".' };
  if (!SEVERITIES.includes(issue.severity)) return { error: `--severity is one of ${SEVERITIES.join(', ')}.` };
  return { issue };
}

const minutes = (ms) => (Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : 0);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.env.POWER_OUT;
  if (!out) { console.log('No power test is running (POWER_OUT is not set).'); process.exit(1); }
  const file = path.join(out, 'diary.jsonl');
  let clock = {};
  try { clock = JSON.parse(fs.readFileSync(path.join(out, 'clock.json'), 'utf8')); } catch { /* before the first stretch */ }
  const write = (entry) => fs.appendFileSync(file, `${JSON.stringify({ at: Date.now(), round: clock.round ?? null, ...entry })}\n`);
  const [verb, ...args] = process.argv.slice(2);
  if (verb === 'note') {
    const text = args.join(' ').trim();
    if (!text) { console.log('A note needs some words.'); process.exit(1); }
    write({ kind: 'note', text });
    console.log('Noted.');
  } else if (verb === 'issue') {
    const { issue, error } = issueFrom(args);
    if (error) { console.log(error); process.exit(1); }
    const missing = issue.shots.filter((s) => !fs.existsSync(path.join(out, s)));
    write({ kind: 'issue', ...issue });
    const n = readDiary(file).issues.length;
    console.log(`Logged issue ${n}.${missing.length ? ` No picture called ${missing.join(', ')} yet: take it with shot.` : ''}`);
  } else if (verb === 'again') {
    const n = Number(args[0]);
    const { issues } = readDiary(file);
    if (!issues[n - 1]) { console.log(`There is no issue ${args[0] ?? ''}. You have logged ${issues.length}.`); process.exit(1); }
    write({ kind: 'again', n, text: args.slice(1).join(' ').trim() });
    console.log(`Issue ${n} seen ${issues[n - 1].seen + 1} times now.`);
  } else if (verb === 'time') {
    const now = Date.now();
    const stretch = minutes(clock.roundEnd - now);
    console.log(`${minutes(clock.deadline - now)} minutes left in the session; ${stretch ? `this stretch ends in ${stretch}.` : 'this stretch is over: stop here.'}`);
  } else {
    console.log('usage: diary.mjs note "<text>" | issue --severity <broken|wrong|slow|confusing> --title "…" --steps "…" --expected "…" --actual "…" [--shot name] | again <n> "<text>" | time');
    process.exit(2);
  }
}
