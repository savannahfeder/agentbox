// THE WHOLE LIST OF WHAT AGENTBOX MAY SEND. Nothing else can leave.
//
// Her eight, approved 2026-08-19 under her 08-18 rule: NO CODE, PROMPTS, KEYS
// OR PATHS. Seven of them are counts and the eighth is the version pair, which
// is not an event but a property on every one of them, exactly as
// `legal/privacy.html` section 5.1 describes it.
//
// This file is SHARED so the code and the published promise cannot drift apart.
// The privacy page lists these sentences; a test reads them from here and fails
// the build when one of them is missing from the page, and
// `scripts/shot-legal-pages.mjs` in the store fails from the other side.
//
// The naming rule that matters: an event name says THAT something happened. It
// never carries what it happened to. There is no room in this file for a title,
// a path, a repo name or a slug, and the property allowlist below is what stops
// a future caller adding one by accident.

// name -> the sentence the privacy page promises, word for word.
import { Name } from '../shared/product-name.mjs';
export const EVENTS: Record<string, string> = {
  app_opened: `${Name} was opened`,
  first_run_finished: 'First run finished',
  repo_connected: 'A repo was connected',
  agent_seen: 'An agent was seen',
  task_opened: 'A task was opened',
  reply_sent: 'A reply was sent',
  task_finished: 'A task finished',
  // REAL USE, NOT ONLY THE WALKTHROUGH (2026-10-06). Every "task finished" on
  // the day downloads opened was somebody closing practice rows in setup; there
  // was no count of an agent doing real work, of where setup was left, or of an
  // install being used on a day, which is what retention is read from.
  day_active: `${Name} was used today`,
  first_run_step: 'A setup step was reached',
  task_written: 'A task was written',
  run_started: 'An agent started work',
  run_finished: 'An agent stopped work',
  // WHAT HAPPENS IN THE MINUTES AFTER SETUP (2026-10-16). Most installs on
  // 0.1.13 went quiet within minutes of finishing setup, and nothing said
  // whether they quit, put the corner tag away, or what the import brought in
  // (tests/what-people-do-after-setup-is-counted.test.mts).
  app_quit: `${Name} was quit`,
  tag_hidden: 'The corner tag was hidden',
  tag_turned_off: 'The corner tag was turned off',
  import_offered: 'Setup offered agents to import',
  import_taken: 'Setup imported agents',
  // Sent as the switch goes off and never again, so an install that opted out
  // is not read as one that stopped using the app.
  counts_turned_off: 'Counts were turned off',
  // WHY A TASK HAS NOT STARTED (2026-10-29). 8 of 26 installs wrote a task and
  // never started an agent, and nothing said which of a dozen checks held it
  // (tests/a-start-that-is-turned-away-is-counted-and-said.test.mts).
  run_waiting: 'An agent could not start yet',
  // HOW HEAVY IT IS ON THE MACS OF THE PEOPLE USING IT (2026-11-22), which
  // only the person's own Mac could say until now
  // (tests/each-install-says-once-a-day-how-heavy-the-app-was.test.mts).
  app_health: 'How heavy the app was on a day',
  // Sent as it happens, since somebody stuck in setup may never open the app
  // again (tests/a-freeze-during-setup-or-an-import-is-counted-at-once.test.mts).
  app_froze: 'The app froze during setup or an import',
};

export const EVENT_NAMES: string[] = Object.keys(EVENTS);

