// ⌘K: everything without a dedicated key. The list filters on each row's label
// and keywords (../palette-rows), so a row is found only by words it contains.

import { cloudCommands, type CloudMode, type CloudStatus } from '../cloud-menu';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Product, ThreadStateWord, View } from '../types';
import { commandKeys } from '../palette-keys';
import { keptPick, nameRank, namesIt, pointerMoved, titleFirst } from '../palette-pick';
import { emptyLine, escapeClosesThePalette, lookRows, matchesQuery, pageRows, rankMatches, walkRows } from '../palette-rows';
import { ICONS, iconFor } from '../palette-glyphs';
import { markedWords } from '../found-inside';
import { ago } from '../format';
import { type Look } from '../skins';
import { type ThemeChoice } from '../theme';
import { NAME } from '../../../shared/product-name.mjs';
import { CHECK_SAY, MOVE_SAY } from '../update-row';
import { closesOnPress } from '../press';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  /** A thread's line under its title: the sentence the query was found in. */
  sub?: string;
  /** A thread's list, which picks its icon (../palette-glyphs). */
  state?: ThreadStateWord;
  // Words she might TYPE that the label does not say. Matched, never shown;
  // the hint is shown, never matched (../palette-rows).
  keywords?: string;
  /** What the row was called before a rename: typing one ranks the row as its label would. Keep them in keywords too. */
  oldNames?: readonly string[];
  /** A word the query must name before the row is offered (../palette-rows). */
  onlyWith?: string;
  /** Not in the list until something is typed (../palette-rows). */
  unlisted?: boolean;
  keyHint?: string;
  run: () => void;
  /** A line, file, comment or decision found inside something: drawn as its words with who and where under. */
  found?: { text: string; file?: string; who: string; at: number; where: string };
  /** A thread's place before its title is weighed (../search SearchHit.lead). */
  lead?: number;
}

/** What was found inside things, a labelled group of rows each (renderer/src/found-inside.ts). */
export interface InsideSection { key: string; label: string; rows: Command[] }
/** The sections, and the threads opened lately the words are inside, which join the threads found. */
export interface PaletteInside { sections: InsideSection[]; threads?: ReadonlyMap<string, string> }
const NOTHING_INSIDE: PaletteInside = { sections: [] };

