// The card can say "start it later", and the card and the inbox mean the same
// thing by it.
//
// Both halves of that were already built and neither was reachable while she
// was writing: "In 30 minutes" is the first preset S offers on an inbox row,
// and repeating lived behind a ↻ tag. The card now asks both with one word
// ("Starts now"), and this is the proof that the word is not decoration:
//
//   1. the two grammars are read in the right ORDER, so "every friday at 5pm"
//      is a rule and not a one-off at five;
//   2. a refusal is a refusal, never a fall-through to a preset (2026-08-10);
//   3. a runAt sent with the compose actually LANDS on disk, as the founder's,
//      in one write.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readWhen, whenLabel, whenPreview, startList, repeatList, WHEN_NOW,
} from '../renderer/src/components/When';


describe('what she types into the clock', () => {
  it('reads a recurrence as a recurrence, not as the time inside it', () => {
    const read = readWhen('every friday at 5pm');
    expect(read.repeat).toEqual({ every: 'week', on: 5, at: '17:00' });
    // The trap: parseWhen would happily take "5pm" out of that phrase and set a
    // one-off for this evening. A rule carries its own first moment.
    expect(read.runAt).toBe(0);
  });

  it('reads a moment as a moment', () => {
    const before = Date.now();
    const read = readWhen('30m');
    expect(read.repeat).toBe(null);
    expect(read.runAt).toBeGreaterThanOrEqual(before + 29 * 60_000);
    expect(read.runAt).toBeLessThanOrEqual(Date.now() + 31 * 60_000);
  });

  it('refuses what neither grammar reads, rather than guessing', () => {
    expect(readWhen('when the vibes are right')).toBe(null);
    expect(readWhen('')).toBe(null);
  });

  // That phrase was refused by every grammar in the app until this test existed,
  // which mattered more the moment the box started reading back: the preview
  // would have said "not a time" to the most natural example there is.
  it('reads the numbers she says out loud, not just the ones she types', () => {
    const before = Date.now();
    const read = readWhen('in three hours');
    expect(read.repeat).toBe(null);
    expect(read.runAt).toBeGreaterThanOrEqual(before + 2.9 * 3_600_000);
    expect(read.runAt).toBeLessThanOrEqual(Date.now() + 3.1 * 3_600_000);

    const mins = readWhen('in thirty minutes');
    expect(mins.runAt).toBeGreaterThanOrEqual(before + 29 * 60_000);
    expect(mins.runAt).toBeLessThanOrEqual(Date.now() + 31 * 60_000);

    expect(readWhen('half an hour').runAt).toBeGreaterThanOrEqual(before + 29 * 60_000);
  });

  it('still hears a spelled-out hour as a clock time, not as a count', () => {
    // "six pm" is 6pm today or tomorrow, never six hours from now. The word
    // rule only turns the word into a digit; the clock rule still owns it.
    const at = readWhen('six pm');
    expect(at.repeat).toBe(null);
    expect(new Date(at.runAt).getHours()).toBe(18);
  });
});

// TYPING FILTERS THE MENU.
describe('the menu she filters by typing', () => {
  const NINE_AM = new Date('2026-08-14T09:00:00').getTime();

  it('says nothing until she types: the presets are the whole list', () => {
    const rows = startList('', NINE_AM);
    expect(rows.map((r) => r.label)).toEqual([
      'Now', 'In 30 minutes', 'In 4 hours', 'This evening', 'Tomorrow',
    ]);
    expect(rows.some((r) => r.typed)).toBe(false);
  });

  it('gives back "in 25 minutes" IN HER WORDS, with the clock on the right', () => {
    const rows = startList('in 25 minutes', NINE_AM);
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('In 25 minutes');
    expect(rows[0].typed).toBe(true);
    // The clock has not gone anywhere. It is the hint, where "In 30 minutes"
    // has always kept its own, and not the answer she has to read.
    expect(rows[0].hint).toMatch(/9:25/);
    expect(rows[0].value.runAt).toBe(NINE_AM + 25 * 60_000);
  });

  it('shows the preset ONCE when she types what a preset already says', () => {
    const rows = startList('in 30 minutes', NINE_AM);
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('In 30 minutes');
    expect(rows[0].typed).toBeUndefined();
  });

  it('narrows to the rows that still match her half-typed word', () => {
    expect(startList('in ', NINE_AM).map((r) => r.label))
      .toEqual(['In 30 minutes', 'In 4 hours']);
    expect(startList('tomo', NINE_AM).some((r) => r.label === 'Tomorrow')).toBe(true);
  });

  it('leaves nothing on screen for a phrase it cannot read', () => {
    // An empty list is what makes the menu draw its one dim "not a time" row.
    expect(startList('when the vibes are right', NINE_AM)).toEqual([]);
  });

  it('filters the repeats page the same way, so one habit works on both', () => {
    const mine = repeatList('every friday at 5pm', NINE_AM);
    expect(mine[0].label).toBe('Every friday at 5pm');
    expect(mine[0].typed).toBe(true);
    expect(mine[0].value.repeat).toEqual({ every: 'week', on: 5, at: '17:00' });
    expect(mine[0].hint).toBe('Fridays at 5:00pm');

    const preset = repeatList('every morning at 8:00am', NINE_AM);
    expect(preset.length).toBe(1);
    expect(preset[0].typed).toBeUndefined();
  });
});

