// The words and arithmetic of the agent import card opened from ⌘K, kept out of
// the component so its sentences can be tested. The first run's walk has its
// own card in renderer/src/onboarding.ts.

import type { AgentFile } from './onboarding';
import { Name } from '../../shared/product-name.mjs';

export interface Project { slug: string; name: string; repoPath: string | null }

/**
 * The project the card opens on: the inbox filter if one is on, else the
 * project of the last task, else the first project. A slug that no longer
 * names a project, such as a filter left from a deleted one, falls through. */
export function projectAtOpen(
  products: Project[],
  { filter = null, last = null }: { filter?: string | null; last?: string | null } = {},
): string | null {
  const has = (slug: string | null) => !!slug && products.some((p) => p.slug === slug);
  if (has(filter)) return filter;
  if (has(last)) return last;
  return products[0]?.slug ?? null;
}

/**
 * The folder a project's own agents are read from. Claude Code's project scope
 * is `<repo>/.claude/agents`, so a project with no code folder has none. */
export function folderOfProject(products: Project[], slug: string | null): string | null {
  return products.find((p) => p.slug === slug)?.repoPath ?? null;
}

export function nameOfProject(products: Project[], slug: string | null): string {
  return products.find((p) => p.slug === slug)?.name ?? '';
}

/**
 * Folds the home folder to `~`. The main process folds the paths it finds, but
 * a project's `repoPath` comes off the store unfolded. */
export function fold(p: string | null): string {
  return (p ?? '').replace(/^\/Users\/[^/]+/, '~');
}

/* --------------------------------- words --------------------------------- */

// Counts up to ten are words, because a digit in the middle of a sentence reads
// as a field. Past ten a digit is shorter.
const WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));

export const CARD = {
  /** Same sentence as `COPY.bringHead` in renderer/src/onboarding.ts; change both together. */
  head: 'Add the agents already on this computer.',
  /** No project and no folder to make one from, so the card draws no button. */
  noProject: 'Make a project first, and your agents can land in its inbox.',
  newProject: 'New project…',
  /**
   * Its own headline, because `head` promises an import and there is none to
   * make. `noneLater` is the only place someone with no agents yet learns how
   * to come back to this card. */
  headNone: 'No agents to bring across yet.',
  noneWhere: (dir: string) => `No agent files in ${dir} or your project folders, and no recent Claude Code or Codex conversations you started yourself.`,
  noneLater: 'When you have some, press ⌘K and type import.',
  /** In place of `noneWhere` when everything found is already in the inbox,
   *  where "found nothing" would be untrue. */
  allIn: (n: number) => n === 1
    ? 'The one conversation from the last ten days is already in your inbox.'
    : `All ${n} conversations from the last ten days are already in your inbox.`,
  headAllIn: 'Nothing new to bring across.',
  laterAllIn: 'When there is more, press ⌘K and type import.',
  /** Claude Code may be installed while the card is open, and reading the folders again is cheap. */
  lookAgain: 'Look again',
  looking: 'Looking',
  /** Word for word the walk's foot line. */
  foot: 'Each one you keep lands in your inbox, and your agent files stay where they are.',
  go: 'Add them',
  reading: 'Reading this computer…',
};

/**
 * A folder with agents of its own that no project points at, found by
 * `findAgentFolders` in main/agent-files.mjs. `short` is the path folded to `~`,
 * and `agents` is read by `readFolderAgents`. */
export interface AgentFolder {
  folder: string;
  short: string;
  name: string;
  count: number;
  agents?: AgentFile[];
}

/**
 * One inbox the card's rows can land in.
 *
 * `everywhere` is the home folder set. It works in every project, so the user
 * picks its inbox. `project` is an existing project and the agents in its
 * folder. `new` is a folder with agents that no project points at; the press
 * makes its project, named after the folder. */