export function Palette({ products, supervisorPaused, itemCommands = [], batch = false, order = [], look, machine = 'dark', onSetLook, skyThemes = [], onSkyTheme, staleFiles = [], updateReady = null, onInstallUpdate, onCheckUpdate, moveToApplications = false, onMoveToApplications, filtering = false, onOpenFilter, onClearFilter, onView, teamLayout = false, onPause, onResume, onRankFirst, onOpenProjects, onNewProject, onNewThread, onStanding, onSettings, onUsage, onShortcuts, roomsOn = false, groups = [], onGroups, onPickGroup, teamLists, filePages, onConnections, onHome, teammates = null, onTeammates, onPauseTeammate, boardUp = false, onFlipView, keyHints, onSetKeyHints, findThreads, findChats, findInside, onSearchFor, onFirstRun, onTutorial, onEndTutorial, onImportAgents, onDemo, onClose, cloud = null, onCloudMode, open = true, phone = false, typed = '' }: {
  products: Product[];
  supervisorPaused: boolean;
  itemCommands?: Command[];
  // Rows are ticked, so every item-acting command means "these ones".
  batch?: boolean;
  // A picture is a theme here, not a setting on top of one (skins.ts), so every
  // look is offered by name and light and dark have no separate path.
  look: Look;
  // Which way the Mac points, so on Match system the theme row on top is the
  // one that changes what the window shows (palette-rows.ts).
  machine?: ThemeChoice;
  onSetLook: (look: Look) => void;
  /** The sky themes, each a theme of its own; `on` is the one worn. */
  skyThemes?: { id: string; name: string; on: boolean }[];
  onSkyTheme?: (id: string) => void;
  // Main-process files that changed since this process read them.
  staleFiles?: string[];
  /** The version of an update that has downloaded and is waiting for a
   *  restart, or null. */
  updateReady?: string | null;
  onInstallUpdate?: () => void;
  /** Whether this copy is somewhere it cannot update itself from, which is
   *  what the move row answers (shared/where-it-runs-from.mts). */
  moveToApplications?: boolean;
  onMoveToApplications?: () => void;
  /** Look for a new version now. Answers in a toast. */
  onCheckUpdate?: () => void;
  /** Whether the box filter has anything on, which is when "Clear filter" is offered. */
  filtering?: boolean;
  onOpenFilter: () => void;
  onClearFilter: () => void;
  onEndTutorial?: () => void;
  onView: (view: View) => void;
  /** The team's tabs, where Later and Done are columns of In progress. */
  teamLayout?: boolean;
  onPause: (paused: boolean) => void;
  onResume: () => void;
  order?: string[];
  onRankFirst: (slug: string) => void;
  /** Settings, opened on the Projects page, where the running order is set. */
  onOpenProjects?: () => void;
  // Opens the new project card, which does the naming.
  onNewProject: () => void;
  // Opens the new thread card, the same thing N does.
  onNewThread: () => void;
  onStanding: () => void;
  onSettings: () => void;
  /** Settings, opened where what is left of your limit is read. */
  onUsage?: () => void;
  /** Settings, opened on the Shortcuts page. */
  onShortcuts: () => void;
  /** Whether this Mac has the Groups page at all; without it, no group rows. */
  roomsOn?: boolean;
  /** The groups the page's own menu offers, in its order. */
  groups?: readonly { key: string; name: string }[];
  onGroups?: () => void;
  onPickGroup?: (key: string) => void;
  /** What the team has decided and shipped, each list one row. */
  teamLists?: readonly { id: string; title: string; hint?: string; run: () => void }[];
  /** The Files place: every file, then each project's page. */
  filePages?: readonly { id: string; title: string; hint?: string; run: () => void }[];
  onConnections?: () => void;
  /** Absent where there is no Home page, as on a phone. */
  onHome?: () => void;
  /** Your teammates, or null where there are none to have. */
  teammates?: readonly { id: string; name: string; role: string | null; paused?: boolean }[] | null;
  /** 'team' for the team chat, 'roster' for the Teammates tab, or a teammate's id. */
  onTeammates?: (which: string) => void;
  onPauseTeammate?: (id: string, paused: boolean) => void;
  keyHints: boolean;
  onSetKeyHints: (v: boolean) => void;
  // Absent where B does nothing (an open task, a search, the Team page), and
  // then the row is absent too.
  boardUp?: boolean;
  onFlipView?: () => void;
  /** The threads a query finds, best first, with those `findInside` found. Absent, the box finds commands only. */
  findThreads?: (query: string, inside?: ReadonlyMap<string, string>) => Command[];
  /** People, groups, chats and AI teammates a query names, best first (../team/chats-found). */
  findChats?: (query: string) => Command[];
  /** Lines, files, comments and decisions a query finds, a few of each, shown after the threads. */
  findInside?: (query: string) => Promise<PaletteInside>;
  /** Opens the thread search with this query already typed. */
  onSearchFor?: (query: string) => void;
  /** Walks the welcome screen again on this install, to test the first run. */
  onFirstRun: () => void;
  /** The tutorial alone: the practice project, with no setup screens before
   *  it and no import card after it. */
  onTutorial: () => void;
  onImportAgents: () => void;
  /** A second copy on an invented team, for a call (main/demo.mts). */
  onDemo?: () => void;
  onClose: () => void;
  /** The cloud, when this Mac is set up for it; null hides its rows. */
  cloud?: CloudStatus | null;
  onCloudMode?: (mode: CloudMode) => void;
  /** Drawn only while open. */
  open?: boolean;
  /** Words already in the box when it opens (a menu row that means ⌘K's Move to rows). */
  typed?: string;
  /** Drawn for a phone: full screen, threads first, no keys. */
  phone?: boolean;
}) {
  const projects = useMemo(() => products.filter((p) => !p.team?.direct), [products]);
  const commands: Command[] = useMemo(() => [
    // First, and labelled "project" because that is the word people type. Row
    // one by a product decision (tests/her-word-is-project).
    { id: 'new-project', label: 'New project…', run: onNewProject },
    // AND THEN THE THREAD, which was not here at all: typing "new" offered New
    // project, Check for updates, Set up again and Open as a new user, and no
    // way to start a thread. "It is the thing I do most" (power-test-1, issue
    // 22).
    { id: 'new-thread', label: 'New thread', hint: 'ask an agent', keywords: 'task compose write message ask start', keyHint: 'N', run: onNewThread },
    // Actions on the selected item next, so every chord can be searched for.
    ...itemCommands,
    // One Filter row rather than a row per project, which filled the list. It
    // opens the corner's filter menu with the keyboard in it.
    { id: 'filter', label: 'Filter…', hint: 'project, priority or agent', run: onOpenFilter },
    ...(filtering ? [{ id: 'clear-filter', label: 'Clear filter', run: onClearFilter }] : []),
    ...(onEndTutorial ? [{ id: 'end-tutorial', label: 'Skip walkthrough', keywords: 'end the tutorial skip stop hide tips', run: onEndTutorial }] : []),
    // Per project, only "rank first" is offered. The whole order is set on the
    // Projects page, which the next row opens.
    ...(onOpenProjects ? [{
      id: 'projects-page',
      label: 'Projects…',
      hint: 'order, names and rules',
      keywords: 'priority order rank reorder sort first top priorities rename project settings',
      run: onOpenProjects,
    }] : []),
    // MY WORKSPACE SAYS WHAT IT IS (w-04e8d6d6e6). The app makes it at launch
    // so that a thread always has somewhere to go (main/main.mts), and a new
    // user meets it here as a project they never made, with nothing on the row
    // to say so. Its hint says what it is until it is ranked, after which
    // where it stands is the more useful thing to say.
    // A conversation with a teammate is kept as a record too, and is not a project.
    ...projects.map((p, i) => ({
      id: `rank-${p.slug}`,
      label: `Rank ${p.name} first`,
      hint: order.includes(p.slug) ? `now #${i + 1} of ${projects.length}`
        : p.personal ? 'made for you'
        : 'not ranked yet',
      run: () => onRankFirst(p.slug),
    })),
    // The cloud on or off, with its key, then each meaning of on (C).
    ...(cloud && onCloudMode ? cloudCommands(cloud).map((r, i) => ({
      id: i === 0 ? 'cloud-toggle' : `cloud-${r.mode}`, label: r.label, hint: r.hint, keyHint: r.keyHint, onlyWith: r.onlyWith,
      keywords: 'cloud where threads run mac overflow everything move on off',
      run: () => onCloudMode(r.mode),
    })) : []),
    // Namespaced so they cannot share an id with an item command such as
    // 'done'. Ids become React keys, and a duplicate kept a stale row alive
    // through the filter (../palette-keys).
    // Above Inbox, as in the sidebar, and so "home" lands here although Inbox answers to it too.
    ...(onHome ? [{ id: 'view-home', label: 'Go to Home', keywords: 'start overview', run: onHome }] : []),
    ...pageRows({ team: teamLayout }).map((r) => ({ id: r.id, label: r.label, keywords: r.keywords, run: () => onView(r.view) })),
    // THE OTHER PAGE, AND EVERY GROUP ON IT (w-326fb83c0e). ⌘K found nothing
    // for "rooms", "groups" or "messages", so the only way onto the page was
    // the top bar's own menu. The old name is in the keywords: this was Rooms
    // until 2026-10-23 and that is what somebody who has used it still types.
    ...(roomsOn && onGroups ? [{
      id: 'view-groups',
      label: 'Go to Groups',
      hint: 'people you work with',
      keywords: 'rooms room groups group chat channel messages message dm dms direct teammates team people together',
      oldNames: ['rooms'],
      run: onGroups,
    }] : []),
    // One row per group, by its own name, as the projects above are. No hint:
    // eight rows each saying "group" down the right edge is noise, and the row
    // over them says what they are.
    ...(roomsOn && onPickGroup ? groups.map((g) => ({
      id: `group-${g.key}`,
      label: g.name,
      keywords: `rooms room groups chat channel messages dm ${g.name}`,
      run: () => onPickGroup(g.key),
    })) : []),
    ...(teamLists ?? []).map((l) => ({
      id: `team-list-${l.id}`, label: l.title, hint: l.hint,
      keywords: l.id === 'shipped' ? 'shipped live released launched what went out this week' : `decisions decided decision pinned priorities ${l.title}`, run: l.run,
    })),
    ...(filePages ?? []).map((l) => ({
      id: `files-${l.id}`, label: l.title, hint: l.hint,
      keywords: `files file documents docs pictures images films videos decks slides pdfs designs shared ${l.title}`, run: l.run,
    })),
    ...(onConnections ? [{
      id: 'view-connections', label: 'Go to Connections', hint: 'tools your agents reach',
      keywords: 'connections connect tools linear integrations sign in apps', run: onConnections,
    }] : []),
    ...(teammates && onTeammates ? [
      { id: 'view-teammates', label: 'Go to Teammates', hint: 'the team chat', keywords: 'teammates team chat agents standing jobs', run: () => onTeammates('team') },
      { id: 'new-teammate', label: 'New teammate', hint: 'asks what to do', keywords: 'teammate agent hire add make create start describe', run: () => onTeammates('new') },
      ...teammates.map((t) => ({ id: `teammate-${t.id}`, label: t.name, hint: t.role ?? 'teammate', keywords: `teammate ${t.name} ${t.role ?? ''}`, run: () => onTeammates(t.id) })),
      ...(onPauseTeammate ? teammates.map((t) => ({
        id: `teammate-pause-${t.id}`, label: `${t.paused ? 'Resume' : 'Pause'} ${t.name}`,
        hint: t.paused ? 'wakes on schedule again' : 'wakes when you write',
        keywords: `teammate pause resume stop hold ${t.name}`, run: () => onPauseTeammate(t.id, !t.paused),
      })) : []),
    ] : []),
    // Every appearance row is built in ../palette-rows, which is pure so a test
    // can type into every look.
    // While a sky theme is worn every plain theme is somewhere else to go.
    ...(skyThemes.some((k) => k.on)
      ? [...new Map([...lookRows('light', machine), ...lookRows('ember-grid', machine)].map((r) => [r.id, r])).values()]
      : lookRows(look, machine)).map((r) => ({
      id: r.id,
      label: r.label,
      hint: r.hint,
      keywords: r.keywords,
      run: () => onSetLook(r.to!),
    })),
    ...skyThemes.filter((k) => !k.on).map((k) => ({
      id: `theme-sky-${k.id}`,
      label: `Theme: ${k.name}`,
      hint: 'theme',
      keywords: `theme themes sky ${k.name.toLowerCase()}`,
      run: () => onSkyTheme?.(k.id),
    })),
    // Above the stale-files row, which only concerns a build on this machine.
    // Shown only once the download has finished (main/updater.mts).
    ...(updateReady ? [{
      id: 'update',
      label: `Restart to update ${NAME}`,
      hint: `version ${updateReady} is ready`,
      keywords: 'update upgrade new version restart',
      run: () => onInstallUpdate?.(),
    }] : []),
    // A copy run from the disk image, or from a copy macOS made, can never
    // update itself. This row is here as well as on the sidebar card because
    // that card can be closed (shared/where-it-runs-from.mts).
    ...(moveToApplications ? [{
      id: 'update-move',
      label: MOVE_SAY.button,
      hint: 'cannot update from here',
      keywords: 'update upgrade move applications folder disk image read-only stuck',
      run: () => onMoveToApplications?.(),
    }] : []),
    // Hidden while an update is waiting, so two update rows never sit side by
    // side. It answers in a toast, in the Settings row's words (../update-row).
    ...(updateReady ? [] : [{
      id: 'update-check',
      label: CHECK_SAY.check,
      hint: 'look for one now',
      keywords: 'update upgrade new version release newest restart',
      run: () => onCheckUpdate?.(),
    }]),
    ...(staleFiles.length ? [{
      id: 'stale',
      label: `Restart ${NAME} to pick up main-process changes`,
      hint: `${staleFiles.length} file${staleFiles.length === 1 ? '' : 's'} changed`,
      run: () => {},
    }] : []),
    {
      id: 'pause',
      label: supervisorPaused ? 'Unpause agents' : 'Pause agents',
      hint: supervisorPaused ? 'sessions will spawn again' : 'no new sessions spawn',
      run: () => onPause(!supervisorPaused),
    },
    // Hidden while rows are ticked, where the batch command resumes just those,
    // so "resum" never finds two rows that act on different sets.
    ...(batch ? [] : [{
      id: 'resume-stopped',
      label: 'Resume interrupted agents',
      hint: 'after limits or crashes',
      run: onResume,
    }]),
    // Rules every session is briefed with. The label is the same in the
    // Settings box (../InstructionSettings) and the card's footer (../Standing).
    // The old names, "Standing instructions" and "Your rules", live on in the
    // keywords so they still find it.
    {
      id: 'standing',
      label: 'General agent instructions…',
      hint: 'every agent, every task',
      keywords: 'standing instructions rules your my brief guidelines preferences every agent every session tell agents dont do',
      oldNames: ['standing instructions', 'your rules'],
      run: onStanding,
    },
    // WHAT IS LEFT OF YOUR LIMIT, BY NAME. It is read on the Claude pane, where
    // the accounts are; typing "usage" used to find nothing anywhere in ⌘K.
    ...(onUsage ? [{
      id: 'usage',
      label: 'Usage and limits',
      hint: 'what is left',
      keywords: 'usage limit limits left remaining quota tokens cost spend plan subscription accounts',
      run: onUsage,
    }] : []),
    // One entry, not one per project: a project's settings are two clicks on.
    // The keywords are what is ON a Settings pane, because the label is one
    // word and the word somebody types is usually the thing they want to
    // change (Settings' own search, ../settings-search, has the rest).
    {
      id: 'settings',
      label: 'Settings…',
      hint: 'workspace and every project',
      keywords: 'settings preferences options usage limits accounts account sign in theme appearance look phone cloud permissions agents rooms groups alpha codex claude',
      run: onSettings,
    },
    // Opens the Shortcuts page itself, not Settings' front page. The keywords
    // are what someone types who cannot remember the key.
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      hint: `every key ${NAME} has`,
      keywords: 'keys keyboard shortcut hotkeys commands cheatsheet help what does press bindings',
      run: onShortcuts,
    },
    // Named for the view it takes you to.
    ...(onFlipView ? [{
      id: 'flip-view',
      label: boardUp ? 'Show as a list' : 'Show as a board',
      keywords: 'view board list columns kanban switch toggle',
      keyHint: 'B',
      run: onFlipView,
    }] : []),
    // Its own row, so reaching the import does not mean walking the onboarding
    // again; that is why it sits above the onboarding row. "bring" and "across"
    // stay in the keywords from the old label.
    // Both halves stay short: at 39 and 73 characters this was the longest
    // label and the longest hint in the palette, and it wrapped onto two lines
    // each. tests/a-palette-row-never-stacks-onto-two-lines holds the ceiling.
    {
      id: 'import-agents',
      label: 'Import chats and agents',
      hint: 'Claude Code or Codex',
      keywords: 'import agents claude code codex conversations threads sessions subagents existing mine bring across add my recent older chat find search by name title past old',
      run: onImportAgents,
    },
    // The walkthrough practises and keeps nothing; the onboarding row below sets
    // up and leaves a project. The keywords are split so each word finds only
    // one of the two rows.
    {
      id: 'tutorial',
      label: 'Start the walkthrough',
      hint: 'nothing is kept',
      keywords: 'tutorial practice practise walkthrough walk tour again show me around teach learn training how does this work sandbox lesson',
      run: onTutorial,
    },
    // The onboarding again, on this install. A downloaded app has no address bar
    // for `?firstrun=1`. The walk makes a real project, which the hint says; it
    // deletes nothing.
    {
      id: 'first-run',
      label: `Set ${NAME} up again`,
      hint: 'makes a project',
      keywords: 'onboarding first run new user welcome intro setup start over from scratch install fresh',
      run: onFirstRun,
    },
    // Offered only once "demo" is typed, so it is not in everybody's list
    // (tests/a-demo-copy-opens-from-command-k).
    ...(onDemo ? [{
      id: 'demo',
      label: 'Open a demo copy',
      hint: 'an invented team · yours keeps running',
      keywords: 'demo demonstration present presentation onboarding call customer screen share sample example',
      onlyWith: 'demo',
      unlisted: true,
      run: onDemo,
    }] : []),
    {
      id: 'keyhints',
      label: keyHints ? 'Turn off keyboard shortcut hints' : 'Turn on keyboard shortcut hints',
      hint: 'shown when you point',
      keywords: 'keys keyboard shortcut hints',
      run: () => onSetKeyHints(!keyHints),
    },

  ], [itemCommands, batch, projects, supervisorPaused, order, onNewProject, onNewThread, filtering, onOpenFilter, onClearFilter, onView, teamLayout, onPause, onResume, onRankFirst, onOpenProjects, onStanding, onSettings, onShortcuts, look, machine, onSetLook, skyThemes, onSkyTheme, staleFiles, updateReady, onInstallUpdate, moveToApplications, onMoveToApplications, boardUp, onFlipView, keyHints, onSetKeyHints, onFirstRun, onTutorial, onEndTutorial, onImportAgents, onDemo, cloud, onCloudMode]);
  // The walkthrough's ⌘K is a short list, with the rest a word away.
  const drawn = useMemo(() => (onEndTutorial ? walkRows(commands) : commands), [onEndTutorial, commands]);
  return open ? <PaletteBox commands={drawn} findThreads={findThreads} findChats={findChats} findInside={findInside} onSearchFor={onSearchFor} onClose={onClose} phone={phone} typed={typed} /> : null;
}

