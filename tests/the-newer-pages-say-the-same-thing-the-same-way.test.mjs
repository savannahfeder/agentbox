// THE NEWER PAGES SAY THE SAME THING THE SAME WAY.
//
// Read side by side in light mode at 1440x900: the Files page's tabs began 12 px
// left of its "Files" title (fixed 32 px padding, title on --text-x); Today said
// "Waits on you" where a person's place and every row's status say "Waiting on
// you"; a place said "On now" and "under way" where the tab says In progress;
// Today and the file view wrote 5:31 AM where a thread writes 5:31am; and each
// page had its own small-label spacing and empty-line size.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lineWhen } from '../renderer/src/team/today.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => new RegExp(`^${sel.replace('.', '\\.')}[^{]*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
const today = read('renderer/src/team/today.css');
const files = read('renderer/src/files/files-place.css');
const place = read('renderer/src/team/everything/everything.css');
const app = read('renderer/src/App.tsx');

describe('the same words', () => {
  it('Waiting on you on a place and a row, never Waits on you', () => {
    const page = read('renderer/src/team/TodayPage.tsx');
    expect(page).not.toContain('Waits on you');
    expect(app).toContain('<PlaceList title="Waiting on you"');
  });
  it('In progress on a place, as on the tab', () => {
    expect(app).toContain('<PlaceList title="In progress"');
    expect(app).not.toContain('title="On now"');
    expect(app).not.toMatch(/nothing under way|Nothing under way/);
  });
  it('one way to write a time', () => {
    const at = new Date(2026, 9, 31, 9, 5).getTime();
    expect(lineWhen(at, 'today', at)).toBe('9:05am');
    expect(read('renderer/src/components/ArtifactView.tsx')).not.toContain('toLocaleTimeString');
  });
});

describe('the same spacing', () => {
  it('Files lines its tabs up with its title, as Today does', () => {
    expect(rule(files, '.fp-page')).toContain('var(--text-x, 32px)');
    expect(rule(files, '.fp-page')).toContain('var(--row-r, 24px)');
    expect(rule(today, '.td')).toContain('var(--text-x, 32px)');
  });
  it('one small label', () => {
    expect(rule(files, '.fp-sent-label')).toMatch(/font: 11px var\(--mono\); letter-spacing: \.08em/);
    expect(place).toMatch(/\.pl-sec h3 \{[^}]*font: 11px var\(--mono\)[^}]*letter-spacing: \.08em/);
  });
  it('one empty line', () => {
    for (const r of [rule(files, '.fp-empty'), rule(today, '.td-empty')]) expect(r).toMatch(/font-size: 13\.5px; line-height: 20px; color: var\(--text-faint\)/);
    expect(rule(files, '.fp-empty')).toMatch(/margin: 26px 0 0/);
  });
});
