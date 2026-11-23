// A KEY CAP SAYS ITS NAME, AND THE PRACTICE TASK IS A REQUEST. Two rules that
// outlived the old walk (removed 2026-11-21): a key cap whose glyph says nothing
// gets its name written inside it, and the practice task reads as a request about
// a named pretend app.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_NAMES, keyName } from '../renderer/src/onboarding.ts';
import { PRACTICE_ANSWER, PRACTICE_ROWS, PRACTICE_TASK } from '../shared/first-run-practice.mts';
import { NAME } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');

describe('2. a key is drawn with its name when the glyph says nothing', () => {
  it('names ⇥ and ↵, which are the two she watched somebody fail to read', () => {
    expect(keyName('⇥')).toBe('Tab');
    expect(keyName('↵')).toBe('Return');
  });

  it('names nothing that already says its own name', () => {
    // ⌘1 to ⌘4 joined this list on w-ec62ab6b38 (2026-09-28): "the cmd 2
    // says it twice". The walk no longer draws them (w-914b16eab6), and they
    // stay here so a chord that comes back is still not named twice.
    for (const cap of ['C', 'E', 'S', '1', '⌘K', '⌘↵', '⌘1', '⌘2', '⌘3', '⌘4']) {
      expect(keyName(cap), cap).toBeNull();
    }
    expect(keyName(null)).toBeNull();
  });

  it('is a map rather than a guess, so a new cap is named on purpose or not at all', () => {
    expect(Object.keys(KEY_NAMES).sort()).toEqual(['↵', '⇥'].sort());
  });

  it('draws the name inside the same cap, not as a second kind of key', () => {
    // One component, so a cap cannot appear with its name on one screen and
    // without it on the next.
    const cap = read('renderer/src/components/Cap.tsx');
    expect(cap).toContain('<kbd className={className}>');
    expect(cap).toContain('className="fr-cap-word"');
    // The name is asked of the cap AS DRAWN, not of the glyph it came from
    // (4dabd8f7): where there is no ⇥ key the cap is already the word Tab,
    // and naming that one would put Tab inside Tab.
    expect(cap).toMatch(/const shown = chord\(cap\);[\s\S]{0,80}keyName\(shown\)/);
  });

  it('styles the word as part of the cap rather than as a caption beside it', () => {
    const rule = css.slice(css.indexOf('.fr-cap-word {'), css.indexOf('}', css.indexOf('.fr-cap-word {')));
    expect(rule).toMatch(/font-size: 0\.\d+em/);
    expect(rule).toMatch(/color: var\(--text-dim\)/);
    // No border and no background of its own: the cap around it is the key.
    expect(rule).not.toMatch(/border|background/);
  });
});

describe('1. the first practice task is fiction about a named pretend app', () => {
  it('is still a request, because this is the one row she sends', () => {
    // It was past tense for one build and that broke the beat: she presses ⌘↵
    // on a button reading 'Start it' and is answered 'Done, and the tests
    // pass.', so a title saying the work is already done makes nonsense of the
    // sequence. What killed her misreading is the app's name, not the tense.
    expect(PRACTICE_TASK.title).not.toMatch(/^Added\b/);
    expect(PRACTICE_TASK.title).toMatch(/^Add\b/);
  });

  it('names the pretend project in the sentence itself', () => {
    // "Practice" is the name the rail, the band and the compose card already
    // say. There is no second pretend name invented for this string.
    expect(PRACTICE_TASK.title).toContain('Practice');
  });

  // THE BODY IS WHAT A PERSON WOULD TYPE SINCE 2026-10-06. It said "Practice
  // is a pretend project, not your work and not Agentbox. This one is written
  // for you already.", which answered a misreading of a task long since
  // replaced (a sign-out button for a pretend app), and it was then drawn in
  // her own thread as a message from "You". The band over the window says
  // nothing in here is hers on every beat of the tutorial.
  it(`is written as a request a person would send, not as the walk talking to her`, () => {
    expect(PRACTICE_TASK.body.toLowerCase()).not.toContain('pretend');
    expect(PRACTICE_TASK.body).not.toContain(NAME);
    expect(PRACTICE_TASK.body.toLowerCase()).not.toContain('for you');
  });

  it('reads sensibly as the request that PRACTICE_ANSWER answers', () => {
    // The four rows already sitting in the inbox are past tense because they
    // are finished when she meets them. This one is not: it is the request, and
    // the answer arrives two seconds later.
    for (const row of PRACTICE_ROWS.filter((r) => !r.waiting)) {
      expect(row.title).toMatch(/^[A-Z]\w+ed\b|^The\b/);
    }
    expect(PRACTICE_ANSWER).toMatch(/^Done\./);
  });

  it('stays short enough to be a row title as well as a card', () => {
    // It is what her inbox row is called two beats later, beside four others.
    const longest = Math.max(...PRACTICE_ROWS.map((r) => r.title.length));
    expect(PRACTICE_TASK.title.length).toBeLessThanOrEqual(longest + 4);
  });

  it('no longer reassures her about something other than the sentence above it', () => {
    // The old body was 'This one is written for you. You do not have to think
    // of anything.', which is about the CARD rather than about the task, so it
    // read as being about some other thing entirely.
    expect(PRACTICE_TASK.body).not.toContain('You do not have to think of anything');
  });
});