/** How many threads the box lists under the commands before "See all". */
export const THREADS_SHOWN = 5;

/** The thread rows a query adds under the matching commands: the best few,
 *  then one row that opens the full search when there are more. */
export function threadRows(query: string, findThreads?: (q: string) => Command[], onSearchFor?: (q: string) => void): Command[] {
  const q = query.trim();
  if (!q || !findThreads) return [];
  const found = findThreads(q);
  const rows = found.slice(0, THREADS_SHOWN);
  if (found.length > THREADS_SHOWN && onSearchFor) {
    rows.push({ id: 'all-threads', label: `See all ${found.length} threads`, run: () => onSearchFor(q) });
  }
  return rows;
}

// The box itself, mounted fresh each time ⌘K opens, so it starts empty and focused.
/** Commands about the Mac or its keyboard, which a phone has neither of. */
export const NOT_ON_A_PHONE = ['keyhints', 'shortcuts', 'stale', 'update', 'update-check', 'update-move', 'first-run', 'tutorial', 'demo', 'import-agents', 'open-terminal', 'remote-control', 'flip-view'];

/** Whether the people and groups go ahead of the threads: when the words name one of them better
 *  than any thread title (../palette-pick nameRank), or as well and its name begins with them. */
export function peopleLead(query: string, people: readonly Command[], threads: readonly Command[]): boolean {
  const best = (rows: readonly Command[]) => Math.min(...rows.filter((r) => r.id !== 'all-threads').map((r) => nameRank(query, r.label)));
  const p = best(people);
  const t = best(threads);
  return p < t || (p === t && p <= 1);
}

