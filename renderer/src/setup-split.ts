// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right filling in. The rules, with no React, so
// tests/the-setup-beside-the-app-asks-only-what-applies.test.mjs reads them.

export type SetupStep = 'chats' | 'folder' | 'account' | 'invite' | 'teammates' | 'look';

/** Only the steps that can apply on this build: most people are not on a team,
 *  and an AI teammate needs a project to work in. Tools are not asked for: the
 *  person's Claude Code and Codex already carry their connections. */
export function setupSteps({ chats, team, teammates, project, signedIn = true }: { chats: number; team: boolean; teammates: boolean; project: boolean; signedIn?: boolean }): SetupStep[] {
  const out: SetupStep[] = [chats > 0 ? 'chats' : 'folder'];
  // Signing in is required, so it is a step, and what needs it comes after.
  if (team && !signedIn) out.push('account');
  if (team) out.push('invite');
  if (teammates && project) out.push('teammates');
  out.push('look');
  return out;
}

export const stepLabel = (steps: SetupStep[], step: SetupStep) => `Step ${steps.indexOf(step) + 1} of ${steps.length}`;

/** Ids in shared sky themes and skins.ts: Light and Dark are the plain looks. */
const LOOK_ORDER = ['ember', 'dusk', 'aurora', 'sage', 'light', 'dark'];
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

/** The sky a new install starts in: dark orange on a Mac in dark mode, light green in light, unless someone already chose. */
export function setupStartsOn({ sky, dark }: { sky: string | null; dark: boolean }): string | null {
  return sky ? null : dark ? 'ember' : 'sage';
}

/** The walkthrough's place: the lit row or one past what is done, whichever is further. */
export const tourPlace = (rows: ChecklistRow[]) => Math.min(Math.max(rows.filter((r) => r.state === 'done').length + 1, rows.findIndex((r) => r.state === 'now') + 1), rows.length);
export const tourCount = (rows: ChecklistRow[]) => `${tourPlace(rows)} of ${rows.length}`;
