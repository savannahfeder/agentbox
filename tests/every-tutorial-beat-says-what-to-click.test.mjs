// EVERY BEAT OF THE TUTORIAL SAYS WHAT TO CLICK, NOT ONLY WHAT TO PRESS.
//
// Two people walked the whole thing on 2026-10-01: a PM and an office manager.
// Neither of them uses a keyboard shortcut for anything. Every practice beat
// told them to press a letter and nothing on any card said where to click, so
// the walk reads as a riddle to the half of its audience that has never pressed
// E to archive anything. The founder's words on the round: "every step must
// also say what to click, for people who will not remember keys."
//
// THE RULE THIS FILE HOLDS. If a card names a key, the same line names
// something on the screen to click. Two beats are exceptions and both are
// written out below, because an exception nobody can find is how this comes
// back one card at a time.
//
// AND THE CLICK HAS TO BE REAL, which is the half worth more than the words.
// The clearing beat and the scheduling beat point at a chip on the row, which
// was a <span> and is a <button> now, running the same function the key runs.
// A sentence in the walk promising a click that does nothing is the dead key
// this walk's own rule (tests/the-walk-promises-no-dead-keys.test.mjs) refuses,
// arriving through the mouse instead of the keyboard.
//
// The counter the same round deleted is pinned in
// tests/the-introduction-shows-the-product.test.mjs.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR, COACHED, TEAM_TAB_NAMES, coach } from '../renderer/src/onboarding.ts';
import { rowKeys, walkRowKeys } from '../renderer/src/list-rules.ts';
import { workspaceDestinations } from '../renderer/src/workspace-navigation.mjs';
import { DONE } from '../renderer/src/done-word.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const list = read('renderer/src/components/List.tsx');
const css = read('renderer/src/styles.css');

/** The loud line of a card, which is the line that names the press. */
const loud = (say) => `${say.lead}${say.key ?? ''}${say.tail}`;

/**
 * EVERY CARD THE PRACTICE ROUND CAN DRAW, in every state the app hands it. The
 *  same shape the two-lines budget is measured over: a beat with two halves is
 *  two cards and both of them are somebody's whole screen.
 */
function everyCard() {
  const cards = [];
  // THE STRIP'S WORDS GO IN ON EVERY CARD, because the app puts them in on
  // every card: `tabNames` is handed over whenever the tab strip is the thing
  // on the screen, and in this build it always is. Only the tab tour reads
  // them, and a beat that is asked without them is the subject of its own test
  // below.
  for (const step of COACHED) {
    for (const ctx of [{}, { opened: true }, { picking: true }, { palette: true }, { left: 1 }, { left: 2 }]) {
      const say = coach(step, 0, { ...ctx, tabNames: TEAM_TAB_NAMES });
      if (say) cards.push([`${step} ${JSON.stringify(ctx)}`, say]);
    }
    const slow = coach(step, 30_000, { tabNames: TEAM_TAB_NAMES });
    if (slow) cards.push([`${step} (slow)`, slow]);
  }
  // THE TAB TOUR IS ASKED FOR THE WAY THE APP ASKS, which is one card per stop
  // round the app's own rotation, with the strip's own words. `tabNames` is
  // what lets that beat name a tab, and the app hands it whenever the tab strip
  // is the thing on the screen (components/Onboarding.tsx), which in this build
  // is always: `workspaceNavigationShown` returns true and the inbox draws
  // `.th-bar .tm-tabs`. Both rotations are walked, because Scheduled is in it
  // only while something is actually put off, and the walk puts something off
  // one beat before this one.
  for (const scheduledCount of [0, 1]) {
    const tabs = workspaceDestinations({ scheduledCount }).map(([key]) => key);
    for (const view of tabs) {
      cards.push([
        `where ${view} (${tabs.length} tabs)`,
        coach('where', 0, { view, tabs, tabNames: TEAM_TAB_NAMES }),
      ]);
    }
  }
  return cards;
}

/**
 * THE TWO CARDS THAT NAME NO CLICK, AND WHY EACH ONE IS HONEST.
 *
 *  Neither is a card somebody has to get past with a key they do not know.
 */
