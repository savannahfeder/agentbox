// THE FIRST RUN'S RULES, with no window in them (w-fadbbea8ef). The screens are
// components/FirstRun.tsx; tests/the-first-run-starts-on-real-work.test.mts
// holds what each rule is for.

import { checkProjectFolder } from '../../shared/project-folder-check.mts';
import { repeatLabel, type RepeatShape } from '../../shared/repeats.mts';
import { projectNameFor } from './agent-import-card';

export type Screen = 'welcome' | 'chats';
export type Engine = 'claude' | 'codex';

export function previousScreen(screen: Screen): Screen | null {
  return screen === 'chats' ? 'welcome' : null;
}

/** The number each screen is counted under as `first_run_step`. In the twenties
 *  because the walk this replaced counted 1 to 15 (BEAT in ./onboarding.ts). The
 *  folder and the first task are now the tutorial's (./tour.ts), on the inbox. */
export const FIRST_RUN_STEP = { welcome: 21, chats: 22, task: 23, where: 24 } as const;

type Reading = { engine: Engine; found?: boolean; signedIn?: boolean } | null;

export function readyEngines(readings: Reading[]): Engine[] {
  return (['claude', 'codex'] as const).filter((engine) => readings.some((r) => r?.engine === engine && r.found && r.signedIn));
}

/** Installed here but not signed in: its button signs in rather than installs. */
export function signedOutEngines(readings: Reading[]): Engine[] {
  return (['claude', 'codex'] as const).filter((engine) => readings.some((r) => r?.engine === engine && r.found && !r.signedIn));
}

export const ENGINE_NAME: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };

export type EngineSetup = { engine: Engine; phase: string; error?: string | null } | null;

/** What pressing an agent's button on the first screen does, in its own words. */
export function setupWord(engine: Engine, signedOut: Engine[] = []): string {
  return `${signedOut.includes(engine) ? 'Sign in to' : 'Install'} ${ENGINE_NAME[engine]}`;
}

/** The footer's line when nothing is ready yet. */
export function foundLine(signedOut: Engine[]): [string, string] {
  if (!signedOut.length) return ['No coding agent', 'found'];
  return [signedOut.map((e) => ENGINE_NAME[e]).join(' and '), 'signed out'];
}

/**
 * THE FIRST SCREEN WHILE AN AGENT IS BEING INSTALLED OR SIGNED IN (F-145, F-178).
 *
 *  The heading is the only line on that screen anybody reads, so it names the
 *  agent and what is happening. `running` swaps the two agent buttons for Back,
 *  and, while signing in, a way to open the page again: a sign-in waits on its
 *  browser tab for as long as the tool likes, so closing that tab must not
 *  leave the screen with nothing to press.
 */
export function installGate(setup: EngineSetup, signedOut: Engine[] = []): { heading: string; running: boolean; again: boolean } {
  const running = !!setup && ['installing', 'checking', 'signing-in'].includes(setup.phase);
  if (!running) {
    const heading = signedOut.length ? 'Set up Claude Code or Codex to start' : 'Install Claude Code or Codex to start';
    return { heading, running: false, again: false };
  }
  const named = ENGINE_NAME[setup!.engine];
  const signingIn = setup!.phase === 'signing-in';
  return {
    heading: signingIn ? `Finish signing in to ${named} in your browser`
      : setup!.phase === 'checking' && signedOut.includes(setup!.engine) ? `Signing in to ${named}` : `Installing ${named}`,
    running: true,
    again: signingIn,
  };
}

export type ListKey = 'up' | 'down' | 'toggle' | 'next' | 'skip' | null;

type KeyLike = { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };

/** Enter acts on the row you are on; ⌘↵ or Ctrl+Enter moves on. */
export function listKey(e: KeyLike): ListKey {
  if (e.key === 'Enter') {
    if (e.shiftKey || e.altKey) return null;
    return e.metaKey || e.ctrlKey ? 'next' : 'toggle';
  }
  if (e.key === 'ArrowUp') return 'up';
  if (e.key === 'ArrowDown') return 'down';
  if (e.key === 'Escape') return 'skip';
  return null;
}


type ThreadLike = { folder?: string; short?: string; when?: number; imported?: boolean; lastSaid?: string; endUnknown?: boolean };

