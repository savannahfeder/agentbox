// THE TEAM PAGE READS AS PEOPLE, THEN TASKS; IN PROGRESS HOLDS LATER AND DONE.
//
// The owner, 2026-11-02, on the layout with Needs you and In progress and a
// Team page in the sidebar: "i can't understand the new team page, the icon,
// etc. also where do tasks saved for later and things go?" The page opened on
// "4 things need you", a line about you, over the team's day, and its tasks
// had no heading; its icon was a calendar. On that layout Later and Done had no
// tab, so In progress now opens as your board: In progress, Later, Done.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the Team page', () => {
  it('wears the team\'s own mark in the sidebar, not a calendar', () => {
    const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
    const team = nav.slice(nav.indexOf('data-tab="team"'), nav.indexOf('<span>Team</span>'));
    expect(team).not.toMatch(/M4\.5 10h15/);
    expect(team).toMatch(/aria-hidden="true"/);
  });
});

describe('leaving the Team page', () => {
  // Pressing Inbox in the sidebar on the Team page left you on the Team page.
  it('is what the sidebar\'s Inbox does', () => {
    const app = read('renderer/src/App.tsx');
    const open = app.slice(app.indexOf('  const openView = (next: View) => {'));
    expect(open.slice(0, open.indexOf('\n'))).toMatch(/setTodayOn\(false\); setTasksOn\(false\);/);
  });
});

describe('In progress on that layout', () => {
  it('opens as the board, so Later and Done have a place', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/evChosen \?\? \(homeLayout === 'list' \? 'list' : 'board'\)/);
  });
});
