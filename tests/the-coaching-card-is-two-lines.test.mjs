// MARGARETTE'S FOUR, PINNED.
//
// The founder walked a brand new user through the onboarding — the least
// technical person she has interviewed — and four of the things that went wrong
// are words and small layout inside the walk. Her notes, verbatim, because each
// of these is the sort of thing a later session undoes by accident:
//
// The task is fiction about somebody else's app and nothing on the card said
// so. 3. The ⌘K card said "Press ⌘K any time" and stopped. Every card before it
// ends on a next step, so the pattern broke on the last one and she did not
// know what to do.
//
// WHAT THIS FILE HOLDS IS THE BUDGET AND THE FOLDS. Cutting a line is easy and
// cutting a sentence she asked for by name is the failure mode: three of the
// four deleted lines were hers. So every one of them is asserted to be still on
// the walk, in the two lines that remain.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COACHED, KEY_NAMES, coach, keyName,
} from '../renderer/src/onboarding.ts';
import { PRACTICE_ANSWER, PRACTICE_ROWS, PRACTICE_TASK } from '../shared/first-run-practice.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const drawn = read('renderer/src/components/Onboarding.tsx');
const css = read('renderer/src/styles.css');

/**
 * EVERY CARD THE WALK CAN DRAW, including both halves of the beats that have
 *  two and all four stops of the tab tour. A budget that only holds on the
 *  cards somebody remembered to list is not a budget: the beat she photographed
 *  was one of the halves. */
function everyCard() {
  const cards = [];
  for (const step of COACHED) {
    cards.push([step, coach(step, 0)]);
    cards.push([`${step} (slow)`, coach(step, 30_000)]);
    cards.push([`${step} (opened)`, coach(step, 0, { opened: true })]);
    cards.push([`${step} (picking)`, coach(step, 0, { picking: true })]);
    cards.push([`${step} (one left)`, coach(step, 0, { left: 1 })]);
    for (const view of ['inbox', 'snoozed', 'progress', 'done']) {
      cards.push([`${step} (${view})`, coach(step, 0, { view })]);
    }
  }
  return cards.filter(([, c]) => c);
}

