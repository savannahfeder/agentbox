// BRINGING YOUR AGENTS IN, OUTSIDE THE WALK.
//
// The offer existed in exactly one place: the last card of the first run. Skip
// that card, or install Claude Code afterwards, and there was no way back to it
// short of walking the whole setup again. So the card comes off the walk and
// becomes a row in ⌘K, against a project she picks.
//
// Everything here is words and arithmetic, so the card's sentences are tested
// rather than eyeballed on a screen nobody can photograph twice.
//
// AND THEN IT WAS READ.
//
// Two faults, and both of them are answered here rather than on the screen.
//
//   THE FOLDER IS THE PROJECT, AND SHE DOES NOT MAKE IT. The old card found the
//   folder, said so in a sentence, and then asked her to press a word, type a
//   name and press again before a single agent moved. Agentbox already knows the
//   folder and already derives the name from it (`projectNameFor`), so all of
//   that was a form asking her to confirm what it had detected. It is gone. The
//   project is made on the one press that brings the agents in.
//
//   AND THE CARD IS A HIERARCHY, NOT A PARAGRAPH. `destinations` below is the
//   whole of it: one section per inbox the rows can land in, each with a name at
//   the top and its own agents under it. The two-sided switch this card
//   inherited from the walk is gone with it, because out here the sides were
//   never two: they are every folder on the Mac that has agents in it.
//
// The walk's card is untouched. Inside the setup there is exactly one project
// and one folder, so a switch is the right shape there and a list of
// destinations would be a list of one.

import type { AgentFile } from './onboarding';
import { Name } from '../../shared/product-name.mjs';

export interface Project { slug: string; name: string; repoPath: string | null }

/**
 * WHICH PROJECT THE CARD OPENS ON.
 *
 *  The rows land in a project's inbox, so the one thing this card may never do
 *  is guess quietly. It opens on the project the app is already showing — the
 *  inbox filter if one is on, else the project her last task was addressed to —
 *  and the card prints the name in a sentence with the choice under it.
 *
 *  A slug that is not a project any more (a filter left over from one she
 *  deleted) falls through to the next reading rather than opening the card on
 *  nothing. */
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
 * The folder a project's own agents are read out of. Claude Code's project
 *  scope is `<repo>/.claude/agents`, so a project with no code folder has no
 *  project side, which the card says in the walk's own words. */
export function folderOfProject(products: Project[], slug: string | null): string | null {
  return products.find((p) => p.slug === slug)?.repoPath ?? null;
}

export function nameOfProject(products: Project[], slug: string | null): string {
  return products.find((p) => p.slug === slug)?.name ?? '';
}

/**
 * `/Users/you/Desktop/dev/x` → `~/Desktop/dev/x`. The main process folds the
 * paths it finds; a project's own `repoPath` comes off the store unfolded, and
 * a path with her account name in it reads as a system string. */
export function fold(p: string | null): string {
  return (p ?? '').replace(/^\/Users\/[^/]+/, '~');
}

/* --------------------------------- words --------------------------------- */

// Counts are written the way she writes them, because these sentences are read
// once and a digit in the middle of a line reads as a field rather than a fact.
// Past ten a digit is the shorter of two evils.
const WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));

