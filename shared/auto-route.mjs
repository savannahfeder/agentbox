// AUTO: A NEW THREAD GOES TO THE TEAMMATE WHOSE WORK IT IS (w-b5f23cff71).
//
// "I couldn't remember which agent held which context, or which was best to
// assign a particular task to ... Routing should probably just be done
// automatically." A thread sent To Auto is made at once, carrying the `auto`
// label, and nothing starts it while it has that label. The supervisor asks the
// small model one question about it (main/supervisor.mjs `routeTheThreads`):
// which of these teammates does this belong to, or none. The answer only ever
// changes who the thread is for, by its labels. The person's words go through
// as written, and nothing writes instructions to the teammate: an agent in the
// middle giving the others orders is what was turned down before ("You are not
// its boss. It is its own boss.").
//
// The model you picked in the box stays the model the thread runs on, whoever
// takes it.
import { teammateLabel, teammateIdOf, activeRunOf, TEAMMATE_LABEL_PREFIX } from './teammates.mjs';

export const AUTO_LABEL = 'auto';

export function isAuto(item) {
  return (item?.labels ?? []).includes(AUTO_LABEL);
}

/** Auto has asked the person which teammate should take it, and waits on them. */
export function asksWho(item) {
  return isAuto(item) && Array.isArray(item?.routed?.ask) && item.routed.ask.length > 0;
}

export const AGENT_WHY = "No teammate's job covers this, so an agent took it.";
export const NOBODY_WHY = 'You have no AI teammates working, so an agent took it.';
export const FAILED_WHY = 'Auto could not decide, so an agent took it.';
export const PICKED_WHY = 'You picked it.';
// Read after "<primary> took this." on the thread.
export const PRIMARY_WHY = 'Auto was not sure who should.';
export const PRIMARY_TIE_WHY = 'Two teammates fit, so it decides who does the work.';

/**
 * The teammates a thread can go to by their job: set up, not paused, not
 * ended. The primary is not one of them; it is offered for what spans jobs.
 */
export function routeCandidates(teammates = []) {
  return teammates.filter((t) => t && t.id && t.name && !t.primary && !t.endedAt && !t.paused && (t.status ?? 'active') === 'active');
}

/**
 * PURE. What Auto could not place goes to the primary when there is one: two
 * that fit, or no usable answer. A clear answer is left as it was.
 */
export function orPrimary(decision, primary) {
  if (!primary) return decision ?? { to: 'agent', why: FAILED_WHY };
  if (!decision) return { to: `mate:${primary.id}`, why: PRIMARY_WHY };
  if (decision.ask) return { to: `mate:${primary.id}`, why: PRIMARY_TIE_WHY };
  return decision;
}

const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A teammate's newest threads, by the name each shows on the row. */
function recentTitles(id, items, n = 6) {
  return (items ?? [])
    .filter((i) => teammateIdOf(i) === id)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, n)
    .map((i) => cut(i.label || i.title, 90))
    .filter(Boolean);
}

