// MARGARETTE'S ONBOARDING, THE COMPOSE CARD.
//
// She is the first non-technical person to be walked through Agentbox, and three
// of the notes off that call are about one card. Two of them are pinned here.
//
// 1. A TASK INTO THE PRACTICE PROJECT WAS ACCEPTED AND NEVER RAN.Nothing was
// broken. main/supervisor.mjs skips practice projects in four separate places
// on purpose — nobody works in one and it points at no folder — and the card
// did not know, so it took her task, filed it, and left her watching a row
// that could never move. The status she saw flapping was the same fault from
// the other end: there was never a run behind it.
//
//    THE FIX IS THE CARD SAYING NO. Making practice projects runnable is the
//    one repair that is not allowed, so these tests hold the refusal in place
//    from both ends: the rule that decides, and the fact that no path through
//    the card can send anyway.
//
// 2. The card closed, the inbox looked the same, and she read a success as a
// failure.
//
// The words themselves are tested, not only the plumbing, because copy is part
// of the design here (CLAUDE.md) and a refusal nobody finishes reading is a
// refusal that did not happen.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRACTICE_REFUSAL, practiceRefusal, sentLine } from '../renderer/src/compose-says.ts';

const source = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const compose = source('../renderer/src/components/Compose.tsx');
const app = source('../renderer/src/App.tsx');
const css = source('../renderer/src/styles.css');

// The two shapes the card ever holds, as main/store.mjs really hands them over:
// the practice mark is written off project.json, never matched on a name.
const practice = { name: 'Practice', practice: true };
const real = { name: 'Kestrel' };

describe('a task of her own into the practice project', () => {
  it('is refused, with a sentence', () => {
    expect(practiceRefusal(practice)).toBe(PRACTICE_REFUSAL);
  });

  it('is the only thing refused: a real project takes the task', () => {
    expect(practiceRefusal(real)).toBe(null);
    // No project picked yet is not a refusal either; the card already declines
    // to send without one, and two reasons for one dead button is one too many.
    expect(practiceRefusal(null)).toBe(null);
    expect(practiceRefusal(undefined)).toBe(null);
  });

  // A REAL PROJECT SOMEBODY CALLED "Practice" IS REAL WORK. The flag decides,
  // and this is the test that stops anybody ever reaching for the name.
  it('does not refuse a real project that happens to be called Practice', () => {
    expect(practiceRefusal({ name: 'Practice' })).toBe(null);
    expect(practiceRefusal({ name: 'Practice', practice: false })).toBe(null);
  });

  // THE WALK'S OWN EXAMPLE TASK STILL GOES.
  it('still lets the first run send its own scripted task', () => {
    expect(practiceRefusal(practice, { scripted: true })).toBe(null);
  });
});

describe('the refusal reads as English to somebody who does not code', () => {
  it('says where it is and what to do instead', () => {
    expect(PRACTICE_REFUSAL).toMatch(/Practice/);
    expect(PRACTICE_REFUSAL).toMatch(/Pick one of your own projects/);
  });

  // A DENSE SCREEN IS A FAILED SCREEN (CLAUDE.md). Two sentences, and short
  // enough that the card does not grow a paragraph while she is typing in it.
  it('is two short sentences and nothing else', () => {
    expect(PRACTICE_REFUSAL.length).toBeLessThan(160);
    expect(PRACTICE_REFUSAL.split('.').filter((s) => s.trim()).length).toBe(2);
  });

  it('carries no jargon and no blame', () => {
    for (const word of [
      'supervisor', 'project.json', 'flag', 'queue', 'queued', 'session',
      'ledger', 'store', 'error', 'invalid', 'cannot', 'failed', 'sorry',
    ]) {
      expect(PRACTICE_REFUSAL.toLowerCase()).not.toContain(word);
    }
  });
});

