// WHAT THE FIRST RUN AND THE WALKTHROUGH AFTER IT SHARE, with no window in them:
// whether a first run is needed, the practice thread's words, the names on key
// caps, and the words for making a project. The screens are components/FirstRun.tsx
// and components/Tour.tsx.

import { PRACTICE_TASK } from '../../shared/first-run-practice.mts';
import { titleFromFileName } from '../../shared/name-words.mts';
import { Name } from '../../shared/product-name.mjs';

type Stamped = { wrote?: Record<string, { ts: number } | undefined> };
const stamp = (it: Stamped, field: string) => it.wrote?.[field]?.ts ?? 0;
/** A reply is in on the row and nothing has answered it yet, read off the ledger's stamps. */
export function replyWritten(it: Stamped): boolean {
  return stamp(it, 'answer') > 0 && stamp(it, 'answer') >= stamp(it, 'result');
}

/**
 * WHICH ROW THE MOUSE MAY LIGHT. A card drawn under a mouse standing still fires
 *  mouseenter on whatever row lands beneath it, so until the pointer has moved
 *  since the screen was drawn, the lit row is whatever the keyboard made it. */
export function hoverLit(lit: number, row: number, moved: boolean): number {
  return moved ? row : lit;
}

/** `~/Desktop/dev/agentbox-v2` reads as `Agentbox v2`: the folder is a path and the name is a name. */
export function nameFromFolder(path: string): string {
  return titleFromFileName(path.replace(/\/+$/, '').split('/').pop() ?? '');
}

/** A store with no projects of its own has never been used; `done` is written once setup ends. */
export function firstRunNeeded(p: { products: number; done: boolean }): boolean {
  return !p.done && p.products === 0;
}

/**
 * THE PROJECTS SOMEBODY MADE. My Workspace is made by the app at launch, so
 *  counting it skipped the first run for every new user (w-9f6975906c). */
export function projectsOfTheirOwn(products: Array<{ personal?: boolean }>): number {
  return products.filter((p) => !p.personal).length;
}

// The walkthrough's practice thread (shared/first-run-practice.mts).
export const TASK_TITLE = PRACTICE_TASK.title;
export const TASK_BODY = PRACTICE_TASK.body;
/** Whether a New thread draft is the practice thread, which must not outlive the walkthrough. */
export const practiceDraftLeft = (text: string): boolean => text.trim().startsWith(PRACTICE_TASK.title);

/** The mark on the practice thread. The supervisor never starts work on a row carrying it. */
export const FIRST_RUN_LABEL = 'first-run';

/** How long a reply to the practice thread is left working before the store answers it. */
export const ANSWER_AFTER_MS = 2_000;

export const COPY = {
  page: 'Set up your first project.',
  takenName: (name: string) => `You already have a project called ${name}. Give this one another name.`,
  emptyName: 'A project needs a name with letters or numbers in it.',
  notMade: (why: string) => `${Name} could not make the project. ${why}`,
  submit: 'Submit',
  agentsOffer: `${Name} watches them and puts what they send you in your inbox.`,
  agentsAll: 'Every project',
  agentsHere: 'Only this project',
  agentsRead: `Each one you keep lands in your inbox. ${Name} never moves the file.`,
  finishHead: 'You finished the tutorial.',
  finishLine: 'Your inbox is empty and no agent is waiting on you.',
  finishGo: 'Open my inbox',
} as const;

/** Caps whose glyph does not say its own name get it written inside. A map, so a new cap is named on purpose. */
export const KEY_NAMES: Readonly<Record<string, string>> = {
  '⇥': 'Tab',
  '↵': 'Return',
};

/** The word that goes inside the cap beside the glyph, or null for a cap that already says its own name. */
export function keyName(cap: string | null | undefined): string | null {
  if (!cap) return null;
  return KEY_NAMES[cap] ?? null;
}

export const KEY = 'zero.firstRun';
export const DONE_KEY = 'zero.firstRun.done';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function finishFirstRun(store: Store): void {
  try { store.setItem(DONE_KEY, '1'); store.removeItem(KEY); } catch { /* a first run that cannot be marked done is shown again */ }
}

export function firstRunDone(store: Store): boolean {
  try { return store.getItem(DONE_KEY) === '1'; } catch { return false; }
}

/** ⌘K's Set Agentbox up again: forgets the first run was finished and touches nothing else. */
export function restartFirstRun(store: Store): void {
  try { store.removeItem(DONE_KEY); store.removeItem(KEY); } catch { /* nothing to forget */ }
}

/** An agent file found on this computer, which the import card offers (main/agent-files.mts). */
export interface AgentFile {
  name: string;
  /** The name a person would say, so `leon-okafor-qa` reads as Leon Okafor QA. */
  title: string;
  /** One sentence of the agent's own description, already clipped. */
  line: string;
  /** Claude Code's two scopes: the home folder is every project, the project folder is that one. */
  scope: 'all' | 'project';
  path: string;
}

/** The store's refusal to make a project, said in the app's words rather than its own. */
export function whyNotMade(message: string, name: string): string {
  const said = String(message ?? '').trim();
  if (/already exists/i.test(said)) return COPY.takenName(name);
  if (/needs a name/i.test(said)) return COPY.emptyName;
  const bare = said.replace(/^Error invoking remote method '[^']*':\s*/i, '').replace(/^Error:\s*/i, '');
  return COPY.notMade(bare ? (/[.!?]$/.test(bare) ? bare : `${bare}.`) : 'It did not say why.');
}
