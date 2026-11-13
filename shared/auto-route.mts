// AUTO: A NEW THREAD GOES TO THE TEAMMATE WHOSE WORK IT IS (w-b5f23cff71).
//
// "I couldn't remember which agent held which context, or which was best to
// assign a particular task to ... Routing should probably just be done
// automatically." A thread sent To Auto is made at once, carrying the `auto`
// label, and nothing starts it while it has that label. The supervisor asks the
// small model one question about it (main/supervisor.mts `routeTheThreads`):
// which of these teammates does this belong to, or none. The answer only ever
// changes who the thread is for, by its labels. The person's words go through
// as written, and nothing writes instructions to the teammate: an agent in the
// middle giving the others orders is what was turned down before ("You are not
// its boss. It is its own boss.").
//
// The model you picked in the box stays the model the thread runs on, whoever
// takes it.
import { teammateLabel, teammateIdOf, activeRunOf, TEAMMATE_LABEL_PREFIX, type Labelled, type RunItem } from './teammates.mts';
import type { Routed as RouteRecord, RouteOffer } from './work-items.mts';

export type { Routed as RouteRecord, RouteOffer } from './work-items.mts';

export interface RouteDecision { to?: string; ask?: string[]; why: string; offer?: RouteOffer }
export interface RouteMate {
  id: string;
  name: string;
  role?: string | null;
  job?: string | null;
  goal?: string | null;
  duties?: readonly { what: string }[];
  status?: string;
  paused?: boolean;
  primary?: boolean;
  endedAt?: number | null;
}
type RouteItem = Labelled & { updatedAt?: number; label?: string; title?: string };
/** A type alias, not an interface, so it passes where a store patch is a plain record. */
export type RoutedPatch = { labels: string[]; routed: RouteRecord; start?: 'later' };

export const AUTO_LABEL = 'auto';

export function isAuto(item: { labels?: readonly string[] } | null | undefined): boolean {
  return (item?.labels ?? []).includes(AUTO_LABEL);
}

/** Auto has asked the person which teammate should take it, and waits on them. */
export function asksWho(item: { labels?: readonly string[]; routed?: { ask?: readonly string[] } | null } | null | undefined): boolean {
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
export function routeCandidates<T extends RouteMate>(teammates: readonly T[] = []): T[] {
  return teammates.filter((t) => t && t.id && t.name && !t.primary && !t.endedAt && !t.paused && (t.status ?? 'active') === 'active');
}

/**
 * PURE. What Auto could not place goes to the primary when there is one: two
 * that fit, or no usable answer. A clear answer is left as it was.
 */
export function orPrimary(decision: RouteDecision | null | undefined, primary: { id: string } | null | undefined): RouteDecision {
  if (!primary) return decision ?? { to: 'agent', why: FAILED_WHY };
  if (!decision) return { to: `mate:${primary.id}`, why: PRIMARY_WHY };
  if (decision.ask) return { to: `mate:${primary.id}`, why: PRIMARY_TIE_WHY };
  return decision;
}

const cut = (s: string | null | undefined, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// Handed a picture's file name, the small model guessed what the picture
// showed and matched a teammate on that.
const PICTURE = /!\[[^\]\n]*\]\([^)\n]*\)/g;
const named = (s: string | null | undefined, seen: boolean) => String(s ?? '').replace(PICTURE, seen ? '(a picture, attached)' : '(a picture you cannot see)');

/** A teammate's newest threads, by the name each shows on the row. */
function recentTitles(id: string, items: readonly RouteItem[] | null | undefined, n = 6): string[] {
  return (items ?? [])
    .filter((i) => teammateIdOf(i) === id)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, n)
    .map((i) => cut(i.label || i.title, 90))
    .filter(Boolean);
}