export interface Destination {
  key: string;
  kind: 'everywhere' | 'project' | 'new';
  /** A project's name, or the name the new project will get. */
  name: string;
  /** Null for a project that does not exist yet. */
  slug: string | null;
  /** The folder its agents live in, and the folder a new project will point at. */
  folder: string | null;
  /** The folder as shown under the heading. */
  where: string;
  items: AgentFile[];
  /** Recent conversations in that folder. Optional, so read it through `picksOf`. */
  threads?: SessionThread[];
}

/**
 * A Claude Code or Codex conversation the user started. `readSessionThreads` in
 * main/agent-sessions.mjs decides what counts. `title` is the first prompt,
 * because a transcript has no title. Everything on the card is ticked by `path`. */
export interface SessionThread {
  id: string;
  source: 'terminal' | 'editor' | 'desktop' | 'codex';
  folder: string;
  folderName: string;
  short: string;
  title: string;
  when: number;
  path: string;
  /** Already has a row in the inbox, so the card does not offer it again. */
  imported?: boolean;
  /** The agent's last reply ended on a question for you. */
  waiting?: boolean;
  /** How it ended was not read (past the list's cap), so it is neither waiting nor finished. */
  endUnknown?: boolean;
  /** That question, short enough for one line. */
  ask?: string;
}

/**
 * Everything tickable in a section, agent files and threads, by path. Every
 * count, tick and button goes through here so they cannot disagree. */
export function picksOf(d: Destination): string[] {
  return [...d.items.map((a) => a.path), ...(d.threads ?? []).map((t) => t.path)];
}

export function countKinds(
  dests: Destination[], picked?: string[],
): { agents: number; threads: number } {
  const on = picked ? new Set(picked) : null;
  let agents = 0;
  let threads = 0;
  for (const d of dests) {
    agents += d.items.filter((a) => !on || on.has(a.path)).length;
    threads += (d.threads ?? []).filter((t) => !on || on.has(t.path)).length;
  }
  return { agents, threads };
}

/** Names both kinds, never one bare number for both, so the count can be checked against the list. */
export function kindPhrase({ agents, threads }: { agents: number; threads: number }): string {
  const part = (n: number, one: string) => `${word(n).toLowerCase()} ${one}${n === 1 ? '' : 's'}`;
  if (agents && threads) return `${part(agents, 'agent')} and ${part(threads, 'thread')}`;
  if (threads) return part(threads, 'thread');
  return part(agents, 'agent');
}

/**
 * A folder's agents and threads appear only under the project that points at
 * that folder, so no tick can file them where they would not run. The home
 * folder set works in every project, so its inbox is the one choice. A folder
 * no project points at gets a section, and the press makes its project. */
export function destinations({
  found,
  folders = [],
  products = [],
  project = null,
  threads = [],
}: {
  found: { user: AgentFile[]; project: AgentFile[] } | null;
  folders?: AgentFolder[];
  products?: Project[];
  project?: string | null;
  threads?: SessionThread[];
}): Destination[] {
  const out: Destination[] = [];
  const name = nameOfProject(products, project);
  const folder = folderOfProject(products, project);
  if (found?.user.length) {
    out.push({
      key: 'everywhere', kind: 'everywhere', name, slug: project, folder: null,
      where: SECTION.homeFolder, items: found.user, threads: [],
    });
  }
  if (found?.project.length && project) {
    out.push({
      key: `project:${project}`, kind: 'project', name, slug: project, folder,
      where: fold(folder), items: found.project, threads: [],
    });
  }
  // Names already taken, so two folders with the same basename do not propose
  // the same project and fail the press on a duplicate slug.
  const taken = products.map((p) => p.name);
  for (const f of unclaimed(folders, products)) {
    const name = projectNameFor(f, taken);
    taken.push(name);
    out.push({
      key: `new:${f.folder}`, kind: 'new', name, slug: null,
      folder: f.folder, where: f.short, items: f.agents ?? [], threads: [],
    });
  }

  // A thread joins the section for its folder, else a new section for the
  // project that points at the folder, else a new project. It never joins the
  // home folder set, because a conversation happened in one folder.
  const at = new Map(out.filter((d) => d.folder).map((d) => [trimSlash(d.folder as string), d]));
  const owns = new Map(
    products.filter((p) => p.repoPath).map((p) => [trimSlash(p.repoPath as string), p]),
  );
  for (const t of threads) {
    const key = trimSlash(t.folder);
    if (!key) continue;
    let d = at.get(key);
    if (!d) {
      const own = owns.get(key);
      const made = own
        ? {
          key: `project:${own.slug}`, kind: 'project' as const, name: own.name, slug: own.slug,
          folder: t.folder, where: t.short, items: [], threads: [],
        }
        : {
          key: `new:${t.folder}`, kind: 'new' as const, name: projectNameFor({ name: t.folderName }, taken),
          slug: null, folder: t.folder, where: t.short, items: [], threads: [],
        };
      if (!own) taken.push(made.name);
      out.push(made);
      at.set(key, made);
      d = made;
    }
    (d.threads as SessionThread[]).push(t);
  }
  return out;
}

