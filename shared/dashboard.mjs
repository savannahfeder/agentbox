// The dashboard: the company's real state as one folded picture.
//
// This module is the PURE core, zero-dep ESM so main (the ledger store, the
// agent tools) and the renderer (the page) share exactly one set of rules. No
// filesystem, no network, no React, no Date.now except as an injected default,
// so every rule below is unit-testable without a DOM or a disk.
//
// Two halves, and the split is the whole design:
//
//   DERIVED    in-flight work, artifacts, folders, analytics numbers, how many
//              days in. Computed at read time from state that already exists.
//              Typed status rots; earned status stays true.
//
//   WRITTEN    the judgments a derivation cannot make: the one-liner, where the
//              company is on the path, the bottleneck, the next move, which
//              metrics matter. Appended to a ledger as partial patches by any
//              agent (or the founder), folded newest-wins per field.
//
// The sharpest constraint in the whole feature, worth restating where the code
// lives: any pre-launch score that can be improved WITHOUT moving toward launch
// will be improved without moving toward launch. That is why the pre-launch
// headline is "steps to launch", which counts down and is derived from the
// path, rather than anything a founder can raise by interviewing forever.

/* ------------------------------- the stages ------------------------------ */
// Two states of one page, never two products. Pre-launch adds the path and the
// proportion pips; launched retires them and real metrics take over.). A
// founder who flips their own stage early is not a failure mode worth
// machinery.
export const STAGES = ['prelaunch', 'launched'];

/* -------------------------------- the path ------------------------------- */
// The default road to launch. Six steps, plain words, ending at the door: the
// point is showing it to people you do not know. An agent may replace this
// wholesale for a company these steps do not fit (a physical product, an
// existing business adding a product), which is why it is a ledger field and
// not a hard-coded ladder.
//
// Every step's `note` is a fact or a condition, never a target and never a
// countdown: comparison is motivating, prescription is not.
export const DEFAULT_PATH = [
  { name: 'Describe it', status: 'here', note: '' },
  { name: 'Meet your customers', status: 'ahead', note: '' },
  { name: 'Talk to them', status: 'ahead', note: '' },
  { name: 'Build it', status: 'ahead', note: '' },
  { name: 'Put it online, take payment', status: 'ahead', note: '' },
  { name: "Show it to people you don't know", status: 'ahead', note: 'the whole point' },
];

export const STEP_STATUSES = ['done', 'here', 'ahead'];

// The last step is the door: it renders as wanted rather than as locked (full
// strength label, a lamp ring waiting). Position, not a flag on the data, so a
// replaced path gets the same treatment for free.
export function isDoor(path, index) {
  return index === (path?.length ?? 0) - 1;
}

// How many steps remain, the pre-launch headline. Counts every step that is not
// done, so standing still cannot improve it and finishing one always does.
export function stepsToLaunch(path) {
  const steps = Array.isArray(path) ? path : [];
  return steps.filter((s) => s?.status !== 'done').length;
}

/* ------------------------------- the metrics ----------------------------- */
// A metric is one of three things, and the difference between the second and
// the third is a load-bearing honesty rule:
//
//   a VALUE      a real number we measured. `0` is a real number.
//   ABSENT       we are not collecting this. Says so, and says what would make
//                it start. Renders over a dashed baseline.
//   a PROPORTION "4 of 6", pre-launch, drawn as pips rather than a time series
//                because the answer is out of six, not over days.
//
// Absence of data and a real zero are DIFFERENT FACTS and must never look the
// same. A page that draws "not measured" as a confident 0 is lying, and this
// product's whole claim is that its numbers are not lying.
export function makeMetric(input = {}) {
  const value = Number.isFinite(input.value) ? input.value : null;
  const of = Number.isFinite(input.of) ? input.of : null;
  return {
    id: String(input.id ?? '').trim() || slug(input.label),
    label: String(input.label ?? '').trim(),
    value,
    of,
    // A currency mark, and the only reason it exists: a big bare "1,240" reads
    // as a count of things, not as money. Kept to a mark rather than a format
    // so the number itself stays the number.
    prefix: String(input.prefix ?? '').trim().slice(0, 4),
    // the italic line beneath the number: what the number MEANS, in plain words
    unit: String(input.unit ?? '').trim(),
    // when there is no value: the short honest phrase ("not measured", "not
    // yet") and the line that says what would fill it. Never a loading state.
    absent: value == null ? (String(input.absent ?? '').trim() || 'not measured') : null,
    fills: value == null ? String(input.fills ?? '').trim() : '',
    series: Array.isArray(input.series) ? input.series.filter((n) => Number.isFinite(n)) : null,
    source: input.source ?? null,
  };
}

