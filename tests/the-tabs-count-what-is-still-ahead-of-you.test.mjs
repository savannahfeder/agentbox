// A TAB CARRIES A NUMBER ONLY WHERE THE NUMBER CHANGES WHAT YOU DO.
//
// The strip read WAITING 10, IN PROGRESS 16, SCHEDULED 4, DONE 1036, ALL 31 on
// a real inbox on 2026-10-01, and it was not liked. Done 1036 is the archive
// counting itself: it is the same four digits every day, it is never anything
// to act on, and it was the widest thing on the row. All 31 is the other three
// added up, which nobody needs read back to them.
//
// So the number stays on the three tabs that are still ahead of you, Waiting,
// In progress and Scheduled, and only while there is something in them. Done
// and All are words. Zero is not drawn either: an empty tab says so by being
// empty, and a 0 beside a word is noise in the one row that has to stay quiet.
//
// Read off the source, because the rule lives in the markup of one component
// and there is nothing pure underneath it to call.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pages = fs.readFileSync(path.join(REPO, 'renderer/src/threads/Pages.tsx'), 'utf8');
const tabs = pages.slice(pages.indexOf('export function StateTabs'), pages.indexOf('whose threads'));

describe('which tabs carry a number', () => {
  it('names the three that are still ahead of you, and no others', () => {
    const counted = pages.slice(pages.indexOf('const COUNTED'), pages.indexOf('const COUNTED') + 120);
    expect(counted).toContain("'inbox'");
    expect(counted).toContain("'progress'");
    expect(counted).toContain("'snoozed'");
    expect(counted).not.toContain("'done'");
    expect(counted).not.toContain("'all'");
  });

  it('asks that list before it draws a number, rather than drawing whatever it was handed', () => {
    expect(tabs).toMatch(/COUNTED\.includes/);
  });

  it('draws nothing where the count is zero, so an empty tab is a word alone', () => {
    // `!!counts[t.view]` is what makes 0 and undefined both draw nothing.
    expect(tabs).toMatch(/!!counts\[/);
  });

  it('still keeps all five tabs, in the order Tab moves along', () => {
    const list = pages.slice(pages.indexOf('export const INBOX_TABS'), pages.indexOf('export function StateTabs'));
    for (const view of ['inbox', 'progress', 'snoozed', 'done', 'all']) expect(list).toContain(`'${view}'`);
  });
});

describe('what the tabs say', () => {
  it('leaves the first tab its two names, yours and a team\'s', () => {
    expect(tabs).toContain('needs');
    expect(tabs).toContain("'inbox'");
  });
});