const NO_CLICK = {
  // It asks for nothing. The agent is running and the beat ends when it comes
  // back, so there is no press on this card to find a mouse route for.
  working: 'nothing to press',
  // THE TWO BEATS THAT RING A ROW, AND THE EXCEPTION THAT COST THE MOST TO
  // LEARN. Both said "or click Done on the row" and "or click Later on the row"
  // for an hour on 2026-10-01, and the chip they pointed at was made a button
  // to make them true. The founder caught it the same day: "you can't actually
  // click Done in the app... I think it's sort of misleading users because you
  // can't actually do that in the real app."
  //
  // She is right, and the reason is worth writing down because the next session
  // will want to add the clause back. That chip is drawn ONLY while the walk is
  // on (the `walk &&` guard in components/List.tsx), so a tutorial teaching a
  // click there teaches a button that is gone the moment the walk ends. From
  // the list the app has no click route to close or schedule a thread at all:
  // the hover plate is `pointer-events: none` on purpose
  // (components/HintPlate.tsx, "a hint you can hover is a hint that can be
  // hovered off the thing it describes") and Mark done is a row in the
  // three-dot menu inside an opened thread (threads/ThreadMenu.tsx).
  //
  // So these two name a key and nothing else until the app grows the button.
  // Putting the clause back without building that is the fault coming back.
  clear: 'the row chip is not a button, and the app has no click route to close',
  snooze: 'the same: no click route to schedule from the list',
  // The second half of the last beat, with the command list open over the app.
  // The ring is round the palette, so the only things inside it are the search
  // field and eighty command rows, and "click a row" would RUN one of them
  // rather than close the list. esc is not a shortcut anybody has to remember;
  // it is the key every window on this machine closes on, which is the whole
  // difference from the letters this round is about.
  command: 'esc, with nothing inside the ring to click',
};

describe('every practice beat names something to click', () => {
  for (const [name, say] of everyCard()) {
    it(`${name} says what to click as well as what to press`, () => {
      const step = name.split(' ')[0];
      if (!say.key) {
        // A card with no key either asks for nothing at all, or asks for a
        // click on something the app has no key for. `who` is the second kind
        // and the only one: To is a button on the card and there is no
        // shortcut that opens it, so the loud line is the click alone rather
        // than a cap invented to keep the other cards' shape. The first kind is
        // the running beat and the picker, which are lists to choose from.
        expect(['working', 'who', 'board', 'snooze', 'command'], `${name} asks for nothing`).toContain(step);
        // `who` and `board` are the click-only beats: the app has no shortcut
        // that opens the To row or the View and filters menu, so their loud
        // lines are the click alone rather than a cap invented to keep the
        // other cards' shape.
        if (step === 'who' || step === 'board') expect(loud(say).toLowerCase(), `${name} names no click`).toContain('click');
        return;
      }
      if (NO_CLICK[step] && (say.key === 'esc' || step === 'working' || step === 'clear' || step === 'snooze')) {
        // One of the four written out above, each with its reason. The card
        // must then name NO click, because a half-promise is the thing being
        // guarded against: either the app answers a mouse here or the card
        // keeps quiet about one.
        expect(loud(say).toLowerCase(), `${name} names a click it should not`).not.toContain('click');
        return;
      }
      expect(loud(say).toLowerCase(), `${name} names no click`).toContain('click');
    });
  }

  // THE EXCEPTIONS ARE A CLOSED LIST. If a beat stops naming a click, the loop
  // above fails; this is the other direction, so that adding a beat with no
  // mouse route cannot quietly widen the list.
  it('has exactly four beats with no click, and names them', () => {
    expect(Object.keys(NO_CLICK).sort()).toEqual(['clear', 'command', 'snooze', 'working']);
    expect(coach('working', 0).key).toBeNull();
    expect(coach('command', 0, { palette: true }).key).toBe('esc');
    // And the first half of that same beat DOES name one, which is the half
    // that asks for the least guessable press in the walk.
    expect(loud(coach('command', 0))).toContain('click the ⌘ button');
  });

  // THE TWO ROW BEATS, WORD FOR WORD, because this is the pair that went wrong
  // and a regex for the absence of "click" would pass on a card that had lost
  // its key as well.
  it('leaves the two row beats on the key alone, and says so plainly', () => {
    expect(loud(coach('clear', 0, { left: 2 }))).toBe('Press E to close it.');
    expect(loud(coach('snooze', 0))).toBe('Press L to deal with it later.');
  });
});