/** The rows in the order drawn, and the label over the row each section starts
 *  at. A phone searches threads more than it runs commands, so they go first. */
// These replace the whole screen, so a word that merely touches a hidden keyword
// must not reach them.
const ASKED_FOR_BY_NAME = new Set(['first-run']);

export function paletteOrder(all: Command[], threads: Command[], phone = false, query = '', chats = 0): { rows: Command[]; labels: Map<number, string> } {
  const labels = new Map<number, string>();
  // The first `chats` of `threads` are the people and groups found.
  const people = threads.slice(0, chats);
  const rest = threads.slice(chats);
  const sections = peopleLead(query, people, rest)
    ? [{ rows: people, label: 'People and groups' }, { rows: rest, label: 'Threads' }]
    : [{ rows: rest, label: 'Threads' }, { rows: people, label: 'People and groups' }];
  const found = sections.flatMap((s) => s.rows);
  const heads = (at: number) => {
    for (const s of sections) {
      if (s.rows.length) labels.set(at, s.label);
      at += s.rows.length;
    }
  };
  // Ahead of the threads only when the words start words of its name: "sum up"
  // is not "reSUMe interrUPted agents". A name it had before a rename counts.
  const named = (c: Command) => namesIt(query, c.label) || (c.oldNames ?? []).some((n) => namesIt(query, n));
  // A group or teammate under People and groups is not listed again as a command.
  const listed = new Set(people.map((c) => c.id.replace(/^chat-/, '')));
  const matched = all.filter((c) => !listed.has(c.id) && (!ASKED_FOR_BY_NAME.has(c.id) || !query.trim() || named(c)));
  // "Waits on <that thread>" names a thread the words name, so it stays below
  // that thread unless its label starts with them.
  const said = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const namedTitles = found.filter((t) => namesIt(query, t.label)).map((t) => said(t.label));
  const carriesANamedTitle = (c: Command) => namedTitles.some((t) => said(c.label).includes(t));
  const ahead = (c: Command) => named(c) && (!carriesANamedTitle(c) || said(c.label).startsWith(said(query)));
  if (!phone) {
    // A command the words only touch by keyword comes after the threads they found.
    if (found.length && query.trim()) {
      const first = matched.filter(ahead);
      const after = matched.filter((c) => !ahead(c));
      heads(first.length);
      if (after.length) labels.set(first.length + found.length, 'Commands');
      return { rows: [...first, ...found, ...after], labels };
    }
    if (found.length) heads(matched.length);
    return { rows: [...matched, ...found], labels };
  }
  if (found.length) {
    heads(0);
    if (matched.length) labels.set(found.length, 'Commands');
  }
  return { rows: [...found, ...matched], labels };
}