const trimSlash = (p: string) => String(p ?? '').replace(/\/+$/, '');

export const SECTION = {
  /** Not a project name: the home folder set is the scope Claude Code loads in every session. */
  everywhere: 'Every project',
  homeFolder: '~/.claude/agents',
  /** Split so the project name can be a button in the middle of the sentence. */
  landBefore: 'They work everywhere, so their rows go to',
  landAfter: '.',
  landNowhere: 'They work everywhere. Make a project and they have an inbox.',
  newBadge: 'New project',
  /** The count on the right of a heading. */
  n: (items: { length: number }) => String(items.length),
};

/**
 * The toast after the press. New rows and rows that already existed are counted
 * apart, because `importAgentRows` files nothing for an agent that has a row
 * (`agentsNeedingRows`, shared/agent-import.mjs). `inboxes` and `made` cover a
 * press that files into several projects and makes some of them. */
export function importedLine(
  {
    added = 0, already = 0, name = '', inboxes = 1, made = [], noun = 'agent', done = 0,
  }: {
    added?: number; already?: number; name?: string; inboxes?: number; made?: string[];
    noun?: string; done?: number;
  },
): string {
  if (added === 0 && already === 0) return 'Nothing was ticked, so nothing was filed.';
  if (noun === 'thread' && added > 0) return chatsLine({ added, already, made, done });
  const many = inboxes > 1;
  const where = name ? ` ${name}` : '';
  if (added === 0) {
    // The caller passes `noun`, because the thing that already had a row may be a thread.
    if (many) {
      return already === 1
        ? `That ${noun} already has a row.`
        : `${word(already)} of them already have rows.`;
    }
    return already === 1
      ? `That ${noun} already has a row in${where}.`
      : `${word(already)} of them already have rows in${where}.`;
  }
  const rows = added === 1 ? 'One row is' : `${word(added)} rows are`;
  const head = many
    ? `${rows} in ${word(inboxes).toLowerCase()} inboxes.`
    : `${rows} in your ${made.length === 1 ? 'new ' : ''}${name} inbox.`;
  const tail = many && made.length
    ? (made.length === 1 ? ` ${made[0]} is new.` : ` ${word(made.length)} of them are new.`)
    : '';
  if (already === 0) return `${head}${tail}`;
  const had = already === 1 ? ' One already had one.' : ` ${word(already)} already had rows.`;
  return `${head}${had}${tail}`;
}

