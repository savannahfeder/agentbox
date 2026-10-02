// EVERY KEY ON THE SHORTCUTS PAGE IS A KEY THE APP REALLY HAS.
//
// Settings has a shortcuts page. It came out of onboarding a non-technical
// tester, where each key had to be said out loud, because Agentbox had a
// switch for whether it whispers its keys and no page anywhere saying what
// they are.
//
// WHY THIS FILE IS THE INTERESTING PART OF THAT WORK. A shortcuts page that is
// missing a key is a nuisance. A shortcuts page that LISTS a key which does
// nothing is much worse: the person it fails is by definition somebody who
// does not know the app, they press the key, nothing happens, and what they
// learn is that this app ignores them. That is the same rule `list-rules.ts`
// keeps for the hint drawn on a row, and it binds harder here, because a hint
// is glanced at and a reference page is believed.
//
// So every cap on that page is checked, below, against the branch that runs
// it — in the right SLICE of App.tsx, not merely somewhere in a 4,500 line
// file, because "the letter E appears in App.tsx" is not evidence of anything.
// The table is exhaustive by construction: the last test walks every cap the
// page draws and fails on any that is not in the table, so a key added to
// ../renderer/src/shortcuts.ts without somebody finding its handler cannot
// reach her screen.
//
// AND THE OMISSIONS ARE PINNED TOO. ⌘1..4 was removed on purpose, first as
// priority and then (2026-10-02) as the sidebar's sections, for Tab. G
// and B are real but gated on an empty inbox. Any of the three would be an
// easy, plausible, wrong addition, so each has a test saying no.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHORTCUTS, everyKey } from '../renderer/src/shortcuts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('renderer/src/App.tsx');
const settings = read('renderer/src/components/Settings.tsx');
const palette = read('renderer/src/components/Palette.tsx');
const compose = read('renderer/src/components/Compose.tsx');
const focus = read('renderer/src/components/Focus.tsx');
// The summary panel owns S in its own capture-phase listener (2026-10-01), so
// that row's handler is here rather than in App.tsx.
const summary = read('renderer/src/threads/Summary.tsx');
const mainProc = read('main/main.mjs');
const css = read('renderer/src/styles.css');

// The window key handler, cut into the three states it actually has. Every
// claim below names which one it is talking about, because the same letter
// means different things in two of them and nothing in a whole-file grep can
// tell them apart.
const HANDLER = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
const FOCUSED = app.indexOf('      if (focused) {');
const LIST = app.indexOf('      switch (e.key) {');
/** Chords and the keys answered before either branch: ⌘K, Tab, ⌘A, / and \. */
const chords = app.slice(HANDLER, FOCUSED);
/** A task open in front of her. */
const focused = app.slice(FOCUSED, LIST);
/** The list, with nothing open. */
const list = app.slice(LIST);