describe('the click each card names is a real one', () => {
  // ONE PER BEAT, CHECKED AGAINST THE THING THE RING IS ROUND. The ring is what
  // the walk lets a click through to (`strayClick`), so a card naming something
  // outside it would be telling somebody to do the one thing the walk refuses.
  it('points at the button the ring is round, on the two beats that ring a button', () => {
    expect(loud(coach('make', 0))).toContain('click New thread');
    expect(ANCHOR.make[0]).toBe('button[aria-label="New thread"]');
    // THE REAL NEW THREAD CARD SINCE 2026-10-01, which says Send rather than
    // Start it. The walk had kept the retired one-line card for a round and the
    // founder caught it: "the tutorial is using the wrong component here, we no
    // longer use this."
    expect(loud(coach('task', 0))).toContain('click Send');
    expect(ANCHOR.task[0]).toBe('.tc-card .tc-send-main');
    // The card's own button really says that word, in the element the ring is
    // drawn round.
    expect(read('renderer/src/threads/ThreadComposer.tsx')).toMatch(/className="tc-send-main"[\s\S]{0,400}Send/);
  });

  // WHO THE THREAD IS FOR (2026-10-01). The beat she asked for: "we're missing
  // important stuff like: selecting who it's to etc. and sending messages to
  // both people and agents." It rings the To row and the list it opens, and
  // says both halves, because on a Mac with no teammates the list draws Agent
  // alone and the People half appears the day somebody joins.
  it('points at the To row, and names an agent and a person', () => {
    const say = coach('who', 0);
    expect(say.key).toBeNull();
    expect(loud(say)).toBe('Click To at the top of the card to see who it can go to.');
    expect(say.quiet).toBe('Every thread goes to an agent, or to a person on your team.');
    expect(ANCHOR.who).toEqual(['.tc-card .tc-to-menu', '.tc-card .tc-word']);
  });

  it('points at the row on the two beats that ring a row', () => {
    for (const step of ['open', 'unblock']) {
      expect(loud(coach(step, 0)), step).toContain('click the row');
      expect(ANCHOR[step], step).toContain('.list-pane .row');
    }
  });

  it('points at the reply box and the options strip, which are what those beats ring', () => {
    expect(loud(coach('answer', 0))).toContain('Click the box below');
    expect(ANCHOR.answer[0]).toBe('.focus-dock .dock-card');
    expect(loud(coach('unblock', 0, { opened: true }))).toContain('click the first answer');
    expect(ANCHOR.unblock[0]).toBe('.opt-strip');
  });

  // AND THE ONE STATE THAT NAMES NO TAB IS DELIBERATE AND NOT A GAP. The tab
  // tour names the tab the press opens, and it looks that word up rather than
  // writing one out, for the reason the beat's own comment gives: Scheduled is
  // drawn only some of the time, so a word written here would send somebody to
  // the wrong tab on the days the strip is a different shape. A card asked with
  // no words for the strip therefore names no tab, which leaves it correct and
  // one clause shorter. It is reachable only if the inbox is drawn with no tab
  // strip at all, and then there is no tab on the screen to name.
  it('names no tab when it has not been given the strip words, rather than guessing one', () => {
    const bare = coach('where', 0, { view: 'inbox', tabs: ['inbox', 'progress', 'done'] });
    expect(bare.key).toBe('⌘2');
    expect(loud(bare)).toBe('Press ⌘2 to see where it all went.');
    expect(loud(bare)).not.toContain('click');
  });

  it('points at the tab it is sending somebody to, by the strip own word', () => {
    const tabs = ['inbox', 'progress', 'snoozed', 'done'];
    const said = coach('where', 0, { view: 'inbox', tabs, tabNames: TEAM_TAB_NAMES });
    expect(loud(said)).toContain(`click ${TEAM_TAB_NAMES.progress}`);
    // The words are the strip's own, not a second copy written in the walk.
    const pages = read('renderer/src/threads/Pages.tsx');
    for (const word of ['Needs you', 'In progress', 'Scheduled']) expect(pages).toContain(word);
  });
});

