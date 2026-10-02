// SEVEN CHANGES FROM THE ROUND-FIVE REVIEW, PINNED.
//
// Walking the round-five page produced seven changes. Five of them are copy or
// layout and two of them turned out to be real faults visible on the screen
// without it being obvious what they were. Each one gets a test here, with the
// reason on it, because every one of them has already been re-litigated at
// least once in this file's history and the reason is the only thing that
// stops it happening again.
//
//   2. — pinned in the-practice-project-is-the-whole-app.
//   3. — pinned in the-introduction-shows-the-product.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, BOUNDS, COACHED, COPY, BEAT, IN_PRACTICE, UNDER,
  coach, finishedCleared, laterCleared, laterId, laterIndex, waitingIndex, walkRows,
} from '../renderer/src/onboarding.ts';
import { SECTION, fold } from '../renderer/src/agent-import-card.ts';
import { PRACTICE_NOTE, PRACTICE_ROWS, PRACTICE_SLUG } from '../shared/first-run-practice.mjs';
import { NOTE_NAME, readNote } from '../main/rail-note.mjs';
import { Store } from '../main/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const view = read('renderer/src/components/Onboarding.tsx');

async function freshStore() {
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-practice-'));
  const store = new Store({ accountRoot: account, products: [], personalProducts: [] });
  await store.init();
  // The watcher is real and this test does not want one running after it.
  store.watch = () => {};
  return { store, account };
}

describe('1. the line she rewrote herself', () => {
  it('says exactly what she wrote, and nothing about whole jobs', () => {
    const say = coach('where', 0, { view: 'inbox' });
    // The rewritten sentence still opens it; inbox zero is named after it as
    // the goal (w-ec62ab6b38, 2026-09-28).
    expect(say.quiet.startsWith('Great! Your inbox is now empty.')).toBe(true);
    expect(say.quiet).toMatch(/inbox zero/);
    expect(say.quiet).not.toMatch(/whole job/i);
  });
});

describe('4. the sidebar note, which the practice project really has', () => {
  it('writes the note into the practice project as the real file the panel reads', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    // `pinned.md` in the project's own folder, which is what main/rail-note.mjs
    // reads and writes. Nothing here is special-cased in the renderer: the
    // practice project simply has a note in it already.
    const file = path.join(account, PRACTICE_SLUG, NOTE_NAME);
    expect(fs.existsSync(file), `no ${NOTE_NAME} in the practice project`).toBe(true);
    const product = { dir: path.join(account, PRACTICE_SLUG) };
    const got = readNote({ product });
    expect(got.ok).toBe(true);
    expect(got.text).toBe(PRACTICE_NOTE);
  });

  it('holds the MIX a founder would actually keep, not a goals form', () => {
    // The first cut was two headings, **Goals this week** and **Next steps**,
    // and nothing else, which reads as the two things this panel is FOR. So
    // what is checked now is that it is a mix of kinds: a decision, a number, a
    // link and one thing to do next.
    expect(PRACTICE_NOTE).not.toMatch(/Goals/i);
    expect(PRACTICE_NOTE).toMatch(/cookies, not tokens/); // a decision
    expect(PRACTICE_NOTE).toMatch(/15 new users/);     // a number worth watching
    expect(PRACTICE_NOTE).toMatch(/practice\.local/);  // somewhere to go
    expect(PRACTICE_NOTE).toMatch(/^Next: /m);         // one thing to do next
    // Short enough for a 322px column. A wrapped line reads as a paragraph.
    for (const line of PRACTICE_NOTE.split('\n').filter(Boolean)) {
      expect(line.length, line).toBeLessThan(42);
    }
  });
});