// THE ONLY PROPERTIES A CALLER MAY ATTACH. Each is a number, a boolean or a
// word from a closed list, except `freezeWhere`, which must be a place in the
// app's own code (`appCode`). Any other string is refused outright rather than
// scrubbed. The version pair is set by the sender itself (`main/analytics
// .mjs`), never by a caller, which is why it is not in here.
export const ALLOWED_PROPS: Set<string> = new Set([
  'seconds',        // how long something took, rounded
  'count',          // how many of a thing, never which ones
  'kind',           // -> KINDS below, an enum and nothing else
  'fromAgent',      // whether an agent or the founder did it
  'failed',         // whether an agent's run ended in failure
  'practice',       // whether it happened in setup's practice project
  'engine',         // -> ENGINES below, which coding agent ran
  'reason',         // -> WAIT_REASONS below, why an agent could not start yet
  // `app_health`'s nine, all numbers (main/health-day.mts).
  'appMb',          // the most memory the app's own processes used
  'mainMb',         // the most its main process used
  'idleCpu',        // its average CPU, % of one core, while no agent ran
  'busyCpu',        // the same while one did
  'wakeups',        // how often a second it woke the Mac while idle
  'freezes',        // how many times its main thread held for half a second or more
  'freezeSeconds',  // the longest of those
  'tightMinutes',   // minutes the Mac was short of memory
  'hours',          // hours it was open
  // And when and how it got heavy, said by time since it opened, never the hour.
  'peakHours',      // how long it had been open when its memory peaked
  'peakAgents',     // how many agents were running then
  'peakPart',       // -> PARTS below, which part of the app held the most
  'mainMbPerHour',  // how fast main grew over the longest stretch it stayed open
  'cpuPeak',        // its busiest minute, % of one core
  'cpuPeakPart',    // -> PARTS below, which part was busiest then
  'freezeWhere',    // the app's own function that held the longest freeze, as `appCode` allows
  'freezeHours',    // how long it had been open then
  'freezeAgents',   // how many agents were running then
  // `app_froze`'s, beside `seconds`, `count` (setup's step) and `freezeWhere`.
  'during',         // -> DURING below, setup or an import
  'heldPart',       // -> PARTS below, the main process or a window
]);

// The parts of the app main/own-use.mts measures.
export const PARTS: Set<string> = new Set(['main', 'windows', 'gpu', 'helpers']);
export const DURING: Set<string> = new Set(['setup', 'import']);

/**
 * A function in the app's own code, as main/freeze-recorder.mts names it:
 * its name and its file and line under the app's own folders. A frame from
 * anywhere else is written `…/a/b.js` there, and so never matches.
 */
export function appCode(where: unknown): where is string {
  return typeof where === 'string' && where.length <= 120 && !where.includes('..')
    && /^(\(anonymous\)|[A-Za-z_$][\w$]*) (main|shared|mcp|bin)\/[\w./-]+\.(mts|mjs|cjs|js|ts):\d+$/.test(where);
}

// `kind`, `engine`, `reason`, `during` and the parts are closed lists. A value
// outside one is dropped, not passed through.
export const KINDS: Set<string> = new Set(['task', 'question', 'review', 'directive', 'agent', 'digest']);
export const ENGINES: Set<string> = new Set(['claude', 'codex']);
export const WAIT_REASONS: Set<string> = new Set([
  'setup', 'paused', 'asleep', 'stuck', 'brake', 'slot', 'login', 'engine', 'memory',
  'held', 'folder', 'slow-folder', 'model', 'cloud', 'practice', 'project', 'claim', 'error',
]);

// Refuse an event nobody approved; drop a property nobody approved. Returns the
// payload that may be sent, or null when the event itself is not one of hers.
export function sanitize(name: string, props: Record<string, unknown> | null = {}): Record<string, string | number | boolean> | null {
  if (!EVENT_NAMES.includes(name)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (key === 'kind') {
      if (typeof value === 'string' && KINDS.has(value)) out.kind = value;
      continue;
    }
    if (key === 'engine') {
      if (typeof value === 'string' && ENGINES.has(value)) out.engine = value;
      continue;
    }
    if (key === 'reason') {
      if (typeof value === 'string' && WAIT_REASONS.has(value)) out.reason = value;
      continue;
    }
    if (key === 'peakPart' || key === 'cpuPeakPart' || key === 'heldPart') {
      if (typeof value === 'string' && PARTS.has(value)) out[key] = value;
      continue;
    }
    if (key === 'during') {
      if (typeof value === 'string' && DURING.has(value)) out.during = value;
      continue;
    }
    if (key === 'freezeWhere') {
      if (appCode(value)) out.freezeWhere = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
