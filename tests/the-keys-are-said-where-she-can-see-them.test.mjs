// THE APP SAYS WHAT ITS KEYS ARE, ON THE ROW AND ON THE TABS.
//
// What was measured on the running app that day, and is the whole reason the
// tab half exists: Tab rotates Inbox, Scheduled, In progress and Closed, and
// nothing in the app said so anywhere. The four tabs carried no title and no
// aria-label. ⌘K had forty-seven lines, ten of which printed a key, and the
// three that switch these very views printed none.
//
// Two things here are worth a test rather than an eye:
//
//   A HINT THAT PRINTS A KEY THE HANDLER DOES NOT HAVE IS WORSE THAN NO HINT.
//   The pairs are a pure function of the view, and every one of them is checked
//   against the branch in App.tsx that actually runs it.
//
//   A HINT DRAWN ON THE ROW UNDER THE POINTER IS A PROMISE ABOUT THAT ROW.
//   The keys used to act on `current`, the row the KEYBOARD is on, which after
//   one click and one escape is very often a different row entirely. Pressing E
//   over a hint that says Close has to close the row the hint is on, or the app
//   closes the wrong task while telling her it will not.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowKeys } from '../renderer/src/list-rules';
import { HINTS, capsFor } from '../renderer/src/hint-plate';
import { DONE } from '../renderer/src/done-word';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const settings = read('renderer/src/components/Settings.tsx');
const palette = read('renderer/src/components/Palette.tsx');
const list = read('renderer/src/components/List.tsx');
const css = read('renderer/src/styles.css');
// The four other files a component can wear `data-hint` in.
const nav1 = read('renderer/src/components/WorkspaceNavigation.tsx');
const terminal = read('renderer/src/components/TaskTerminal.tsx');
const focus = read('renderer/src/components/Focus.tsx');
// The header's right end and the Inbox page's state tabs (approved 2026-10-01).
const pages = read('renderer/src/threads/Pages.tsx');
// The thread's Summary button, which printed its S on its face until
// w-5984544441 and says it in a plate now.
const summary = read('renderer/src/threads/Summary.tsx');

// The list's own key switch, which is the only place the row keys are run.
// Everything above it belongs to modals, chords and full-screen reading.
const listSwitch = app.slice(app.indexOf('      switch (e.key) {'));

// The tab row as it is actually written, so a test about what stands IN it
// cannot be satisfied by something 800 points away in the corner.
const tabNav = () => {
  const start = app.indexOf('<nav\n          className="tabs"');
  return app.slice(start, app.indexOf('</nav>', start));
};