describe('the card cannot send a refused task by any route', () => {
  // The button is one route and ⌘↵ is the other, and the keyboard is how this
  // card is actually used. A guard on the button alone is not a guard.
  it('disables Start it and returns before the send', () => {
    expect(compose).toMatch(/const canSend = \(.*\) && !refusal;/);
    expect(compose).toMatch(/if \(refusal\) return;/);
  });

  it('asks the rule rather than keeping a second copy of it', () => {
    expect(compose).toMatch(/practiceRefusal\(product, \{ scripted: !!prefill \}\)/);
    // Nothing in the card may match on the name or the slug: that is the same
    // mistake in a new place.
    expect(compose).not.toMatch(/=== 'practice'/);
  });
});

describe('the card says which project the task is going to', () => {
  // The footer's resting clause is the project (her pick), but it was only
  // drawn when there was more than one project to choose between. A practice
  // project always names itself, because there the answer decides whether
  // anything happens at all, and "where did it go" is exactly what she could
  // not tell.
  it('names a practice project even when it is the only one', () => {
    expect(compose).toMatch(/const hasProjectClause = shown\.length > 1 \|\| !!product\?\.practice;/);
  });

  // ONE FACT, TWO READERS. The clause and the footer's own rule read the same
  // constant, so the card cannot draw a clause the rule thinks is absent.
  it('draws the clause off the same fact the footer rule is given', () => {
    expect(compose).toMatch(/\{hasProjectClause && \(/);
    expect(compose).toMatch(/hasProjectClause,\n\s*\};/);
  });
});

describe('the confirmation on send', () => {
  it('names the project it went to', () => {
    expect(sentLine({ to: 'Kestrel' })).toBe('Started in Kestrel · Z to undo');
  });

  // A task she asked to start later has still been SENT; it just has not
  // started. Dropping either half is how "Queued" became a small lie.
  it('says so and still says when it starts', () => {
    expect(sentLine({ to: 'Kestrel', when: 'Starts in 30 minutes' }))
      .toBe('Scheduled in Kestrel · Starts in 30 minutes · Z to undo');
  });

  it('keeps the way back in the sentence', () => {
    expect(sentLine({ to: 'Kestrel' })).toContain('Z to undo');
  });

  it('is not our own machinery said out loud', () => {
    expect(sentLine({ to: 'Kestrel' })).not.toContain('Queued');
    expect(sentLine({ to: 'Kestrel' })).not.toContain('→');
  });
});

describe('it is the toast the app already has', () => {
  // REUSE, NOT A SECOND MECHANISM. The toast is one element, one rule, one
  // z-index that was already fixed once for being painted under the setup
  // screens, and once again for sitting on top of the reply box. A second
  // transient message would have to relearn both.
  it('is raised through showToast, from where the card is closed', () => {
    expect(app).toMatch(/showToast\(sentLine\(\{/);
  });

  it('adds no second transient element to the card', () => {
    expect(compose).not.toContain('toast');
    expect(css.match(/^\.toast \{/gm) ?? []).toHaveLength(1);
  });

  // The rule that moves it out of the reply composer's way is load-bearing and
  // easy to delete by accident while editing the block above it.
  it('leaves the rule that gets out of the composer\'s way alone', () => {
    expect(css).toContain('.app.composing .toast { bottom: auto; top: 74px; }');
  });
});

describe('the refusal wears no alarm colour', () => {
  // Twice rejected already: the sidebar and the footer's unsaved edit. It is
  // one rule.
  it('only lifts the ink', () => {
    const block = css.match(/\.compose-note\.refuses \{([^}]*)\}/);
    expect(block).not.toBe(null);
    const body = block[1];
    expect(body).toContain('color: var(--text-dim)');
    // No literal colours at all, so nobody can slip an amber in as a hex.
    expect(body).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(body).not.toMatch(/\b(red|orange|amber|crimson|rgb|hsl)\b/i);
    expect(body).not.toMatch(/background/);
  });
});
