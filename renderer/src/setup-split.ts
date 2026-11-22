// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right filling in. The rules, with no React, so
// tests/the-setup-beside-the-app-asks-only-what-applies.test.mjs reads them.

import { MATCH_SKY } from './home/sky';
import { TEAM, teamFreeDays } from '../../cloud/gateway/plans.mjs';

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

/** Starts the import and returns at once, so no step of the setup waits on it.
 *  `landed` hears how many chats came in, 0 when the import failed. */
export function bringInBehind(bring: () => Promise<number>, landed: (n: number) => void): void {
  void Promise.resolve().then(bring).then((n) => Number(n) || 0, () => 0).then(landed);
}

export type SetupStep = 'chats' | 'folder' | 'agent' | 'account' | 'plan' | 'join' | 'teammates' | 'look';
export type SetupPlan = 'free' | 'pro';

// The account step once the account is made, and the plan page once Pro is paid for, only send you forward again.
const passedOver = (step: SetupStep, signedIn: boolean, paid: boolean) => (step === 'account' && signedIn) || (step === 'plan' && paid);
/** Where Back goes, from a step or from the page after the last one, passing over steps that are done for good. */
export function stepBefore(steps: readonly SetupStep[], at: number, signedIn: boolean, paid = false): number | null {
  let to = Math.min(at, steps.length) - 1;
  while (to >= 0 && passedOver(steps[to], signedIn, paid)) to -= 1;
  return to >= 0 ? to : null;
}
/** A dash at the top takes you back to its step once you have passed it. */
export const dashGoesBack = (steps: readonly SetupStep[], i: number, at: number, signedIn: boolean, paid = false): boolean =>
  i < at && !passedOver(steps[i], signedIn, paid);

/** Only the steps that can apply on this build: most people are not on a team,
 *  and an AI teammate needs a project to work in. Tools are not asked for: the
 *  person's Claude Code and Codex already carry their connections. */
export function setupSteps({ chats, team, teammates, project, signedIn = true, plan = 'free', onTeam = false, agents = 1, invited = false }: { chats: number; team: boolean; teammates: boolean; project: boolean; signedIn?: boolean; plan?: SetupPlan; onTeam?: boolean; agents?: number; invited?: boolean }): SetupStep[] {
  const out: SetupStep[] = [chats > 0 ? 'chats' : 'folder'];
  // With Claude Code and Codex both ready, which one starts your threads is yours to say.
  if (agents > 1) out.push('agent');
  // Signing in is required, so it is a step, and what needs it comes after.
  if (team && !signedIn) out.push('account');
  // One page offers Pro and takes its payment. The team is a paid thing, so inviting comes only once Pro is started.
  // Someone invited joins a team whose owner pays for their seat.
  if (team && !onTeam) out.push(invited ? 'join' : 'plan');
  if (teammates && project) out.push('teammates');
  out.push('look');
  return out;
}

/** The plan page's words: what Pro brings in three lines, the cloud computer first, then the free week beside the paid month, and Free as the way on.
 *  components/ProShowcase.tsx draws one card for each line, in this order. */
export const PRO_PITCH = {
  head: 'Upgrade to Pro.',
  perks: [
    { id: 'cloud', title: 'A computer for every agent' },
    // Multiplayer is let in by hand for now (20261119000000_multiplayer_is_invite_only.sql).
    { id: 'team', title: 'Share threads and tasks with your team', tag: 'Invite only' },
    { id: 'files', title: 'Files saved in the cloud' },
  ],
  // The free week beside the paid month, so the trial's hours are never read as the plan's.
  trial: { label: `First ${TEAM.trialDays} days`, price: 'Free', line: `${TEAM.trialHoursPerMember} cloud hours to try` },
  paid: { label: 'Then', price: `$${TEAM.dollarsPerSeat}`, per: 'a month', line: `${TEAM.hoursPerSeat} cloud hours a month` },
  cta: `Try Pro free for ${TEAM.trialDays} days`,
  terms: 'Cancel any time.',
  free: 'Stay on Free',
};

type PlanSeen = { teamFreeDays?: number; team?: { trial: boolean; endsAt: number | null } | null } | null | undefined;

/** The free days Pro starts with. A team is made when Pro starts, so without one they are all there;
 *  a team already made has what the cloud says its checkout would give. A cloud from before
 *  2026-11-21 does not say, and its team had what was left of a trial counted from the day it was made. */
export function proFreeDays(hasTeam: boolean, plan: PlanSeen, now = Date.now()): number {
  if (!hasTeam) return TEAM.trialDays;
  if (typeof plan?.teamFreeDays === 'number') return plan.teamFreeDays;
  return plan?.team?.trial && plan.team.endsAt ? teamFreeDays(plan.team.endsAt, now) : 0;
}

/** The plan page's pricing and button for `days` free days: with none, no free column and no free claim. */
export function proOffer(days: number) {
  if (!days) return { trial: null, paid: { ...PRO_PITCH.paid, label: 'From today' }, cta: 'Start Pro now' };
  if (days === TEAM.trialDays) return { trial: PRO_PITCH.trial, paid: PRO_PITCH.paid, cta: PRO_PITCH.cta };
  return { trial: { ...PRO_PITCH.trial, label: `First ${days} days` }, paid: PRO_PITCH.paid, cta: `Try Pro free for ${days} days` };
}

/** Pro's button where inviting would be: the plan page's for the free days the cloud says the team has, and no promise until it has said. */
export function proButton(hasTeam: boolean, plan: (PlanSeen & { signedIn?: boolean }) | null | undefined): string {
  if (!hasTeam) return PRO_PITCH.cta;
  if (!plan || plan.signedIn === false) return 'Start Pro';
  return proOffer(proFreeDays(true, plan)).cta;
}