// ---------------------------------------------------------------------------
// THE TABLE. One entry per cap the page draws; each is a list of things that
// must be true of the code, in the slice named. Keep the excerpts verbatim
// from the source, so a refactor that moves a key breaks this loudly rather
// than passing on a regex that happens to still match.
const HANDLED = {
  // --- looking down the inbox ---
  'J': [[list, "case 'j': case 'J':"], [list, 'Math.min(selected + 1']],
  '↓': [[list, "case 'ArrowDown':"]],
  'K': [[list, "case 'k': case 'K':"], [list, 'Math.max(0, selected - 1)']],
  '↑': [[list, "case 'ArrowUp':"]],
  '↵': [[list, "case 'Enter': if (!multiSel.size && pointed)"]],
  // Tab and Shift-Tab walk the tabs along the top of the inbox. They replaced
  // ⌘1 to ⌘4 on 2026-10-02 (w-914b16eab6), which went to a section of the
  // sidebar before those sections became these tabs.
  'tab': [[chords, "if (e.key === 'Tab') {"], [chords, 'setView(nextTab(stateTabOrder, view, e.shiftKey) as View);']],
  '⇧tab': [[chords, "if (e.key === 'Tab') {"], [chords, 'setView(nextTab(stateTabOrder, view, e.shiftKey) as View);']],
  'esc': [
    // One step back out: the document, then the task, then the list.
    [focused, "if (e.key === 'Escape') { if (escapeClosesDoc(openDoc)) closeArtifact(); else setFocused(null); }"],
  ],

  // --- answering an agent ---
  'R': [[focused, "e.key === 'r' || e.key === 'R') { e.preventDefault(); setOpenDoc(null); setModal('reply'); }"], [list, "case 'r': case 'R':"]],
  // The send chord lives in the two boxes she types in, not on the window.
  '⌘↵': [
    [compose, "if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();"],
    [focus, "if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();"],
  ],
  '1': [[focused, "/^[1-9]$/.test(e.key)) pickOption(focused, Number(e.key))"]],
  '9': [[focused, "/^[1-9]$/.test(e.key)) pickOption(focused, Number(e.key))"]],
  // The arrows walk the options, and Enter sends the one showing.
  '⌘Y': [
    [mainProc, "if (key !== 'y' && key !== 'n') return;"],
    [mainProc, "ipc.answerApproval(oldest.id, key === 'y');"],
  ],
  '⌘N': [[mainProc, "if (key !== 'y' && key !== 'n') return;"]],
  // ⌘J shows and hides the open task's terminal (w-ef92663cb1). It sits ABOVE
  // the inInput gate, so it works with her cursor in the reply box, and it
  // toasts rather than going quiet when there is no task to have a terminal.
  '⌘J': [
    [chords, "(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j'"],
    [chords, "window.dispatchEvent(new Event('task-terminal-toggle'));"],
    [chords, "showToast('Open a task to use its terminal');"],
  ],

  // --- getting it off her plate ---
  'E': [
    [focused, "e.key === 'e' || e.key === 'E') { e.preventDefault(); markDone(focused); }"],
    [list, "case 'e': case 'E':"],
    // The clause about Scheduled is a promise about a different branch of the
    // same key, so it is checked as well.
    [list, "if (view === 'snoozed') unsnooze("],
  ],
  // L, NOT S, SINCE 2026-10-01. S opened this picker in the list AND toggled
  // the summary inside a thread, so the page taught one letter for two
  // different things and an office manager testing the app met both inside a
  // minute. One meaning per letter: L is later, S is the summary.
  'L': [[focused, "e.key === 'l' || e.key === 'L') openSnooze(focused)"], [list, "case 'l': case 'L':"]],
  // AND S IS THE ONE ROW ON THE PAGE WHOSE HANDLER IS NOT IN App.tsx. The
  // summary owns its key in its own component, in the capture phase, which is
  // why it beat the window's handler for the day they were both bound. The
  // claim the page makes is "S shows or hides the summary", so the evidence is
  // that hook: the key it reads, and the toggle it calls.
  'S': [
    [summary, "if (e.key !== 's' && e.key !== 'S') return;"],
    [summary, 'if (!e.repeat) onToggle();'],
    [summary, "window.addEventListener('keydown', onKey, true);"],
  ],
  'Z': [[focused, "e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }"], [list, "case 'z': case 'Z': undo(); break;"]],
  '⌘A': [
    [chords, "e.key.toLowerCase() === 'a' && !inInput && !modal"],
    // Pressing it again with everything ticked clears the ticks, which the
    // sentence on the page promises in so many words.
    [chords, 'm.size >= list.length && list.length > 0 ? new Set()'],
  ],

  // --- wherever she is ---
  '⌘K': [[chords, "e.key.toLowerCase() === 'k'"], [chords, "setModal((m) => (m === 'palette' ? null : 'palette'))"]],
  'C': [[focused, "e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('compose'); }"], [list, "case 'c': case 'C': case 'n': case 'N': e.preventDefault(); setModal('compose'); break;"]],
  'N': [[focused, "e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('compose'); }"], [list, "case 'c': case 'C': case 'n': case 'N': e.preventDefault(); setModal('compose'); break;"]],
  '/': [[chords, "if (e.key === '/')"], [chords, 'openSearch();']],
  '\\': [[chords, "if (e.key === '\\\\')"], [chords, 'togglePanel();']],
};