/** Chats land in Needs you or Done, so the line names those, not projects. */
function chatsLine({ added, already, made, done }: { added: number; already: number; made: string[]; done: number }): string {
  const filedDone = Math.min(Math.max(0, done), added);
  const waiting = added - filedDone;
  const chats = (n: number) => (n === 1 ? 'One chat is' : `${word(n)} chats are`);
  const head = !filedDone ? `${chats(waiting)} in Needs you.`
    : !waiting ? `${chats(filedDone)} in Done.`
      : `${chats(waiting)} in Needs you and ${filedDone === 1 ? 'one is' : `${word(filedDone).toLowerCase()} are`} in Done.`;
  const had = !already ? '' : already === 1 ? ' One was already here.' : ` ${word(already)} were already here.`;
  const making = !made.length ? '' : made.length === 1 ? ` ${made[0]} is a new project.` : ` ${word(made.length)} new projects were made for them.`;
  return `${head}${had}${making}`;
}

/**
 * Whether the button may be pressed: something is ticked, and every section
 * with a tick has an inbox. A `new` section always does, because the press makes
 * its project. The button and ⌘↵ both ask this. */
export function canBring(
  { read, picked, dests }: { read: boolean; picked: string[]; dests: Destination[] },
): boolean {
  if (!read || picked.length === 0) return false;
  const on = new Set(picked);
  for (const d of dests) {
    if (!picksOf(d).some((p) => on.has(p))) continue;
    if (d.kind !== 'new' && !d.slug) return false;
  }
  return true;
}

/**
 * Ticks or unticks one path. Ticks are keyed by path, not name, because two
 * folders can each hold an agent called `code-reviewer`. The result follows the
 * card's order, not the click order. */
export function togglePicked(dests: Destination[], picked: string[], path: string): string[] {
  const on = new Set(picked);
  if (on.has(path)) on.delete(path); else on.add(path);
  return dests.flatMap(picksOf).filter((p) => on.has(p));
}

/**
 * The name for a project made from a folder: `sidecar-desktop` becomes
 * `Sidecar Desktop`. A folder name with a capital or a space was chosen by a
 * person and is kept as written. */
export function projectNameFor(folder: { name?: string } | null, taken: string[] = []): string {
  const n = (folder?.name ?? '').trim();
  if (!n) return '';
  const base = /[A-Z\s]/.test(n)
    ? n
    : n.replace(/[-_.]+/g, ' ').split(' ').filter(Boolean)
      .map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join(' ');
  // `createProduct` throws on a slug it already has, so a taken name gets a
  // number. Two folders called `api` under two roots is the usual way here.
  const used = new Set(taken.map(slugFor));
  if (!used.has(slugFor(base))) return base;
  for (let i = 2; i < 100; i += 1) {
    if (!used.has(slugFor(`${base} ${i}`))) return `${base} ${i}`;
  }
  return base;
}

/**
 * The store's slug rule (`createProduct`, main/store.mjs), repeated so the card
 * knows before the press that two names make one slug. */