const bare = (folder: string) => folder.replace(/\/+$/, '');

// Anyone's home folder, so a window run with a throwaway home still refuses the real one.
const A_HOME = /^\/(Users|home)\/[^/]+$|^\/root$/;

/** A home folder can't be a project, so a chat that ran there goes to My Workspace. */
export const inHomeFolder = (folder: string): boolean => A_HOME.test(bare(folder));

/** Whether a chat ran somewhere it can be brought in to. */
function placed(t: ThreadLike, home: string): boolean {
  const folder = bare(String(t.folder ?? ''));
  if (!folder || folder === '/') return false;
  if (A_HOME.test(folder)) return true;
  // The chat's own `~/` path answers before the app has said where home is.
  return checkProjectFolder(folder, { home }).ok && (!t.short || checkProjectFolder(t.short, { home }).ok);
}

/** Read to the end and the agent said nothing: brought in, it would open on her own words alone. */
const unanswered = (t: ThreadLike) => typeof t.lastSaid === 'string' && !t.endUnknown && !t.lastSaid.trim();

/** The newest chats not yet in the inbox, from any folder that can be a project. */
export function chatChoices<T extends ThreadLike>(threads: T[], { home = '', max = 8 }: { home?: string; max?: number } = {}): T[] {
  return threads
    .filter((t) => !t.imported && placed(t, home) && !unanswered(t))
    .sort((a, b) => (b.when ?? 0) - (a.when ?? 0))
    .slice(0, max);
}

type ProjectLike = { name: string; repoPath?: string | null };

/** The projects bringing these chats in makes: one per folder no project points at yet. */
export function projectsToMake(chats: ThreadLike[], products: ProjectLike[]): Array<{ folder: string; name: string }> {
  const owned = new Set(products.map((p) => bare(p.repoPath ?? '')).filter(Boolean));
  const taken = products.map((p) => p.name);
  const out: Array<{ folder: string; name: string }> = [];
  for (const t of chats) {
    const folder = bare(String(t.folder ?? ''));
    if (!folder || owned.has(folder) || inHomeFolder(folder)) continue;
    owned.add(folder);
    const name = projectNameFor({ name: folder.split('/').pop() ?? '' }, taken);
    taken.push(name);
    out.push({ folder, name });
  }
  return out;
}

export function chatsHeadline(chats: Array<{ source?: string }>): string {
  const codex = chats.filter((t) => t.source === 'codex').length;
  const from = codex === 0 ? 'Claude Code ' : codex === chats.length ? 'Codex ' : '';
  return `Bring in your latest ${from}chats`;
}

export interface Idea {
  text: string;
  /** The schedule it keeps, with its words on the row and on the chip. None runs it once. */
  repeat?: RepeatShape & { short: string; label: string };
}

/** A look at the code, then jobs people want running and rarely have. None names the project: a folder can be called anything.
 *  My Workspace has no code and knows nothing about you, so it is offered work that needs neither. */
export function ideasFor({ folder = true }: { folder?: boolean } = {}): Idea[] {
  if (!folder) return [
    { text: 'Compare the three most popular note-taking tools and their pricing' },
    { text: 'Write a one-page guide to getting started with AI agents' },
    { text: 'Summarize this week’s AI news in five bullets', repeat: { every: 'week', on: 1, at: '09:00', short: 'Every Monday', label: 'Every Monday at 9:00am' } },
    { text: 'Write a checklist for launching a new feature' },
  ];
  return [
    { text: 'Explain how this project is put together' },
    { text: 'Test the app and flag what’s broken', repeat: { every: 'day', at: '08:00', short: 'Every morning', label: 'Every morning at 8:00am' } },
    { text: 'Review the week’s changes for bugs', repeat: { every: 'week', on: 5, at: '16:00', short: 'Every Friday', label: 'Every Friday at 4:00pm' } },
    { text: 'Check for security holes and outdated packages', repeat: { every: 'week', on: 1, at: '09:00', short: 'Every Monday', label: 'Every Monday at 9:00am' } },
  ];
}

/** The run of a repeating task, found by its rule's label once the run exists. */
export function runOfRule(ruleId: string, rows: { id: string; labels?: string[] }[]): string | null {
  const label = repeatLabel(ruleId);
  return rows.find((r) => r.labels?.includes(label))?.id ?? null;
}