/** PURE. The one question the small model is asked about a thread sent To Auto. */
export function routePrompt(
  item: { title?: string; body?: string } | null | undefined,
  candidates: readonly RouteMate[],
  items: readonly RouteItem[] = [],
  { primary = null, declined = [], pictures = false }: { primary?: RouteMate | null; declined?: readonly string[]; pictures?: boolean } = {},
): string {
  const never = [...new Set([...candidates, ...(primary ? [primary] : [])].flatMap((t) => [t.name, t.role ?? '']).concat(declined).map((r) => r.trim()).filter(Boolean))];
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
    'Reply with two lines and nothing else. The first, in one of these forms:',
    '  2 | It made the last four clips and runs the clip engine.',
    '  0 | -',
    '  1,2 | Both have worked on the captions.',
    ...(primary ? ['  P | It needs a clip, the post and a fix.'] : []),
    'The number is who takes it. After the bar, one short plain sentence: for a',
    'teammate, start with "It" and say what in its job or recent threads fits.',
    'Name two numbers only when two teammates fit equally well and you cannot',
    'tell which; the person will be asked. When unsure between a teammate and',
    'none, answer 0.',
    'A teammate fits only when the task asks for the work its job describes.',
    'A word the task shares with a job is not a fit: "status" is not a',
    'teammate\'s status board, and "plan" is not its plan.',
    ...(pictures
      ? ['The pictures attached are part of the task: look at them to see what',
        'it is about. When the words and the pictures together do not say, answer 0.']
      : ['When the words alone do not say what the task is about, as when they',
        'point at a picture you cannot see, answer 0.']),
    'An idea for something new, or a question about how hard it would be to',
    'build, goes to a teammate only when its job is building that very thing.',
    'A job of watching or fixing a part of the app is not building something',
    'new in that part: answer 0.',
    '',
    'The second line says whether this is work an AI teammate of its own would',
    'do better than a one-off agent, because none of the teammates above covers',
    'it and it is one of these:',
    '  - it repeats: every week, each new customer, a regular report',
    '  - it is a long project that runs for weeks or has several parts, where',
    '    what is learned carries over: the person\'s taste, what they approved',
    '  - it is an ongoing role, such as support, marketing or hiring',
    'A one-off fix, a question, or a single change is not. When unsure, it is not.',
    'Write it in one of these forms, the role in one to three words:',
    '  Teammate: Marketer | It is a post every week, and it would learn your voice.',
    '  Teammate: -',
    ...(never.length ? [`Never offer one of these, which they have or turned down: ${never.join(', ')}.`] : []),
    '',
    '--- the task ---',
    cut(named(item?.title, pictures), 400),
    cut(named(item?.body && item.body !== item.title ? item.body : '', pictures), 1500),
    '---',
  ].filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');
}