describe('the row prints the keys it really has', () => {
  // AND LATER IS ON AN INBOX ROW TOO SINCE 2026-10-01. These words are only
  // ever drawn while the tutorial is on (`walkRowKeys` narrows them to the
  // beat's own key and List.tsx draws them under a `walk &&` guard), and the
  // tutorial's scheduling beat asks for L on an inbox row. Without this entry
  // that beat drew a card naming a key and left nothing on the row to click.
  // L really does open the picker in the inbox, which is the rule this whole
  // file keeps.
  it('gives the inbox reply, close and later, which are the keys it really has', () => {
    expect(rowKeys('inbox')).toEqual([
      { key: 'R', word: 'Reply' },
      { key: 'E', word: DONE.short },
      { key: 'L', word: 'Later' },
    ]);
  });

  it('never offers reply outside the inbox, because R is inbox-only', () => {
    expect(listSwitch).toMatch(/case 'r': case 'R':.*view === 'inbox'/);
    for (const view of ['snoozed', 'progress', 'done']) {
      expect(rowKeys(view).some((k) => k.key === 'R')).toBe(false);
    }
  });

  it('changes E’s word in Scheduled, where it wakes instead of closing', () => {
    // Same key, opposite event: `case 'e'` unsnoozes in that view and closes in
    // the inbox, so a hint that said "Close" on both would be a lie on one.
    expect(listSwitch).toMatch(/case 'e': case 'E':[\s\S]{0,400}view === 'snoozed'\) unsnooze/);
    expect(rowKeys('snoozed')).toEqual([
      { key: 'E', word: 'Back to inbox' },
      { key: 'L', word: 'Remind me' },
    ]);
  });

  it('offers only Open where E and R do nothing at all', () => {
    for (const view of ['progress', 'done']) {
      expect(rowKeys(view)).toEqual([{ key: '⏎', word: 'Open' }]);
    }
  });

  it('says nothing while rows are ticked, because E is then the batch close', () => {
    // With a selection, `case 'e'` runs batchDone over the ticks and R drops
    // out, so a per-row hint would be naming the wrong target.
    expect(listSwitch).toMatch(/multiSel\.size\) batchDone\(multiSel\)/);
    for (const view of ['inbox', 'snoozed', 'progress', 'done']) {
      expect(rowKeys(view, true)).toEqual([]);
    }
  });

  // L, NOT S, SINCE 2026-10-01, AND IT IS BOTH VIEWS THE PICKER OPENS IN. The
  // key moved because S also toggled the summary inside a thread, so one letter
  // meant two things; the claim is unchanged, which is that the row only prints
  // the key where the handler really answers it. The handler's own condition is
  // `view === 'inbox' || view === 'snoozed'`, so both of those print it and the
  // other two print nothing.
  it('prints L only where the reminder picker opens, and never S', () => {
    expect(listSwitch).toMatch(/case 'l': case 'L':[\s\S]{0,400}view === 'inbox' \|\| view === 'snoozed'/);
    const views = ['inbox', 'snoozed', 'progress', 'done'];
    expect(views.filter((v) => rowKeys(v).some((k) => k.key === 'L'))).toEqual(['inbox', 'snoozed']);
    expect(views.filter((v) => rowKeys(v).some((k) => k.key === 'S'))).toEqual([]);
  });
});