// The hint column's words: the clock a row comes out as, which is how a typed
// row keeps the exact time without printing it in place of the typed words.
describe('the clock on the right of a row', () => {
  it('gives a clock for a moment later today', () => {
    const now = new Date('2026-08-14T09:00:00').getTime();
    const value = { runAt: now + 3 * 3_600_000, repeat: null };
    expect(whenPreview(value, now)).toMatch(/12:00/);
  });

  it('carries the day when the moment is not today', () => {
    const now = new Date('2026-08-14T09:00:00').getTime();
    const tomorrow = new Date('2026-08-15T08:00:00').getTime();
    expect(whenPreview({ runAt: tomorrow, repeat: null }, now)).toMatch(/SAT/i);
  });

  it('shows a recurrence as the rule itself', () => {
    expect(whenPreview({ runAt: 0, repeat: { every: 'weekday', at: '09:00' } }))
      .toBe('weekdays at 9:00am');
  });

  it('says nothing it cannot read: a refusal has no preview to print', () => {
    expect(readWhen('when the vibes are right')).toBe(null);
  });
});

describe('the word in the sentence', () => {
  it('says "Starts now" by default, which is a true sentence about the task', () => {
    expect(whenLabel(WHEN_NOW)).toBe('Starts now');
  });

  it('reads back a delayed start in minutes', () => {
    expect(whenLabel({ runAt: Date.now() + 30 * 60_000, repeat: null })).toBe('Starts in 30 minutes');
  });

  it('lets the schedule replace the start clause, because it answers the same question', () => {
    expect(whenLabel({ runAt: 0, repeat: { every: 'weekday', at: '09:00' } })).toBe('Weekdays at 9:00am');
  });

  it('is capitalised, because it is a clause in a sentence and not a tag', () => {
    const label = whenLabel({ runAt: 0, repeat: { every: 'day', at: '08:00' } });
    expect(label[0]).toBe(label[0].toUpperCase());
  });
});

describe('a task composed to start later', () => {
  let tmp; let store; let product;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-later-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    const productDir = path.join(accountRoot, 'testprod');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'testprod', name: 'Test Product',
    }));
    const { Store } = await import('../main/store.mjs');
    store = await new Store({
      storeRoot: tmp, accountId: 'test-account', accountRoot, products: [],
    }).init();
    [product] = store.listProducts();
  });

  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('lands on disk with her moment on it, written as hers', () => {
    const at = Date.now() + 30 * 60_000;
    const item = store.composeItem(product.slug, { title: 'Chase the Stripe verification', runAt: at });
    const written = store.listItems().find((i) => i.id === item.id);
    expect(written.runAt).toBe(at);
    // The user's, not an agent's. list-rules.ts treats the two differently: an
    // agent's future runAt hides a row, and the founder's does not.
    expect(written.wrote.runAt.source).toBe('founder');
  });

  it('still starts now when she did not ask for later', () => {
    const item = store.composeItem(product.slug, { title: 'Chase it now' });
    const written = store.listItems().find((i) => i.id === item.id);
    expect(written.runAt ?? 0).toBe(0);
  });
});