describe('every key the shortcuts page draws is one the app answers', () => {
  for (const [cap, claims] of Object.entries(HANDLED)) {
    it(`${cap} has a handler`, () => {
      for (const [where, excerpt] of claims) expect(where).toContain(excerpt);
    });
  }

  it('checks every cap on the page and nothing is taken on trust', () => {
    const unchecked = [...new Set(everyKey())].filter((k) => !(k in HANDLED));
    expect(unchecked).toEqual([]);
  });

  // The arrows on an open task are the one entry whose sentence names a third
  // key inside itself, so all three halves are checked rather than the cap
  // alone.
  it('the arrows really do walk an agent’s options, and ↵ really sends one', () => {
    expect(focused).toContain("e.key === 'ArrowDown' && opts.length");
    expect(focused).toContain("e.key === 'ArrowUp' && opts.length");
    expect(focused).toContain("e.key === 'Enter') { e.preventDefault(); if (optionSel !== null) pickOption(focused, optionSel); }");
  });

  // J and K keep their meaning inside an open task. The page no longer says so
  // out loud, because that was the tail of a note and the notes are gone, but
  // it is still checked: the J and K rows sit under a heading reading "In your
  // inbox", and what keeps that from being a half truth is that the keys are a
  // SUPERSET there, never a different key somewhere else. If this branch ever
  // stops re-focusing the neighbour, the heading starts lying.
  it('J and K mean the same thing inside an open task as they do in the list', () => {
    expect(focused).toContain("e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K'");
    expect(focused).toContain('if (target) { setFocused(target); markSeen(target); setSelected(next); }');
  });
});

describe('what the page refuses to say', () => {
  // The chord does not fire. Two tooltips in Compose.tsx and Focus.tsx still
  // print it and are simply wrong; a shortcuts page repeating them would
  // promote a stale tooltip into a promise.
  it('does not offer ⌘1 to ⌘4 at all, for priority or for sections', () => {
    // Priority was the first meaning and was removed on purpose. From
    // 2026-09-23 the chord went to a section of the sidebar, and that went on
    // 2026-10-02 (w-914b16eab6) for Tab. Neither may come back unexamined.
    expect(everyKey().filter((c) => /^⌘[1-4]$/.test(c))).toEqual([]);
    expect(app.replace(/^\s*\/\/ ?/gm, '').replace(/\s+/g, ' ')).toContain('it does not fire, so ⌘1..4 is free again');
  });

  // Both WERE real keys and both did nothing at all on almost every screen: G
  // needed the games built in AND an empty inbox, B needed an empty inbox. The
  // page never listed them, and the keys and everything behind them are now
  // deleted, so there is nothing to list. This test stays: it is the guard
  // against either letter coming back unexamined.
  it('does not offer the two keys that were gated on an empty inbox', () => {
    expect(everyKey()).not.toContain('G');
    expect(everyKey()).not.toContain('B');
    expect(list).not.toContain("snap?.config.games");
    expect(list).not.toContain("case 'b': case 'B':");
  });

  // 1, 2 and I answer a Codex conversation's import row and are dead on every
  // other row in the app (w-9741ed0e0b). Gated exactly like G and B, so they
  // are left off for exactly that reason. The row keys were Y and N until
  // w-fb9051e597; Y stays dead, and N now opens a new task. 1 and 2 are on
  // the page already as "pick an option by its number", which is what they
  // do on an import row too.
  it('does not offer the keys that only work on an import row', () => {
    for (const dead of ['Y', 'I']) expect(everyKey()).not.toContain(dead);
    expect(list).toContain('isImportRow(pointed)');
    expect(list).not.toContain("case 'y': case 'Y':");
  });

  // ⇥ inside the new task card really does change the project, and it used to
  // ride along inside the C row's sentence. A key named only in prose cannot be
  // scanned for on a page whose whole promise is a column of keys, so it came
  // off rather than being promoted to a row of its own: it is gated to one card
  // that draws its projects on screen anyway.
  it('does not name ⇥ inside another row’s sentence', () => {
    const prose = SHORTCUTS.flatMap((g) => g.keys.map((k) => k.what)).join(' ');
    expect(prose).not.toContain('⇥');
    expect(compose).toContain("if (e.key === 'Tab')");
  });

  it('says out loud, in the file itself, why each of those is missing', () => {
    const src = read('renderer/src/shortcuts.ts');
    expect(src).toContain('WHAT IS DELIBERATELY NOT HERE');
    expect(src).toContain('⌘1..4');
    expect(src).toContain('Y, N and I on a row in the list');
    expect(src).toContain('⇥ inside the new task card');
  });
});

