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
export const EVENTS = {
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
  // (tests/what-people-do-after-setup-is-counted.test.mjs).
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
  // (tests/a-start-that-is-turned-away-is-counted-and-said.test.mjs).
  run_waiting: 'An agent could not start yet',
};

export const EVENT_NAMES = Object.keys(EVENTS);

// THE ONLY PROPERTIES A CALLER MAY ATTACH, and every one of them is a number or
// a boolean. A string is refused outright rather than scrubbed, because a
// scrubbed string is a promise about a regular expression and this is a promise
// about a type. The version pair is set by the sender itself (`main/analytics
// .mjs`), never by a caller, which is why it is not in here.
export const ALLOWED_PROPS = new Set([
  'seconds',        // how long something took, rounded
  'count',          // how many of a thing, never which ones
  'kind',           // -> KINDS below, an enum and nothing else
  'fromAgent',      // whether an agent or the founder did it
  'failed',         // whether an agent's run ended in failure
  'practice',       // whether it happened in setup's practice project
  'engine',         // -> ENGINES below, which coding agent ran
  'reason',         // -> WAIT_REASONS below, why an agent could not start yet
]);

// `kind`, `engine` and `reason` are the properties that are not numbers, so each is a
// closed list. A value outside it is dropped, not passed through.
export const KINDS = new Set(['task', 'question', 'review', 'directive', 'agent', 'digest']);
export const ENGINES = new Set(['claude', 'codex']);
export const WAIT_REASONS = new Set([
  'setup', 'paused', 'asleep', 'stuck', 'brake', 'slot', 'login', 'engine', 'memory',
  'held', 'folder', 'slow-folder', 'model', 'cloud', 'practice', 'project', 'claim', 'error',
]);

// Refuse an event nobody approved; drop a property nobody approved. Returns the
// payload that may be sent, or null when the event itself is not one of hers.
export function sanitize(name, props = {}) {
  if (!EVENT_NAMES.includes(name)) return null;
  const out = {};
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
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