export const CARD = {
  /**
   * The walk's own headline, because it is the same card. The old headlines
   * offered to bring agents across without saying across from where, and to
   * where, and nothing on the card answered that. `COPY.bringHead` in
   * renderer/src/onboarding.ts is the same sentence and moves with it. */
  head: 'Add the agents already on this Mac.',
  /**
   * No project at all and no folder to make one out of. The rows have nowhere
   *  to go, so the card does not draw a button it cannot honour. */
  noProject: 'Make a project first, and your agents can land in its inbox.',
  newProject: 'New project…',
  /**
   * NOTHING ON THE MAC, AND THIS STATE IS NOW THE WALK'S TOO.
   *
   *  The headline is its own, because `head` above promises an import and this
   *  card has none to make. That contradiction — a headline offering agents over
   *  a line saying there are none, was a real screen and
   *  the reason the walk stopped drawing anything at all. The screen was not the
   *  fault; the two sentences disagreeing were.
   *
   *  So it says three things and stops: there is nothing yet, here is where
   *  Agentbox looked, here is how to come back when there is. `noneLater` is the
   *  half that makes this screen worth appearing on an empty Mac at all: it is
   *  the only place somebody who has no agents yet is told that Agentbox takes
   *  them, and where the door is. */
  headNone: 'No agents to bring across yet.',
  /*
   * `none: 'No agent files on this Mac yet.'` was the heading of this block and
     it is deleted, because `headNone` one line above it now says the same thing
     in the place a headline goes. It is in decisions.md, 08-28, verbatim. */
  // IT SAYS IT LOOKED AT CLAUDE CODE AND CODEX TOO (w-ec62ab6b38). It was
  // looking, at the conversations as well as the agent files; the line only
  // ever named the files, so it read as if it had not looked in Claude Code.
  noneWhere: (dir: string) => `No agent files in ${dir} or your project folders, and no recent Claude Code or Codex conversations you started yourself.`,
  noneLater: 'When you have some, press ⌘K and type import.',
  /** In place of `noneWhere` when there is nothing left only because it is all
   *  in already (w-db6f5e331e): "found nothing" would be untrue. */
  allIn: (n: number) => n === 1
    ? 'The one conversation from the last ten days is already in your inbox.'
    : `All ${n} conversations from the last ten days are already in your inbox.`,
  /**
   * AND THE WAY TO ASK AGAIN WITHOUT LEAVING. a tester's case, 2026-08-24, is
   * the one this is for: Claude Code was installed in front of her while the
   * walk was open, and the answer on the screen was read off a Mac that had not
   * had it a minute earlier. A directory listing costs nothing to take twice.
   * */
  lookAgain: 'Look again',
  looking: 'Looking',
  /** The foot, word for word the walk's, because it is the same promise. */
  foot: 'Each one you keep lands in your inbox, and your agent files stay where they are.',
  go: 'Add them',
  reading: 'Reading this Mac…',
};

/* ------------------------- WHERE THE ROWS CAN LAND ------------------------- */

/**
 * A folder on this Mac with agents of its own that no project points at.
 *  Found by `findAgentFolders` in main/agent-files.mjs; `short` is the path with
 *  her account name folded to `~`, and `agents` is what is in it, read by
 *  `readFolderAgents` so the card can list them rather than count them. */
export interface AgentFolder {
  folder: string;
  short: string;
  name: string;
  count: number;
  agents?: AgentFile[];
}

/**
 * ONE INBOX THE ROWS CAN LAND IN, and everything the card draws about it.
 *
 *  `kind` is the only thing that differs between them:
 *    everywhere — her home folder set, which works in every project, so
 *                 something has to choose an inbox and the name is a control.
 *    project    — a project she has, and the agents inside its own folder.
 *    new        — a folder with agents that no project points at. Agentbox makes
 *                 the project when she presses, named after the folder. */
export interface Destination {
  key: string;
  kind: 'everywhere' | 'project' | 'new';
  /** The heading. A project's name, or the name Agentbox will give the new one. */
  name: string;
  /** Null on a project that does not exist yet. */
  slug: string | null;
  /** The folder its agents live in, and the folder a new project will point at. */
  folder: string | null;
  /** The line under the heading: the folder, as she reads it. */
  where: string;
  items: AgentFile[];
  /**
   * The conversations she had in that folder in the last few days. Sections
   *  built before threads existed carry none, so it is optional and every
   *  reader below goes through `picksOf`. */
  threads?: SessionThread[];
}

/**
 * ONE CLAUDE CODE CONVERSATION SHE STARTED HERSELF.
 *
 *  Found by `readSessionThreads` in main/agent-sessions.mjs, which is where
 *  every judgment about what counts lives. `title` is the first thing the user typed
 *  into it, because a terminal transcript has no title of its own; `path` is the
 *  transcript, and it is on this interface for one reason, which is that
 *  everything on this card is ticked by path. */
export interface SessionThread {
  id: string;
  source: 'terminal' | 'desktop' | 'codex';
  folder: string;
  folderName: string;
  short: string;
  title: string;
  when: number;
  path: string;
  /** Already has a row in the inbox, so the card does not offer it again. */
  imported?: boolean;
}

/**
 * EVERYTHING TICKABLE IN A SECTION, agents and threads together, by path.
 *
 *  Every count, every tick and every button on this card goes through here, so
 *  there is no arrangement of the two kinds that can make two of them disagree
 *  about what is on the screen. */
export function picksOf(d: Destination): string[] {
  return [...d.items.map((a) => a.path), ...(d.threads ?? []).map((t) => t.path)];
}

/**
 * How many of each kind a set of sections holds, which is the one thing the
 *  card's sentences need that a list of paths cannot answer. */
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

/* * * THE TWO KINDS IN ONE PHRASE, and never a bare number standing for both. * * "Add all
 thirteen" over four agent files and nine conversations is the same * silence the zero-pixel
 scrollbar was keeping: a number she cannot check * against anything on the screen.
*/
export function kindPhrase({ agents, threads }: { agents: number; threads: number }): string {
  const part = (n: number, one: string) => `${word(n).toLowerCase()} ${one}${n === 1 ? '' : 's'}`;
  if (agents && threads) return `${part(agents, 'agent')} and ${part(threads, 'thread')}`;
  if (threads) return part(threads, 'thread');
  return part(agents, 'agent');
}