describe('the page stays a page and not a wall', () => {
  // A DENSE SCREEN IS A FAILED SCREEN. The failure mode of a reference page is
  // to accumulate, one plausible key at a time, until it is the dense screen
  // seven artboards were rejected for. These numbers are the guard rail, and if
  // a later change genuinely needs to cross them that is a design decision
  // rather than an edit here.
  //
  // Density is not row count anyway: the same change made the page 205 points
  // SHORTER carrying two more rows, by cutting every sentence to one and giving
  // them a measure (measured on the built page at 1440 by 1100, 1354 points
  // before and 1149 after).
  // AND THE NUMBERS WENT UP BY ONE ON 2026-10-01, WHICH IS THE DECISION THE
  // PARAGRAPH ABOVE ASKS FOR RATHER THAN AN EDIT AROUND IT.
  //
  // S changed meaning that day. It had opened the schedule picker, and the
  // approved thread top bar prints S on the Summary button, so the one letter
  // did two things and a tester met both inside a minute. Scheduling moved to
  // L, which is the row this page already had, reworded. What was NOT already
  // here is S, and leaving it off is the worse of the two faults this file
  // weighs: somebody who learned S as "put this off" and finds a summary panel
  // instead comes to this page to find out what S is, and the page is the one
  // place in the app that promises to answer that. A nuisance is a missing key;
  // a page that lists a key which does nothing is much worse, and neither of
  // those is "the page is one row longer".
  //
  // So "In a task you have opened" carries seven and the page carries 21. The
  // budget is still a budget: the next key wanting a row has to make the same
  // argument, out loud, here.
  it('is four groups, none of them longer than seven keys', () => {
    expect(SHORTCUTS).toHaveLength(4);
    for (const g of SHORTCUTS) expect(g.keys.length).toBeLessThanOrEqual(7);
    // Rows, not caps: everyKey() flattens the caps and a row can draw two.
    expect(SHORTCUTS.reduce((n, g) => n + g.keys.length, 0)).toBeLessThanOrEqual(21);
  });

  it('groups by when the keys work, not by which handler runs them', () => {
    expect(SHORTCUTS.map((g) => g.label)).toEqual([
      'In your inbox',
      'In a task you have opened',
      'Closing, scheduling and undoing',
      'Anywhere in the app',
    ]);
  });

  // NO FIGURES OF SPEECH IN A HEADING (w-1bc916a880, 2026-09-22, round two).
  //
  // The first four are the idioms that were rejected, plus the ones a later
  // session would most plausibly reach for in their place. This list is not
  // meant to be exhaustive and cannot be; it is here so the specific phrasings
  // that were rejected cannot come back, and so anybody adding a fifth reads
  // the rule above.
  it('uses no figure of speech in a heading', () => {
    const headings = SHORTCUTS.map((g) => g.label.toLowerCase()).join(' | ');
    for (const idiom of [
      'looking down', 'off your plate', 'wherever you are', 'on your plate',
      'at a glance', 'on the go', 'in the flow', 'getting things done',
    ]) {
      expect(headings, `"${idiom}" is a figure of speech`).not.toContain(idiom);
    }
  });

  // AND A HEADING USES ONLY WORDS THE APP ITSELF PRINTS (round three). A term
  // can be accurate about the code and still be one the user has never seen on
  // a screen. Inbox is the first row of the sidebar, so the heading says inbox.
  //
  // The check is the honest way round: every noun a heading uses for a PLACE
  // has to be a place the sidebar draws.
  it('names a place in a heading only if the sidebar draws that place', () => {
    const nav = read('renderer/src/workspace-navigation.mjs');
    const drawn = [...nav.matchAll(/\['[a-z]+', '([^']+)'\]/g)].map((m) => m[1].toLowerCase());
    expect(drawn).toContain('inbox');
    const headings = SHORTCUTS.map((g) => g.label.toLowerCase());
    expect(headings.some((h) => h.includes('inbox'))).toBe(true);
    for (const invented of ['task list', 'work list', 'queue', 'feed', 'dashboard']) {
      expect(headings.join(' | '), `the app never prints "${invented}"`).not.toContain(invented);
    }
  });

  // THE HEADING IS THE ONLY PROSE A GROUP GETS.
  it('gives a group a heading and its keys, and nothing else', () => {
    for (const g of SHORTCUTS) {
      expect(Object.keys(g).sort()).toEqual(['keys', 'label']);
    }
    expect(read('renderer/src/shortcuts.ts')).not.toMatch(/^\s*note\?:/m);
    // Scoped to this pane's own markup: `.set-group-note` is a real class that
    // other panes in Settings still use, so a whole-file search proves nothing.
    const pane = settings.slice(
      settings.indexOf("{pane === 'shortcuts' && ("),
      settings.indexOf("{model && current && ("),
    );
    expect(pane).toContain('set-group-label');
    expect(pane).not.toContain('set-group-note');
    expect(read('renderer/src/styles.css')).not.toContain('.set-keys-page .set-group-note');
  });

  // ONE SHORT SENTENCE A ROW. A row that wants a second idea becomes its own
  // row, or the idea belongs to the group and goes in the group's note.
  it('says each key in one short sentence', () => {
    for (const g of SHORTCUTS) {
      for (const k of g.keys) {
        expect(k.what.length, `${k.keys.join('/')} is too long: ${k.what}`).toBeLessThanOrEqual(70);
      }
    }
  });

  // A key named in prose cannot be scanned for in the column of keys, which is
  // the one thing this page is for. ↵ means two things and now has a row under
  // each of the two moments, which is the honest way to say so.
  it('hides no key inside another row’s sentence', () => {
    const prose = SHORTCUTS.flatMap((g) => g.keys.map((k) => k.what)).join(' ');
    for (const cap of ['⌘', '⇥', '↵', '↑', '↓']) expect(prose).not.toContain(cap);
    const enters = SHORTCUTS.flatMap((g) => g.keys).filter((k) => k.keys.includes('↵'));
    expect(enters).toHaveLength(2);
  });

  // The person this page was built for does not know what a binary, a modal,
  // a pane or a view is. Every sentence on it is checked against the words the
  // app itself never shows her.
  it('uses no word she has not seen on screen', () => {
    const prose = SHORTCUTS.flatMap((g) => g.keys.map((k) => k.what)).join(' ').toLowerCase();
    // Whole words. "Panel" is the app's OWN word for the strip down the right
    // (⌘K: "Show the product panel"), and banning "pane" as a substring would
    // ban the one word the row is obliged to use.
    //
    // "TERMINAL" CAME OFF THIS LIST, AND ONLY BECAUSE THE APP NOW SAYS IT. The
    // rule was never a list of hard words, it is that no row may use a word she
    // has not seen on screen, and since w-ef92663cb1 the app draws Terminal as
    // that panel's own heading and Open Terminal as a ⌘K row. Both are pinned
    // below, so the day either stops being printed this row starts failing
    // again rather than quietly teaching her a word we invented.
    for (const jargon of ['modal', 'binary', 'shell', 'handler', 'keybinding', 'toggle', 'pane', 'view', 'chord']) {
      expect(prose).not.toMatch(new RegExp(`\\b${jargon}s?\\b`));
    }
    if (/\bterminals?\b/.test(prose)) {
      expect(read('renderer/src/components/TaskTerminal.tsx')).toContain('<strong>Terminal</strong>');
      expect(app).toContain("label:'Open Terminal'");
    }
  });

  it('ends every sentence, so nothing on it reads as a fragment', () => {
    for (const g of SHORTCUTS) for (const k of g.keys) expect(k.what.endsWith('.')).toBe(true);
  });
});

describe('she can get to it from both places she looks', () => {
  it('is a page in Settings’ own navigation', () => {
    expect(settings).toContain("['shortcuts', 'Shortcuts'],");
    expect(settings).toContain("{pane === 'shortcuts' && (");
    expect(settings).toContain('<h1 className="set-title">Shortcuts</h1>');
  });

  // ⌘K is where new users are taught to look, which is why this is in both
  // places.
  it('is a ⌘K row, and that row goes straight to the page', () => {
    expect(palette).toContain("id: 'shortcuts',");
    expect(palette).toContain("label: 'Keyboard shortcuts',");
    expect(palette).toContain('run: onShortcuts,');
    expect(app).toContain("onShortcuts={() => { setModal(null); setSettingsPane('shortcuts'); setSettingsOpen(true); }}");
    expect(app).toContain('startPane={settingsPane}');
  });

  // The palette filters on a row's label AND its keywords, and nobody typing
  // for this types the word on the label: they type the key, or "keyboard".
  it('can be found by the words somebody actually types', () => {
    const row = palette.slice(palette.indexOf("id: 'shortcuts',"), palette.indexOf("id: 'shortcuts',") + 400);
    for (const word of ['keys', 'keyboard', 'hotkeys']) expect(row).toContain(word);
  });

  it('does not wait on a settings read it has no use for', () => {
    expect(settings).toContain("{!model && pane !== 'shortcuts' &&");
  });

  // AND DOES NOT WARN ABOUT ONE EITHER (w-1bc916a880, 2026-09-22). `api.ts`
  // answers "quit and reopen agentbox to change settings" when the window has
  // outrun the main process and `settingsRead` is not there to call, and that
  // banner used to draw over every pane. On a pane made of settings it is true
  // and worth saying. On this one it warns about a thing the page was never
  // going to do.
  // Since w-b3e123a0af (2026-09-26) the stale-build note is left unsaid on every
  // pane, because it should not exist at all. A real save failure still reaches
  // the banner.
  it('does not warn about a settings read it never makes', () => {
    expect(settings).toContain("{error && error !== RESTART_NOTE && pane !== 'shortcuts' &&");
    expect(read('renderer/src/api.ts')).toContain('export const RESTART_NOTE =');
  });

  // THE PAGE IS THE TITLE AND THE KEYS.
  it('opens on the first heading, with no lede in front of it', () => {
    const pane = settings.slice(
      settings.indexOf("{pane === 'shortcuts' && ("),
      settings.indexOf("{model && current && ("),
    );
    expect(pane).toContain('<h1 className="set-title">Shortcuts</h1>');
    expect(pane).not.toContain('set-lede');
  });

  // The caps are drawn with the app's own keycap, not a second picture of one.
  it('draws the app’s own keycap', () => {
    expect(css).toContain('.set-key-caps kbd {');
    expect(settings).toContain('<kbd>{k}</kbd>');
  });

  // THE PAGE HAS TWO LEFT EDGES AND ONLY TWO (w-1bc916a880, 2026-09-23). The
  // built page's alignment was visibly off.
  //
  // The caps were right-aligned inside their column so a short cap would land
  // beside its own sentence. Measured in a window 1680 wide: the four headings
  // began at 278 and the first keycap of a row began at eight different
  // offsets, 278 through 369, because each row's caps are a different width.
  // Flush left puts every heading and every cap on one edge and every sentence
  // on the other. The temptation to reach for `flex-end` again is the whole
  // reason this is a test.
  it('sets the caps flush left, on the headings’ own edge', () => {
    const block = css.slice(css.indexOf('.set-key-caps {'), css.indexOf('.set-key-caps kbd {'));
    expect(block).toContain('justify-content: flex-start;');
    expect(block).not.toContain('flex-end');
    // Both columns of the grid are one shared width, which is what makes a
    // single edge possible at all.
    expect(css).toContain('grid-template-columns: max-content minmax(0, 1fr);');
    expect(css).toContain('.set-keys-page .set-group-label { grid-column: 1 / -1; }');
  });
});
