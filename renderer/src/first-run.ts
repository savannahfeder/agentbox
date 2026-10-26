// THE FIRST RUN'S RULES, with no window in them (w-fadbbea8ef). The screens are
// components/FirstRun.tsx; tests/the-first-run-starts-on-real-work.test.mjs
// holds what each rule is for.

import { checkProjectFolder } from '../../shared/project-folder-check.mjs';
import { occurrenceId, periodKey, type RepeatShape } from '../../shared/repeats.mjs';
import { projectNameFor } from './agent-import-card';
import { shortPath } from './onboarding';

export type Step = 'chats' | 'task';
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

/** Whether a key press is ⌘↵ or Ctrl+Enter, which sends from a text field. */
export const isSend = (e: KeyLike): boolean => e.key === 'Enter' && !!(e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;

type ThreadLike = { folder?: string; short?: string; when?: number; imported?: boolean };

export interface FolderChoice {
  folder: string;
  name: string;
  short: string;
  chats: number;
  when: number;
}

const bare = (folder: string) => folder.replace(/\/+$/, '');

// Anyone's home folder, so a window run with a throwaway home still refuses the real one.
const A_HOME = /^\/(Users|home)\/[^/]+$|^\/root$/;

/** Whether a chat ran in a folder that can be a project. */
function placed(t: ThreadLike, home: string): boolean {
  const folder = bare(String(t.folder ?? ''));
  if (!folder || folder === '/' || A_HOME.test(folder)) return false;
  // The chat's own `~/` path answers before the app has said where home is.
  return checkProjectFolder(folder, { home }).ok && (!t.short || checkProjectFolder(t.short, { home }).ok);
}

/** The folders your agents already ran in, busiest first. */
export function folderChoices(threads: ThreadLike[], { home = '', max = 5 }: { home?: string; max?: number } = {}): FolderChoice[] {
  const by = new Map<string, FolderChoice>();
  for (const t of threads) {
    if (!placed(t, home)) continue;
    const folder = bare(String(t.folder));
    const had = by.get(folder);
    if (had) {
      had.chats += 1;
      had.when = Math.max(had.when, t.when ?? 0);
      continue;
    }
    by.set(folder, {
      folder,
      name: projectNameFor({ name: folder.split('/').pop() ?? '' }),
      short: t.short ? bare(t.short) : shortPath(folder, home),
      chats: 1,
      when: t.when ?? 0,
    });
  }
  return [...by.values()].sort((a, b) => b.chats - a.chats || b.when - a.when).slice(0, max);
}

/** The newest chats not yet in the inbox, from any folder that can be a project. */
export function chatChoices<T extends ThreadLike>(threads: T[], { home = '', max = 8 }: { home?: string; max?: number } = {}): T[] {
  return threads
    .filter((t) => !t.imported && placed(t, home))
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
    if (!folder || owned.has(folder)) continue;
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

export function stepsFor({ chats }: { chats: number }): Step[] {
  return chats > 0 ? ['chats', 'task'] : ['task'];
}

export interface Idea {
  text: string;
  /** The schedule it keeps, with its words on the row and on the chip. None runs it once. */
  repeat?: RepeatShape & { short: string; label: string };
}

/** A look at the code, then jobs people want running and rarely have. None names the project: a folder can be called anything. */
export function ideasFor(): Idea[] {
  return [
    { text: 'Explain how this project is put together' },
    { text: 'Test the app and flag what’s broken', repeat: { every: 'day', at: '08:00', short: 'Every morning', label: 'Every morning at 8:00am' } },
    { text: 'Review the week’s changes for bugs', repeat: { every: 'week', on: 5, at: '16:00', short: 'Every Friday', label: 'Every Friday at 4:00pm' } },
    { text: 'Check for security holes and outdated packages', repeat: { every: 'week', on: 1, at: '09:00', short: 'Every Monday', label: 'Every Monday at 9:00am' } },
  ];
}

/** The id of the run a rule made now starts with: a new rule is owed at once. */
export function firstRunOf(rule: RepeatShape & { id: string }, now = Date.now()): string | null {
  const key = periodKey(rule, now);
  return key ? occurrenceId(rule.id, key) : null;
}

/** Where the first run leaves you: on the task you sent, or in Needs you. */
export function landing(sent: string | null): { view: 'inbox' | 'progress'; select: string | null } {
  return sent ? { view: 'progress', select: sent } : { view: 'inbox', select: null };
}

/** The one-time lessons left after the first run: the key beside the first thread, and the lit 1. */
export const TEACH_KEY = 'zero.firstRun.teach';
export type Lesson = 'open' | 'pick';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function lessonsLeft(store: Store): Lesson[] {
  try {
    const raw = store.getItem(TEACH_KEY);
    return raw ? raw.split(',').filter((l): l is Lesson => l === 'open' || l === 'pick') : [];
  } catch { return []; }
}

export function setLessons(store: Store, lessons: Lesson[]): void {
  try { store.setItem(TEACH_KEY, lessons.join(',')); } catch { /* a lesson missed is not worth a failure */ }
}
