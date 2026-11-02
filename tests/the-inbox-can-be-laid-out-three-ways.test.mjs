// THE INBOX CAN BE LAID OUT THREE WAYS.
//
// The owner asked, six times over, whether Needs you, In progress, Today and
// Tasks was the right row of tabs, then for the two-tab layout (Needs you and
// Everything else) to be tried against the others. Two tabs had lost Today and
// Tasks, which lived only on the four-tab row. Now:
//   list   — Needs you, In progress, Today, Tasks (as it was)
//   tabs   — Needs you, Everything else; the Team card holds Today, Board, Tasks
//   states — Needs you, In progress, Done; Tasks is a page in the sidebar
// All three are picked under View and filters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readHomeLayout } from '../renderer/src/team/everything/place.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const store = (v) => ({ getItem: () => v, setItem: () => {} });

describe('the three layouts', () => {
  it('remembers each, and falls back to the one list', () => {
    expect(readHomeLayout(store('tabs'))).toBe('tabs');
    expect(readHomeLayout(store('states'))).toBe('states');
    expect(readHomeLayout(store('list'))).toBe('list');
    expect(readHomeLayout(store('nonsense'))).toBe('list');
  });

  it('are all offered under View and filters', () => {
    const pages = read('renderer/src/threads/Pages.tsx');
    for (const l of ['list', 'tabs', 'states']) expect(pages).toMatch(new RegExp(`home\\.onLayout\\('${l}'\\)`));
  });

  it('give two tabs the team views on the Team card', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const todayPage = \(\) =>/);
    expect(app).toMatch(/const tasksPage = \(\) =>/);
    expect(app).toMatch(/teamSpace === 'today' \? todayPage\(\) : teamSpace === 'tasks' \? tasksPage\(\)/);
  });

  it('give the state layout a Done tab and Tasks in the sidebar', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toMatch(/team\?\.done && <button/);
    expect(read('renderer/src/components/WorkspaceNavigation.tsx')).toMatch(/data-tab="tasks"/);
  });
});
