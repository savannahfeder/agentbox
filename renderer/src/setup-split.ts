// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right filling in. The rules, with no React, so
// tests/the-setup-beside-the-app-asks-only-what-applies.test.mjs reads them.

import { MATCH_SKY } from './home/sky';
import { FREE, TEAM } from '../../cloud/gateway/plans.mjs';

/** Where the app sits beside the setup, in window pixels: the steps panel's
 *  width, the app's top-left corner and scale, and, in the app's own pixels,
 *  its height and how much of its 1120 width the panel cuts at the right. */
export function setupPreview(width: number, height: number) {
  const left = Math.round(Math.min(720, Math.max(480, width * 0.41)));
  const x = left + 24;
  const y = 40;
  // The app runs a little past the panel's right edge at any window size.
  const scale = Math.min(0.85, Math.max(0.55, (width - x + 60) / 1120));
  // As tall as the panel, so Home lays out as it does in a real window.
  return { left, x, y, scale, h: (height - 16 - y) / scale, right: Math.max(0, 1120 - (width - 16 - x) / scale) };
}

export type SetupStep = 'chats' | 'folder' | 'account' | 'plan' | 'invite' | 'pay' | 'teammates' | 'look';
export type SetupPlan = 'free' | 'pro';

/** Only the steps that can apply on this build: most people are not on a team,
 *  and an AI teammate needs a project to work in. Tools are not asked for: the
 *  person's Claude Code and Codex already carry their connections. */
export function setupSteps({ chats, team, teammates, project, signedIn = true, plan = 'free', onTeam = false }: { chats: number; team: boolean; teammates: boolean; project: boolean; signedIn?: boolean; plan?: SetupPlan; onTeam?: boolean }): SetupStep[] {
  const out: SetupStep[] = [chats > 0 ? 'chats' : 'folder'];
  // Signing in is required, so it is a step, and what needs it comes after.
  if (team && !signedIn) out.push('account');
  // The team is a paid thing: Free goes on without inviting anyone.
  if (team && !onTeam) out.push('plan');
  if (team && (onTeam || plan === 'pro')) out.push('invite');
  // Seats are bought for a team, so the purchase page follows the step that makes it.
  if (team && !onTeam && plan === 'pro') out.push('pay');
  if (teammates && project) out.push('teammates');
  out.push('look');
  return out;
}

/** The plans the setup offers, at the prices the cloud charges (cloud/gateway/plans.mjs). */
export const SETUP_PLANS: Array<{ id: SetupPlan; name: string; price: string; per?: string; tag?: string; sub: string }> = [
  { id: 'free', name: 'Free', price: '$0', sub: `Just you, with ${FREE.hours} cloud hours to try` },
  { id: 'pro', name: 'Pro', price: `$${TEAM.dollarsPerSeat}`, per: 'a month', tag: `${TEAM.trialDays} days free`, sub: `Your team, plus ${TEAM.agentsPerSeat} cloud agents at once` },
];

/** The purchase page's words: what Pro brings in three lines, the cloud computer first, the price in one quiet line.
 *  components/ProShowcase.tsx draws one card for each line, in this order. */
export const PRO_PITCH = {
  head: 'Upgrade to Pro.',
  perks: [
    { id: 'cloud', title: 'A computer for every agent' },
    { id: 'team', title: 'Your team in one inbox' },
    { id: 'files', title: 'Files saved in the cloud' },
  ],
  cta: `Try Pro free for ${TEAM.trialDays} days`,
  terms: `Then $${TEAM.dollarsPerSeat} a month. Cancel any time.`,
};

const SHOWCASE_FILL = ['Fix the flaky date picker test', 'Add a health check endpoint', 'Profile the slowest page', 'Port the cron jobs to the queue', 'Write tests for the refund flow', 'Speed up the search index build'];
/** The agents drawn on their own cloud computers: the person's own chats first, then stand-ins to make six. */
export function cloudShowcase(titles: readonly string[]): string[] {
  const own = titles.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  return [...own, ...SHOWCASE_FILL.filter((t) => !own.includes(t))].slice(0, 6);
}

/** The team has bought its seats, so the purchase page can move on. */
export const teamPaid = (plan: { team?: { seats?: number } } | null | undefined): boolean => (plan?.team?.seats ?? 0) > 0;

export const stepLabel = (steps: SetupStep[], step: SetupStep) => `Step ${steps.indexOf(step) + 1} of ${steps.length}`;

/** Ids in shared sky themes and skins.ts: Light and Dark are the plain looks. */
const LOOK_ORDER = [MATCH_SKY, 'ember', 'dusk', 'aurora', 'sage', 'light', 'dark'];
const LIGHT_SKIES = ['sage', 'dusk-light'];
/** The look you have first, then the dark orange sky; the light pink sky only if you already wear it.
 *  A sky is drawn only on Home, so without it the choice is Light or Dark. */