/**
 * THE RULE, WRITTEN DOWN ONCE.
 *
 *  Every section below is that rule drawn. A folder's agents appear under the
 *  project that points at that folder and under no other, so there is no arrangement
 *  of ticks on this card that files a folder agent somewhere it would not run.
 *  The home folder set is the one exception and it is not one: those work in
 *  every project, so they are the only section whose inbox is a choice.
 *
 *  A folder no project points at used to be unreachable: agents in a folder
 *  with no project pointing there had no choice on the card that brought them
 *  in. Now it is a section
 *  like any other and the project behind it is made on the press. */
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
  // The names already spoken for, so two folders with the same basename do not
  // both propose the same project and the second press fail on the first's slug.
  const taken = products.map((p) => p.name);
  for (const f of unclaimed(folders, products)) {
    const name = projectNameFor(f, taken);
    taken.push(name);
    out.push({
      key: `new:${f.folder}`, kind: 'new', name, slug: null,
      folder: f.folder, where: f.short, items: f.agents ?? [], threads: [],
    });
  }

  /*
   * THREADS, INTO THE SECTIONS THAT ALREADY EXIST.
   *
   *  A thread has a folder, so the rule above decides where it lands without
   *  being asked twice: the conversations had in a folder belong under the
   *  project that points at that folder, and under no other. Three
   *  cases and they are all the same rule:
   *
   *    a section is already drawn for that folder  →  they go in it
   *    a project of hers points at that folder     →  a section for it
   *    nobody points at it                         →  a new project, on the press
   *
   *  The home folder set is never one of them. Its agents work everywhere, which
   *  is why its inbox is a choice; a conversation happened in one place and has
   *  nothing to choose. */
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
  /**
   * The heading over the home folder set. Not a project name, because it is
   *  not one: it is the scope Claude Code loads in every session it starts. */
  everywhere: 'Every project',
  homeFolder: '~/.claude/agents',
  /**
   * Where the home set lands, and the name is the control that changes it.
   *  Split so the name can be a button in the middle of the sentence. */
  landBefore: 'They work everywhere, so their rows go to',
  landAfter: '.',
  /** Nowhere to put them yet. */
  landNowhere: 'They work everywhere. Make a project and they have an inbox.',
  /**
   * THE BADGE, and it is now the whole of what a folder-turned-project says on
   * a row.
   *
   * It repeated once per section what the badge says in two words and what the
   * foot line says once for the whole press, and a card that repeats itself
   * has too much text on it to read. */
  newBadge: 'New project',
  /** The count on the right of a heading. */
  n: (items: { length: number }) => String(items.length),
};

/**
 * WHAT THE TOAST SAYS AFTER THE PRESS, and it says the two numbers separately
 *  on purpose.
 *
 *  Pressing this a second time is the ordinary case rather than the exception:
 *  the card opens with everything she took last time already ticked, so the
 *  second press is usually all-already. `importAgentRows` files nothing for an
 *  agent that has a row (`agentsNeedingRows`, shared/agent-import.mjs), and a
 *  press that says "Three agents imported" over a store that did not move is
 *  the exact defect the import had before 08-23.
 *
 *  `inboxes` and `made` are the 08-26 half: one press can now file into several
 *  projects and make some of them, and a line naming one inbox out of three
 *  would be the same defect in a new place. */