/** A team is made when Pro starts, before anyone has named it; Settings › Team renames it. */
export function teamNameFor(person: string | null | undefined): string {
  const first = (person ?? '').trim().split(/\s+/)[0];
  return first ? `${first}’s team` : 'My team';
}

const SHOWCASE_FILL = ['Fix the flaky date picker test', 'Add a health check endpoint', 'Profile the slowest page', 'Port the cron jobs to the queue', 'Write tests for the refund flow', 'Speed up the search index build'];
/** The agents drawn on their own cloud computers: the person's own chats first, then stand-ins to make six. */
export function cloudShowcase(titles: readonly string[]): string[] {
  const own = titles.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  return [...own, ...SHOWCASE_FILL.filter((t) => !own.includes(t))].slice(0, 6);
}

/** The team has bought its seats, so the purchase page can move on. */
export const teamPaid = (plan: { team?: { seats?: number } } | null | undefined): boolean => (plan?.team?.seats ?? 0) > 0;

/** ↑ and ↓ on a step that asks for one of a list: the choice one along, stopping at either end. */
export function nextChoice<T>(all: readonly T[], now: T, by: 1 | -1): T {
  const at = all.indexOf(now);
  return all[Math.max(0, Math.min(all.length - 1, (at < 0 ? 0 : at) + by))] ?? now;
}


/** Enter held down repeats, and a repeat is not a press: one press moves one step. Arrows may repeat. */
export const heldPress =(e: { key: string; repeat?: boolean }): boolean => e.key === 'Enter' && !!e.repeat;

export const stepLabel = (steps: SetupStep[], step: SetupStep) => `Step ${steps.indexOf(step) + 1} of ${steps.length}`;

/** Ids in shared sky themes and skins.ts: Light and Dark are the plain looks. */
const LOOK_ORDER = [MATCH_SKY, 'ember', 'dusk', 'aurora', 'sage', 'dusk-light', 'light', 'dark'];
const LIGHT_SKIES = ['sage', 'dusk-light'];
/** The look you have first, then Match my system, then every sky Settings offers.
 *  A sky is drawn only on Home, so without it the choice is Light or Dark. */
export function lookChoices(current: string, skies: boolean): string[] {
  if (!skies) {
    const plain = current === 'light' || LIGHT_SKIES.includes(current) ? 'light' : 'dark';
    return [plain, plain === 'light' ? 'dark' : 'light'];
  }
  return [current, ...LOOK_ORDER.filter((l) => l !== current)];
}

type StarterLike = { starter: string; name: string; ask: string };
const ENGINEERING = ['quality', 'maintainer'];
/** The starters an engineering team wants, from the ones not yet on the team. */
export function starterChoices<T extends StarterLike>(left: T[]): T[] {
  return ENGINEERING.map((id) => left.find((s) => s.starter === id)).filter((s): s is T => !!s);
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** What the last screen says was set up: only what happened. */
export function setUpLines({ chats, project, teammates }: { chats: number; project: string | null; teammates: string[] }): string[] {
  const out: string[] = [];
  if (chats) out.push(`${n(chats, 'chat', 'chats')} brought in`);
  else if (project) out.push(`${project} is ready`);
  for (const t of teammates) out.push(`${t} added`);
  return out;
}

type Lesson = 'start' | 'compose' | 'working' | 'open' | 'choose' | 'reply' | 'close' | 'palette' | 'busy' | 'urgent';
export interface ChecklistRow { label: string; keys: string[]; state: 'done' | 'now' | 'todo' }
/** The tour's lessons as the list beside it. Answering is either a choice or a reply.
 *  `now` is the lesson the tour is pointing at; without one, the first not done is lit. */
// Each step: its words, its keys, the lessons that tick it, and the tips that point at it.
const walkSteps = (cmd: string): Array<[string, string[], Lesson[], Lesson[]]> => [
  ['Send a thread', ['N'], ['start', 'compose'], ['start', 'compose']],
  // Writing back to a thread or closing it means it was opened, whatever opened it.
  ['Open one', ['↵'], ['open', 'choose', 'reply', 'close'], ['open', 'working']],
  ['Write back', ['R'], ['choose', 'reply'], ['choose', 'reply', 'busy']],
  ['Mark it done', ['E'], ['close'], ['close']],
  ['Find anything', [cmd, 'K'], ['palette'], ['palette', 'urgent']],
];

export function tourChecklist(done: readonly Lesson[], cmd = '⌘', now: Lesson | null = null): ChecklistRow[] {
  const has = (...l: Lesson[]) => l.some((x) => done.includes(x));
  const rows = walkSteps(cmd);
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

/** How far through the walkthrough you are, for the column beside the framed app: the step the tip on
 *  screen is about. ⌘K opened before the practice thread is closed has its own tip, which is not a step
 *  further on, and a lesson learned out of turn does not move the count past the tip. */
export function walkPlace(done: readonly Lesson[], now: Lesson | null): { at: number; of: number } {
  const early = (now === 'palette' || now === 'urgent') && !done.includes('close');
  const steps = walkSteps('⌘');
  const tip = now && !early ? steps.findIndex(([, , , by]) => by.includes(now)) : -1;
  const next = tourChecklist(done).findIndex((r) => r.state !== 'done');
  const at = tip >= 0 ? tip : next >= 0 ? next : steps.length - 1;
  return { at: at + 1, of: steps.length };
}