// Which drawing a metric gets. A proportion is pips; anything else with history
// is a sparkline; anything else is the dashed absent baseline. Pure, so the
// component never decides this itself and the tests can pin it.
export function metricShape(metric) {
  if (!metric) return 'absent';
  if (metric.of != null) return 'pips';
  if (metric.value == null) return 'absent';
  // A series that is zero every day is drawn as a real LINE on a real baseline,
  // not as a row of bars with no height. A flat line reads as a measurement;
  // the dashed baseline reads as an absence.
  if (metric.series && metric.series.length) {
    return metric.series.some((n) => n > 0) ? 'series' : 'flat';
  }
  return 'flat';
}

// True when this metric is honestly measured. `0` is measured; null is not.
export function isMeasured(metric) {
  return !!metric && metric.value != null;
}

// `drillEvent` lived here: it answered which event a number could be opened
// into, and it did that by asking whether the metric's source kind was the
// other product's name. Removed on 2026-09-22 with the rest of that name. It
// had no callers in main, shared, renderer, tests or scripts, and nothing in
// this file ever wrote that kind (the only one written is 'derived'), so it
// returned null for every input it could ever have been given.

/* ------------------------------- the ledger ------------------------------ */
// Append-only, one JSON object per line:
//   { ts, source: 'agent' | 'founder', chatId?, patch: { <field>: value } }
//
// Several conversations run at once and all of them may want to write, which is
// exactly why this is append-only: two chats appending concurrently cannot
// clobber each other the way two read-modify-writes of a single document would.
// Folding is newest-wins per TOP-LEVEL field, so a chat that only knows the
// next move never has to restate the one-liner to avoid erasing it.
export const LEDGER_FIELDS = [
  'founderName', 'oneLiner', 'stage', 'path', 'bottleneck', 'nextMove',
  'metrics', 'keyMetricId', 'analytics',
];

export const LEDGER_SOURCES = ['agent', 'founder'];

// THE FOUNDER'S WORD WINS.). Authority is per FIELD and only over fields the
// founder actually touched, so pinning the headline metric never freezes the
// agent out of updating the metric values themselves. A newer founder patch
// always beats an older founder patch: changing your mind is allowed.
export function foldLedger(lines, now = Date.now()) {
  const picture = defaultDashboard(now);
  const winner = new Map(); // field -> { ts, source }

  for (const line of Array.isArray(lines) ? lines : []) {
    const entry = normalizeLine(line);
    if (!entry) continue; // a malformed line is skipped, never fatal
    for (const [field, value] of Object.entries(entry.patch)) {
      if (!LEDGER_FIELDS.includes(field)) continue;
      const held = winner.get(field);
      if (held && !beats(entry, held)) continue;
      const clean = coerceField(field, value);
      if (clean === undefined) continue; // a field that failed validation keeps the older value
      picture[field] = clean;
      winner.set(field, { ts: entry.ts, source: entry.source });
    }
  }

  // who last spoke for each field, so the page can show the founder that their
  // own choice is the one in force rather than silently agreeing with them
  picture.authored = Object.fromEntries([...winner].map(([f, w]) => [f, w.source]));
  return picture;
}

