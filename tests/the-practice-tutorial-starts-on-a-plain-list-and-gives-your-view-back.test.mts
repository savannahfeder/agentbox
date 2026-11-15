// THE PRACTICE TUTORIAL STARTS ON A PLAIN LIST AND GIVES YOUR VIEW BACK (w-fbe5e95dea, 2026-11-10).
//
// Fourth-round testers ran the practice tutorial from a board and from a
// project filter: in board view its Tab beat could not move between tabs (Tab
// walked the cards) and a thread it marked done stayed under Needs you, and
// with Backend filtered every example thread was hidden and Clear filters
// would not bring them back. The tutorial now starts on the list with no
// filters and puts the person's own view back when it ends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('the practice tutorial', () => {
  it('starts on the list with no project or priority filter', () => {
    expect(app).toMatch(/viewBeforePractice\.current = \{ display: inboxDisplay, ev: evView \};/);
    expect(app).toMatch(/setInboxDisplay\(\{ \.\.\.inboxDisplay, view: 'list', projects: \[\], priorities: \[\] \}\)/);
  });
  it('puts the view back when it ends', () => {
    expect(app).toMatch(/setInboxDisplay\(was\.display\)/);
  });
});

describe('the setup and a focused button', () => {
  // A tester tabbed to Back and pressed Enter, and the setup went forward.
  it('lets Enter on a focused button press that button', () => {
    expect(split).toMatch(/inSetup && enterIsTheButtons\(e\)\) return;/);
  });
});