export function importedLine(
  {
    added = 0, already = 0, name = '', inboxes = 1, made = [], noun = 'agent',
  }: {
    added?: number; already?: number; name?: string; inboxes?: number; made?: string[];
    noun?: string;
  },
): string {
  if (added === 0 && already === 0) return 'Nothing was ticked, so nothing was filed.';
  const many = inboxes > 1;
  const where = name ? ` ${name}` : '';
  if (added === 0) {
    // "That agent" is right on a card that only ever held agent files and wrong
    // the moment a thread can be the thing that already had a row, so `noun` is
    // handed in by the press rather than assumed here.
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

/**
 * Whether the button may be pressed: something ticked, and every section that
 *  has something ticked in it has an inbox to file into. A folder section always
 *  does, because pressing is what makes its project. Stated once so the button
 *  and the ⌘↵ that presses it can never disagree about it. */
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
 * WHAT IS TICKED WHEN THE CHOOSE SCREEN OPENS: nothing.
 *
 *  This used to be everything, narrowed by what she took last time
 *  (`pickedAtOpen`, deleted 2026-08-26 with its `chosen` argument). That was
 *  right on a card with one screen on it. It is wrong now that the first screen
 *  already offers "all", because a choose screen that opens full makes the two
 *  doors do the same thing until she has unticked fourteen rows.
 *
 *  KEYED BY PATH, NOT BY NAME, everywhere below. Two folders on one Mac can both
 *  hold an agent called `code-reviewer`, and with several folders on one card at
 *  once a tick keyed by name would turn one of those on by turning the other on. */

/**
 * Ticking one on or off. Order follows the card rather than the clicking, so
 *  what gets filed reads the same as what she was looking at. */
export function togglePicked(dests: Destination[], picked: string[], path: string): string[] {
  const on = new Set(picked);
  if (on.has(path)) on.delete(path); else on.add(path);
  return dests.flatMap(picksOf).filter((p) => on.has(p));
}

/**
 * THE NAME AGENTBOX GIVES THE PROJECT IT MAKES. A folder is called
 *  `sidecar-desktop` and a project in her sidebar is not, so the separators come
 *  out and the words go up.
 *
 * This used to open a field the user had to type in. The name can be
 * detected from the folder, so the name is now printed as the section's heading and used as it
 * stands.
 *
 *  A folder whose name already carries a capital or a space was named by a
 *  person and is left exactly as they wrote it. */
export function projectNameFor(folder: { name?: string } | null, taken: string[] = []): string {
  const n = (folder?.name ?? '').trim();
  if (!n) return '';
  const base = /[A-Z\s]/.test(n)
    ? n
    : n.replace(/[-_.]+/g, ' ').split(' ').filter(Boolean)
      .map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join(' ');
  // AND IT HAS TO BE A NAME THE STORE WILL ACCEPT. `createProduct` throws on a
  // slug it already has, and with nobody typing the name any more that throw
  // would be the whole press failing on a word she never chose. Two folders
  // called `api` under two roots is the ordinary way to get there.
  const used = new Set(taken.map(slugFor));
  if (!used.has(slugFor(base))) return base;
  for (let i = 2; i < 100; i += 1) {
    if (!used.has(slugFor(`${base} ${i}`))) return `${base} ${i}`;
  }
  return base;
}

/**
 * The store's own slug rule (`createProduct`, main/store.mjs), repeated here
 *  for one reason: two names that differ only in punctuation are one project as
 *  far as the store is concerned, and the card has to know that BEFORE it
 *  presses rather than by catching the throw. */
export function slugFor(name: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/**
 * Which found folders are still worth a section: the ones no project points
 *  at. The main process filters these already, and it is done again here because
 *  a project made ON this card has to drop out the moment it exists, without
 *  waiting for the app to hand a new product list down. */
export function unclaimed(folders: AgentFolder[], products: Project[]): AgentFolder[] {
  const owned = new Set(
    products.map((p) => (p.repoPath ?? '').replace(/\/+$/, '')).filter(Boolean),
  );
  return folders.filter((f) => !owned.has(f.folder.replace(/\/+$/, '')));
}

export { word as countWord };

/* -------------------------------- TWO DOORS -------------------------------- */
// FOUR LOOKS WERE DRAWN AND ALL FOUR WERE REJECTED.
//
// So the card no longer opens on a list at all. It opens on two sentences, and
// picking one of them is the whole of the first screen.
//
//   BRING THEM ALL IN. Every agent on this Mac, every folder a project, in the
//   press. Making a project for each folder is not a second step and never was.
//   What the press is about to do is under the button, in `pressLine`, because a
//   press that makes five projects in the sidebar has to say five first.
//
//   CHOOSE WHICH ONES. ONE screen, never eight. Look 3 was the most readable
//   and it is deleted anyway, because it walked through one project at a time,
//   and nobody pages through eight screens of content.
//
// Do not put a look switcher back. Anything still switchable is something the
// user has to decide again.
//
// STILL MEASURED, STILL TRUE, and both corrections survive into the choose
// screen (scripts/measure-the-import-card-at-scale.mjs, eight folders and
// fifteen agents in the real built renderer): the list scrolled with a scrollbar
// ZERO pixels wide, so five of eight projects sat under a fold nothing on the
// screen mentioned — `totalLine` in the header and the count of what is below
// answer that in words. And bringing in one project took thirteen to fifteen
// presses — the choose screen opens with nothing ticked, so it takes one.

export const DOOR = {
  /** The second door. The first one says its own count, so it is `bringAllLine`. */
  pick: 'Choose which ones',
  pickWhy: 'Pick a whole project, or single agents inside it.',
  /**
   * The promise, under both doors. What a press that makes six projects needs
   *  first is the half that says the user's files are not touched. */
  never: `${Name} never moves your agent files.`,
};

/**
 * THE FIRST DOOR, which has to name the number it is about to act on. "Bring
 *  them all in" over twenty-eight agents she has never seen listed is the same
 *  silence the zero-pixel scrollbar was keeping. */
export function bringAllLine(dests: Destination[]): string {
  const kinds = countKinds(dests);
  const n = kinds.agents + kinds.threads;
  return n === 1 ? `Add the one ${kinds.threads ? 'thread' : 'agent'}` : `Add all ${kindPhrase(kinds)}`;
}

/**
 * WHETHER A WHOLE SECTION IS ON, OFF, OR HALF ON. The tick at the top of a
 *  section has three states because a person who opens a project and unticks one
 *  agent inside it must not see the project's own tick claim everything is on. */
export function sectionState(d: Destination, picked: string[]): 'all' | 'some' | 'none' {
  const mine = picksOf(d);
  if (mine.length === 0) return 'none';
  const on = new Set(picked);
  const n = mine.filter((p) => on.has(p)).length;
  if (n === 0) return 'none';
  return n === mine.length ? 'all' : 'some';
}

/**
 * THE TICK ON A WHOLE PROJECT. Off if any of it is on, on if none of it is:
 *  the half-on state resolves downward, so one press always clears a section she
 *  has been picking at rather than filling it back up. */
export function toggleSection(dests: Destination[], picked: string[], key: string): string[] {
  const d = dests.find((x) => x.key === key);
  if (!d) return picked;
  const on = new Set(picked);
  const mine = picksOf(d);
  const anyOn = mine.some((p) => on.has(p));
  for (const p of mine) { if (anyOn) on.delete(p); else on.add(p); }
  return dests.flatMap(picksOf).filter((p) => on.has(p));
}

/**
 * The choose screen opens with NOTHING ticked, because the other door is
 * already "all", so ticking one project is one press of `toggleSection` and
 * nothing else is on. That is what `onlySection` and its per-row "Only this"
 * used to buy, and they are deleted: a shortcut on every row is a control on
 * every row, and a card with them on it had too much on it. */

/** Everything on the card, and none of it. */
export function allPicked(dests: Destination[]): string[] {
  return dests.flatMap(picksOf);
}

/**
 * WHAT THE CARD SAYS IT HOLDS, above the list and outside the scroll.
 *
 *  This is the line the measurement asked for. With eight folders on the card
 *  five of them were under the fold and nothing on the screen said the number
 *  eight, so a person could press the button believing they had seen all of it.
 *  The total lives in the header, which never scrolls. */
export function totalLine(dests: Destination[]): string {
  const kinds = countKinds(dests);
  const places = dests.length;
  if (kinds.agents + kinds.threads === 0) return '';
  const a = kindPhrase(kinds);
  const p = `${word(places).toLowerCase()} folder${places === 1 ? '' : 's'}`;
  return `${a[0].toUpperCase()}${a.slice(1)} in ${p}.`;
}

/**
 * WHAT THE BUTTON SAYS, which has to name what is really about to happen.
 *  "Bring them in" over three ticked agents out of fifteen is the same lie the
 *  silent scroll was telling. */
export function goLine(dests: Destination[], picked: string[]): string {
  if (picked.length === 0) return 'Nothing ticked';
  return `Add ${kindPhrase(countKinds(dests, picked))}`;
}

/**
 * HOW MANY PROJECTS THIS PRESS WOULD MAKE, said before the press and not
 *  after it. A folder section that has anything ticked in it becomes a project. */
export function willMake(dests: Destination[], picked: string[]): string[] {
  const on = new Set(picked);
  return dests
    .filter((d) => d.kind === 'new' && picksOf(d).some((p) => on.has(p)))
    .map((d) => d.name);
}

/**
 * THE NEWS THE BUTTON IS NOT ALLOWED TO CARRY. How many inboxes this press
 *  touches and how many projects it makes, in one sentence, before the press.
 *  Empty when there is nothing surprising about it. */
export function pressLine(dests: Destination[], picked: string[]): string {
  const on = new Set(picked);
  const inboxes = dests.filter((d) => picksOf(d).some((p) => on.has(p))).length;
  const made = willMake(dests, picked);
  if (inboxes === 0) return '';
  // NOT "THEY LAND IN TWO INBOXES". There is one inbox in this app and the
  // tab is called Inbox, so a line promising two of them describes a product
  // she does not have. What two really means is two projects, which is a word
  // the sidebar already uses beside her eyes.
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
