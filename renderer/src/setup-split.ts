// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right filling in. The rules, with no React, so
// tests/the-setup-beside-the-app-asks-only-what-applies.test.mjs reads them.

export type SetupStep = 'chats' | 'folder' | 'connect' | 'invite' | 'teammates' | 'look';

/** Only the steps that can apply on this build: most people are not on a team. */
export function setupSteps({ chats, team, teammates }: { chats: number; team: boolean; teammates: boolean }): SetupStep[] {
  const out: SetupStep[] = [chats > 0 ? 'chats' : 'folder', 'connect'];
  if (team) out.push('invite');
  if (teammates) out.push('teammates');
  out.push('look');
  return out;
}

export const stepLabel = (steps: SetupStep[], step: SetupStep) => `Step ${steps.indexOf(step) + 1} of ${steps.length}`;

/** The tools an engineering team reaches for first, in the order offered. */
export const CONNECT_FIRST = ['github', 'linear', 'sentry', 'notion', 'vercel'];

type TileLike = { id: string; access?: string };
export function connectTiles<T extends TileLike>(tiles: T[]): T[] {
  return CONNECT_FIRST.map((id) => tiles.find((t) => t.id === id)).filter((t): t is T => !!t && t.access !== 'vendor_approval');
}

/** Ids in shared sky themes and skins.ts: Light and Dark are the plain looks. */
const LOOK_ORDER = ['ember', 'dusk', 'aurora', 'sage', 'light', 'dark'];
/** The look you have first, then the dark orange sky; the light pink sky only if you already wear it. */
export function lookChoices(current: string): string[] {
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
/** The tour's lessons as the list beside it. Answering is either a choice or a reply. */
export function tourChecklist(done: readonly Lesson[], cmd = '⌘'): ChecklistRow[] {
  const has = (...l: Lesson[]) => l.some((x) => done.includes(x));
  const rows: Array<[string, string[], boolean]> = [
    ['Send a thread', ['N'], has('start', 'compose')],
    ['Open one', ['↵'], has('open')],
    ['Answer it', ['R'], has('choose', 'reply')],
    ['Mark it done', ['E'], has('close')],
    ['Find anything', [cmd, 'K'], has('palette')],
  ];
  let lit = false;
  return rows.map(([label, keys, isDone]) => {
    if (isDone) return { label, keys, state: 'done' as const };
    if (!lit) { lit = true; return { label, keys, state: 'now' as const }; }
    return { label, keys, state: 'todo' as const };
  });
}