export function lookChoices(current: string, skies: boolean): string[] {
  if (!skies) {
    const plain = current === 'light' || LIGHT_SKIES.includes(current) ? 'light' : 'dark';
    return [plain, plain === 'light' ? 'dark' : 'light'];
  }
  return [current, ...LOOK_ORDER.filter((l) => l !== current)];
}

type StarterLike = { starter: string; name: string; ask: string };
const ENGINEERING = ['quality', 'maintainer', 'chief'];
/** The starters an engineering team wants, from the ones not yet on the team. */
export function starterChoices<T extends StarterLike>(left: T[]): T[] {
  return ENGINEERING.map((id) => left.find((s) => s.starter === id)).filter((s): s is T => !!s);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function inviteList(raw: string[]): string[] {
  return [...new Set(raw.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** What the last screen says was set up: only what happened. */
export function setUpLines({ chats, project, invited, teammates }: { chats: number; project: string | null; invited: number; teammates: string[] }): string[] {
  const out: string[] = [];
  if (chats) out.push(`${n(chats, 'chat', 'chats')} brought in`);
  else if (project) out.push(`${project} is ready`);
  if (invited) out.push(`${n(invited, 'teammate', 'teammates')} invited`);
  for (const t of teammates) out.push(`${t} added`);
  return out;
}

type Lesson = 'start' | 'compose' | 'working' | 'open' | 'choose' | 'reply' | 'close' | 'palette' | 'busy' | 'urgent';
export interface ChecklistRow { label: string; keys: string[]; state: 'done' | 'now' | 'todo' }
/** The tour's lessons as the list beside it. Answering is either a choice or a reply.
 *  `now` is the lesson the tour is pointing at; without one, the first not done is lit. */
export function tourChecklist(done: readonly Lesson[], cmd = '⌘', now: Lesson | null = null): ChecklistRow[] {
  const has = (...l: Lesson[]) => l.some((x) => done.includes(x));
  // Each row: its words, its keys, the lessons that tick it, and the tips that point at it.
  const rows: Array<[string, string[], Lesson[], Lesson[]]> = [
    ['Send a thread', ['N'], ['start', 'compose'], ['start', 'compose']],
    // Writing back to a thread or closing it means it was opened, whatever opened it.
    ['Open one', ['↵'], ['open', 'choose', 'reply', 'close'], ['open', 'working']],
    ['Write back', ['R'], ['choose', 'reply'], ['choose', 'reply', 'busy']],
    ['Mark it done', ['E'], ['close'], ['close']],
    ['Find anything', [cmd, 'K'], ['palette'], ['palette', 'urgent']],
  ];
  // A row already done keeps its tick; the tour pointing back at it lights the next one to do.
  const at = now ? rows.findIndex(([, , ls, by]) => by.includes(now) && !has(...ls)) : -1;
  const lit = at >= 0 ? at : rows.findIndex(([, , ls]) => !has(...ls));
  return rows.map(([label, keys, ls], i) => ({ label, keys, state: i === lit ? 'now' as const : has(...ls) ? 'done' as const : 'todo' as const }));
}

/** Where a key pressed during the setup is aimed: a box in the setup, the setup's buttons,
 *  or a box in the app drawn behind it, which must never take the keys. */
export function typingInSetup(target: { closest(sel: string): unknown } | null): 'typing' | 'keys' | 'behind' {
  if (!target || typeof target.closest !== 'function') return 'keys';
  const field = !!target.closest('input, textarea, [contenteditable]');
  if (!target.closest('.setup-split, .ss-picker')) return field ? 'behind' : 'keys';
  return field ? 'typing' : 'keys';
}

/** Which of `count` controls Tab lands on from `at` (-1 when focus is outside them), going round. */
export function tabStop(count: number, at: number, back: boolean): number {
  if (!count) return -1;
  if (at < 0) return back ? count - 1 : 0;
  return (at + (back ? count - 1 : 1)) % count;
}

/** The look the setup ticks: the sky picked, Light or Dark once one of those was picked, and otherwise Match my system. */
export function setupLook({ skies, picked, worn, light }: { skies: boolean; picked: boolean; worn: string | null; light: boolean }): string {
  if (skies && picked && worn) return worn;
  if (skies && worn) return MATCH_SKY;
  return light ? 'light' : 'dark';
}

/** The walkthrough's place: the lit row or one past what is done, whichever is further. */
export const tourPlace = (rows: ChecklistRow[]) => Math.min(Math.max(rows.filter((r) => r.state === 'done').length + 1, rows.findIndex((r) => r.state === 'now') + 1), rows.length);
export const tourCount = (rows: ChecklistRow[]) => `${tourPlace(rows)} of ${rows.length}`;

/** How far through the walkthrough you are, for the bar above the framed app. */
export function walkPlace(done: readonly Lesson[], now: Lesson | null): { at: number; of: number } {
  const rows = tourChecklist(done, '⌘', now);
  return { at: tourPlace(rows), of: rows.length };
}
