// Approved sidebar: every destination it is drawing is reachable in either
// width, and there is one real create action plus one collapse control.
//
// It said "including Scheduled when empty" until 2026-09-21, when she asked for
// Scheduled to appear only when something is scheduled. So the count of tabs is
// now read off what she has, three on a quiet workspace and four with something
// waiting, and the labels are checked against the row the component actually
// drew.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { DONE } from '../renderer/src/done-word';
const draw = (extra={}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {view:'inbox', collapsed:false, onToggle(){}, onView(){}, onSearch(){}, onCompose(){}, ...extra}));
it.each([false, true])('keeps accessible controls when collapsed=%s', collapsed => {
  const html = draw({view:'snoozed', collapsed, scheduledCount:2});
  // ONE WORD ON EVERY SURFACE (w-581dbc6cc4). The word has to match what the
// sidebar calls it, and "closed" was not the right one. Done was picked out of
// six pairs, and it comes from `done-word.ts` so the button, the row hint, the
// palette and this tab cannot drift apart again.
  for (const label of ['Inbox','Scheduled','In progress',DONE.noun,'Search tasks']) expect(html).toContain(`aria-label="${label}"`);
  expect(html.match(/data-tab=/g)).toHaveLength(4);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain(collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  expect(html).not.toContain('Active agents');
});
it.each([false, true])('drops Scheduled and keeps the rest when collapsed=%s', collapsed => {
  const html = draw({collapsed});
  for (const label of ['Inbox','In progress',DONE.noun,'Search tasks']) expect(html).toContain(`aria-label="${label}"`);
  expect(html).not.toContain('aria-label="Scheduled"');
  expect(html.match(/data-tab=/g)).toHaveLength(3);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain(collapsed ? 'Expand sidebar' : 'Collapse sidebar');
});
// SCHEDULED STILL APPEARS ONLY WHEN SOMETHING IS SCHEDULED, AND STILL SITS
// AFTER IN PROGRESS. That is the half of w-4e8396ed5b she asked for on
// 2026-09-21 and it is untouched. What went on 2026-09-22 is the NUMBER on it,
// and the one on In progress: the sidebar carries one number now and it is on
// Inbox (w-5f02e7b525). So `scheduledCount` still decides whether the tab is
// drawn and no longer draws anything itself.
it('draws Scheduled after In progress and gives it no number of its own', () => {
  const html = draw({scheduledCount:4, inboxCount:3});
  expect(html.indexOf('data-tab="snoozed"')).toBeGreaterThan(html.indexOf('data-tab="progress"'));
  expect(html.indexOf('data-tab="snoozed"')).toBeLessThan(html.indexOf('data-tab="done"'));
  expect(html.match(/class="workspace-running/g)).toHaveLength(1);
  expect(html).not.toContain('tasks scheduled');
  expect(html).toContain('3 tasks waiting');
});
// THE TOP IS INBOX AND IN PROGRESS, AND NOTHING ELSE (w-6c5534a58d). The top
// reads better with only those two. So Scheduled, when it exists, and Closed
// are drawn in the bottom group, in that order, above Settings.
it('keeps the top to Inbox and In progress and puts Scheduled then Closed below', () => {
  const html = draw({scheduledCount:2, onSettings(){}});
  const top = html.slice(html.indexOf('workspace-tabs'), html.indexOf('workspace-bottom'));
  const bottom = html.slice(html.indexOf('workspace-bottom'));
  expect(top).toContain('data-tab="inbox"');
  expect(top).toContain('data-tab="progress"');
  expect(top).not.toContain('data-tab="snoozed"');
  expect(top).not.toContain('data-tab="done"');
  expect(bottom.indexOf('data-tab="snoozed"')).toBeGreaterThan(-1);
  expect(bottom.indexOf('data-tab="snoozed"')).toBeLessThan(bottom.indexOf('data-tab="done"'));
  expect(bottom.indexOf('data-tab="done"')).toBeLessThan(bottom.indexOf('aria-label="Settings"'));
});
it('still draws the tab when she is standing on an empty Scheduled', () => {
  const html = draw({view:'snoozed', scheduledCount:0});
  expect(html).toContain('data-tab="snoozed"');
  expect(html).not.toContain('class="workspace-running');
});