function cleanWhy(text: string | null | undefined): string {
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
export function readRoute(text: string, candidates: readonly { id: string }[], primary: { id: string } | null = null): RouteDecision | null {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const p = /^\[?P\]?\s*\|\s*(.*)$/i.exec(line);
  if (p) return primary ? { to: `mate:${primary.id}`, why: cleanWhy(p[1]) || PRIMARY_WHY } : null;
  const m = /^\[?(\d{1,2})\]?(?:\s*,\s*\[?(\d{1,2})\]?)?\s*\|\s*(.*)$/.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? null : Number(m[2]);
  const inRange = (n: number) => n >= 0 && n <= candidates.length;
  if (!inRange(a) || (b !== null && !inRange(b))) return null;
  const why = cleanWhy(m[3]);
  const key = (n: number) => (n === 0 ? 'agent' : `mate:${candidates[n - 1].id}`);
  if (b !== null && b !== a) {
    if (a === 0 || b === 0) return null;
    return { ask: [key(a), key(b)], why: why || 'Both of them could take this.' };
  }
  return a === 0 ? { to: 'agent', why: AGENT_WHY } : { to: key(a), why };
}

/** PURE. The offer in the model's reply, or null: no line, "-", or a role that is not a short one. */
export function readOffer(text: string, { taken = [] }: { taken?: readonly string[] } = {}): RouteOffer | null {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find((l) => /^teammate\s*:/i.test(l));
  const m = line ? /^teammate\s*:\s*([^|]*?)\s*(?:\|\s*(.*))?$/i.exec(line) : null;
  if (!m) return null;
  const role = m[1].replace(/^["'`“”‘’]+|["'`“”‘’.]+$/g, '').trim();
  if (!role || role === '-' || !/^[\p{L}][\p{L}&/' -]{0,29}$/u.test(role) || role.split(/\s+/).length > 3) return null;
  if (taken.some((t) => t.trim().toLowerCase() === role.toLowerCase())) return null;
  return { role: role[0].toUpperCase() + role.slice(1), why: cleanWhy(m[2]) };
}

/**
 * PURE. The second, short question asked only once Auto has offered a role:
 *  the three reasons the card shows. Asked apart from the routing question
 *  because asking both at once made the small model offer less often (7 of 12
 *  recurring tasks against 11 of 12, measured on Haiku 2026-11-12).
 */
export function offerPrompt(item: { title?: string | null; body?: string | null } | null | undefined, offer: { role: string }): string {
  return [
    `A person asked for the task below. An AI teammate, a ${offer.role}, could take on work like it from now on.`,
    'Write three lines, each under ten words, about this task, saying what the',
    'teammate would learn, what it would carry on from, and what it would then do.',
    'Promise nothing it would send or post without asking first. Reply with the',
    'three lines and nothing else, in this form:',
    '- Learns your voice from every post you approve or change',
    '- Carries on where this post left off, not from nothing',
    '- Writes it every Monday, and asks you before it posts',
    '',
    '--- the task ---',
    cut(named(item?.title, false), 400),
    cut(named(item?.body && item.body !== item.title ? item.body : '', false), 1500),
    '---',
  ].join('\n');
}

/** PURE. The three lines, bullets or not, or null unless there are exactly three short ones. */
export function readGains(text: string): string[] | null {
  const lines = String(text ?? '').split('\n').map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '')).filter(Boolean);
  if (lines.length !== 3) return null;
  const gains = lines.map((l) => l.replace(/^["'`“”‘’]+|["'`“”‘’.]+$/g, '').replace(/\s+/g, ' ').trim());
  if (gains.some((g) => !g || g.includes('|') || /^teammate\s*:/i.test(g))) return null;
  return gains.map((g) => (g.length > 90 ? `${g.slice(0, 89).replace(/\s+\S*$/, '')}…` : g));
}

/**
 * PURE. What the thread's row becomes once it is decided: its labels and the
 *  `routed` note the thread draws as one line. Never its words.
 *
 *  `by` is 'auto' for the model's answer and 'you' for a pick of hers. Going to
 *  a teammate that is already running something queues it behind that run, the
 *  way a teammate's own work queues (shared/teammates.mts `planWakes`).
 */
export function routedPatch(
  item: { id?: string; labels?: readonly string[] } | null | undefined,
  decision: RouteDecision,
  { items = [], now = Date.now(), by = 'auto' }: { items?: readonly RunItem[]; now?: number; by?: 'auto' | 'you' } = {},
): RoutedPatch {
  const others = (item?.labels ?? []).filter((l) => l !== AUTO_LABEL && !String(l).startsWith(TEAMMATE_LABEL_PREFIX));
  if (decision.ask) {
    return { labels: [...others, AUTO_LABEL], routed: { ask: decision.ask, why: decision.why, at: now, by } };
  }
  const mate = decision.to?.startsWith('mate:') ? decision.to.slice('mate:'.length) : null;
  const routed = { to: decision.to, why: decision.why ?? '', at: now, by, ...(decision.offer ? { offer: decision.offer } : {}) };
  if (!mate) return { labels: others, routed };
  const busy = activeRunOf(mate, (items ?? []).filter((i) => i.id !== item?.id));
  return { labels: [...others, teammateLabel(mate)], routed, ...(busy ? { start: 'later' } : {}) };
}