describe('the chip on the row says a key and promises nothing else', () => {
  // THE TWO BEATS THAT DRAW A CHIP. Done on the clearing beat and Later on the
  // scheduling beat. The chip is the beat's own key with its word beside it,
  // and it is a LABEL: it is drawn only while the walk is on, so a clickable
  // one would be a control that exists in the tutorial and nowhere else.
  it('draws Done on the clearing beat row, with the key the card names', () => {
    const say = coach('clear', 0, { left: 2 });
    expect(say.key).toBe('E');
    const chip = walkRowKeys(rowKeys('inbox'), { key: 'E', rows: ['w-p1'] }, 'w-p1');
    expect(chip.map((k) => k.key)).toEqual(['E']);
    expect(chip[0].word).toBe(DONE.short);
    expect(loud(say)).not.toContain('click');
  });

  it('draws Later on the scheduling beat row, with the key that card names', () => {
    const say = coach('snooze', 0);
    expect(say.key).toBe('L');
    const chip = walkRowKeys(rowKeys('inbox'), { key: 'L', rows: ['w-p3'] }, 'w-p3');
    expect(chip.map((k) => k.key)).toEqual(['L']);
    expect(chip[0].word).toBe('Later');
    expect(loud(say)).not.toContain('click');
  });

  // IT WAS A BUTTON FOR AN HOUR ON 2026-10-01 AND THIS IS THE GUARD AGAINST
  // THAT COMING BACK. The two cards said "or click Done on the row" and "or
  // click Later on the row", and the chip was made clickable so they would be
  // true. The founder's words the same day: "you can't actually click Done in
  // the app... I think it's sort of misleading users because you can't actually
  // do that in the real app."
  //
  // The chip is drawn only under the `walk &&` guard asserted here, so anything
  // clickable in that slot is a control that exists in the tutorial and in no
  // other minute of using Agentbox. The right fix is a click route in the app
  // itself, and until there is one this slot says a key and nothing else.
  it('is a label, because a button here would exist only inside the tutorial', () => {
    expect(list).toMatch(/\{walk && keysFor\(item\.id\)\.length \? \(\s*<span className="row-keys">\s*\{keysFor\(item\.id\)\.map\(\(k\) => \(\s*<span className="row-key"/);
    expect(list).not.toContain('onRowKey');
    expect(app).not.toContain('onRowKey');
    // And the button reset is back on the import row's slot, which is the one
    // row whose keys really are pressable with a mouse.
    expect(css).not.toMatch(/button\.row-key \{/);
    expect(css).toMatch(/\.row-end \.import-keys \.row-key \{/);
  });

  // AND THE APP REALLY HAS NO OTHER ROUTE, which is the fact the two cards are
  // written against. If either of these stops being true, the cards can say
  // more than they do and somebody should come back to them.
  it('has no click route to close or schedule a thread from the list', () => {
    // The hover plate names the keys and refuses the pointer on purpose.
    expect(read('renderer/src/components/HintPlate.tsx')).toContain('It never takes the pointer');
    expect(css).toMatch(/\.hint-plate \{[\s\S]*?pointer-events: none;[\s\S]*?\}/);
    // Mark done is a row in the menu inside an opened thread, and that menu is
    // the only place in the app it can be pressed with a mouse.
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toContain("label: 'Mark done'");
    // The list draws no control that closes or schedules. Every pressable key
    // on a row belongs to a Codex conversation asking to come in, which is the
    // `import-keys` slot: its Yes, its No and the Import on one that was
    // declined. Each is checked by the slot it opens, so a new button anywhere
    // else in a row's right end fails this.
    expect(list).not.toMatch(/onClick=\{[^}]*markDone/);
    expect(list).not.toMatch(/onClick=\{[^}]*openSnooze/);
    const buttons = [...list.matchAll(/<span className="row-keys([^"]*)">\s*\{[A-Z_]+\.map/g)];
    expect(buttons.map((m) => m[1].trim())).toEqual(['import-keys', 'import-keys import-key']);
  });
});