export function slugFor(name: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/**
 * Found folders that no project points at. The main process filters these too;
 * filtering again here drops a project made on this card at once, before a new
 * product list arrives. */
export function unclaimed(folders: AgentFolder[], products: Project[]): AgentFolder[] {
  const owned = new Set(
    products.map((p) => (p.repoPath ?? '').replace(/\/+$/, '')).filter(Boolean),
  );
  return folders.filter((f) => !owned.has(f.folder.replace(/\/+$/, '')));
}

export { word as countWord };

export const DOOR = {
  /** The second door. The first says its own count, so it is `bringAllLine`. */
  pick: 'Choose which ones',
  pickWhy: 'Pick a whole project, or single agents inside it.',
  never: `${Name} never moves your agent files.`,
};

/** The first door, which names the count it is about to act on. */
export function bringAllLine(dests: Destination[]): string {
  const kinds = countKinds(dests);
  const n = kinds.agents + kinds.threads;
  return n === 1 ? `Add the one ${kinds.threads ? 'thread' : 'agent'}` : `Add all ${kindPhrase(kinds)}`;
}

/** Three states, so a section with one agent unticked does not show as all ticked. */
export function sectionState(d: Destination, picked: string[]): 'all' | 'some' | 'none' {
  const mine = picksOf(d);
  if (mine.length === 0) return 'none';
  const on = new Set(picked);
  const n = mine.filter((p) => on.has(p)).length;
  if (n === 0) return 'none';
  return n === mine.length ? 'all' : 'some';
}

/** A half-ticked section clears on press rather than filling up. */
export function toggleSection(dests: Destination[], picked: string[], key: string): string[] {
  const d = dests.find((x) => x.key === key);
  if (!d) return picked;
  const on = new Set(picked);
  const mine = picksOf(d);
  const anyOn = mine.some((p) => on.has(p));
  for (const p of mine) { if (anyOn) on.delete(p); else on.add(p); }
  return dests.flatMap(picksOf).filter((p) => on.has(p));
}

export function allPicked(dests: Destination[]): string[] {
  return dests.flatMap(picksOf);
}

/** The total for the header, which does not scroll, so what is below the fold is still counted. */
export function totalLine(dests: Destination[]): string {
  const kinds = countKinds(dests);
  const places = dests.length;
  if (kinds.agents + kinds.threads === 0) return '';
  const a = kindPhrase(kinds);
  const p = `${word(places).toLowerCase()} folder${places === 1 ? '' : 's'}`;
  return `${a[0].toUpperCase()}${a.slice(1)} in ${p}.`;
}

/** The button names what is ticked, not everything on the card. */
export function goLine(dests: Destination[], picked: string[]): string {
  if (picked.length === 0) return 'Nothing ticked';
  return `Add ${kindPhrase(countKinds(dests, picked))}`;
}

export function willMake(dests: Destination[], picked: string[]): string[] {
  const on = new Set(picked);
  return dests
    .filter((d) => d.kind === 'new' && picksOf(d).some((p) => on.has(p)))
    .map((d) => d.name);
}

/**
 * One sentence before the press: how many projects it files into and which it
 * makes. Empty when it files into one project and makes none. */
export function pressLine(dests: Destination[], picked: string[]): string {
  const on = new Set(picked);
  const inboxes = dests.filter((d) => picksOf(d).some((p) => on.has(p))).length;
  const made = willMake(dests, picked);
  if (inboxes === 0) return '';
  // Projects, not inboxes: the app has one Inbox tab, and the sidebar already says projects.
  const where = inboxes === 1
    ? ''
    : `${Name} files them under ${word(inboxes).toLowerCase()} projects.`;
  const makes = made.length === 0
    ? ''
    : made.length === 1
      ? `${made[0]} becomes a new project.`
      : `${word(made.length)} of them become new projects.`;
  return [where, makes].filter(Boolean).join(' ');
}

// The card draws one ticked list. The destinations above still decide where each
// line lands, and a folder no project points at still becomes a project on the
// press, but the list draws none of that: a line shows only what it is, where
// it came from and when.

export const LIST = {
  head: 'Bring in your recent agents',
  line: 'From the last 10 days. Untick any you want to leave out.',
  // When the last ten days held nothing and main/importable-threads.mjs reached
  // back for the newest older conversations.
  lineOlder: 'Nothing from the last 10 days, so here are your most recent. Untick any you want to leave out.',
  // AND ONCE A SEARCH HAS PUT SOMETHING ON THIS LIST (w-6418318cd5). Keeping a
  // match from March adds it here, ticked, so "From the last 10 days" over it
  // is this card's oldest fault in a new place.
  lineFound: 'From the last 10 days, plus the ones you found by name. Untick any you want to leave out.',
  add: (n: number) => (n > 0 ? `Add ${n} to your inbox` : 'Nothing ticked'),
  notNow: 'Not now',
};

/**
 * The older line only when every dated conversation is over ten days old,
 * which is when the main process reached back. Agent files have no date. */
export function listLine(
  threads: Array<{ when?: number }> = [], now = Date.now(), alsoFound = false,
): string {
  // A chat kept out of a search is on this list whatever its date, so it
  // outranks both readings below: neither line describes a list with March on
  // it by request.
  if (alsoFound) return LIST.lineFound;
  const dated = threads.filter((t) => Number(t?.when) > 0);
  const recent = now - 10 * 86400000;
  return dated.length && dated.every((t) => Number(t.when) < recent) ? LIST.lineOlder : LIST.line;
}

export interface ImportLine { path: string; title: string; meta: string; when: number }

/** "today", "yesterday", "Wednesday", "Sep 27": the card's own short form. */
function whenShort(when: number, now = Date.now()): string {
  const then = new Date(Number(when) || 0);
  if (!when || !Number.isFinite(then.getTime())) return '';
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(then)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return then.toLocaleDateString('en-US', { weekday: 'long' });
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Every line the card draws, newest conversation first and agent files last. */
export function importLines(dests: Destination[], now = Date.now()): ImportLine[] {
  const talks: ImportLine[] = [];
  const files: ImportLine[] = [];
  for (const d of dests) {
    for (const t of d.threads ?? []) {
      const from = t.source === 'codex' ? 'Codex' : 'Claude Code';
      const when = whenShort(t.when, now);
      talks.push({ path: t.path, title: t.title, meta: [from, d.name, when].filter(Boolean).join(' · '), when: t.when });
    }
    for (const a of d.items) files.push({ path: a.path, title: a.title, meta: `Claude Code agent · ${d.name}`, when: 0 });
  }
  return [...talks.sort((a, b) => b.when - a.when), ...files];
}

/* ------------------------ SETUP'S LAST SCREEN ------------------------------ */
// The design the founder approved as R1 (w-62228098e6): only the chats that
// were waiting on you, each with its question; the finished ones from this
// week go to Done; and a tick that keeps new chats coming.

export const PICKUP = {
  head: 'Pick up where you left off',
  lineNone: 'Nothing in Claude Code or Codex is waiting on you.',
  finished: (n: number) => {
    if (n <= 0) return '';
    return n === 1 ? 'The one finished chat from this week goes to Done.' : `The ${n} finished chats from this week go to Done.`;
  },
  keep: 'Keep bringing in new chats from Claude Code and Codex',
  go: (n: number) => (n > 0 ? `Bring in ${n}` : 'Continue'),
  notNow: 'Not now',
};

/**
 * The line under the head. A Claude Code chat carries on as the same
 *  conversation; a Codex chat carries on here from what it said, so "the same
 *  conversation" is promised only when every chat listed is Claude Code's. */
export function pickupLine(waiting: Array<{ source?: string }> = []): string {
  if (!waiting.length) return PICKUP.lineNone;
  const codex = waiting.some((t) => t.source === 'codex');
  const claude = waiting.some((t) => t.source !== 'codex');
  if (!codex) return 'These were waiting on you in Claude Code. They carry on here, in the same conversation.';
  return `These were waiting on you in ${claude ? 'Claude Code and Codex' : 'Codex'}. They carry on here.`;
}

const WEEK = 7 * 86400000;

/** The chats not in yet: those waiting on you, and the finished ones from this week. */
export function pickupChats(threads: SessionThread[] = [], now = Date.now()) {
  const fresh = threads.filter((t) => !t.imported);
  return {
    waiting: fresh.filter((t) => t.waiting),
    finished: fresh.filter((t) => !t.waiting && !t.endUnknown && Number(t.when) >= now - WEEK),
  };
}

/**
 * The finished chats that go to Done: those whose folder has a project, or is
 *  getting one because a waiting chat beside them is ticked. A project is never
 *  made just to hold a closed row. */
export function finishedForDone(dests: Destination[], finished: SessionThread[], picked: string[]): SessionThread[] {
  const on = new Set(picked);
  const lands = new Set<string>();
  for (const d of dests) {
    const making = (d.threads ?? []).some((t) => t.waiting && on.has(t.path));
    if (d.slug || making) for (const t of d.threads ?? []) lands.add(t.path);
  }
  return finished.filter((t) => lands.has(t.path));
}

export interface PickupLine extends ImportLine { ask: string }

/** The waiting chats as the screen draws them, newest first. */
export function pickupLines(dests: Destination[], now = Date.now()): PickupLine[] {
  const ask = new Map<string, string>();
  for (const d of dests) for (const t of d.threads ?? []) if (t.waiting) ask.set(t.path, t.ask ?? '');
  return importLines(dests, now)
    .filter((l) => ask.has(l.path))
    .map((l) => ({ ...l, ask: ask.get(l.path) ?? '' }));
}

/* ------------------------- FINDING AN OLDER ONE ---------------------------- */
// The card offered the last ten days and nothing else, so a chat from July
// could not be brought in at all. The idea is GitHub #31's; the way in is not.
// He put an "Add chat" button in the inbox header, which is four controls wide
// already and only carries what is pressed daily.
//
// SO THE FIELD IS ON THE CARD THAT ALREADY EXISTS, and the ways to that card
// are the two places the thought occurs: ⌘K, where the row has always been,
// and the New thread card, because a chat you already had is a thread you
// already started.
//
// THE TEN DAYS ARE UNTOUCHED. They arrive ticked, which is the founder's own
// pick (w-db6f5e331e). A search is the opposite act: you typed four letters,
// nine rows came back, and not one of them is a row you chose. So matches
// arrive unticked and the button stays dark until you pick.

export const SEARCH = {
  /** Over a list of matches from March, `LIST.head` ("your recent agents")
   *  would be the card contradicting itself again. */
  head: 'Bring in an older chat',
  placeholder: 'Find a chat by name',
  /** Under the field, so it is clear this reaches past the ten days above it. */
  hint: 'Finds your older Claude Code and Codex chats too.',
  looking: 'Looking through your chats…',
  /** Typed in the field, quoted back, so a typo is visible rather than silent. */
  none: (q: string) => `No chat with “${q}” in its name.`,
  /** How many matched, over the list, because the list scrolls. */
  found: (n: number) => (n === 1 ? 'One chat matches.' : `${n} chats match.`),
  clear: 'Clear',
};

/**
 * DOES THIS CHAT'S NAME MATCH WHAT WAS TYPED.
 *
 *  Every word typed has to appear somewhere in the name, in any order, so
 *  "hero image" and "image hero" both find the same chat and neither needs the
 *  words to be adjacent. Capitals are ignored.
 *
 *  THE NAME AND NOTHING ELSE. The field says "by name", and a match on the
 *  folder would mean typing a project's name returns every chat that ever ran
 *  inside it — a list of forty you would then be invited to add in one press.
 *
 *  A blank field is not a search and matches nothing, which is what keeps the
 *  card on its ten-day list until somebody really types. */
export function matchesName(title: string, query: string): boolean {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const name = String(title ?? '').toLowerCase();
  return words.every((w) => name.includes(w));
}

/**
 * The lines a search puts on the card: the matching ones, in the order they
 *  were already in, which is newest first. Agent files carry no date and are
 *  not chats, so a search leaves them out. */
export function searchLines(lines: ImportLine[], query: string): ImportLine[] {
  if (!String(query ?? '').trim()) return [];
  return lines.filter((l) => l.when > 0 && matchesName(l.title, query));
}

/**
 * HOW FAR BACK THE SEARCH REALLY GOT, said out loud when it is not all of it.
 *
 *  There are 29,703 transcripts on the Mac this was written on, and a name is
 *  only known once the file has been opened, so a search cannot promise every
 *  chat that ever happened. The read goes newest first until its budget is
 *  spent (`readSearchableThreads`, main/importable-threads.mjs) and hands back
 *  the moment it stopped at. A card that printed "No chat with that name" over
 *  a read that gave up in August would be lying by omission, which is the same
 *  silence the zero-pixel scrollbar was keeping. */
export function reachLine(reached: number | null | undefined, now = Date.now()): string {
  const when = Number(reached) || 0;
  if (!when) return '';
  const day = new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Searched back to ${day}.`;
}
