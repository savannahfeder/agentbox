// ⌘K: everything without a dedicated key. Jump to a project, switch views,
// pause the fleet, and start a new project.
//
// "New project…" IS THE FIRST ROW AND SAYS THE APP'S WORD. It used to say "New
// product…" and sit at row 82 of about 82, so typing "project" into ⌘K matched
// nothing: this list filters on a row's own label, and no label in the app
// contained the word people actually use.
//
// The friction it used to carry — type the command, then the name, then confirm
// — is gone from here and lives in the new project card, which asks one thing
// and shows the folder it will make before it makes it.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product, View } from '../types';
import { commandKeys } from '../palette-keys';
import { emptyLine, lookRows, matchesQuery, rankMatches } from '../palette-rows';
import { type Look } from '../skins';
import { NAME } from '../../../shared/product-name.mjs';

interface Command {
  id: string;
  label: string;
  hint?: string;
  // Words she might TYPE that the label does not say. Matched, never shown;
  // the hint is shown, never matched (../palette-rows).
  keywords?: string;
  keyHint?: string;
  run: () => void;
}

export function Palette({ products, supervisorPaused, itemCommands = [], batch = false, order = [], look, onSetLook, onThemes, staleFiles = [], updateReady = null, onInstallUpdate, filtering = false, onOpenFilter, onClearFilter, onView, onPause, onResume, onRankFirst, onOpenProjects, onNewProject, onStanding, onSettings, onShortcuts, panelUp, onTogglePanel, keyHints, onSetKeyHints, onSearch, onFirstRun, onTutorial, onImportAgents, onFreshUser, onDemo, onClose }: {
  products: Product[];
  supervisorPaused: boolean;
  itemCommands?: Command[];
  // Rows are ticked, so every item-acting command means "these ones".
  batch?: boolean;
  // Which of the three she is on, and the one way to change it. A picture is a
  // theme here, not a setting on top of one (skins.ts), so the palette offers
  // all of them by name and there is no second path for light and dark.
  look: Look;
  onSetLook: (look: Look) => void;
  onThemes: () => void;
  // Main-process files that changed since this process read them. The banner
  // that used to announce these is gone; the fact lives here, where it costs
  // nothing to ignore.
  staleFiles?: string[];
  /**
   * The version number of an Agentbox that has already downloaded itself and is
   * waiting for a restart, or null. It is HERE as well as in Settings because
   * Settings is a screen you go to when you want to know something, and this
   * is a thing you would rather be handed than have to go and ask for. It is
   * not on the rail: the rail carries the last few things and no bookkeeping,
   * and that is a standing rule, not an oversight. */
  updateReady?: string | null;
  onInstallUpdate?: () => void;
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
  // Door B: the new project card. The palette no longer names a project
  // itself; it opens the one card that does.
  onNewProject: () => void;
  onStanding: () => void;
  onSettings: () => void;
  /** Settings, opened on the Shortcuts page. */
  onShortcuts: () => void;
  // The shelf, and whose it is. Absent when there is no product to open one
  // for, which is the only state where the command would land nowhere.
  // The product panel: whether it is up, and the way to change that by name.
  panelUp: boolean;
  keyHints: boolean;
  onSetKeyHints: (v: boolean) => void;
  onTogglePanel: () => void;
  // Task search, which also has the corner magnifier and `/`.
  onSearch: () => void;
  /**
   * Set Agentbox up again, from the welcome screen, on the install she already
   * has. It is there to test the first run with. */
  onFirstRun: () => void;
  /**
   * THE TUTORIAL ON ITS OWN: the practice project and the eleven beats, with
   * no setup screens in front of it and no import card after it. The other
   * half of the split; see the rows below for whose words the two labels are.
   * */
  onTutorial: () => void;
  /** The agent import, off the walk and on a card of its own. */
  onImportAgents: () => void;
  onFreshUser: (withAgents: boolean) => void;
  /**
   * The demo inbox: a second Agentbox on an invented studio's work, so a demo
   * does not have to be her own screen. */
  onDemo: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const commands: Command[] = useMemo(() => [
    // The word people use, and at the top.
    //
    // It said "New product…" and sat at row 82 of about 82, which is why typing
    // "project" into ⌘K found nothing at all: the palette filters on a row's
    // own label and no label contained "project". Renaming it is not cosmetic,
    // it is the fix for a door that could not be found by the name it is called.
    //
    // It also stopped being a two-step name-then-confirm prompt of its own. The
    // friction that flow existed for now lives in the card, which asks one
    // thing and shows what it will make before it makes it.
    { id: 'new-project', label: 'New project…', hint: 'name it, and it is yours', run: onNewProject },
    // Actions on the selected item next: the palette is the searchable form
    // of every chord, and the reason no action needs its own memorized key.
    ...itemCommands,
    // FILTERING IS ONE LINE, NOT ONE PER PROJECT (w-aa3fa4cbf0, 2026-09-28).
    // There was a "Go to <project>" row for every project, and with twenty
    // projects those rows fill the whole ⌘K list. One Filter line reaches all of
    // them instead. So this opens the corner's own menu with
    // the keyboard in it, where the projects, priorities and agents already are.
    { id: 'filter', label: 'Filter…', hint: 'Project, priority or agent', run: onOpenFilter },
    ...(filtering ? [{ id: 'clear-filter', label: 'Clear filter', run: onClearFilter }] : []),
    // "WHAT'S NEXT?" USED TO BE HERE, ONE ROW PER PROJECT, AND IT IS GONE
    // (w-d19d6d387c, 2026-09-22). It spawned a session that read a project and
    // filed what it thought should happen next, which is the self-driving half
    // of this app. Code that drives a product on its own was removed entirely
    // and does not come back.
    // The standing rank. A running order is not something to type your way
    // through one step at a time, so the palette offers only the move worth
    // naming: put this project at the top. Everything finer is the Projects
    // page in Settings, where the whole order is visible at once, and the
    // first row here is the door to it.
    ...(onOpenProjects ? [{
      id: 'projects-page',
      label: 'Projects…',
      hint: 'which goes first, names and rules',
      keywords: 'priority order rank reorder sort first top priorities rename project settings',
      run: onOpenProjects,
    }] : []),
    ...products.map((p, i) => ({
      id: `rank-${p.slug}`,
      label: `Rank ${p.name} first`,
      hint: order.includes(p.slug) ? `now #${i + 1} of ${products.length}` : 'not ranked yet',
      run: () => onRankFirst(p.slug),
    })),
    // HOW THE KEY GETS LEARNED. The magnifier in the corner is the door for a
    // hand that has never used this app; this line is where the hand that has
    // finds out it never needs the mouse again. It prints the key rather than
    // describing it, the way every other chord in here does, and it is why ⌘K
    // on its own was not enough to be the entry point.
    { id: 'search', label: 'Search threads', keyHint: '/', run: onSearch },
    // NAMESPACED, because these ids are React keys over a list that filters as
    // she types, and 'done' collided with the item command of the same name.
    // Two entries under one key made React keep a stale row alive through the
    // filter: typing "high" listed "Close This Task" above "Priority: High", a
    // command that was not a match and sat under her return key (found
    // 2026-08-11 while adding the priority entries).
    { id: 'view-inbox', label: 'Inbox', run: () => onView('inbox') },
    { id: 'view-progress', label: 'In progress', run: () => onView('progress') },
    { id: 'view-done', label: 'Closed', run: () => onView('done') },
    // APPEARANCE: the picker, the light/dark toggle, and the two ways to a look
    // that is neither. EVERY ONE OF THEM lives in ../palette-rows, with the
    // reasons they are shaped this way. They are pure so a test can type
    // "dark" into every look and check something comes back, which is the whole
    // of the bug: on a picture, nothing did.
    //
    // Light and dark live here rather than on a button in the corner.
    //
    // THE PICKER ROW USED TO BE ASSEMBLED HERE while its neighbours were
    // assembled next door, and the sixteen picture rows sat under it.
    ...lookRows(look).map((r) => ({
      id: r.id,
      label: r.label,
      hint: r.hint,
      keywords: r.keywords,
      run: r.opens === 'themes' ? onThemes : () => onSetLook(r.to!),
    })),
    // A NEW AGENTBOX, ALREADY ON THE DISK. Above the stale-files row on purpose:
    // that one is about a build somebody is making on this Mac right now, and
    // this one is about the app everybody has. It is only ever here when the
    // download has finished, so pressing it costs a few seconds and nothing
    // else (main/updater.mjs).
    ...(updateReady ? [{
      id: 'update',
      label: `Restart to update ${NAME}`,
      hint: `version ${updateReady} has downloaded · restarting puts you back where you were`,
      keywords: 'update upgrade new version restart',
      run: () => onInstallUpdate?.(),
    }] : []),
    ...(staleFiles.length ? [{
      id: 'stale',
      label: `Restart ${NAME} to pick up main-process changes`,
      hint: `${staleFiles.length} file${staleFiles.length === 1 ? '' : 's'} changed since this one started · ⌘R will not pick them up`,
      run: () => {},
    }] : []),
    {
      id: 'pause',
      label: supervisorPaused ? 'Unpause agents' : 'Pause agents',
      hint: supervisorPaused ? 'sessions will spawn again' : 'no new sessions spawn',
      run: () => onPause(!supervisorPaused),
    },
    // The mass-recovery command: when the plan's usage limit (or a crash)
    // kills every worker at once, this respawns everything left stranded.
    //
    // It stands down while rows are selected, where the batch command above
    // resumes exactly those. Two commands both matching "resum", one acting on
    // her three ticked rows and one on everything that ever stopped, is a
    // choice she should never have to make correctly at speed.
    ...(batch ? [] : [{
      id: 'resume-stopped',
      label: 'Resume interrupted agents',
      hint: 'respawn work stranded by a usage limit or crash',
      run: onResume,
    }]),
    // Rules she writes once that every session is briefed with. It lives here
    // because a rule usually occurs to her mid-triage, watching an agent do the
    // thing she does not want done again.
    //
    // THE LABEL IS "GENERAL AGENT INSTRUCTIONS" (w-3dc46f3a67). What opened
    // this: ⌘K with "stand" in the box and "Nothing matches “stand”" under it.
    // The row said "Your rules…", the filter is a substring over label plus
    // keywords (../palette-rows), and no row in the app contained either word
    // being reached for. "Standing instructions…" was not clear enough, so the
    // name is "general" against "this project", which is what the box on a
    // project's own settings page says.
    //
    // THE SAME WORDS SAY IT IN ALL THREE PLACES, deliberately. This row,
    // the Settings box (../InstructionSettings) and the card's own footer
    // (../Standing) are one file under one name now; two of them disagreeing
    // is what made it impossible to find. What she might TYPE lives in the
    // keywords instead, "standing" and "rules" among them, because a rules
    // file may still call it "Standing instructions", and a hand that learned
    // "Your rules…" must still land.
    {
      id: 'standing',
      label: 'General agent instructions…',
      hint: 'every agent, every task',
      keywords: 'standing instructions rules your my brief guidelines preferences every agent every session tell agents dont do',
      run: onStanding,
    },
    // The other way into settings: the cog in the corner AND ⌘K, because a cog is what a hand finds and ⌘K is what a hand that
    // already knows this app reaches for. A project's own settings are two
    // clicks from here, which is why this is one entry rather than one per
    // project cluttering a list she types into.
    {
      id: 'settings',
      label: 'Settings…',
      hint: 'the workspace, and every project',
      run: onSettings,
    },
    // THE KEYS, BY NAME, BECAUSE ⌘K IS WHERE PEOPLE ARE TAUGHT TO LOOK.
    //
    // It goes straight to the page rather than to Settings' front door. A ⌘K
    // row that lands you one pane away from what you typed is a row that made
    // you look twice.
    //
    // The keywords are what somebody types when they cannot remember the key,
    // which is never the word "shortcuts": it is the key itself, or the word
    // keyboard, or the thing they want to do with it.
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      hint: `every key ${NAME} has`,
      keywords: 'keys keyboard shortcut hotkeys commands cheatsheet help what does press bindings',
      run: onShortcuts,
    },
    // The panel, by name, for the hand that never learned the key. Named for
    // what it does to the screen rather than for the word "sidebar", because
    // that word is the one thing on it that is not on it.
    {
      id: 'panel',
      label: panelUp ? 'Collapse sidebar' : 'Expand sidebar',
      hint: 'what this product is, and what else is open on it',
      keyHint: '\\',
      run: onTogglePanel,
    },
    // The way out of the keyboard hints, and the way back in. Both, and this is
    // the ⌘K half.
    //
    // It says "keyboard shortcut hints" rather than anything shorter because
    // that is what they are called, and this list is typed into: the words
    // someone would reach for are the ones that have to match.
    //
    // The offer was on the last card of the first run and nowhere else, so
    // pressing past it, or installing Claude Code the day after setting Agentbox
    // up, left no way back to it except the row below this one: walk the whole
    // thing again and make a spare project on the way. That is why this sits
    // ABOVE it. Same card, same import, no walk.
    //
    // The old note here was wrong about why: it argued nobody reaches for the
    // bare word "import", but that is the word Claude Code's own docs use for
    // these files, and it is the word people type. "Bring in" was only our
    // phrasing.
    //
    // "bring" and "across" stay in the keywords anyway, because they were the
    // label and somebody who saw it once should still find the row by it.
    {
      id: 'import-agents',
      label: 'Import your Claude Code agents',
      hint: 'the ones already on this Mac · they land in your inbox',
      keywords: 'import agents claude code subagents existing mine bring across add my',
      run: onImportAgents,
    },
    /* * ------------------- THE TUTORIAL, WHICH IS NOT THE ONBOARDING ---------
       TWO ROWS WHERE THERE WAS ONE (w-9a6ea066d6). In a session with a
       non-technical tester, the tester wanted the practice round again and had
       to be told out loud to type "onboarding", and what that gave was the
       wrong thing anyway: the row below this one starts at the welcome screen
       and asks somebody who has used Agentbox for weeks where their code is
       and what to call a project they already have.

       SO THE WORDS ARE THE ONES PEOPLE USE, NOT OURS: "the tutorial" and "the
       onboarding" are two different things, and we had been calling both of
       them the onboarding.

       WHAT TELLS THEM APART IN FOUR WORDS is what each one PUTS ON THE SCREEN. This one
       practises; that one sets up. The hints carry the one fact somebody would want before
       pressing: this one leaves nothing behind, that one leaves a project behind.

       AND THE LABEL SAYS TUTORIAL (w-9a6ea066d6, 2026-08-28). It read "Practise in
       Agentbox", on the argument that tutorial is a word for a thing rather than for doing
       it.

       THE WORD THE WALK TELLS PEOPLE TO TYPE IS THIS LABEL'S. The last card of
       the tutorial now reads "So is this one: type tutorial", so the label has
       to contain that word or the walk is teaching a search that finds nothing.
       tests/the-tutorial-and-the-onboarding-are-two-things.test.mjs holds the
       two against each other for that reason.

       THE KEYWORDS ARE SPLIT AND THE SPLIT IS THE POINT. "tutorial",
       "practice", "practise" (both spellings, since the label now carries
       neither) and "walkthrough" belong here; "onboarding", "first run" and
       "new user" belong below. Typing either word finds exactly ONE row, which
       is the older rule on this list: two rows under one word is a choice
       nobody should have to make correctly at speed.
    */
    {
      id: 'tutorial',
      label: 'Take the tutorial',
      hint: 'a pretend project · nothing is kept',
      /*
       * `agentbox` IS IN HERE BECAUSE IT CAME OUT OF THE LABEL. The row read
         "Practise in the app", so typing the product's name found it; measured
         2026-08-28 on the new label, typing agentbox listed the five other rows
         and not this one. A word that used to find a row and stops finding it
         is a regression whatever the label says. */
      /*
       * `demo` LEFT THIS LIST ON 2026-09-02: there is a row below that is one,
         and typing the word put this row under her return key instead. */
      keywords: 'tutorial practice practise walkthrough walk tour again show me around teach learn training how does this work sandbox lesson',
      run: onTutorial,
    },
    // THE ONBOARDING, AGAIN, ON PURPOSE.
    //
    // `?firstrun=1` has always walked it a second time, and a downloaded app
    // has no address bar to type that into, so until now the only way back to
    // the welcome screen was to throw the install away.
    //
    // THE HINT SAYS WHAT IT COSTS, IN AS FEW WORDS AS THAT TAKES. The walk
    // makes a real project as it goes, because every beat of it is the real app
    // rather than a picture of one, so this leaves her with one more project
    // than she started with. It deletes nothing: a row in this list that
    // quietly emptied a store would be the worst thing in the app.
    //
    // The hint said "the welcome screen and the whole walk · makes a new
    // project as it goes", which is 70 characters of us explaining our own
    // machinery. Every other hint in this list is three or four words. So it
    // says where it puts you and what it leaves behind, and stops. AND IT IS
    // STILL HERE, WHOLE, BECAUSE IT IS NEEDED TO TEST WITH. What moved is its
    // NAME: it said "Run the onboarding again", which is the sentence a tester
    // was read out loud and then given the wrong thing by, because "the
    // onboarding" is the whole first install and what the tester wanted was
    // the practice round. The label now says what it puts on the screen (the
    // setup, again) and "onboarding" stays in the keywords, where it finds
    // exactly this row.
    {
      id: 'first-run',
      label: `Set ${NAME} up again`,
      hint: 'from the welcome screen · makes a project',
      keywords: 'onboarding first run new user welcome intro setup start over from scratch install fresh',
      run: onFirstRun,
    },
    // AND THE WHOLE OF IT: A BRAND NEW USER, NOT JUST THE WALK.The row above is
    // the "at LEAST"; this is the first half.
    //
    // The difference is what each one forgets. The row above forgets that the
    // walk was finished, so the walk runs again inside the Agentbox she already
    // has, with all her projects and settings still around it. This one opens
    // a SECOND Agentbox that has never been set up at all: no projects, no
    // settings, no theme, no store, no config. That is the thing a stranger
    // gets off the website, and there was no way to see it on a downloaded app
    // except to throw the install away.
    //
    // IT OPENS A WINDOW AND IT DELETES NOTHING. Her own Agentbox and every agent
    // in it keep running, which is the property the whole thing rests on
    // (main/fresh-user.mjs). The toast on the way out says so out loud, which
    // is why the hint no longer spends half its length repeating it.
    //
    // AND IT SEES NOTHING OF THE REAL INSTALL. The row was linking ~/.claude
    // through on purpose, so the fresh copy read the Claude Code sessions
    // already running on this Mac and put them in its inbox. Measured with the
    // app's own discovery: sessions found with the folder linked, none without.
    //
    // THERE WAS A SECOND ROW FOR THE OTHER HALF OF THAT AND IT IS GONE, 08-23.
    // ran the same window WITH ~/.claude linked, which is the only way to watch
    // the finish card offer to bring agents over. Three rows about being a new
    // user is a command bar with our test rig in it, and that row was the one
    // nobody but us would ever want. The capability is untouched and still one
    // command away in a terminal: `npm run fresh -- --with-agents`
    // (scripts/fresh-user.mjs). Put the row back only if it is asked for. AN
    // INBOX TO DEMO WITH, WHICH IS NOT THE SAME ROW AS THE ONE BELOW.
    //
    // The row below opens a second Agentbox that has never been set up, which is
    // the right answer for testing a first run and the wrong one for a demo:
    // an empty inbox demonstrates nothing, and the welcome walk is not what she
    // is there to show. This opens the same second Agentbox onto an INVENTED
    // studio: three products nobody has heard of and a day of work, including a
    // question with options under it and something built and waiting on a yes.
    // Her own copy keeps running with every agent in it (main/demo.mjs).
    //
    // THE HINT SAYS THE TWO THINGS SOMEBODY ABOUT TO PRESENT NEEDS TO KNOW: it
    // is not her work on the screen, and hers has not gone anywhere. Every
    // other hint in this list is three or four words and so is this one.
    {
      id: 'demo',
      label: 'Open a demo inbox',
      hint: 'invented work · yours keeps running',
      keywords: 'demo demonstration present presentation pitch investor customer screen share screenshare record video sample fake example stage not mine hide my work',
      run: onDemo,
    },
    {
      id: 'fresh-user',
      label: `Open ${NAME} as a new user`,
      hint: 'nothing set up · yours keeps running',
      keywords: 'new user fresh install stranger onboarding first run clean empty blank test website download nothing of mine agents claude code sessions',
      run: () => onFreshUser(false),
    },
    {
      id: 'keyhints',
      label: keyHints ? 'Turn off keyboard shortcut hints' : 'Turn on keyboard shortcut hints',
      hint: 'the keys a row and the tabs offer, drawn when you point at them',
      run: () => onSetKeyHints(!keyHints),
    },

  ], [itemCommands, batch, products, supervisorPaused, order, onNewProject, filtering, onOpenFilter, onClearFilter, onView, onPause, onResume, onRankFirst, onOpenProjects, onStanding, onSettings, onShortcuts, look, onSetLook, onThemes, staleFiles, updateReady, onInstallUpdate, panelUp, onTogglePanel, keyHints, onSetKeyHints, onSearch, onFirstRun, onTutorial, onImportAgents, onFreshUser, onDemo]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    // Ranked as well as filtered, because a row that merely matches is not the
    // row she meant: "rem" matched Remote Control first and Remind Me second
    // (../palette-rows).
    return rankMatches(q, commands.filter((c) => matchesQuery(q, c)));
  }, [commands, query]);

  // Keys the filtered rows so two lists that share an id cannot leave a stale
  // row alive through the filter (see ../palette-keys).
  const keys = useMemo(() => commandKeys(filtered), [filtered]);

  useEffect(() => setSelected(0), [query]);

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="modal palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            // Clamped at 0 as well as at the end, because with nothing matching
            // there is no last row to stop at and Math.min alone walks to -1.
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.max(0, Math.min(s + 1, filtered.length - 1))); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
            if (e.key === 'Enter' && filtered[selected]) filtered[selected].run();
          }}
        />
        {/* NOTHING MATCHED (w-4ede42cdce). The divider under the input used
            to hang over an empty box. One line sits where a row would, saying
            the sentence task search already says (../palette-rows). */}
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">{emptyLine(query)}</div>}
          {filtered.map((c, i) => (
            <div
              key={keys[i]}
              className={`palette-item ${i === selected ? 'selected' : ''}`}
              onClick={c.run}
              onMouseEnter={() => setSelected(i)}
            >
              <span>{c.label}</span>
              {c.keyHint ? <span className="palette-key">{c.keyHint}</span> : c.hint && <span className="palette-hint">{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
