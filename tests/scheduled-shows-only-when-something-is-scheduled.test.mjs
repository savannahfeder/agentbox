// This file used to pin the opposite, under the name
// tab-includes-scheduled-even-when-it-is-empty. That rule came from 2026-09-14,
// when the sidebar drew Scheduled always and Tab skipped it when it was empty,
// which put a stop and a tab out of step. Her answer to the same mismatch is
// the other one: the tab goes when there is nothing in it, and the rotation
// goes with it. What survives untouched from that day is the half that is still
// true, that an empty Scheduled page never bounces her out of itself.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { workspaceDestinations, workspacePageTitle } from '../renderer/src/workspace-navigation.mjs';
import { DONE } from '../renderer/src/done-word';
const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const keys = (state) => workspaceDestinations(state).map(([key]) => key);
it('names every page and falls back safely', () => {
  // ONE WORD ON EVERY SURFACE (w-581dbc6cc4). The word has to match what the
// sidebar calls it, and "closed" was not the right one. Done was picked out of
// six pairs, and it comes from `done-word.ts` so the button, the row hint, the
// palette and this tab cannot drift apart again.
  for (const [view,title] of Object.entries({inbox:'Inbox',snoozed:'Scheduled',progress:'In progress',done:DONE.noun})) expect(workspacePageTitle(view, DONE.noun)).toBe(title);
  expect(workspacePageTitle('unknown')).toBe('Inbox');
});
it('drops Scheduled when nothing is scheduled', () => {
  expect(keys({scheduledCount: 0})).toEqual(['inbox', 'progress', 'done']);
  expect(keys()).toEqual(['inbox', 'progress', 'done']);
});
it('puts Scheduled after In progress when something is waiting', () => {
  for (const scheduledCount of [1, 2, 40]) expect(keys({scheduledCount})).toEqual(['inbox', 'progress', 'snoozed', 'done']);
});
it('keeps the tab under her while she is standing on it', () => {
  // Waking the last deferred task takes the count to zero. Taking the tab away
  // at that instant leaves her reading a page no row in the sidebar claims.
  expect(keys({scheduledCount: 0, view: 'snoozed'})).toEqual(['inbox', 'progress', 'snoozed', 'done']);
  expect(keys({scheduledCount: 0, view: 'inbox'})).toEqual(['inbox', 'progress', 'done']);
});
it('ignores a count that is not a real number', () => {
  for (const scheduledCount of [-1, NaN, 0.4]) expect(keys({scheduledCount})).toEqual(['inbox', 'progress', 'done']);
});
it('counts what the Scheduled page actually lists, deferred rows and repeats', () => {
  expect(app).toContain('const scheduledCount = snoozed.length + repeats.length;');
  expect(app).toContain('scheduledCount={scheduledCount}');
});
it('does not bounce out of an empty Scheduled page', () => {
  expect(app).not.toContain("if (view === 'snoozed' && snoozed.length === 0");
  // The page heading takes the round's word too (w-581dbc6cc4), so the title
  // over the list and the tab in the sidebar cannot say different things.
  expect(app).toContain('className="workspace-title">{workspacePageTitle(view, DONE.noun)}');
});
