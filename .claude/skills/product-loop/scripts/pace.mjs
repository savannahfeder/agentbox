#!/usr/bin/env node
// HOW MUCH OF THE CODEX WEEK THE LOOP MAY SPEND NOW. Testers only ever run on Codex.
//
//   node pace.mjs [--home ~/.codex-2] [--target 90] [--json]
//
// The line runs from 0% at the start of the weekly window to --target at its
// reset. Behind the line: run. Ahead: hold until the line catches up. The
// 5-hour window nearly full: wait for it. Target reached: stop for the week.
// The reading is the last one Codex wrote in its session logs under --home,
// which is what the app's usage meter shows. Without --home it is the Codex
// login on the best plan (codex-tester.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerunWithStripTypes } from '../../../../scripts/lib/rerun-with-strip-types.mjs';

rerunWithStripTypes(import.meta.url);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const WEEK = 7 * 24 * 3600_000;
const SESSION_CAP = 90;

/** `{ week, session }` out of the limits the app draws, or null without a week. */
export function readingFromLimits(limits) {
  // With more than one week reported, the fullest runs out first.
  const pick = (span) => {
    const l = (limits ?? []).filter((x) => x.span === span && Number.isFinite(x.percent)).sort((a, b) => b.percent - a.percent)[0];
    return l ? { percent: l.percent, resetsAt: l.resetsAt ?? null } : null;
  };
  const week = pick('week');
  return week ? { week, session: pick('session') } : null;
}

/**
 * @returns {{ verdict: 'run'|'hold'|'wait'|'stop', why: string, line?: number, until?: number }}
 */
export function paceFor(reading, { now = Date.now(), target = 90 } = {}) {
  const week = reading?.week;
  if (!week || !Number.isFinite(week.resetsAt) || now >= week.resetsAt) {
    return { verdict: 'run', why: 'No reading for this week yet, so one stretch runs and writes one.' };
  }
  if (week.percent >= target) {
    return { verdict: 'stop', why: `The week is at ${week.percent}%, which is the ${target}% target. Nothing more until it resets.`, until: week.resetsAt };
  }
  const session = reading.session;
  if (session && session.percent >= SESSION_CAP && Number.isFinite(session.resetsAt) && session.resetsAt > now) {
    return { verdict: 'wait', why: `The 5-hour window is at ${session.percent}%.`, until: session.resetsAt };
  }
  const startedAt = week.resetsAt - WEEK;
  const line = target * Math.min(1, Math.max(0, (now - startedAt) / WEEK));
  if (week.percent < line) {
    return { verdict: 'run', why: `The week is at ${week.percent}% and the line is at ${Math.round(line)}%.`, line };
  }
  return {
    verdict: 'hold',
    why: `The week is at ${week.percent}%, ahead of the line at ${Math.round(line)}%.`,
    line,
    until: startedAt + Math.round((week.percent / target) * WEEK),
  };
}

/** The reading the pacer works from: that Codex login's latest. */
export async function readingFor(home) {
  const { loggedCodexLimits } = await import(path.join(REPO, 'main/codex-usage-file.mts'));
  const { codexLimits } = await import(path.join(REPO, 'shared/codex-usage.mts'));
  const logged = loggedCodexLimits(home);
  return logged ? readingFromLimits(codexLimits(logged.snapshot)) : null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  if (opt('engine', 'codex') !== 'codex') { console.error('pace: testers run on Codex only, so there is no other week to pace.'); process.exit(1); }
  const { testerLogin } = await import(path.join(REPO, '.claude/skills/power-test/scripts/codex-tester.mjs'));
  const login = testerLogin({ given: opt('home', process.env.CODEX_HOME || null) });
  if (!login) { console.error('pace: there is no Codex login on this computer.'); process.exit(1); }
  const pace = paceFor(await readingFor(login.home), { target: Number(opt('target', 90)) });
  if (args.includes('--json')) console.log(JSON.stringify(pace));
  else console.log(`${pace.verdict}: ${pace.why}${pace.until ? ` Until ${new Date(pace.until).toLocaleString()}.` : ''}`);
}