/** PURE. The one question the small model is asked about a thread sent To Auto. */
export function routePrompt(item, candidates, items = [], { primary = null } = {}) {
  const who = candidates.map((t, n) => {
    const parts = [`[${n + 1}] ${t.name}${t.role && t.role.toLowerCase() !== t.name.toLowerCase() ? `, ${t.role}` : ''}.`];
    if (t.job) parts.push(`Job: ${cut(t.job, 300)}`);
    if (t.goal) parts.push(`Goal: ${cut(t.goal, 160)}`);
    const duties = (t.duties ?? []).map((d) => cut(d.what, 90)).filter(Boolean);
    if (duties.length) parts.push(`Does on its own: ${duties.slice(0, 4).join('; ')}`);
    const recent = recentTitles(t.id, items);
    if (recent.length) parts.push(`Recent threads: ${recent.map((r) => `"${r}"`).join(', ')}`);
    return parts.join('\n    ');
  });
  return [
    'A person just wrote a new task. Decide who should take it: one of their AI',
    'teammates, or an ordinary coding agent when it is not clearly part of any',
    "teammate's job or recent work.",
    '',
    'Their AI teammates:',
    ...who,
    '[0] None of them: an ordinary coding agent does it.',
    ...(primary ? [`[P] ${primary.name}, their primary teammate: only when the task needs several of the teammates above, or is about the team's work as a whole.`] : []),
    '',
    'Reply with exactly one line and nothing else, in one of these forms:',
    '  2 | It made the last four clips and runs the clip engine.',
    '  0 | -',
    '  1,2 | Both have worked on the captions.',
    ...(primary ? ['  P | It needs a clip, the post and a fix.'] : []),
    'The number is who takes it. After the bar, one short plain sentence: for a',
    'teammate, start with "It" and say what in its job or recent threads fits.',
    'Name two numbers only when two teammates fit equally well and you cannot',
    'tell which; the person will be asked. When unsure between a teammate and',
    'none, answer 0.',
    '',
    '--- the task ---',
    cut(item?.title, 400),
    cut(item?.body && item.body !== item.title ? item.body : '', 1500),
    '---',
  ].filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');
}

function cleanWhy(text) {
  const t = String(text ?? '')
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t === '-' || /^n\/?a$/i.test(t)) return '';
  const short = t.length > 160 ? `${t.slice(0, 159).replace(/\s+\S*$/, '')}…` : t;
  return /[.!?…]$/.test(short) ? short : `${short}.`;
}

/**
 * PURE. The model's reply as a decision, or null when it is not one: the first
 *  line, a number or two, a bar, a sentence. Anything else is no answer, and a
 *  thread with no answer goes to an agent rather than waiting (FAILED_WHY).
 */
export function readRoute(text, candidates, primary = null) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const p = /^\[?P\]?\s*\|\s*(.*)$/i.exec(line);
  if (p) return primary ? { to: `mate:${primary.id}`, why: cleanWhy(p[1]) || PRIMARY_WHY } : null;
  const m = /^\[?(\d{1,2})\]?(?:\s*,\s*\[?(\d{1,2})\]?)?\s*\|\s*(.*)$/.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? null : Number(m[2]);
  const inRange = (n) => n >= 0 && n <= candidates.length;
  if (!inRange(a) || (b !== null && !inRange(b))) return null;
  const why = cleanWhy(m[3]);
  const key = (n) => (n === 0 ? 'agent' : `mate:${candidates[n - 1].id}`);
  if (b !== null && b !== a) {
    if (a === 0 || b === 0) return null;
    return { ask: [key(a), key(b)], why: why || 'Both of them could take this.' };
  }
  return a === 0 ? { to: 'agent', why: AGENT_WHY } : { to: key(a), why };
}

/**
 * PURE. What the thread's row becomes once it is decided: its labels and the
 *  `routed` note the thread draws as one line. Never its words.
 *
 *  `by` is 'auto' for the model's answer and 'you' for a pick of hers. Going to
 *  a teammate that is already running something queues it behind that run, the
 *  way a teammate's own work queues (shared/teammates.mjs `planWakes`).
 */
export function routedPatch(item, decision, { items = [], now = Date.now(), by = 'auto' } = {}) {
  const others = (item?.labels ?? []).filter((l) => l !== AUTO_LABEL && !String(l).startsWith(TEAMMATE_LABEL_PREFIX));
  if (decision.ask) {
    return { labels: [...others, AUTO_LABEL], routed: { ask: decision.ask, why: decision.why, at: now, by } };
  }
  const mate = decision.to?.startsWith('mate:') ? decision.to.slice('mate:'.length) : null;
  const routed = { to: decision.to, why: decision.why ?? '', at: now, by };
  if (!mate) return { labels: others, routed };
  const busy = activeRunOf(mate, (items ?? []).filter((i) => i.id !== item?.id));
  return { labels: [...others, teammateLabel(mate)], routed, ...(busy ? { start: 'later' } : {}) };
}
