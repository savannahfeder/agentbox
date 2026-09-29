// THE TAB TOUR SAYS WHERE THE PRESS ACTUALLY GOES.
//
// A tester was walked through the tutorial on a call on 2026-09-01 and read one
// of these cards out loud against the screen it was sitting on:
//
// The card was naming the next tab out of a list written into the copy —
// Scheduled, In progress, Closed, back to the Inbox — while the ring beside it
// was drawn off the app's real rotation and the press obeyed that rotation too.
// Two answers to one question, kept in step by nothing.
//
// The strip is not a fixed list. Scheduled is DRAWN when something is snoozed
// OR a repeat rule exists, and is in the ROTATION only when something is really
// snoozed, so the two rules come apart on an ordinary install. Everything below
// holds the sentence to the rotation instead of to a list.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAB_TOUR_FLOOR, coach, nextTab } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** The whole tail of a card, the way the card draws it. */
const tail = (view, tabs) => coach('where', 0, { view, tabs })?.tail;

describe('1. the ordinary walk says exactly what it said before', () => {
  // Nothing here is a new sentence. The four hops of the walk as it really
  // runs, with a row snoozed, have to come out word for word as they were, or
  // this change is a rewrite of copy she approved rather than a fix.
  const strip = ['inbox', 'snoozed', 'progress', 'done'];

  it('opens on her own line and promises no particular tab', () => {
    const card = coach('where', 0, { view: 'inbox', tabs: strip });
    // Her sentence, then inbox zero named as the goal (w-ec62ab6b38, 2026-09-28).
    expect(card.quiet).toBe('Great! Your inbox is now empty. That is inbox zero, and it is the goal.');
    expect(card.tail).toBe(' to see where it all went.');
  });

  it('sends Scheduled on to the agent she answered', () => {
    expect(tail('snoozed', strip)).toBe(' for the agent you answered.');
  });

  it('sends In progress on to everything she closed', () => {
    expect(tail('progress', strip)).toBe(' for everything you closed.');
  });

  it('sends Closed back to the inbox, and only that hop says come back', () => {
    expect(tail('done', strip)).toBe(' to come back.');
    const others = strip.slice(0, 3).map((v) => tail(v, strip));
    for (const said of others) expect(said).not.toMatch(/come back/);
  });

  it('never says again, because every hop is a different key (w-ec62ab6b38)', () => {
    for (const v of strip) expect(tail(v, strip)).not.toMatch(/again|once more/);
  });
});

describe('2. and with no Scheduled tab it still says what is really next', () => {
  // The commonest strip of the three: nothing snoozed, so Tab rotates three.
  const strip = ['inbox', 'progress', 'done'];

  it('does not promise the one she put off when there is nowhere to put it', () => {
    expect(tail('inbox', strip)).toBe(' to see where it all went.');
    expect(tail('progress', strip)).toBe(' for everything you closed.');
    expect(tail('done', strip)).toBe(' to come back.');
  });
});

describe('3. the sentence is chosen by destination, not by position', () => {
  it('says come back from whichever tab is last, not from Closed', () => {
    // A strip that ends on In progress. The old copy had "once more to come
    // back" welded to the Closed card, so this hop said the wrong thing.
    expect(tail('progress', ['inbox', 'done', 'progress'])).toBe(' to come back.');
    expect(tail('done', ['inbox', 'done', 'progress'])).toBe(' for the agent you answered.');
  });

  it('names Scheduled when Scheduled is what comes next', () => {
    expect(tail('progress', ['inbox', 'progress', 'snoozed', 'done']))
      .toBe(' for the one you put off.');
  });

  it('sends her to the inbox from a tab the rotation has never heard of', () => {
    // Standing on Scheduled while it is drawn but not rotated: App.tsx's own
    // `order.indexOf(v)` comes back -1 and the press lands on the first tab.
    // This is the exact shape of the fault the tester read out, so the card has to
    // say inbox and not name the tab that used to follow Scheduled.
    expect(nextTab(['inbox', 'progress', 'done'], 'snoozed')).toBe('inbox');
    expect(tail('snoozed', ['inbox', 'progress', 'done'])).toBe(' to come back.');
  });

  it('never says nothing, whatever the strip is', () => {
    const strips = [
      ['inbox', 'snoozed', 'progress', 'done'],
      ['inbox', 'progress', 'done'],
      ['inbox', 'done', 'progress'],
      ['inbox'],
      [],
      undefined,
    ];
    for (const tabs of strips) {
      for (const view of ['inbox', 'snoozed', 'progress', 'done']) {
        const card = coach('where', 0, { view, tabs });
        expect(card.key, `${view} on ${tabs}`).toMatch(/^⌘[1-4]$/);
        expect(card.tail.trim().length, `${view} on ${tabs}`).toBeGreaterThan(0);
        expect(card.tail.endsWith('.'), `${view} on ${tabs}`).toBe(true);
      }
    }
  });
});

describe('4. one copy of where the press goes, used by the ring and the words', () => {
  it('is the app rotation, and the floor is the three tabs always drawn', () => {
    expect([...TAB_TOUR_FLOOR]).toEqual(['inbox', 'progress', 'done']);
    // Given nothing, it behaves as the app does with nothing.
    expect(nextTab(undefined, 'inbox')).toBe('progress');
    expect(nextTab([], 'inbox')).toBe('progress');
  });

  it('matches what App.tsx really does with Tab', () => {
    // The rotation the key handler runs. If this line moves, the walk's idea of
    // the next tab has to move with it, which is the whole reason there is one
    // function rather than two lists.
    // ⌘1 to ⌘4 go straight to a slot rather than rotating, since 2026-09-23.
    // The walk's idea of where the next press lands has to be that same list,
    // which is why there is one function rather than two.
    expect(read('renderer/src/App.tsx')).toContain('const want = order[slot - 1];');
    expect(read('renderer/src/App.tsx')).toContain('setView(want);');
  });

  it('leaves no second copy of the rotation in the walk component', () => {
    const view = read('renderer/src/components/Onboarding.tsx');
    expect(view).toContain('nextTab(tabs, view)');
    expect(view).not.toContain("tabs ?? ['inbox', 'progress', 'done']");
    // And the ring is drawn off that same answer.
    expect(view).toContain('.tabs .tab[data-tab="${goingTo}"]');
  });

  it('hands the strip to the card as well as to the ring', () => {
    expect(read('renderer/src/components/Onboarding.tsx'))
      .toContain('left: beat?.length, tabs,');
  });

  it('keeps the tab names out of the copy as a written-out order', () => {
    // The three tails that used to be welded to a position. If one of these
    // comes back as a literal inside a `ctx.view ===` branch, the fault is back.
    const src = read('renderer/src/onboarding.ts');
    const beat = src.slice(src.indexOf("case 'where': {"), src.indexOf("case 'command':"));
    for (const said of [
      "' for the agent you answered.'",
      "' for everything you closed.'",
      "' to come back.'",
    ]) expect(beat).not.toContain(said);
    expect(beat).toContain('TAB_TOUR_SENDS_YOU[nextTab(ctx.tabs, ctx.view)]');
  });
});
