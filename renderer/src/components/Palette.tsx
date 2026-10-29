// ⌘K: everything without a dedicated key. The list filters on each row's label
// and keywords (../palette-rows), so a row is found only by words it contains.

import { cloudCommands, type CloudMode, type CloudStatus } from '../cloud-menu';
import { chord } from '../this-keyboard';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Product, View } from '../types';
import { DONE } from '../done-word';
import { commandKeys } from '../palette-keys';
import { emptyLine, lookRows, matchesQuery, rankMatches } from '../palette-rows';
import { glyphFor } from '../palette-glyphs';
import { type Look } from '../skins';
import { type ThemeChoice } from '../theme';
import { NAME } from '../../../shared/product-name.mjs';
import { CHECK_SAY, MOVE_SAY } from '../update-row';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  // Words she might TYPE that the label does not say. Matched, never shown;
  // the hint is shown, never matched (../palette-rows).
  keywords?: string;
  keyHint?: string;
  run: () => void;
}

export function Palette({ products, supervisorPaused, itemCommands = [], batch = false, order = [], look, machine = 'dark', onSetLook, staleFiles = [], updateReady = null, onInstallUpdate, onCheckUpdate, moveToApplications = false, onMoveToApplications, filtering = false, onOpenFilter, onClearFilter, onView, onPause, onResume, onRankFirst, onOpenProjects, onNewProject, onNewThread, onStanding, onSettings, onUsage, onShortcuts, roomsOn = false, groups = [], onGroups, onPickGroup, teammates = null, onTeammates, onPauseTeammate, boardUp = false, onFlipView, keyHints, onSetKeyHints, onSearch, findThreads, onSearchFor, onFirstRun, onTutorial, onImportAgents, onFreshUser, onDemo, onClose, cloud = null, onCloudMode, open = true, phone = false }: {
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
  // Main-process files that changed since this process read them.
  staleFiles?: string[];
  /** The version of an update that has downloaded and is waiting for a
   *  restart, or null. */
  updateReady?: string | null;
  onInstallUpdate?: () => void;
  /** Whether this copy is somewhere it cannot update itself from, which is
   *  what the move row answers (shared/where-it-runs-from.mjs). */
  moveToApplications?: boolean;
  onMoveToApplications?: () => void;
  /** Look for a new version now. Answers in a toast. */
  onCheckUpdate?: () => void;
  /** Whether the box filter has anything on, which is when "Clear filter" is offered. */
  filtering?: boolean;
  onOpenFilter: () => void;
  onClearFilter: () => void;
  onView: (view: View) => void;
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
  onSearch: () => void;
  /** The threads a query finds, best first. Absent, the box finds commands only. */
  findThreads?: (query: string) => Command[];
  /** Opens the thread search with this query already typed. */
  onSearchFor?: (query: string) => void;
  /** Walks the welcome screen again on this install, to test the first run. */
  onFirstRun: () => void;
  /** The tutorial alone: the practice project, with no setup screens before
   *  it and no import card after it. */
  onTutorial: () => void;
  onImportAgents: () => void;
  onFreshUser: (withAgents: boolean, withTools?: boolean) => void;
  /** Opens a second Agentbox on an invented studio's work, for demos. */
  onDemo: () => void;
  onClose: () => void;
  /** The cloud, when this Mac is set up for it; null hides its rows. */
  cloud?: CloudStatus | null;
  onCloudMode?: (mode: CloudMode) => void;
  /** Drawn only while open. */
  open?: boolean;
  /** Drawn for a phone: full screen, threads first, no keys. */
  phone?: boolean;
}) {
  const commands: Command[] = useMemo(() => [
    // First, and labelled "project" because that is the word people type. Row
    // one by a product decision (tests/her-word-is-project).
    { id: 'new-project', label: 'New project…', hint: 'name it, and it is yours', run: onNewProject },
    // AND THEN THE THREAD, which was not here at all: typing "new" offered New
    // project, Check for updates, Set up again and Open as a new user, and no
    // way to start a thread. "It is the thing I do most" (power-test-1, issue
    // 22).
    { id: 'new-thread', label: 'New thread', hint: 'ask an agent for something', keywords: 'task compose write message ask start', keyHint: 'N', run: onNewThread },
    // Actions on the selected item next, so every chord can be searched for.
    ...itemCommands,
    // One Filter row rather than a row per project, which filled the list. It
    // opens the corner's filter menu with the keyboard in it.
    { id: 'filter', label: 'Filter…', hint: 'Project, priority or agent', run: onOpenFilter },
    ...(filtering ? [{ id: 'clear-filter', label: 'Clear filter', run: onClearFilter }] : []),
    // Per project, only "rank first" is offered. The whole order is set on the
    // Projects page, which the next row opens.
    ...(onOpenProjects ? [{
      id: 'projects-page',
      label: 'Projects…',
      hint: 'which goes first, names and rules',
      keywords: 'priority order rank reorder sort first top priorities rename project settings',
      run: onOpenProjects,
    }] : []),
    // MY WORKSPACE SAYS WHAT IT IS (w-04e8d6d6e6). The app makes it at launch
    // so that a thread always has somewhere to go (main/main.mjs), and a new
    // user meets it here as a project they never made, with nothing on the row
    // to say so. Its hint says what it is until it is ranked, after which
    // where it stands is the more useful thing to say.
    ...products.map((p, i) => ({
      id: `rank-${p.slug}`,
      label: `Rank ${p.name} first`,
      hint: order.includes(p.slug) ? `now #${i + 1} of ${products.length}`
        : p.personal ? 'made for you, so a thread always has somewhere to go'
        : 'not ranked yet',
      run: () => onRankFirst(p.slug),
    })),
    // Prints its key, so someone who uses the corner magnifier learns `/`.
    { id: 'search', label: 'Search threads', keyHint: '/', run: onSearch },
    // The cloud on or off, with its key, then each meaning of on (C).
    ...(cloud && onCloudMode ? cloudCommands(cloud).map((r, i) => ({
      id: i === 0 ? 'cloud-toggle' : `cloud-${r.mode}`, label: r.label, hint: r.hint, keyHint: r.keyHint,
      keywords: 'cloud where threads run mac overflow everything move on off',
      run: () => onCloudMode(r.mode),
    })) : []),
    // Namespaced so they cannot share an id with an item command such as
    // 'done'. Ids become React keys, and a duplicate kept a stale row alive
    // through the filter (../palette-keys).
    { id: 'view-inbox', label: 'Inbox', run: () => onView('inbox') },
    { id: 'view-progress', label: 'In progress', run: () => onView('progress') },
    // The tab this opens says Done, and so does the key, the row's chip and
    // the button (../done-word). This row said Closed.
    { id: 'view-done', label: DONE.short, run: () => onView('done') },
    // THE OTHER PAGE, AND EVERY GROUP ON IT (w-326fb83c0e). ⌘K found nothing
    // for "rooms", "groups" or "messages", so the only way onto the page was
    // the top bar's own menu. The old name is in the keywords: this was Rooms
    // until 2026-10-23 and that is what somebody who has used it still types.
    ...(roomsOn && onGroups ? [{
      id: 'view-groups',
      label: 'Groups',
      hint: 'the people you work with, and what they are on',
      keywords: 'rooms room groups group chat channel messages message dm dms direct teammates team people together',
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
    ...(teammates && onTeammates ? [
      { id: 'view-teammates', label: 'Teammates', hint: 'the team chat', keywords: 'teammates team chat agents standing jobs', run: () => onTeammates('team') },
      { id: 'new-teammate', label: 'New teammate', hint: 'it asks you what to take on', keywords: 'teammate agent hire add make create start describe', run: () => onTeammates('new') },
      ...teammates.map((t) => ({ id: `teammate-${t.id}`, label: t.name, hint: t.role ?? 'teammate', keywords: `teammate ${t.name} ${t.role ?? ''}`, run: () => onTeammates(t.id) })),
      ...(onPauseTeammate ? teammates.map((t) => ({
        id: `teammate-pause-${t.id}`, label: `${t.paused ? 'Resume' : 'Pause'} ${t.name}`,
        hint: t.paused ? 'it wakes for its schedule and the team again' : 'it wakes only when you write to it',
        keywords: `teammate pause resume stop hold ${t.name}`, run: () => onPauseTeammate(t.id, !t.paused),
      })) : []),
    ] : []),
    // Every appearance row is built in ../palette-rows, which is pure so a test
    // can type into every look.
    ...lookRows(look, machine).map((r) => ({
      id: r.id,
      label: r.label,
      hint: r.hint,
      keywords: r.keywords,
      run: () => onSetLook(r.to!),
    })),
    // Above the stale-files row, which only concerns a build on this machine.
    // Shown only once the download has finished (main/updater.mjs).
    ...(updateReady ? [{
      id: 'update',
      label: `Restart to update ${NAME}`,
      hint: `version ${updateReady} has downloaded · restarting puts you back where you were`,
      keywords: 'update upgrade new version restart',
      run: () => onInstallUpdate?.(),
    }] : []),
    // A copy run from the disk image, or from a copy macOS made, can never
    // update itself. This row is here as well as on the sidebar card because
    // that card can be closed (shared/where-it-runs-from.mjs).
    ...(moveToApplications ? [{
      id: 'update-move',
      label: MOVE_SAY.button,
      hint: `${NAME} cannot update itself from where it is now`,
      keywords: 'update upgrade move applications folder disk image read-only stuck',
      run: () => onMoveToApplications?.(),
    }] : []),
    // Hidden while an update is waiting, so two update rows never sit side by
    // side. It answers in a toast, in the Settings row's words (../update-row).
    ...(updateReady ? [] : [{
      id: 'update-check',
      label: CHECK_SAY.check,
      hint: `look now instead of waiting for ${NAME} to look on its own`,
      keywords: 'update upgrade new version release newest restart',
      run: () => onCheckUpdate?.(),
    }]),
    ...(staleFiles.length ? [{
      id: 'stale',
      label: `Restart ${NAME} to pick up main-process changes`,
      hint: `${staleFiles.length} file${staleFiles.length === 1 ? '' : 's'} changed since this one started · ${chord('⌘R')} will not pick them up`,
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
      hint: 'respawn work stranded by a usage limit or crash',
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
      run: onStanding,
    },
    // WHAT IS LEFT OF YOUR LIMIT, BY NAME. It is read on the Claude pane, where
    // the accounts are; typing "usage" used to find nothing anywhere in ⌘K.
    ...(onUsage ? [{
      id: 'usage',
      label: 'Usage and limits',
      hint: 'what is left of your week',
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
      hint: 'the workspace, and every project',
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
      hint: 'from Claude Code or Codex · recent or by name',
      keywords: 'import agents claude code codex conversations threads sessions subagents existing mine bring across add my recent older chat find search by name title past old',
      run: onImportAgents,
    },
    // The tutorial practises and keeps nothing; the onboarding row below sets
    // up and leaves a project. The walk's last card says "type tutorial", so
    // this label must contain that word
    // (tests/the-tutorial-and-the-onboarding-are-two-things.test.mjs). The
    // keywords are split so each word finds only one of the two rows, and
    // "demo" is left to the demo row.
    {
      id: 'tutorial',
      label: 'Take the tutorial',
      hint: 'a pretend project · nothing is kept',
      keywords: 'tutorial practice practise walkthrough walk tour again show me around teach learn training how does this work sandbox lesson',
      run: onTutorial,
    },
    // The onboarding again, on this install. A downloaded app has no address bar
    // for `?firstrun=1`. The walk makes a real project, which the hint says; it
    // deletes nothing.
    {
      id: 'first-run',
      label: `Set ${NAME} up again`,
      hint: 'from the welcome screen · makes a project',
      keywords: 'onboarding first run new user welcome intro setup start over from scratch install fresh',
      run: onFirstRun,
    },
    // A second Agentbox on an invented studio's work, so a demo does not show
    // the user's own. Their copy keeps running (main/demo.mjs).
    {
      id: 'demo',
      label: 'Open a demo inbox',
      hint: 'invented work · yours keeps running',
      keywords: 'demo demonstration present presentation pitch investor customer screen share screenshare record video sample fake example stage not mine hide my work',
      run: onDemo,
    },
    // A second Agentbox that has never been set up, in its own window. It
    // deletes nothing and does not link ~/.claude, so the real install's
    // sessions stay out of it (main/fresh-user.mjs). With agents is
    // `npm run fresh -- --with-agents`.
    {
      id: 'fresh-user',
      label: `Open ${NAME} as a new user`,
      hint: 'nothing set up · yours keeps running',
      keywords: 'new user fresh install stranger onboarding first run clean empty blank test website download nothing of mine agents claude code sessions setup plan codex chatgpt not installed',
      // Claude Code stays visible to the new copy: most new users have a plan,
      // and hiding it made the app say they had none.
      run: () => onFreshUser(false),
    },
    {
      id: 'keyhints',
      label: keyHints ? 'Turn off keyboard shortcut hints' : 'Turn on keyboard shortcut hints',
      hint: 'the keys a row and the tabs offer, drawn when you point at them',
      run: () => onSetKeyHints(!keyHints),
    },

  ], [itemCommands, batch, products, supervisorPaused, order, onNewProject, onNewThread, filtering, onOpenFilter, onClearFilter, onView, onPause, onResume, onRankFirst, onOpenProjects, onStanding, onSettings, onShortcuts, look, machine, onSetLook, staleFiles, updateReady, onInstallUpdate, moveToApplications, onMoveToApplications, boardUp, onFlipView, keyHints, onSetKeyHints, onSearch, onFirstRun, onTutorial, onImportAgents, onFreshUser, onDemo, cloud, onCloudMode]);
  return open ? <PaletteBox commands={commands} findThreads={findThreads} onSearchFor={onSearchFor} onClose={onClose} phone={phone} /> : null;
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
/** Commands about the Mac or its keyboard, which a phone has neither of, and
 *  Search threads, which the phone's field already is. */
export const NOT_ON_A_PHONE = ['search', 'keyhints', 'shortcuts', 'stale', 'update', 'update-check', 'update-move', 'first-run', 'fresh-user', 'demo', 'tutorial', 'import-agents', 'open-terminal', 'remote-control', 'flip-view'];

/** The rows in the order drawn, and the label over the row each section starts
 *  at. A phone searches threads more than it runs commands, so they go first. */
export function paletteOrder(matched: Command[], threads: Command[], phone = false): { rows: Command[]; labels: Map<number, string> } {
  const labels = new Map<number, string>();
  if (!phone) {
    if (threads.length) labels.set(matched.length, 'Threads');
    return { rows: [...matched, ...threads], labels };
  }
  if (threads.length) {
    labels.set(0, 'Threads');
    if (matched.length) labels.set(threads.length, 'Commands');
  }
  return { rows: [...threads, ...matched], labels };
}

// The box itself, mounted fresh each time ⌘K opens, so it starts empty and focused.
function PaletteBox({ commands, findThreads, onSearchFor, onClose, phone = false }: { commands: Command[]; findThreads?: (q: string) => Command[]; onSearchFor?: (q: string) => void; onClose: () => void; phone?: boolean }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only a key moves the list to the pick; a pointer is already over it.
  const byKey = useRef(false);

  useEffect(() => inputRef.current?.focus(), []);

  const offered = useMemo(() => (phone ? commands.filter((c) => !NOT_ON_A_PHONE.includes(c.id)) : commands), [commands, phone]);
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offered;
    // Ranked as well as filtered, so "rem" puts Remind Me above Remote Control
    // (../palette-rows).
    return rankMatches(q, offered.filter((c) => matchesQuery(q, c)));
  }, [offered, query]);
  const threads = useMemo(() => threadRows(query, findThreads, onSearchFor), [query, findThreads, onSearchFor]);
  const { rows: filtered, labels } = useMemo(() => paletteOrder(matched, threads, phone), [matched, threads, phone]);
  const isThread = (c: Command) => c.id.startsWith('thread-') || c.id === 'all-threads';

  // Unique keys, so two lists sharing an id cannot leave a stale row alive
  // through the filter (../palette-keys).
  const keys = useMemo(() => commandKeys(filtered), [filtered]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    if (!byKey.current) return;
    byKey.current = false;
    listRef.current?.querySelector('.palette-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className={`modal-backdrop palette-backdrop${phone ? ' palette-on-phone' : ''}`} onClick={onClose}>
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
              if (e.key === 'Escape') onClose();
              // Clamped at 0 as well as at the end, because with nothing matching
              // there is no last row to stop at and Math.min alone walks to -1.
              if (e.key === 'ArrowDown') { e.preventDefault(); byKey.current = true; setSelected((s) => Math.max(0, Math.min(s + 1, filtered.length - 1))); }
              if (e.key === 'ArrowUp') { e.preventDefault(); byKey.current = true; setSelected((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter' && filtered[selected]) filtered[selected].run();
            }}
          />
          {phone
            ? <button type="button" className="palette-cancel" onClick={onClose}>Cancel</button>
            : <button type="button" className="palette-esc" aria-label="Close" onClick={onClose}>esc</button>}
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && <div className="palette-empty">{emptyLine(query)}</div>}
          {filtered.map((c, i) => (<Fragment key={keys[i]}>
            {labels.has(i) && <div className="palette-section">{labels.get(i)}</div>}
            <div
              className={`palette-item ${isThread(c) ? 'palette-thread ' : ''}${i === selected ? 'selected' : ''}`}
              onClick={c.run}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="palette-glyph" aria-hidden="true">{glyphFor(c)}</span>
              {phone
                ? <span className="palette-text"><span className="palette-label">{c.label}</span>{isThread(c) && c.hint && <span className="palette-sub">{c.hint}</span>}</span>
                : <span className="palette-label">{c.label}</span>}
              {!phone && (c.keyHint ? <span className="palette-key">{c.keyHint}</span> : c.hint && <span className="palette-hint">{c.hint}</span>)}
            </div>
          </Fragment>))}
        </div>
        {!phone && <div className="palette-foot" aria-hidden="true"><span><b>↑ ↓</b> move</span><span><b>↵</b> select</span></div>}
      </div>
    </div>
  );
}