describe('5. the bar at the bottom she could not read', () => {
  // The bar read "Closed: Added the sign-in route. Tests g · Z to undo": the
  // row's title cut mid-word at 32 characters, then a bare Z running straight
  // on from it, which read as one garbled word.
  it('never cuts a row title mid-word in a toast again', () => {
    expect(app).not.toMatch(/title\.slice\(0, 32\)/);
    expect(app).toMatch(/clipToSentence\(item\.title, TOAST_TITLE\)/);
  });

  it('names the key as a press, so it cannot read as part of the sentence', () => {
    expect(app).toMatch(/· press Z to undo/);
  });

  it('leaves every practice row whole in that bar', async () => {
    const { clipToSentence } = await import('../renderer/src/list-rules.ts');
    const budget = Number(/const TOAST_TITLE = (\d+);/.exec(app)[1]);
    for (const row of PRACTICE_ROWS) {
      const shown = clipToSentence(row.title, budget);
      // Either the whole title, or a clip that stopped on a word with an
      // ellipsis. Never a bare fragment of one.
      expect(shown === row.title || shown.endsWith('…'), `${row.title} -> ${shown}`).toBe(true);
      expect(shown).not.toMatch(/[A-Za-z]$/);
    }
  });

  it('says on the card that closing is reversible', () => {
    // IN THE QUIET LINE, on the first of the two presses.
    expect(coach('clear', 0).quiet).toMatch(/\bZ\b/);
    expect(coach('clear', 0).why).toBeUndefined();
  });
});

describe('6. snoozing, which is the third way a row leaves the inbox', () => {
  it('is a beat of the walk, inside the practice project', () => {
    expect(IN_PRACTICE).toContain('snooze');
    expect(COACHED).toContain('snooze');
    // Thirteen since the theme step went with the themes (w-9e434e8671).
    expect(BEAT.snooze).toBe(13);
    // Between closing the finished ones and answering the stopped one, which is
    // the order the three shapes of row are in the list.
    expect(BEAT.clear).toBeLessThan(BEAT.snooze);
    expect(BEAT.snooze).toBeLessThan(BEAT.unblock);
  });

  // L, NOT S, SINCE 2026-10-01. S also toggled the summary inside a thread, so
  // the app said one letter for two things and this beat taught the half the
  // app was about to stop answering. L is "later" and nothing else uses it.
  it('names L, which is the app\'s own key, and says why an empty inbox matters', () => {
    const say = coach('snooze', 0);
    expect(say.key).toBe('L');
    // THE GOAL IS IN THE QUIET LINE SINCE 2026-08-28. It was 'An empty inbox
    // is the goal. Putting something off is how you get there honestly.' on a
    // third line; the idea survives in five words above the key, where
    // somebody deciding whether to press L is already looking.
    expect(say.quiet).toMatch(/empty inbox/i);
    expect(say.why).toBeUndefined();
    // The app really binds it, so nothing was added to make this beat work.
    expect(app).toMatch(/e\.key === 'l' \|\| e\.key === 'L'/);
    // AND IT NAMES NO CLICK, WHICH IS THE ONE BEAT OF THE 2026-10-01 ROUND
    // THAT COULD NOT HAVE ONE. It said "or click Later on the row" for an hour,
    // with the row's chip made into a button to match; the chip is drawn only
    // while the walk is on, so that taught a control the real app does not
    // have. The whole of it is in
    // tests/every-tutorial-beat-says-what-to-click.test.mjs.
    expect(`${say.lead}${say.tail}`).not.toContain('click');
  });

  it('has a second sentence for the picker that opens over the row', () => {
    const picking = coach('snooze', 0, { picking: true });
    expect(picking.quiet).toMatch(/come back/i);
    // No key on the second half: the picker is a list to choose from, and a
    // card naming a key that is not the way through is a dead key by the rule
    // in the-walk-promises-no-dead-keys.
    expect(picking.key).toBeNull();
    expect(ANCHOR.snooze[0]).toBe('.modal.snooze .palette-list');
  });

  it('rings the row that is not for today and keeps the card off the stack', () => {
    expect(ANCHOR.snooze).toContain('.list-pane .row');
    expect(BOUNDS.snooze).toBe('.list-pane');
    expect(UNDER.snooze).toBe('.list-pane .row:last-of-type');
    expect(view).toMatch(/run\.step === 'snooze' && later && !picking/);
  });

  it('has exactly one row it is right for, and it is neither of the other two shapes', () => {
    const later = laterIndex(PRACTICE_ROWS);
    const waiting = waitingIndex(PRACTICE_ROWS);
    expect(later).toBeGreaterThanOrEqual(0);
    expect(later).not.toBe(waiting);
    expect(PRACTICE_ROWS[later].later).toBe(true);
    expect(PRACTICE_ROWS[later].waiting).toBeUndefined();
  });

  it('does not end the closing beat until the two FINISHED rows are gone', () => {
    // The whole point of the three beats is that a different move is right on
    // each row, so closing the snoozeable one must not be what moves the walk
    // on, exactly as closing the stopped one must not.
    const ids = PRACTICE_ROWS.map((_, i) => `w-ex${i + 1}`);
    const run = { examples: ids };
    const later = laterIndex(PRACTICE_ROWS);
    const waiting = waitingIndex(PRACTICE_ROWS);
    const left = (keep) => keep.map((i) => ({ id: ids[i] }));
    // Both finished ones still there: not over.
    expect(finishedCleared(left([0, 1, later, waiting]), run, waiting, later)).toBe(false);
    // One finished one left: still not over.
    expect(finishedCleared(left([1, later, waiting]), run, waiting, later)).toBe(false);
    // Both finished ones gone, the other two still sitting there: over.
    expect(finishedCleared(left([later, waiting]), run, waiting, later)).toBe(true);
  });

  it('ends the snooze beat when that row leaves the inbox, however it left', () => {
    const ids = PRACTICE_ROWS.map((_, i) => `w-ex${i + 1}`);
    const run = { examples: ids };
    const later = laterIndex(PRACTICE_ROWS);
    expect(laterId(run, later)).toBe(ids[later]);
    expect(laterCleared([{ id: ids[later] }], run, later)).toBe(false);
    expect(laterCleared([{ id: ids[0] }], run, later)).toBe(true);
  });

  it('keeps all four practice rows on the screen for the beat', () => {
    const ids = PRACTICE_ROWS.map((_, i) => `w-ex${i + 1}`);
    const run = { step: 'snooze', examples: ids, item: 'w-first' };
    const rows = [...ids, 'w-someone-elses'].map((id) => ({ id }));
    expect(walkRows(rows, run).map((r) => r.id)).toEqual(ids);
  });
});

