// The reply box wears the new-task card's footer.
//
// The footer looked messy, and that had numbers behind it, measured in the
// running app before the change: the reply footer drew FOUR font sizes, FIVE
// baselines, FIVE bordered boxes and TWO icons, against the card's two sizes,
// one text run and none of either. The card had the same problem earlier, and
// the card's answer is the law in styles.css: one size, one baseline, two
// inks, no icons.
//
// So these tests hold the reply footer to that answer, and to the one thing
// that must NOT be shared with the card: a reply cannot set a start time.
// A runAt written under the user's own name is a SNOOZE, and it hides the
// row being replied on.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repeatList, whenLabel, WHEN_NOW } from '../renderer/src/components/When';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// The reply footer's markup, so a claim about it is made against the real file.
const dock = focus.slice(focus.indexOf('function DockComposer'));

describe('the reply footer is the card\'s footer', () => {
  it('is one sentence, not a row of pills', () => {
    expect(dock).toMatch(/className="compose-sentence"/);
    expect(dock).toMatch(/className="compose-clauses"/);
    // The row it replaces, and the two hints that sat in it.
    expect(dock).not.toMatch(/dock-foot/);
    expect(dock).not.toMatch(/paste or drop files to attach/);
  });

  it('draws priority as a word, which is the variant that carries no icon', () => {
    expect(dock).toMatch(/variant="word"/);
  });

  it('uses the card\'s own clock control rather than a second schedule list', () => {
    // Two lists of the same four schedules is how the card and the dock drifted
    // apart the first time; the dock's ↻ tag was the second list.
    expect(dock).toMatch(/<WhenPicker/);
    expect(dock).not.toMatch(/RepeatPicker/);
    expect(focus).not.toMatch(/from '\.\/Repeat'/);
  });

  it('sends with the app\'s own button, keycap inside it', () => {
    expect(dock).toMatch(/className="dock-send"[\s\S]{0,160}Send <kbd>⌘↵<\/kbd>/);
  });

  it('opens its menus UPWARD, because this footer sits at the bottom', () => {
    // The card sits near the top of the window and its menus drop. The same
    // sentence at the bottom of the window would open both of them off the
    // screen; measured before this rule existed, the priority drawer alone is
    // 145px tall against 88px of room below the dock.
    expect(css).toMatch(/\.dock-card \.compose-word-wrap \.prio-menu,\s*\n\.dock-card \.when-menu \{[^}]*bottom: calc\(100% \+ 8px\)/);
  });
});

describe('a reply can say how often, never when to start', () => {
  it('refuses a typed moment on the reply\'s page', () => {
    // "9am" is a perfectly good moment, and on the card's first page it makes a
    // row. Here it must not: taking it would write a runAt under her name.
    const rows = repeatList('9am', Date.now(), true);
    expect(rows.filter((r) => r.typed)).toEqual([]);
    expect(rows.every((r) => r.value.runAt === 0)).toBe(true);
  });

  it('still takes a typed rule, in her own words', () => {
    const rows = repeatList('every friday at 5pm', Date.now(), true);
    expect(rows[0].typed).toBe(true);
    expect(rows[0].label).toBe('Every friday at 5pm');
    expect(rows[0].hint).toBe('Fridays at 5:00pm');
    expect(rows[0].value.repeat).toEqual({ every: 'week', on: 5, at: '17:00' });
    expect(rows[0].value.runAt).toBe(0);
  });

  it('leaves the card\'s own page alone', () => {
    // Same call without the flag is the card, where a moment IS an answer.
    const rows = repeatList('9am', Date.now());
    expect(rows.some((r) => r.typed && r.value.runAt > 0)).toBe(true);
  });

  it('says "Runs once" where the card says "Starts now"', () => {
    // The card asks about a beginning. The thread has already begun, so the
    // only thing left to set is whether it comes back.
    expect(whenLabel(WHEN_NOW, 'Runs once')).toBe('Runs once');
    expect(whenLabel(WHEN_NOW)).toBe('Starts now');
    // A rule reads the same on both, because it is the same rule.
    const rule = { every: 'weekday', at: '09:00' };
    expect(whenLabel({ runAt: 0, repeat: rule }, 'Runs once')).toBe(whenLabel({ runAt: 0, repeat: rule }));
  });
});
