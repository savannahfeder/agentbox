// THE REPORT: WHAT WENT WRONG, WORST FIRST, WITH WHAT HAPPENED AROUND IT.
import fs from 'node:fs';
import path from 'node:path';
import { readDiary } from './diary.mjs';

const ORDER = { broken: 0, wrong: 1, slow: 2, confusing: 3 };
const clock = (ms) => { const m = Math.max(0, Math.round(ms / 60_000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const readJsonl = (file) => {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Worst first: severity, then how often it was seen, then when. */
export function rankIssues(issues) {
  return [...issues].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9) || (b.seen ?? 1) - (a.seen ?? 1) || a.at - b.at);
}

/**
 * What happened to the app in the ten minutes before `at`, latest first: the
 * likeliest cause to look at. The agents' pace holds all session, so it
 * explains nothing.
 */
export function nearestEvent(events, at, windowMs = 10 * 60_000) {
  return [...events].filter((e) => e.kind !== 'agents' && e.at <= at && at - e.at <= windowMs).sort((a, b) => b.at - a.at)[0] ?? null;
}

export function writeReport({ root, startedAt, endedAt, focus = null, real = false, chaos = 'normal', people }) {
  const since = (at) => clock(at - startedAt);
  const all = [];
  const machine = [];
  const sections = [];
  for (const p of people) {
    const { issues, notes } = readDiary(path.join(p.dir, 'diary.jsonl'));
    const events = readJsonl(path.join(p.dir, 'timeline.jsonl'));
    const actions = readJsonl(path.join(p.dir, 'actions.jsonl'));
    const found = readJson(path.join(p.dir, 'machine.json')) ?? readJsonl(path.join(p.dir, 'machine.jsonl'));
    for (const i of issues) all.push({ ...i, who: p, event: nearestEvent(events, i.at) });
    for (const f of found) machine.push({ ...f, who: p, event: nearestEvent(events, f.firstAt) });
    const timed = actions.filter((a) => ['click', 'press', 'type', 'look', 'reload'].includes(a.verb));
    const slowest = [...timed].sort((a, b) => b.ms - a.ms).slice(0, 3);
    const pageErrors = [...new Set(actions.flatMap((a) => a.errors ?? []))];
    const timedOut = actions.filter((a) => a.timedOut).length;
    sections.push([
      `### ${p.name}, ${p.role}`,
      '',
      `${p.rounds ?? 0} stretches, ${actions.length} actions, ${notes.length} diary notes, ${issues.length} issues. ${p.stopped ? `Stopped because ${p.stopped}.` : ''}`,
      p.coverage ? `Did: ${p.coverage.did.join(', ') || 'nothing on the list'}.` : '',
      p.coverage?.notYet.length ? `Never got to: ${p.coverage.notYet.join('; ')}.` : '',
      timed.length ? `Screen: half of ${timed.length} actions answered within ${median(timed.map((a) => a.ms))} ms; slowest ${slowest.map((a) => `${a.verb} ${a.args.join(' ').slice(0, 30)} ${a.ms} ms`).join(', ')}.` : '',
      timedOut ? `${timedOut} action(s) got no answer from the screen in 90 seconds.` : '',
      pageErrors.length ? `Page errors: ${pageErrors.slice(0, 5).map((e) => `\`${e.slice(0, 160)}\``).join(', ')}` : 'No page errors.',
      events.length ? `\nWhat happened to their app: ${events.map((e) => `${since(e.at)} ${e.says}`).join(' · ')}` : '',
      `\nEvidence: \`${p.dir}\``,
    ].filter(Boolean).join('\n'));
  }

  const ranked = rankIssues(all);
  const severe = machine.sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9) || a.firstAt - b.firstAt);
  const seenTwice = ranked.filter((i) => i.seen > 1).length;
  const minutes = Math.round((endedAt - startedAt) / 60_000);
  const lines = [
    `# Power test, ${new Date(startedAt).toISOString().slice(0, 16).replace('T', ' ')}: ${focus ?? 'an ordinary day'}`,
    '',
    `${people.length} ${people.length === 1 ? 'person' : 'people'} (${people.map((p) => p.name).join(', ')}) for ${clock(endedAt - startedAt)} (${minutes} min), on ${real ? 'the real Claude Code and Codex on this computer' : 'stand-in agents'}, chaos ${chaos}. Testers logged ${ranked.length} issue(s), ${seenTwice} seen more than once; the watcher found ${severe.length}.`,
    real ? '' : 'The agents were stand-ins: their answers are canned, so an issue about what an answer said is about the stand-in, not the app. What the app did with it counts.',
    '',
    '## What the testers hit',
    '',
  ];
  if (!ranked.length) lines.push('Nothing logged.', '');
  else {
    lines.push('| # | severity | what | who | seen | at |', '|---|---|---|---|---|---|');
    ranked.forEach((i, k) => lines.push(`| ${k + 1} | ${i.severity} | ${i.title.replace(/\|/g, '/')} | ${i.who.name} | ${i.seen} | ${since(i.at)} |`));
    lines.push('');
    ranked.forEach((i, k) => {
      lines.push(`### ${k + 1}. ${i.title}`, '',
        `${i.severity}, logged by ${i.who.name} ${since(i.at)} into the test, seen ${i.seen} time(s).${i.event ? ` ${Math.round((i.at - i.event.at) / 60_000)} min after: ${i.event.says}` : ''}`);
      if (i.steps) lines.push(`\nSteps: ${i.steps}`);
      if (i.expected) lines.push(`\nExpected: ${i.expected}`);
      if (i.actual) lines.push(`\nActual: ${i.actual}`);
      for (const a of i.agains) lines.push(`\nSeen again at ${since(a.at)}: ${a.text}`);
      for (const s of i.shots ?? []) lines.push(`\n${path.join(i.who.dir, s)}`);
      lines.push('');
    });
  }
  lines.push('## What the watcher found', '');
  if (!severe.length) lines.push('Nothing: every thread was answered or told why, nothing was started over and over, no errors in the log, memory held.', '');
  for (const f of severe) {
    lines.push(`- **${f.title}** (${f.severity}, ${f.who.name}'s app, first at ${since(f.firstAt)}${f.count > 1 ? `, seen in ${f.count} checks` : ''}${f.event ? `, ${Math.round((f.firstAt - f.event.at) / 60_000)} min after: ${f.event.says}` : ''}). ${f.detail ?? ''}`);
  }
  lines.push('', '## What each tester did', '', ...sections.flatMap((s) => [s, '']));
  const text = `${lines.filter((l, i, xs) => !(l === '' && xs[i - 1] === '')).join('\n')}\n`;
  const file = path.join(root, 'report.md');
  fs.writeFileSync(file, text);
  return { file, text, counts: { issues: ranked.length, seenTwice, machine: severe.length } };
}