describe('7. the agents on the last card are hers, and the card says so', () => {
  it('says they are already on this Mac rather than offering them from nowhere', () => {
    // IT MOVED UP A LINE ON 2026-08-28 AND IT IS STILL ON THE CARD. The 08-24
    // point stands and "already on this Mac" is now the headline itself, so the
    // second line is free to say what the press does instead of repeating where
    // they came from. The claim tested is that the card says it, not that a
    // particular string does.
    expect(`${COPY.bringHead} ${COPY.agentsOffer}`).toMatch(/this Mac/);
    expect(COPY.bringHead).toMatch(/this Mac/);
    expect(COPY.agentsOffer).toMatch(/inbox/);
  });

  // AND SINCE 2026-08-27 IT PRINTS THE FOLDER ON EVERY SECTION, not on the one
  // side of a switch you happen to be looking at. The walk draws the import card
  // now, and that card's rows carry `where`, which is the real folder each set
  // of agents was read out of.
  it('prints the folder every set of agents was really read out of', () => {
    const card = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'renderer/src/components/ImportAgents.tsx'), 'utf8');
    // The home folder set names the folder Claude Code loads it from; every
    // other section names its own, off the path the scan really walked.
    expect(card).toContain('{d.kind === \'everywhere\' ? <>{SECTION.homeFolder}. {homeLine(d)}</> : d.where}');
    expect(SECTION.homeFolder).toBe('~/.claude/agents');
    // And the walk still says out loud that these came off this Mac.
    expect(view).toMatch(/line: COPY\.agentsOffer,/);
  });

  it('shortens the home folder, the way every other path in the app is shortened', async () => {
    // `fold` is where this lives now. Same substitution, one copy of it, used
    // by every path the import card prints.
    const mod = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'renderer/src/agent-import-card.ts'), 'utf8');
    const fn = mod.slice(mod.indexOf('export function fold('), mod.indexOf('/* ------'));
    expect(fn).toMatch(/\\\/Users\\\/\[\^\/\]\+/);
    expect(fold('/Users/you/Desktop/dev/x')).toBe('~/Desktop/dev/x');
  });
});