describe('the hint is drawn on the row the keys act on', () => {
  it('reaches the pointer’s row, not the keyboard’s, for every key it prints', () => {
    // `pointed` is the hovered row when there is one and `current` otherwise.
    expect(app).toMatch(/const pointed: WorkItem \| undefined =/);
    expect(app).toMatch(/case 'Enter': if \(!multiSel\.size && pointed\)/);
    expect(app).toMatch(/else if \(pointed && view === 'inbox'\) markDone\(pointed\)/);
    expect(app).toMatch(/case 'r': case 'R': if \(!multiSel\.size && pointed && view === 'inbox'\)/);
    expect(app).toMatch(/else if \(pointed && \(view === 'inbox' \|\| view === 'snoozed'\)\) openSnooze\(pointed\)/);
  });

  it('lets a ticked selection outrank the pointer', () => {
    expect(app).toMatch(/hoveredId && !multiSel\.size \? list\.find/);
  });

  it('hands the list back to the keyboard the moment she walks it', () => {
    // A pointer left resting on row four would otherwise keep hold of R and E
    // for as long as it sits there, and J would close the wrong thing.
    const down = listSwitch.slice(listSwitch.indexOf("case 'j': case 'J':"));
    expect(down.slice(0, 400)).toContain('setHoveredId(null)');
    const up = listSwitch.slice(listSwitch.indexOf("case 'k': case 'K':"));
    expect(up.slice(0, 400)).toContain('setHoveredId(null)');
    // Tab swaps the whole list for the next tab's, so it lets go of the row too.
    expect(app).toMatch(/if \(e\.key === 'Tab'\) \{[\s\S]{0,700}setHoveredId\(null\);/);
  });

  it('gives ⌘K the same row, so the menu cannot mean a different task', () => {
    expect(app).toMatch(/const target = focused \?\? pointed;/);
  });

  it('takes the hover from a pointer that MOVES, never from one that rests', () => {
    expect(list).toContain('onMouseMove={() => { if (hoveredId !== item.id) onHover?.(item.id); }}');
    expect(list).not.toContain('onMouseEnter={() => onHover');
  });

  it('leaves the row’s own right end alone, and hangs a plate off the row', () => {
    // THIS WAS REVERSED, and the reversal is the whole of w-2f7fac6027. The
    // right end used to swap the product and the time for two keycaps while
    // the pointer rested on the row, which was the earlier pick. In use, a
    // pointer resting anywhere kept setting off the shortcuts by accident, so
    // the hint now appears after a delay of a second or two, as a plate around
    // the component rather than a change to the component itself.
    //
    // So the row says exactly what it always said, whatever the pointer does,
    // and the keys arrive on a plate beside it.
    expect(list).not.toContain('hintId === item.id');
    expect(list).toContain("? { 'data-hint': 'row', 'data-hint-text': '.subject' }");
    // What is left inside `.row-end` is the first-run walk, which holds the
    // keyboard and asks for one key on the rows of its own beat. That is not a
    // hover hint, and `walkRowKeys` returns everything when no walk is up, so
    // the guard is what keeps it out of her ordinary list.
    expect(list).toContain('{walk && keysFor(item.id).length ? (');
  });

  it('prints the search results’ keys off the tab underneath, not off the list', () => {
    // Results are grouped and stamped like the inbox whatever tab she searched
    // from, so `view` would promise R on a closed row.
    expect(list).toContain('rowKeys(keyView ?? view');
    expect(app).toMatch(/keyView=\{view\}/);
  });
});

describe('Tab walks the tabs the Inbox draws', () => {
  // ⌘1 TO ⌘4 WENT TO A SECTION OF THE SIDEBAR from 2026-09-23 and were removed
  // on 2026-10-02 (w-914b16eab6), once In progress, Later and Done had become
  // tabs on the Inbox page. Tab walks those, and the hint says so on each one.
  it('reads the strip’s own list, which is what the hint claims', () => {
    expect(app).toMatch(/const stateTabOrder = useMemo\(\(\) => INBOX_TABS\.map\(\(t\) => t\.view\)/);
    expect(app).toContain('setView(nextTab(stateTabOrder, view, e.shiftKey) as View);');
  });

  it('wears the Tab plate on every state tab, and nothing on the sidebar’s Threads row', () => {
    expect(pages).toContain('key={t.view} data-hint="state-tab"');
    expect(HINTS['state-tab'].map((l) => l.key)).toEqual(['⇥']);
    expect(nav1).not.toMatch(/data-tab="inbox" data-hint/);
    expect(app).not.toContain('className="tab-hint');
    expect(app).not.toContain('STRIP_HINTS');
  });
});

// THE SEVEN COMPONENTS THAT CARRY A HINT, AND WHY IT IS SEVEN. Excluded: the
// tick box, the reply pill, the options an agent offered, the open reply box,
// and any other place the app already shows the shortcut. That last clause is
// a rule, and it is what also rules out the search field
// (it prints / at its right end), the command button (the button IS the ⌘ mark)
// and the card asking to run something (it prints ⌘Y and ⌘N beside Allow and
// Deny). Nothing may be added to HINTS without meeting it.
describe('only a component that does not already show its key carries a hint', () => {
  it('wears a data-hint for every id the list knows, and knows every id worn', () => {
    const worn = new Set();
    for (const file of [app, list, nav1, terminal, focus, pages, summary]) {
      // The row writes its own as a spread, because it is only worn in the
      // inbox and only off an ordinary row.
      for (const m of file.matchAll(/data-hint(?:="|': ')([a-z-]+)/g)) worn.add(m[1]);
    }
    // Every id worn is one the list knows.
    for (const id of worn) expect(Object.keys(HINTS), `${id} is worn but has no line`).toContain(id);
    // And every id the list knows is worn. The unworn ⌘2 to ⌘4 lines that were
    // allowed here went with those keys (w-914b16eab6); the state tabs wear
    // the Tab line instead. Anything unworn is a dead line.
    const unworn = Object.keys(HINTS).filter((id) => !worn.has(id));
    expect(unworn).toEqual([]);
  });

  it('says nothing on the four she named', () => {
    // The tick box, the reply pill, the options strip and the open reply box.
    expect(app + list + focus).not.toMatch(/data-hint="(tick|reply|options|send)"/);
    expect(Object.keys(HINTS)).not.toContain('tick');
    expect(Object.keys(HINTS)).not.toContain('reply');
  });

  it('does say something on a BUTTON, even one that prints a key beside itself', () => {
    // THIS REVERSED ON 2026-09-24 and the reversal is narrow. The rule still
    // stands for a component that prints its key as a keycap in its own right:
    // the reply pill, the option rows, the card asking to run something. It was
    // read too widely and swallowed three BUTTONS, which then showed no
    // shortcut at all on hover.
    const near = (file, anchor) => file.slice(Math.max(0, file.indexOf(anchor) - 320), file.indexOf(anchor) + 320);
    expect(near(app, 'className="icon-btn tab-search"')).toContain('data-hint="search"');
    expect(near(app, 'aria-label="Commands"')).toContain('data-hint="commands"');
    // What has NOT changed: the four excluded by name still say nothing.
    expect(app + list + focus).not.toMatch(/data-hint="(tick|reply|options|send)"/);
  });
});

describe('the plate says the key and what it does, in one fragment', () => {
  it('explains itself, because the cap alone said nothing', () => {
    // Round three took the sentence off every button and left the cap alone,
    // and that was rejected: the plate has to explain what the key does.
    for (const lines of Object.values(HINTS)) {
      for (const line of lines) expect(line.what.length).toBeGreaterThan(2);
    }
  });

  it('names the thing the key acts on, and never says "it"', () => {
    // Clarity first: "Open it" becomes "Open task" or "Open agent", and every
    // line is one plain, unidiomatic fragment. A fragment takes no full stop,
    // and a pronoun never says what it stands for.
    for (const lines of Object.values(HINTS)) {
      for (const line of lines) {
        expect(line.what).not.toMatch(/\.$/);
        expect(line.what).not.toMatch(/\bit\b/);
      }
    }
  });

  it('draws a chord as one cap for each key, which is what she picked', () => {
    // A chord drawn as one cap looked cramped next to ordinary shortcuts, so
    // the pick was one cap for each key. This overrules the standing
    // rule in shortcuts.ts that a chord is one cap.
    expect(capsFor('⌘J')).toEqual(['⌘', 'J']);
    expect(capsFor('⌘⌥↓')).toEqual(['⌘', '⌥', '↓']);
    // A single key stays whole however it is written.
    expect(capsFor('esc')).toEqual(['esc']);
    expect(capsFor('E')).toEqual(['E']);
    expect(capsFor('↵')).toEqual(['↵']);
  });
});

// THE MAC'S OWN LABEL. The app draws the key itself, so the system label
// saying it too would be the same fact twice, a second apart, in two hands.
describe('the Mac’s label names the button and nothing more', () => {
  it('leaves the Mac’s label naming the button and nothing more', () => {
    // The key is drawn in the app now, so the system label saying it too would
    // be the same fact twice, a second apart, in two different hands.
    expect(app).toContain('title="Search threads"');
    // w-ec62ab6b38 (2026-09-28): the plus is titled New thread now, not New task.
    expect(app).toContain('title="New thread"');
    expect(app).not.toMatch(/title=\{keyHints \? 'Search threads \(\/\)'/);
    expect(app).not.toMatch(/title=\{keyHints \? 'New (task|thread) \(C\)'/);
  });

  it('says nothing on the cog, which has no key to say', () => {
    const cog = app.slice(app.indexOf('title="Settings"') - 200, app.indexOf('title="Settings"') + 200);
    expect(cog).toContain('title="Settings"');
    expect(cog).not.toContain('data-hint');
  });
});

describe('the keycap is the one the app already draws', () => {
  it('borrows .dock-send’s, down to the square corner', () => {
    const cap = css.match(/\.row-keys kbd, \.tab-hint kbd \{[^}]*\}/s);
    expect(cap, 'no keycap rule').toBeTruthy();
    for (const bit of ['font-size: 11px', 'font-weight: 600', 'border-radius: 0', 'line-height: 16px']) {
      expect(cap[0]).toContain(bit);
    }
  });

  it('stays at the weight of the words it replaces', () => {
    // The product name and the time are --text-faint. The row's right end must
    // not get louder just because she is pointing at it.
    const cap = css.match(/\.row-keys kbd, \.tab-hint kbd \{[^}]*\}/s);
    expect(cap[0]).toContain('color: var(--text-faint)');
    const word = css.match(/\.row-key-word \{[^}]*\}/s);
    expect(word[0]).toContain('color: var(--text-faint)');
    expect(css).toMatch(/\.product \{[^}]*color: var\(--text-faint\)/s);
  });
});


// ONE SWITCH OVER ALL OF IT. The hints can be turned on or off from both the
// settings menu and the ⌘K bar. Two places, one flag, and it covers every
// place the app prints a key at a pointer rather than only the row.
describe('the hints have a way out, in both places she named', () => {
  it('is on for a Mac that has never been asked', () => {
    // Anything at all can be in localStorage, and only the string '0' is off:
    // a machine with nothing stored gets the hints that were approved.
    expect(app).toContain("const HINTS_KEY = 'zero.keyhints'");
    expect(app).toMatch(/useState\(\(\) => localStorage\.getItem\(HINTS_KEY\) !== '0'\)/);
  });

  it('remembers the answer past a quit', () => {
    expect(app).toMatch(/localStorage\.setItem\(HINTS_KEY, v \? '1' : '0'\)/);
  });

  // On General, not beside the theme (w-5737fe67cf), because under Appearance
  // it went unnoticed.
  it('is in the settings menu, on General', () => {
    const general = settings.slice(settings.indexOf("pane === 'general'"), settings.indexOf("pane === 'appearance'"));
    expect(general).toContain('label="Show keyboard shortcut hints"');
    expect(general).toMatch(/on=\{keyHints\} onChange=\{onSetKeyHints\}/);
    expect(settings.slice(settings.indexOf("pane === 'appearance'"))).not.toContain('label="Show keyboard shortcut hints"');
    expect(app).toMatch(/<Settings[\s\S]{0,400}keyHints=\{keyHints\}/);
  });

  it('is in ⌘K, saying which way it is about to go', () => {
    expect(palette).toContain("label: keyHints ? 'Turn off keyboard shortcut hints' : 'Turn on keyboard shortcut hints'");
    // The claim is that App hands this to Palette, and it used to be asked as
    // "within 900 characters of <Palette", which is the same thing only while
    // nobody adds a prop. Two were added above it on 2026-08-28 and this
    // failed having found nothing wrong. Asked exactly now: inside Palette's
    // own opening tag, which cannot drift.
    const open = app.slice(app.indexOf('<Palette'));
    expect(open.slice(0, open.indexOf('/>'))).toContain('onSetKeyHints=');
  });

  it('finds that line from the words she would type', () => {
    // The palette filters on the label and the hint together, so both are
    // written in the words a person would type: "keyboard", "shortcut",
    // "hints", "keys".
    const line = palette.slice(palette.indexOf("id: 'keyhints'"), palette.indexOf("id: 'keyhints'") + 400);
    for (const word of ['keyboard', 'shortcut', 'hints', 'keys']) {
      expect(line.toLowerCase()).toContain(word);
    }
  });

  it('takes the pointer’s hold on the keys with it when it goes off', () => {
    // The keys reach the POINTED row because the pointed row is drawing a
    // promise about them. With the hints off there is no promise and no hover
    // is ever recorded, so `pointed` falls back to `current` and the keyboard
    // owns the list again, which is what the app did before the hints.
    expect(app).toContain('onHover={keyHints ? setHoveredId : undefined}');
    expect(app).toMatch(/if \(!v\) \{ setHoveredId\(null\); setPointedHint\(null\); hints\.current\?\.stop\(\); \}/);
  });
});
