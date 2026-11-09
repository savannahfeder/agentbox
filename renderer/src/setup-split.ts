// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right filling in. The rules, with no React, so
// tests/the-setup-beside-the-app-asks-only-what-applies.test.mjs reads them.

export type SetupStep = 'chats' | 'folder' | 'connect' | 'invite' | 'teammates' | 'look';

/** Only the steps that can apply on this build: most people are not on a team,
 *  an AI teammate needs a project to work in, and a tool needs somewhere safe to keep its sign-in. */
export function setupSteps({ chats, team, teammates, project, tools }: { chats: number; team: boolean; teammates: boolean; project: boolean; tools: boolean }): SetupStep[] {
  const out: SetupStep[] = [chats > 0 ? 'chats' : 'folder'];
  if (tools) out.push('connect');
  if (team) out.push('invite');
  if (teammates && project) out.push('teammates');
  out.push('look');
  return out;
}

export const stepLabel = (steps: SetupStep[], step: SetupStep) => `Step ${steps.indexOf(step) + 1} of ${steps.length}`;

/** The tools an engineering team reaches for first, in the order offered. */
export const CONNECT_FIRST = ['github', 'linear', 'sentry', 'notion', 'vercel'];

const USE: Record<string, string> = {
  github: 'Issues and pull requests', linear: 'Issues and projects', sentry: 'Errors from production',
  notion: 'Docs and specs', vercel: 'Deploys and previews',
};
/** What a tool is for, in the setup's words; one line each, all the same length. */
export const toolUse = (id: string) => USE[id] ?? '';

type TileLike = { id: string; access?: string };
export function connectTiles<T extends TileLike>(tiles: T[]): T[] {
  return CONNECT_FIRST.map((id) => tiles.find((t) => t.id === id)).filter((t): t is T => !!t && t.access !== 'vendor_approval');
}

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
export function setUpLines({ chats, project, tools, invited, teammates }: { chats: number; project: string | null; tools: number; invited: number; teammates: string[] }): string[] {
  const out: string[] = [];
  if (chats) out.push(`${n(chats, 'chat', 'chats')} brought in`);
  else if (project) out.push(`${project} is ready`);
  if (tools) out.push(`${n(tools, 'tool', 'tools')} connected`);
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
    ['Open one', ['↵'], ['open'], ['open', 'working']],
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