function RowIcon({ row }: { row: Command }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[iconFor(row)].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

// The box itself, mounted fresh each time ⌘K opens, so it starts empty and focused.
function PaletteBox({ commands, findThreads, findChats, findInside, onSearchFor, onClose, phone = false, typed = '' }: { commands: Command[]; findThreads?: (q: string, inside?: ReadonlyMap<string, string>) => Command[]; findChats?: (q: string) => Command[]; findInside?: (q: string) => Promise<PaletteInside>; onSearchFor?: (q: string) => void; onClose: () => void; phone?: boolean; typed?: string }) {
  const [query, setQuery] = useState(typed);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only a key moves the list to the pick; a pointer is already over it.
  const byKey = useRef(false);

  useEffect(() => inputRef.current?.focus(), []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => escapeClosesThePalette(window, () => closeRef.current()), []);

  const offered = useMemo(() => (phone ? commands.filter((c) => !NOT_ON_A_PHONE.includes(c.id)) : commands), [commands, phone]);
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offered.filter((c) => !c.unlisted);
    // Ranked as well as filtered, so "rem" puts Remind Me above Remote Control
    // (../palette-rows).
    return rankMatches(q, offered.filter((c) => matchesQuery(q, c)));
  }, [offered, query]);
  const chats = useMemo(() => (query.trim() && findChats ? findChats(query.trim()) : []), [query, findChats]);
  // Found inside things comes from main a moment after the words are typed. The
  // last answer stays up until the next lands, so the list does not blink.
  const [inside, setInside] = useState<PaletteInside>(NOTHING_INSIDE);
  const askInside = useRef(findInside);
  askInside.current = findInside;
  useEffect(() => {
    const q = query.trim();
    if (!q || !askInside.current) { setInside(NOTHING_INSIDE); return; }
    let live = true;
    const timer = setTimeout(() => { void askInside.current?.(q).then((got) => { if (live) setInside(got); }).catch(() => {}); }, 90);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  const threads = useMemo(() => {
    const find = findThreads && ((q: string) => findThreads(q, inside.threads));
    return [...chats, ...titleFirst(threadRows(query, find, onSearchFor), query)];
  }, [chats, query, findThreads, onSearchFor, inside.threads]);
  const { rows: found, labels: foundLabels } = useMemo(() => paletteOrder(matched, threads, phone, query, chats.length), [matched, threads, phone, query, chats.length]);
  const filtered = useMemo(() => [...found, ...inside.sections.flatMap((s) => s.rows)], [found, inside.sections]);
  const labels = useMemo(() => {
    const all = new Map(foundLabels);
    let at = found.length;
    for (const s of inside.sections) { all.set(at, s.label); at += s.rows.length; }
    return all;
  }, [foundLabels, found, inside.sections]);
  const isThread = (c: Command) => c.id.startsWith('thread-') || c.id === 'all-threads';

  // Unique keys, so two lists sharing an id cannot leave a stale row alive
  // through the filter (../palette-keys).
  const keys = useMemo(() => commandKeys(filtered), [filtered]);

  // A pick the person made is a row, not a place: a list that re-sorts or
  // grows under it (a new snapshot, the found-inside rows) keeps that row
  // picked, and Enter opens the row drawn as picked. Until they make one, the
  // pick is the top row, so a thread opened lately that main found a moment
  // later takes it.
  const selected = keptPick(pickedKey, keys);
  const pick = (i: number) => setPickedKey(keys[i] ?? null);
  // Chromium sends a pointer event when a list moves under a still pointer.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => setPickedKey(null), [query]);
  useEffect(() => {
    if (!byKey.current) return;
    byKey.current = false;
    listRef.current?.querySelector('.palette-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className={`modal-backdrop palette-backdrop${phone ? ' palette-on-phone' : ''}`} {...closesOnPress(onClose)}>
      <div className={`modal palette palette-k${phone ? ' palette-phone' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="palette-query">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4L14 14" /></svg>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={phone ? 'Search' : findThreads ? 'Search threads or type a command…' : 'Type a command…'}
            enterKeyHint="go"
            onKeyDown={(e) => {
              // Clamped at 0 as well as at the end, because with nothing matching
              // there is no last row to stop at and Math.min alone walks to -1.
              if (e.key === 'ArrowDown') { e.preventDefault(); byKey.current = true; pick(Math.max(0, Math.min(selected + 1, filtered.length - 1))); }
              if (e.key === 'ArrowUp') { e.preventDefault(); byKey.current = true; pick(Math.max(0, selected - 1)); }
              if (e.key === 'Enter' && filtered[selected]) filtered[selected].run();
            }}
          />
          {phone
            ? <button type="button" className="palette-cancel" onClick={onClose}>Cancel</button>
            : <button type="button" className="palette-esc" aria-label="Close" onClick={onClose}>esc</button>}
        </div>
        <div className="palette-list" ref={listRef} role="listbox" aria-label="Results">
          {filtered.length === 0 && <div className="palette-empty">{emptyLine(query)}</div>}
          {filtered.map((c, i) => (<Fragment key={keys[i]}>
            {labels.has(i) && <div className="palette-section">{labels.get(i)}</div>}
            <div
              className={`palette-item ${isThread(c) ? 'palette-thread ' : ''}${c.found ? 'palette-found ' : ''}${!phone && c.sub ? 'palette-two ' : ''}${i === selected ? 'selected' : ''}`}
              role="option"
              aria-selected={i === selected}
              onClick={c.run}
              onMouseMove={(e) => {
                const at = { x: e.clientX, y: e.clientY };
                const moved = pointerMoved(lastPointer.current, at);
                lastPointer.current = at;
                if (moved && i !== selected) pick(i);
              }}
            >
              <span className="palette-glyph" aria-hidden="true"><RowIcon row={c} /></span>
              {c.found
                ? <span className="palette-text">
                  <span className="palette-label">
                    {c.found.file && <span className="palette-file">{c.found.file}</span>}
                    {markedWords(c.found.text, query.trim()).map((run, j) => (run.hit ? <b className="hit" key={j}>{run.text}</b> : <span key={j}>{run.text}</span>))}
                  </span>
                  <span className="palette-sub">{[c.found.who, c.found.where === c.found.who ? '' : c.found.where, c.found.at ? ago(c.found.at) : ''].filter(Boolean).join(' · ')}</span>
                </span>
                : phone
                ? <span className="palette-text"><span className="palette-label">{c.label}</span>{isThread(c) && c.hint && <span className="palette-sub">{c.hint}</span>}</span>
                : c.sub
                ? <span className="palette-text"><span className="palette-label">{c.label}</span><span className="palette-sub">{markedWords(c.sub, query.trim()).map((run, j) => (run.hit ? <b className="hit" key={j}>{run.text}</b> : <span key={j}>{run.text}</span>))}</span></span>
                : <span className="palette-label">{c.label}</span>}
              {!phone && (c.keyHint ? <span className="palette-key">{c.keyHint}</span> : c.hint && <span className="palette-hint">{c.hint}</span>)}
            </div>
          </Fragment>))}
        </div>
      </div>
    </div>
  );
}