// Does the incoming entry outrank the one already holding this field?
function beats(incoming, held) {
  if (held.source === 'founder' && incoming.source !== 'founder') return false;
  if (incoming.source === 'founder' && held.source !== 'founder') return true;
  return incoming.ts >= held.ts;
}

// One ledger line, defensively read. Anything unparseable returns null so a
// corrupt ledger degrades to an older picture rather than a broken page.
export function normalizeLine(line) {
  let raw = line;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    try { raw = JSON.parse(text); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object') return null;
  const patch = raw.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const ts = Number.isFinite(raw.ts) ? raw.ts : 0;
  const source = LEDGER_SOURCES.includes(raw.source) ? raw.source : 'agent';
  return { ts, source, chatId: raw.chatId ?? null, patch };
}

// Per-field validation. Returning undefined means "this patch had nothing
// usable for this field", and the previous value stands: a garbled write can
// never blank a good picture.
function coerceField(field, value) {
  switch (field) {
    case 'founderName':
      // What to call them, as THEY said it. Never derived from an email local
      // part: that produced "Morning, Sfeder." on the founder's own screen
      // (2026-07-27) from a git-style handle, and a name is exactly the thing
      // you do not guess. Absent, the page greets without a name, which is
      // warm and correct; wrong, it is neither.
      return typeof value === 'string' && value.trim() ? clean(value).slice(0, 40) : undefined;

    case 'oneLiner':
      return typeof value === 'string' && value.trim() ? clean(value) : undefined;

    case 'stage':
      return STAGES.includes(value) ? value : undefined;

    case 'keyMetricId':
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;

    case 'path': {
      if (!Array.isArray(value) || !value.length) return undefined;
      const steps = value
        .filter((s) => s && typeof s === 'object' && String(s.name ?? '').trim())
        .map((s) => ({
          name: clean(s.name),
          status: STEP_STATUSES.includes(s.status) ? s.status : 'ahead',
          note: clean(s.note ?? ''),
        }));
      return steps.length ? steps : undefined;
    }

    case 'bottleneck':
    case 'nextMove': {
      if (value === null) return null; // an explicit clear is legitimate
      if (!value || typeof value !== 'object') return undefined;
      const body = clean(value.body ?? '');
      if (!body) return undefined;
      return { body, foot: clean(value.foot ?? '') };
    }

    case 'metrics': {
      if (!Array.isArray(value)) return undefined;
      const metrics = value
        .filter((m) => m && typeof m === 'object' && String(m.label ?? '').trim())
        .map((m) => makeMetric({ ...m, label: clean(m.label), unit: clean(m.unit ?? ''), fills: clean(m.fills ?? ''), absent: clean(m.absent ?? '') }));
      return metrics.length ? metrics : undefined;
    }

    case 'analytics': {
      if (value === null) return null;
      if (!value || typeof value !== 'object') return undefined;
      const provider = String(value.provider ?? '').trim();
      if (!provider) return undefined;
      return {
        provider,
        projectId: value.projectId != null ? String(value.projectId) : null,
        host: typeof value.host === 'string' && value.host.trim() ? value.host.trim() : null,
      };
    }

    default:
      return undefined;
  }
}

// The picture before anyone has written anything: a brand new company on step
// one.
export function defaultDashboard(now = Date.now()) {
  return {
    stage: 'prelaunch',
    founderName: null,
    oneLiner: null,
    path: DEFAULT_PATH.map((s) => ({ ...s })),
    bottleneck: null,
    nextMove: null,
    metrics: [],
    keyMetricId: null,
    analytics: null,
    authored: {},
    now,
  };
}

/* ------------------------- the metric set on screen ---------------------- */
// One large number on the left, three to its right. Which one is large is the
// founder's if they said so, otherwise the first the agent listed, otherwise
// the derived pre-launch headline.
//
// Pre-launch ALWAYS has "steps to launch" available as the headline even when
// no agent has written a single metric, because the page has to be honest and
// useful on day one, and that number is derived from the path so it cannot be
// gamed.
export function metricRow(picture, { others = 3 } = {}) {
  // NO PICTURE IS NOT A COMPANY. Day one is `defaultDashboard`, which has the
  // six-step path and therefore a true headline; a null picture means the
  // ledger has not been read yet (on the web the brain is a sandbox that takes
  // 30-40 seconds to wake, and the workspace paints from cache meanwhile).
  // Deriving the headline from an absent path made those seconds print a
  // confident "0" over "nothing left before launch", which told the founder her
  // company had launched (report 2026-08-06). Invent nothing; the page draws
  // its loading state from this emptiness.
  if (!picture) return { key: null, others: [] };
  const metrics = [...(picture.metrics ?? [])];
  const prelaunch = picture?.stage !== 'launched';

  if (prelaunch && !metrics.some((m) => m.id === 'steps-to-launch')) {
    metrics.unshift(stepsToLaunchMetric(picture?.path ?? []));
  }

  let keyIndex = 0;
  if (picture?.keyMetricId) {
    const found = metrics.findIndex((m) => m.id === picture.keyMetricId);
    if (found >= 0) keyIndex = found;
  }

  const key = metrics[keyIndex] ?? null;
  const rest = metrics.filter((_, i) => i !== keyIndex).slice(0, others);
  return { key, others: rest };
}

// The derived pre-launch headline. Its unit line NAMES the remaining steps, so
// the number is never a bare score: it says what it would take to move it.
export function stepsToLaunchMetric(path) {
  const steps = Array.isArray(path) ? path : [];
  const remaining = steps.filter((s) => s?.status !== 'done');
  const names = remaining.map((s) => lowerFirst(s.name));
  const unit = names.length === 0
    ? 'nothing left before launch.'
    : names.length === 1
      ? `${names[0]}.`
      : `${names.slice(0, -1).join(', ')}, then ${names[names.length - 1]}.`;
  return makeMetric({
    id: 'steps-to-launch',
    label: 'Steps to launch',
    value: remaining.length,
    unit,
    source: { kind: 'derived', of: 'path' },
  });
}

// The pips under a pre-launch figure: a proportion, not a series. The path's
// own pips mark where you are with the lamp; a plain proportion has no "now".
export function pipsFor(metric, path) {
  if (metric?.id === 'steps-to-launch') {
    const steps = Array.isArray(path) ? path : [];
    return steps.map((s, i) => {
      if (s?.status === 'done') return 'on';
      if (s?.status === 'here') return 'now';
      // the first not-done step counts as where you are when nothing says 'here'
      const firstOpen = steps.findIndex((x) => x?.status !== 'done');
      return i === firstOpen && !steps.some((x) => x?.status === 'here') ? 'now' : 'off';
    });
  }
  if (metric?.of == null) return [];
  const total = Math.max(0, Math.round(metric.of));
  const filled = Math.max(0, Math.min(total, Math.round(metric.value ?? 0)));
  return Array.from({ length: total }, (_, i) => (i < filled ? 'on' : 'off'));
}

/* ------------------------------ in flight -------------------------------- */
// Four glyphs and no more, because the founder-facing question is only ever one
// of four: does it need me, is it moving, did it stall, is it ready.
//
//   wait   a conversation is holding a question for you
//   run    a turn is working right now, or a dev server is up
//   stop   something was running and is not any more
//   done   finished and you have not looked at it yet
//
// Everything here is DERIVED from state the app already keeps and never showed
// on this page: the per-chat status ledger and the runtime map. The old home's
// "in progress" lamp was not liveness at all and does not survive into this
// grid.
export const GLYPHS = ['wait', 'run', 'stop', 'done'];

// Order on screen: what needs you, then what is moving, then what stopped, then
// what is ready. Never a drought counter, never a scolding; a stalled item says
// when it stopped and nothing more.
const GLYPH_RANK = { wait: 0, run: 1, stop: 2, done: 3 };

export function deriveInFlight({ chats = [], chatStatus = {}, runtime = {}, creations = [] } = {}, now = Date.now()) {
  const items = [];

  for (const chat of chats) {
    const st = chatStatus?.[chat?.id];
    if (!st) continue;
    if (st.askPending) {
      items.push({ key: `chat:${chat.id}`, chatId: chat.id, name: chat.title || 'Untitled', glyph: 'wait', state: 'waiting on you', detail: '', since: st.askSince ?? null });
    } else if (st.working) {
      items.push({ key: `chat:${chat.id}`, chatId: chat.id, name: chat.title || 'Untitled', glyph: 'run', state: 'working', detail: elapsed(st.workingSince, now), since: st.workingSince ?? null });
    } else if (st.doneAt && !st.readAt) {
      items.push({ key: `chat:${chat.id}`, chatId: chat.id, name: chat.title || 'Untitled', glyph: 'done', state: 'ready', detail: when(st.doneAt, now), since: st.doneAt });
    } else if (st.cutAt) {
      // interrupted by a sleep or a restart and never picked back up
      items.push({ key: `chat:${chat.id}`, chatId: chat.id, name: chat.title || 'Untitled', glyph: 'stop', state: 'stopped', detail: when(st.cutAt, now), since: st.cutAt });
    }
  }

  const titleOf = (id) => creations.find((c) => c?.id === id)?.title;
  for (const [creationId, rt] of Object.entries(runtime ?? {})) {
    const name = titleOf(creationId);
    if (!name) continue; // a runtime whose creation is gone is not a thing to show
    if (rt?.status === 'running' || rt?.status === 'starting') {
      items.push({ key: `run:${creationId}`, creationId, name, glyph: 'run', state: rt.status === 'starting' ? 'starting' : 'running', detail: rt.port ? `port ${rt.port}` : '', since: null });
    } else if (rt?.status === 'error') {
      items.push({ key: `run:${creationId}`, creationId, name, glyph: 'stop', state: 'stopped', detail: 'it errored', since: null });
    }
  }

  items.sort((a, b) => (GLYPH_RANK[a.glyph] - GLYPH_RANK[b.glyph]) || (b.since ?? 0) - (a.since ?? 0));
  return items;
}

/* --------------------------------- time ---------------------------------- */
// Elapsed, for something happening right now. Minutes until an hour, then
// hours: a working turn measured in seconds reads as a stopwatch, which invites
// watching it rather than doing something else.
export function elapsed(since, now = Date.now()) {
  if (!Number.isFinite(since) || since <= 0) return '';
  const mins = Math.floor((now - since) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

// When something happened, in the same words the rest of the app uses.
export function when(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// The date on the top bar, in the app's house form: "Mon · Jul 27".
export function dateLine(now = Date.now()) {
  const d = new Date(now);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const rest = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${rest}`;
}

// NO PACE LINE, deliberately. The pre-launch design carried "day 4 · most
// launch by 9"; the founder cut it (2026-07-26) as incidental copy. Removing
// it also removes the only number on the page with nothing behind it: we have
// no launch cohort yet, so the comparison would have been invented, and a "day
// N" count standing alone is the drought counter the house rules already ban.
// If a real cohort ever exists, comparison is welcome back; a target is not.

/* ------------------------------- the greeting ---------------------------- */
// Time of day, for "Morning, the founder." Local to whoever is reading
// it.
export function greeting(now = Date.now()) {
  const hour = new Date(now).getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

/* -------------------------------- helpers -------------------------------- */
// House rule, enforced rather than remembered: no em or en dashes in anything a
// founder reads. An agent writing the ledger is a model, and models reach for
// them constantly, so the ledger cleans on the way in instead of hoping.
export function clean(text) {
  return String(text ?? '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'metric';
}

function lowerFirst(text) {
  const s = String(text ?? '').trim();
  if (!s) return s;
  // only lowercase a plain capitalized word, so a proper noun keeps its case
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