describe('3. a coaching card is two lines, everywhere in the walk', () => {
  it('has nowhere to put a third line, on any beat or any half of one', () => {
    for (const [name, card] of everyCard()) {
      expect(card.why, `${name} has a third line`).toBeUndefined();
      expect(Object.keys(card).sort(), `${name} has a field to hide one in`)
        .toEqual(card.caps ? ['caps', 'key', 'lead', 'quiet', 'tail'] : ['key', 'lead', 'quiet', 'tail']);
    }
  });

  it('draws no third line either, and has no style left for one', () => {
    expect(drawn).not.toContain('className="fr-why"');
    expect(css).not.toMatch(/\.fr-why\s*\{/);
  });

  it('never writes one back in through `say`', () => {
    // The helper's own signature is the gate: a beat cannot pass a `why` even
    // by accident, because there is no parameter to pass it as.
    const logic = read('renderer/src/onboarding.ts');
    // Cut at the heading's words, not at the comment punctuation in front of
    // them: a doc block gets re-opened onto its own line whenever the prose
    // under it is edited, and a slice that ends at `-1` is the whole file.
    const end = logic.indexOf('THE WORDS OF THE WALK');
    expect(end).toBeGreaterThan(0);
    const helper = logic.slice(logic.indexOf('const say = ('), end);
    expect(helper).toContain('extra: { caps?: number } = {}');
    expect(helper).not.toContain('why');
  });

  /*
   * AND NOTHING SHE ASKED FOR BY NAME WENT WITH THE LINE. This is the half that
     matters: on 2026-08-27 two shorter looks were rejected precisely because
     they deleted these sentences to make the card look tidy, and the difference
     between that and this is that these are all still said. */
  it('still teaches undo, which is hers by name', () => {
    // It was 'Nothing you close here is lost. Z brings the last one straight
    // back.' on a third line.
    const first = coach('clear', 0, { left: 2 });
    expect(first.quiet).toMatch(/\bZ\b/);
    expect(first.quiet.toLowerCase()).toContain('brings back');
    // AND ONCE, not on both presses.
    const second = coach('clear', 0, { left: 1 });
    expect(second.quiet).not.toMatch(/\bZ\b/);
    expect(second.quiet).not.toBe(first.quiet);
  });

  it('still says an empty inbox is the goal, on the beat about putting work off', () => {
    expect(coach('snooze', 0).quiet.toLowerCase()).toContain('empty inbox is the goal');
  });

  it('still refuses to let anybody close an agent that is stopped', () => {
    // The one move the product exists to stop. It was on a third line and it is
    // now the sentence describing the row, so it is read before the key rather
    // than after it.
    const listed = coach('unblock', 0);
    expect(listed.quiet.toLowerCase()).toContain('stopped for good');
    expect(listed.key).toBe('↵');
  });

  it('keeps the lights, because a light is not a line of text', () => {
    // Two presses, two lights, on the one beat that wants two.
    expect(coach('clear', 0).caps).toBe(2);
    expect(drawn).toContain('<Lights');
  });
});

describe('4. the last card ends on the thing she does next', () => {
  const card = coach('command', 0);

  it('names her own first real task rather than stopping on a permission', () => {
    // "Press ⌘K any time" is a permission, not a step, and it was the last
    // thing the walk said. a tester did not know what to do with it.
    const said = `${card.quiet} ${card.lead}${card.key}${card.tail}`;
    // w-ec62ab6b38 (2026-09-28): her word for a row is thread now, not task.
    expect(said.toLowerCase()).toContain('first real thread');
    expect(said).not.toMatch(/any time\.?$/);
  });

  it('still teaches the key, and still ends on the press the beat wants', () => {
    expect(card.key).toBe('⌘K');
    expect(card.lead).toBe('Press ');
  });

  it('claims nothing about being over, because two cards still come after it', () => {
    // The card that said "that's it" while the walk carried on was cut on
    // 2026-08-23. The agents card and the confetti are still to come.
    const said = `${card.quiet} ${card.lead}${card.tail}`.toLowerCase();
    for (const ending of ['that is it', "that's it", 'all done', 'finished', 'you are ready']) {
      expect(said, ending).not.toContain(ending);
    }
  });

  it('is two lines like every other card', () => {
    expect(card.why).toBeUndefined();
    // And the loud line is one sentence. It was two, and it wrapped.
    expect(`${card.lead}${card.tail}`.split('.').filter((s) => s.trim()).length).toBe(1);
  });
});

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

  it('reaches every ⇥ in the tab tour, which is where she lost it', () => {
    const tour = ['inbox', 'snoozed', 'progress', 'done']
      .map((view) => coach('where', 0, { view }));
    expect(tour).toHaveLength(4);
    // THE CAP IS ⇥ AT EVERY STOP AGAIN SINCE 2026-10-02 (w-914b16eab6). From
    // 2026-09-23 it was the destination's own number, ⌘1 to ⌘4; those keys are
    // gone and Tab walks the tabs. So every stop prints ⇥, and ⇥ is named Tab
    // inside its cap, because the glyph alone is what she could not read.
    for (const card of tour) {
      expect(card.key).toBe('⇥');
      expect(keyName(card.key)).toBe('Tab');
    }
  });

  it('draws the name inside the same cap, not as a second kind of key', () => {
    // One component, so a cap cannot appear with its name on one screen and
    // without it on the next.
    const cap = drawn.slice(drawn.indexOf('export function Cap('), drawn.indexOf('/** THE CARD ITSELF'));
    expect(cap).toContain('<kbd className={className}>');
    expect(cap).toContain('className="fr-cap-word"');
    expect(cap).toContain('keyName(cap)');
    // The card and the walk's own Next buttons both go through it, so no bare
    // <kbd> holding a glyph is left anywhere in the walk.
    expect(drawn).not.toContain('<kbd>↵</kbd>');
    expect(drawn).toContain('<Cap');
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
    expect(PRACTICE_TASK.body).toContain('Practice');
  });

  it(`says out loud that it is neither her code nor ${NAME}`, () => {
    // Her exact misreading was that it was a button for signing out of Agentbox.
    expect(PRACTICE_TASK.body.toLowerCase()).toContain('pretend');
    expect(PRACTICE_TASK.body).toContain(NAME);
  });

  it('reads sensibly as the request that PRACTICE_ANSWER answers', () => {
    // The four rows already sitting in the inbox are past tense because they
    // are finished when she meets them. This one is not: it is the request, and
    // the answer arrives two seconds later.
    for (const row of PRACTICE_ROWS.filter((r) => !r.waiting)) {
      expect(row.title).toMatch(/^[A-Z]\w+ed\b|^The\b/);
    }
    expect(PRACTICE_ANSWER).toMatch(/^Done,/);
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
