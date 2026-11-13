#!/usr/bin/env node
// THE THREADS OF THE LAST DAY, FOLDED TO WHO SAID WHAT, THE TROUBLED ONES FIRST.
//
//   node look-back.mjs [--hours 24] [--from items.json] [--out look-back.md]
//
// With no --from it reads every project's ledger, run ledger and run logs on
// this machine. --from takes what `list_work_items` (includeDone) answered,
// for a machine without the store, such as the Agentbox cloud: each thread
// then has only its ask, its latest reply, note and answer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerunWithStripTypes } from '../../../../scripts/lib/rerun-with-strip-types.mjs';

rerunWithStripTypes(import.meta.url);

const H = 3600_000;
export const UNANSWERED_MS = 2 * H;
export const LONG_REPLIES = 4;
const TEXT_CHARS = 700;
const EVENTS_KEPT = 30;

// The person's words. Matched on replies only: a first ask describing the bug
// ("the button still shows...") is the task, not a complaint about the agent.
const PUSHBACK = /\b(again|still|already (said|told|asked)|i (said|asked|told you)|you said|didn'?t|did not|doesn'?t|does not|isn'?t working|not working|not what|wrong|why (did|does|is|are|was|has)|broken?|undo|revert)\b/i;
// Comments pinned on a file, sent as one reply (shared/artifact-marks.mts):
// their words are about the design.
const PINNED_NOTES = /^Notes on [^\n]+:\n/;
// The app's own sentences when a run goes wrong, which it writes as the run's
// result as well as in its notes.
const APP_SAID = /stopped before it did anything|has not been started|tries again on its own|cloud machine stopped|was superseded|did not ship|not laid into/i;
const TROUBLE = /\b(did not|didn'?t|not|never|stopped|fail\w*|could not|couldn'?t|refused|held|bounced|conflict|lost|superseded|timed out|error)\b/i;

const who = (source) => (source === 'founder' ? 'person' : source === 'system' ? 'app' : 'agent');
const clip = (s, n = TEXT_CHARS) => {
  const t = String(s ?? '').replace(/\r/g, '').trim();
  return t.length > n ? `${t.slice(0, n)}… (${t.length} chars)` : t;
};

function flagsOf({ events, status, failedRuns = [], now }) {
  const flags = [];
  const replies = events.filter((e) => e.who === 'person' && e.kind === 'replied');
  const push = replies.find((e) => !PINNED_NOTES.test(e.text) && PUSHBACK.test(e.text));
  if (push) flags.push({ kind: 'pushback', why: `the person said "${clip(push.text, 120)}"` });

  const statuses = events.filter((e) => e.kind === 'status');
  const back = statuses.findIndex((e, i) => i > 0 && statuses[i - 1].text === 'done' && e.text !== 'done');
  if (back > 0) flags.push({ kind: 'reopened', why: `closed, then ${statuses[back].text} again (${statuses[back].who})` });

  const trouble = events.find((e) => (e.kind === 'result' || e.kind === 'note') && (APP_SAID.test(e.text) || (e.who === 'app' && TROUBLE.test(e.text))));
  if (trouble) flags.push({ kind: 'app-trouble', why: `the app said "${clip(trouble.text, 160)}"` });

  if (failedRuns.length) flags.push({ kind: 'failed-run', why: `${failedRuns.length} run${failedRuns.length > 1 ? 's' : ''} exited failed (${[...new Set(failedRuns.map((r) => r.engine).filter(Boolean))].join(', ') || 'engine unknown'})` });

  const last = events[events.length - 1];
  if (status !== 'done' && status !== 'claimed' && last?.who === 'person' && last.kind === 'replied' && now - last.ts > UNANSWERED_MS) {
    flags.push({ kind: 'unanswered', why: `the person's reply waited ${Math.round((now - last.ts) / H)}h with no answer` });
  }

  if (replies.length >= LONG_REPLIES) flags.push({ kind: 'long', why: `${replies.length} replies from the person` });
  return flags;
}

/** One thread from its ledger lines (`readItemHistory`), oldest first. */
export function storyFromHistory(item, lines, { now = Date.now(), runs = [], traces = null } = {}) {
  const events = [];
  let asked = false;
  for (const line of lines) {
    const p = line?.patch;
    if (!p) continue;
    const by = who(line.source);
    const add = (kind, text) => { if (String(text ?? '').trim()) events.push({ ts: line.ts, who: by, kind, text: String(text) }); };
    if (!asked && (p.body || p.title)) { add('asked', p.body || p.title); asked = true; }
    if (p.answer) add('replied', p.answer);
    if (p.note) add('note', p.note);
    if (p.result) add('result', p.result);
    if (p.status) add('status', p.status);
  }
  const failedRuns = runs.filter((r) => r?.item === item.id && r.failed === true);
  return {
    id: item.id, product: item.product, title: item.label || item.title, status: item.status,
    updatedAt: item.updatedAt, events, traces, flags: flagsOf({ events, status: item.status, failedRuns, now }),
  };
}

/** One thread as `list_work_items` answers it: only the newest of each field. */
export function storyFromSnapshot(item, { now = Date.now() } = {}) {
  const wrote = item.wrote ?? {};
  const events = [];
  const add = (kind, field, text, source) => {
    if (String(text ?? '').trim()) events.push({ ts: wrote[field]?.ts ?? item.createdAt ?? 0, who: who(source ?? wrote[field]?.source), kind, text: String(text) });
  };
  add('asked', 'body', item.body || item.title, 'founder');
  add('replied', 'answer', item.answer, 'founder');
  add('note', 'note', item.note);
  add('result', 'result', item.result);
  events.sort((a, b) => a.ts - b.ts);
  return {
    id: item.id, product: item.product, title: item.label || item.title, status: item.status,
    updatedAt: item.updatedAt, events, traces: null, flags: flagsOf({ events, status: item.status, now }),
  };
}

/** The threads touched since `since`: the marked ones, most marks first, and the rest. */
export function lookBack(stories, { since }) {
  const seen = stories.filter((s) => s.updatedAt >= since);
  const newest = (a, b) => b.updatedAt - a.updatedAt;
  return {
    flagged: seen.filter((s) => s.flags.length).sort((a, b) => b.flags.length - a.flags.length || newest(a, b)),
    quiet: seen.filter((s) => !s.flags.length).sort(newest),
  };
}

const when = (ts) => (ts ? new Date(ts).toISOString().slice(5, 16).replace('T', ' ') : '?');

export function renderLookBack({ flagged, quiet }, { hours = 24 } = {}) {
  const out = [`# The last ${hours}h of threads: ${flagged.length} with signs of trouble, ${quiet.length} without`, ''];
  for (const s of flagged) {
    out.push(`## ${s.title} (${s.id}, ${s.product}, ${s.status})`, '');
    for (const f of s.flags) out.push(`- **${f.kind}**: ${f.why}`);
    if (s.traces) out.push(`- run logs: ${s.traces}`);
    out.push('');
    const events = s.events.length > EVENTS_KEPT ? s.events.slice(-EVENTS_KEPT) : s.events;
    if (events.length < s.events.length) out.push(`(${s.events.length - events.length} earlier lines left out)`);
    for (const e of events) {
      if (e.kind === 'status') out.push(`${when(e.ts)} ${e.who} set it ${e.text}`);
      else out.push(`${when(e.ts)} ${e.who} ${e.kind}: ${clip(e.text).replace(/\n+/g, '\n    ')}`);
    }
    out.push('');
  }
  if (quiet.length) {
    out.push('## Threads with no sign of trouble', '');
    for (const s of quiet) out.push(`- ${s.title} (${s.id}, ${s.product}, ${s.status})`);
  }
  return out.join('\n');
}

function storiesOnThisMachine({ now }) {
  return Promise.all([
    import('../../../../mcp/core/account.mts'),
    import('../../../../main/store/project.mts'),
    import('../../../../main/store/work-items.mts'),
    import('../../../../main/store/home.mts'),
    import('../../../../main/run-ledger.mts'),
  ]).then(([{ resolveAccount }, { listProjects }, { readWorkItems, readItemHistories }, { machineryDir }, { readRuns }]) => {
    resolveAccount();
    const runs = readRuns();
    const stories = [];
    for (const p of listProjects()) {
      let items;
      try { items = readWorkItems(p.dir, now); } catch { continue; }
      const historyOf = readItemHistories(p.dir);
      for (const item of items) {
        const traces = path.join(machineryDir(p.dir), 'sessions', item.id);
        stories.push(storyFromHistory({ ...item, product: p.id }, historyOf(item.id), { now, runs, traces: fs.existsSync(traces) ? traces : null }));
      }
    }
    return stories;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const hours = Number(opt('hours') ?? 24);
  const now = Date.now();
  const from = opt('from');
  const stories = from
    ? JSON.parse(fs.readFileSync(from, 'utf8')).map((item) => storyFromSnapshot(item, { now }))
    : await storiesOnThisMachine({ now });
  const text = renderLookBack(lookBack(stories, { since: now - hours * H }), { hours });
  const out = opt('out');
  if (out) { fs.writeFileSync(out, `${text}\n`); console.log(`wrote ${out}`); } else console.log(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
