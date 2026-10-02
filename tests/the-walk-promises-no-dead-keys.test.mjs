// A KEY DRAWN ON A BUTTON IN THE WALK HAS TO DO SOMETHING.
//
// `<kbd>⌘O</kbd>` sat on the Choose a folder button and nothing
// in the renderer, the main process or the app menu ever listened for that
// key, so the hint promised a way through that did not exist. It is gone.
//
// MEASURED THE SAME MORNING, one line below it on the same screen: with a
// folder already chosen and Next live, ⌘↵ also did nothing. That one was wired
// rather than removed, because the walk's own rule is that Enter carries it
// end to end without reaching for the mouse.
//
// What is pinned here is the rule and not the two bugs: every key the setup
// screens DRAW is a key the walk HANDLES.

import { describe, expect, it } from 'vitest';
import { COACHED, coach } from '../renderer/src/onboarding.ts';
import { rowKeys, walkRowKeys } from '../renderer/src/list-rules.ts';
import { workspaceDestinations } from '../renderer/src/workspace-navigation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DONE } from '../renderer/src/done-word';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = read('renderer/src/components/Onboarding.tsx');

// What the screens actually DRAW. The comments are stripped first, because
// this file explains the two dead keys at length and the explanation is worth
// keeping; what may not come back is the key on the screen.
const drawn = walk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Every key the screens draw, in source order. One shape: the <kbd> on a
// button. The bare `.fr-key` that round four left in the corner of a setup
// card is gone, because round eight made that corner a real button instead
// (see the block at the foot of this file). `{say.key}` is not a drawn key: it
// is the coach card printing whatever the beat's own key is, and those are
// checked against the app below.
const hints = [
  ...[...drawn.matchAll(/<kbd>([^<{]+)<\/kbd>/g)].map((m) => m[1]),
  ...[...drawn.matchAll(/className="fr-key"[^>]*>([^<]+)</g)].map((m) => m[1]),
];

describe('the setup screens promise no key they do not handle', () => {
  it('draws no ⌘O anywhere, because nothing has ever listened for it', () => {
    expect(drawn).not.toContain('⌘O');
    expect(hints).not.toContain('⌘O');
  });

  it('leaves the Choose a folder button with no keyboard hint on it', () => {
    const button = drawn.slice(drawn.indexOf('className="fr-pick"'));
    const end = button.indexOf('</button>');
    expect(button.slice(0, end)).not.toContain('<kbd>');
  });

  it('draws only keys the walk listens for', () => {
    // Enter, alone or with the command key. Nothing else is handled anywhere
    // in this component, so nothing else may be drawn.
    for (const hint of hints) expect(['↵', '⌘↵']).toContain(hint);
  });

  it('handles ↵ on the folder screen, which is the key it now draws', () => {
    // w-ec62ab6b38 (2026-09-28): the folder screen is a list; ↵ takes the lit row, or opens the chooser on the last one.
    expect(walk).toContain("if (run.step !== 'folder' || recent === null) return;");
    expect(walk).toMatch(/e\.key === 'Enter'[\s\S]{0,80}if \(lit < rows && recent\[lit\]\) takeFolder\(recent\[lit\]\.folder\);\s*else pickFolder\(\);/);
    // And the arrows the list implies are handled too.
    expect(walk).toMatch(/e\.key === 'ArrowDown'[\s\S]{0,60}setLit\(/);
    expect(walk).toMatch(/e\.key === 'ArrowUp'[\s\S]{0,60}setLit\(/);
    // Taking a folder is moving on to the name.
    expect(walk).toMatch(/const takeFolder = \(picked: string\) => \{[\s\S]{0,120}onStep\('name'\);/);
  });

  it('draws no Next button on either setup card, and no rule across one', () => {
    const setup = drawn.slice(drawn.indexOf("run.step === 'folder'"), drawn.lastIndexOf("run.step === 'name'"));
    expect(setup).not.toContain('fr-foot');
    expect(setup).not.toContain('COPY.next');
    // And `.fr-foot` is off the whole walk now: it belonged to the agents
    // screen, and that screen was folded into the finish card on 08-23.
    expect(drawn).not.toContain('fr-foot');
  });
});

// AND THE RULE READ THE OTHER WAY ROUND: A THING DRAWN AS A BUTTON IS ONE.
//
// Round four took the Command-Enter button off these cards and left a bare ↵
// in the corner where it had been. Enter really did work, so the rule above
// was satisfied, and the screen was still lying: the ↵ sat in a bordered box
// the size and shape of a button, and clicking it did nothing. Both setup
// cards had it. What is pinned here is that each corner now holds a real
// button that does the same thing that screen's Enter does.
describe('the corner of a setup card is a button, not a picture of a key', () => {
  it('draws no bare key in either setup card corner any more', () => {
    expect(drawn).not.toContain('fr-key');
  });

  it('gives the folder card rows that are buttons and go where Enter goes, and no Submit', () => {
    // w-ec62ab6b38 (2026-09-28): a click on a row is the answer, so the folder card lost its Submit.
    // The folder card's JSX runs from its own test to the name card's, which is
    // the next block in the file. `lastIndexOf` because the name step is also
    // named higher up, in the effect that focuses the field, and the first hit
    // would run the slice backwards and come out empty.
    const folder = drawn.slice(drawn.lastIndexOf("run.step === 'folder' && ("), drawn.lastIndexOf("run.step === 'name'"));
    expect(folder).not.toContain('fr-submit');
    expect(folder).not.toContain('COPY.submit');
    // Each recent folder is a real button, and so is the chooser row under them.
    expect(folder).toMatch(/className=\{`fr-folder\$\{[\s\S]*?onClick=\{\(\) => takeFolder\(f\.folder\)\}/);
    expect(folder).toMatch(/className=\{`fr-folder fr-folder-other[\s\S]*?onClick=\{pickFolder\}/);
    // And Enter does the same two things the rows do.
    expect(walk).toMatch(/e\.key === 'Enter'[\s\S]{0,80}takeFolder\(recent\[lit\]\.folder\);\s*else pickFolder\(\);/);
  });

  it('gives the name card the same button, and it makes the project', () => {
    const name = drawn.slice(drawn.lastIndexOf("run.step === 'name'"));
    expect(name).toMatch(/className="fr-submit"[^>]*onClick=\{make\}/);
    // w-ec62ab6b38 (2026-09-28): always drawn, reads Continue with its ↵, disabled until there is a name.
    expect(name).toMatch(/className="fr-submit" onClick=\{make\} disabled=\{!run\.name\.trim\(\) \|\| busy\}>\s*\{COPY\.nameGo\} <Cap cap="↵" \/>/);
    expect(walk).toMatch(/e\.key === 'Enter'[\s\S]{0,60}make\(\)/);
  });

  it('says a word rather than a glyph, because a key is what she reported', () => {
    const logic = read('renderer/src/onboarding.ts');
    expect(logic).toMatch(/submit: '[A-Z][a-z]+',/);
    expect(logic).not.toMatch(/submit: '[↵⌘]/);
  });

  it('leaves the button room, so a long path cannot run under it', () => {
    // `.fr-submit` is absolutely positioned in the corner, so the two lines it
    // sits beside have to reserve the width by hand or a long enough folder
    // path is drawn underneath it.
    const css = read('renderer/src/styles.css');
    const rule = (sel) => css.slice(css.indexOf(`\n${sel} {`), css.indexOf('}', css.indexOf(`\n${sel} {`)));
    expect(rule('.fr-submit')).toContain('position: absolute');
    for (const sel of ['.fr-a', '.fr-name']) expect(rule(sel)).toMatch(/padding:[^;]*86px/);
  });
});

// AND THE SCREEN THAT CONTRADICTED ITSELF IS NOT REWORDED, IT IS GONE.
//
// It was still a whole screen offering an import to somebody with nothing to
// import, whatever tense it was in. So the screen no longer exists: the offer
// is a block on the finish card, and the block is drawn only when there is
// something behind it. What is pinned here is that nothing puts it back.
describe('a Mac with no agent files is offered nothing at all', () => {
  const logic = read('renderer/src/onboarding.ts');

  it('has no agents step left to land on', () => {
    expect(drawn).not.toContain("run.step === 'agents'");
    expect(logic).not.toMatch(/\| 'agents'/);
    expect(logic).not.toMatch(/agents: \d/);
  });

  it('draws the offer only when the read came back with something', () => {
    // `found` is null until the agent files have been read, and `some` is false
    // on a Mac with none. Both have to be true before a word about importing is
    // on the card, so it never flashes an empty list and never offers nothing.
    //
    // AND `some` GREW ON 2026-08-27. The last card is the import card now and
    // it reaches every folder on the Mac with agents in it, not just her home
    // folder and this project's, so a Mac whose agents all live in
    // ~/Desktop/dev/whatever is offered them instead of walked past them. The
    // scan is a second read and the card waits on it too.
    expect(walk).toMatch(/const some = \(!!found && anyAgents\(found\)\) \|\| !!folders\?\.some\(\(f\) => f\.count > 0\);/);
    expect(walk).toMatch(/finishCard\(claude, \{ read: found !== null && folders !== null, some \}\)/);
    // AND NOT ON A CARD THAT IS HOLDING THE INBOX SHUT. A
    // Mac with no Claude Code on it has nothing to import agents INTO yet, and
    // that card is about one thing.
    expect(drawn).toMatch(/if \(!card\.blocked\) \{/);
    // AND NOTHING AT ALL WHILE THE MAC IS STILL BEING READ, which is the one
    // state left that draws no card.
    expect(drawn).toContain('if (!card.show) return null;');
    // AND `straightIn` IS NOT ASSERTED HERE ANY MORE, because it is gone. It
    // was the rule that walked a Mac with nothing to import straight past this
    // card, which is the whole reason a tester was never shown it. See the
    // note on it in onboarding.ts.
    expect(logic).toContain("bringHead: 'Add the agents already on this Mac.'");
  });

  // AND SINCE 2026-08-28 THE CARD APPEARS ON THAT MAC TOO. The rule above
  // stands where it was aimed — no OFFER with nothing behind it — and the
  // screen is no longer deleted along with it. The empty card offers nothing:
  // its headline says there is nothing to bring across yet, and the two lines
  // under it are where Agentbox looked and how to come back to this.
  it('draws the card with an answer on it rather than skipping the screen', () => {
    // The word survives in the note saying what was deleted and why, which is
    // how this repository keeps a reversed rule readable. The FIELD is gone.
    expect(drawn).not.toContain('card.straightIn');
    expect(logic).not.toMatch(/straightIn:/);
    expect(logic).not.toMatch(/straightIn: boolean/);
    const card = read('renderer/src/components/ImportAgents.tsx');
    expect(card).toMatch(/read && !some \? CARD\.headNone : CARD\.head/);
    // The walk's own "these are the agents already on this Mac" is not said
    // over an empty card, because there are none and it would be the same
    // contradiction in a smaller typeface.
    expect(card).toMatch(/walk && screen === 'door' && some && <p className="ia-offer">/);
    // And the key the walk teaches still does something on it.
    expect(card).toMatch(/if \(walk && !some\) \{ walk\.onSkip\(\); return; \}/);
  });

  it('has deleted the two headlines and the line that contradicted them', () => {
    for (const gone of ['agentsHead', 'agentsHeadNone', 'agentsNone:', 'agentsFinish']) {
      expect(logic).not.toContain(`${gone.replace(':', '')}: '`);
    }
    expect(logic).not.toMatch(/found no agent files/);
    expect(drawn).not.toContain('COPY.agentsNone}');
  });

  it('still says what an empty SIDE of the switch would hold', () => {
    // Not the same thing: this is a Mac that HAS agents, looking at the scope
    // that has none of them. There is a list there, so the line teaches what
    // the other word means rather than promising something that is not there.
    expect(logic).toMatch(/agentsNoneAll: '/);
    expect(logic).toMatch(/agentsNoneHere: '/);
  });
});

// AND THE SAME RULE FOR THE CARD BESIDE THE APP. Every beat from four on names
// one key, and the app has to be listening for it. These sentences are the
// approved round four copy, so a key going dead here is a sentence going wrong.
describe('the coaching card promises no dead key either', () => {
  const app = read('renderer/src/App.tsx');
  // READ OFF `coach` ITSELF, NOT OFF THE SOURCE TEXT. This used to be a regex
  // over onboarding.ts looking for `say('…', '…', '…'` on one line, so wrapping
  // one call across three lines silently emptied the list it was checking and
  // the test went green with ⌘K missing from it. Calling the function is both
  // shorter and the only version that cannot lie: it is exactly what the card
  // will draw. Beat fourteen has two sentences, so both are asked for.
  const keys = COACHED
    .flatMap((step) => [
      coach(step, 0),
      coach(step, 0, { opened: true }),
      // AND BEAT FOURTEEN'S SECOND HALF, the picker open over the row. Same
      // reason as `opened` above: a half of a beat nobody asks for is a half
      // nobody checks.
      coach(step, 0, { picking: true }),
    ])
    .map((say) => say?.key)
    .filter(Boolean);

  // BEAT FIFTEEN HAS THREE SENTENCES, one per tab, so the card is asked for in
  // all three states as well. They all name the same key; asking is what proves
  // that rather than assuming it.
  const tourKeys = ['inbox', 'progress', 'done']
    .map((view) => coach('where', 0, { view })?.key)
    .filter(Boolean);

  // EIGHT SINCE 2026-08-24, when the snooze beat went in. L is the app's own
  // key for it (App.tsx), so nothing was added to make this beat work either.
  // IT WAS S UNTIL 2026-10-01: S had come to mean the summary inside a thread
  // as well, so one letter taught two things and the walk taught the one the
  // app no longer did. The count did not move.
  it('names eight keys and no others', () => {
    // ⌘ AND A NUMBER, and WHICH numbers depends on the strip: the tour prints
    // the destination's own slot, and Scheduled is only there some of the time.
    // So the fixed part of the list is checked exactly, and the section keys are
    // checked for being section keys.
    const said = [...new Set([...keys, ...tourKeys])];
    const sections = said.filter((k) => /^⌘[1-4]$/.test(k));
    expect(said.filter((k) => !/^⌘[1-4]$/.test(k)).sort())
      .toEqual(['1', 'N', 'E', 'L', '↵', '⌘K', '⌘↵'].sort());
    expect(sections.length).toBeGreaterThan(0);
  });

  it('⇥ rotates the tabs, which is what beat fifteen says three times', () => {
    // The last beat of the walk asks for Tab three times, once per tab, and it
    // is the app's OWN key: nothing was added to make this beat work. What has
    // to stay true is that a bare Tab on the list still rotates the views, and
    // that the walk's own screens are the only place it is swallowed.
    // The order itself moved into workspaceDestinations on 2026-09-21, when
    // Scheduled stopped being permanent, so the rotation is checked by running
    // that function rather than by reading the memo's text.
    const rotate = app.slice(app.indexOf('const tabOrder = useMemo<View[]>'), app.indexOf('const tabOrder = useMemo<View[]>') + 260);
    expect(rotate).toContain('workspaceDestinations({ scheduledCount, view })');
    expect(workspaceDestinations({ scheduledCount: 0 }).map(([key]) => key)).toEqual(['inbox', 'progress', 'done']);
    expect(workspaceDestinations({ scheduledCount: 1 }).map(([key]) => key)).toEqual(['inbox', 'progress', 'snoozed', 'done']);
    expect(app).toContain('const want = order[slot - 1];');
    expect(app).toContain("if (slot && !inInput && !modal && !inFullScreen)");
    // And each tab carries the mark the ring sits on, or the beat points at
    // nothing. Measured the hard way once already, one beat up: a card that
    // describes something invisible is this whole round's fault.
    for (const tab of ['inbox', 'progress', 'done']) expect(app).toContain(`data-tab="${tab}"`);
  });

  it('says a different thing on each of the three tabs', () => {
    // The card is a function of the view, never of a count of presses, so it
    // cannot get out of step with the screen behind it. Three views, three
    // sentences, no two the same.
    const said = ['inbox', 'progress', 'done'].map((view) => coach('where', 0, { view })?.quiet);
    expect(new Set(said).size).toBe(3);
    // The middle one is the surprise of the tour: the agent she answered rather
    // than closed is running again with nobody watching it. It said "working
    // again" until 2026-08-28 and says "working without you" now, because the
    // third line that used to explain the point came off with the two-line
    // budget and the quiet line took the point into itself.
    expect(said[1]).toMatch(/working without you/);
  });

  it('1 sends the option under it, which is what beat fourteen says', () => {
    // The stopped row's answer is one key because its offer is in its result
    // (shared/first-run-practice.mjs) and a digit on a focused row picks AND
    // sends. If this ever became select-then-Enter the card would be promising
    // one key for a two-key move.
    expect(app).toMatch(/\/\^\[1-9\]\$\/\.test\(e\.key\)\) pickOption\(focused, Number\(e\.key\)\)/);
  });

  it('C opens the compose card, which is what beat four says it does', () => {
    expect(app).toMatch(/case 'c': case 'C':[\s\S]{0,80}setModal\('compose'\)/);
  });

  it('↵ opens the row under the cursor, which is what beat six says', () => {
    expect(app).toMatch(/case 'Enter':[\s\S]{0,90}setFocused\(pointed\)/);
  });

  it('E closes the task, which is what beats seven and nine say', () => {
    expect(app).toMatch(/case 'e': case 'E':[\s\S]{0,900}markDone\(pointed\)/);
  });

  it('still handles plain Enter on the welcome, which draws it', () => {
    expect(walk).toContain("if (run.step !== 'welcome') return;");
    expect(walk).toMatch(/e\.key === 'Enter'[\s\S]{0,60}onEvent\(\{ t: 'start' \}\)/);
  });
});


/* ------------------------------------------------------------------------- */
/*
 * AND THE ROWS BROKE THE SAME RULE, IN THE SAME WALK.
 *
 * Everything above is about the three setup screens. The rows never had this
 * rule at all: the hint on a row is a property of the VIEW, so any inbox row
 * under the pointer printed "R Reply · E Close" whatever the walk was going to
 * do with those keys. While a beat is up the walk swallows every key but its
 * own, and offers even that one only on the rows the beat is about, so on the
 * clearing beat that hint is one true promise and three dead ones.
 *
 * It is photographed. A screenshot of the clearing beat has the pointer on
 * the row an agent is stopped on, and "E Close" printed on that row, while the
 * card beside the list was saying to press E on a different row and the app
 * was refusing the press that was made.*/

describe('a row in the walk promises no key the walk is about to eat', () => {
  const inbox = rowKeys('inbox');
  const finished = ['w-p1', 'w-p2'];
  const stopped = 'w-p4';
  const later = 'w-p3';

  const clearing = { key: 'E', rows: finished };

  it('says nothing at all on a row the beat is not about', () => {
    // The row from the screenshot. The card is about w-p1 and the pointer was here.
    expect(walkRowKeys(inbox, clearing, stopped)).toEqual([]);
    expect(walkRowKeys(inbox, clearing, later)).toEqual([]);
  });

  it('says only the beat own key on a row the beat IS about', () => {
    // R is swallowed on the clearing beat exactly as it is everywhere else in
    // the walk, so "R Reply" on a finished row is a dead promise too.
    const said = walkRowKeys(inbox, clearing, finished[0]);
    expect(said.map((k) => k.key)).toEqual(['E']);
    expect(said[0].word).toBe(DONE.short);
  });

  it('says nothing anywhere on a beat that is not about a row', () => {
    // The beats that stand at the plus, the compose card or the reading pane
    // name no row, so no row may promise anything while they are up.
    for (const id of [...finished, later, stopped]) {
      expect(walkRowKeys(inbox, { key: '↵', rows: [] }, id), id).toEqual([]);
    }
  });

  it('says nothing on a beat that asks for no key at all', () => {
    // A NULL KEY INSIDE A LIVE WALK IS NOT THE SAME AS NO WALK. The running
    // beat asks for nothing and waits, and its row is the one the walk is
    // waiting on: "E Close" there is the press that ends the beat by accident.
    for (const id of [...finished, later, stopped]) {
      expect(walkRowKeys(inbox, { key: null, rows: [id] }, id), id).toEqual([]);
    }
  });

  it('changes nothing at all when no walk is on', () => {
    for (const view of ['inbox', 'snoozed', 'done']) {
      const all = rowKeys(view);
      for (const id of ['w-anything', 'w-else']) {
        expect(walkRowKeys(all, null, id), view).toEqual(all);
      }
    }
  });

  it('is wired into the list off the same rows the coaching card rings', () => {
    const list = read('renderer/src/components/List.tsx');
    const app = read('renderer/src/App.tsx');
    // Still the one call, and still `all` narrowed by the walk. What the row
    // may print before the walk gets to it is now also a property of the row:
    // the trouble row drops R, because there is nobody to reply to and a key
    // that does nothing is what this whole file exists about. The row that
    // says a new version is ready drops it for the same reason: no ledger
    // behind it and nobody listening on it.
    expect(list).toMatch(/walkRowKeys\(\s*id === TROUBLE_ID \|\| id === UPDATE_ID \? all\.filter\(\(k\) => k\.key !== 'R'\) : all,\s*walk \?\? null,\s*id,\s*\)/);
    // ONE ANSWER TO "WHICH ROW IS THE WALK ABOUT", read in both places. Two
    // copies would let the hint on a row disagree with the ring beside it,
    // which is the fault this whole round is about.
    expect((app.match(/const walkBeat = useMemo\(/g) ?? []).length).toBe(1);
    expect(app).toContain('beat={walkBeat}');
    expect(app).toContain('walk={run && search === null ? { key: walkKey, rows: walkBeat } : null}');
  });

  it('never lets a row name a key its own beat is not asking for', () => {
    // The card names one key per beat and the row may name that same key. If a
    // beat asks for a key the inbox rows do not carry, the row simply says
    // nothing, which is honest; what may never happen is a row naming a key the
    // beat is not asking for.
    for (const step of COACHED) {
      const key = coach(step, 0, { left: 2 })?.key ?? null;
      const said = walkRowKeys(inbox, { key, rows: finished }, finished[0]);
      if (!key) { expect(said, step).toEqual([]); continue; }
      for (const k of said) expect(k.key.toUpperCase(), `${step} drew ${k.key}`).toBe(key.toUpperCase());
    }
  });
});
