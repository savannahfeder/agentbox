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
]);

// `kind` is the one property that is not a number, so it is a closed list. A
// value outside it is dropped, not passed through.
export const KINDS = new Set(['task', 'question', 'review', 'directive', 'agent', 'digest']);

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
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
