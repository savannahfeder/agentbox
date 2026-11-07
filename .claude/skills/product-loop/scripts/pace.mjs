#!/usr/bin/env node
// HOW MUCH OF THE WEEK THE LOOP MAY SPEND NOW, on Codex or a Claude Code plan.
//
//   node pace.mjs [--engine codex|claude] [--home ~/.codex | ~/.claude-2] [--target 90] [--json]
//
// The line runs from 0% at the start of the weekly window to --target at its
// reset. Behind the line: run. Ahead: hold until the line catches up. The
// 5-hour window nearly full: wait for it. Target reached: stop for the week.
// Codex's reading is the last one it wrote in its session logs under --home;
// Claude's is asked of Claude Code for that login. Both are what the app's
// usage meter shows.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerunWithStripTypes } from '../../../../scripts/lib/rerun-with-strip-types.mjs';

rerunWithStripTypes(import.meta.url);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const WEEK = 7 * 24 * 3600_000;
const SESSION_CAP = 90;

/** `{ week, session }` out of the limits the app draws, or null without a week. */
export function readingFromLimits(limits) {
  // Claude has several weeks (all models, Opus, Sonnet): the fullest runs out first.
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
export function paceFor(reading, { now = Date.now(), target = 90, needsReading = false } = {}) {
  const week = reading?.week;
  // A Claude stretch writes no reading of its own, so without one nothing would ever pace it.
  if (!week && needsReading) {
    return { verdict: 'stop', why: 'Could not read this login\'s week, so nothing runs unpaced.' };
  }
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

/** The app's name for a Claude login: 'default' for ~/.claude, otherwise its folder. */
export function claudeProfile(home, homeDir = os.homedir()) {
  const dir = String(home ?? '').trim().replace(/^~(?=\/)/, homeDir);
  return !dir || dir === 'default' || path.resolve(dir) === path.join(homeDir, '.claude') ? 'default' : path.resolve(dir);
}

/** That login's limits, asked of Claude Code the way the app's meter asks, or null. */
export async function readClaudeLimits(home, { run = null, env = process.env, now = Date.now(), bin = 'claude' } = {}) {
  const { usageEnv, usageCwd } = await import(path.join(REPO, 'main/claude-usage.mts'));
  const { readUsageReport } = await import(path.join(REPO, 'shared/claude-usage.mts'));
  const { NO_METERED_KEY } = await import(path.join(REPO, 'main/harnesses/claude.mts'));
  const runUsage = run ?? (await import(path.join(REPO, 'main/claude-usage-process.mts'))).runClaudeUsage;
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '',
    '--settings', JSON.stringify({ ...NO_METERED_KEY, disableAllHooks: true })];
  const report = await new Promise((resolve) => {
    try {
      runUsage(bin, args, { cwd: usageCwd(), env: usageEnv(env, claudeProfile(home)), timeout: 30_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
        (err, out) => resolve(err ? null : out));
    } catch { resolve(null); }
  });
  const limits = report ? readUsageReport(report, now) : [];
  return limits.length ? limits : null;
}

/** The reading the pacer works from, for either engine. */
export async function readingFor(engine, home) {
  if (engine === 'claude') return readingFromLimits(await readClaudeLimits(home));
  const { loggedCodexLimits } = await import(path.join(REPO, 'main/codex-usage-file.mts'));
  const { codexLimits } = await import(path.join(REPO, 'shared/codex-usage.mts'));
  const logged = loggedCodexLimits(home);
  return logged ? readingFromLimits(codexLimits(logged.snapshot)) : null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  const engine = opt('engine', 'codex');
  const fallback = engine === 'claude' ? (process.env.CLAUDE_CONFIG_DIR || 'default') : (process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  const home = String(opt('home', fallback)).replace(/^~(?=\/)/, os.homedir());
  const pace = paceFor(await readingFor(engine, home), { target: Number(opt('target', 90)), needsReading: engine === 'claude' });
  if (args.includes('--json')) console.log(JSON.stringify(pace));
  else console.log(`${pace.verdict}: ${pace.why}${pace.until ? ` Until ${new Date(pace.until).toLocaleString()}.` : ''}`);
}
