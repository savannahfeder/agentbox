// ONE NUMBER IN THE SIDEBAR, ON INBOX, IN THE TAB'S OWN TYPE.
//
// This file replaces in-progress-can-quietly-show-running-agents.test.mjs,
// which pinned a badge that has since been removed. w-5f02e7b525: only Inbox
// shows a number, like a classic email client, and of the four designs drawn
// the chosen one sets the number in exactly the label's type.
//
// Two things are checked and they are the two halves of that: WHERE the number
// is, and WHAT IT IS MADE OF. The second one is a stylesheet fact, so it is read
// out of the stylesheet rather than guessed at, because the whole point of that
// design is that the number has no look of its own.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, ...extra,
}));

it.each([1, 3, 120])('puts the number on Inbox for %s waiting tasks', inboxCount => {
  const html = draw({ inboxCount });
  expect(html.match(/class="workspace-running/g)).toHaveLength(1);
  expect(html).toContain(`${inboxCount} ${inboxCount === 1 ? 'task' : 'tasks'} waiting`);
  // It hangs off the Inbox tab and nothing else.
  const onInbox = html.slice(html.indexOf('data-tab="inbox"'), html.indexOf('data-tab="progress"'));
  expect(onInbox).toContain('class="workspace-running');
});

it('leaves In progress and Scheduled bare however much is running or scheduled', () => {
  const html = draw({ inboxCount: 0, scheduledCount: 9 });
  expect(html).toContain('data-tab="snoozed"');
  expect(html).not.toContain('class="workspace-running');
  expect(html).not.toContain('agents running');
  expect(html).not.toContain('tasks scheduled');
});

it.each([0, -1, NaN])('draws nothing for an empty or invalid count: %s', inboxCount => {
  expect(draw({ inboxCount })).not.toContain('class="workspace-running');
});

it('keeps a singular accessible description in the collapsed rail', () => {
  const html = draw({ inboxCount: 1, collapsed: true });
  expect(html).toContain('1 task waiting');
  expect(html).toContain('aria-label="Inbox"');
});

it('no longer calls the number a capsule, because it is not one', () => {
  const html = draw({ inboxCount: 4 });
  expect(html).toContain('has-count');
  expect(html).not.toContain('count-capsule');
});

it('draws the number in the tab\'s own colour, weight and size', () => {
  const css = fs.readFileSync(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'workspace-navigation.css'), 'utf8');
  const rule = css.split('\n').find(l => l.startsWith('.workspace-running {'));
  expect(rule).toBeTruthy();
  // Her pick: the number IS the label's type. Inheriting is the whole of it, so
  // a colour or a weight of its own creeping back in has to fail here.
  expect(rule).toContain('color: inherit');
  expect(rule).toContain('font-weight: inherit');
  expect(rule).toContain('font-size: 13px');
  expect(rule).not.toContain('--text-faint');
  // The figures must not jog the label sideways as work moves.
  expect(rule).toContain('tabular-nums');
  // And no capsule is painted behind it any more.
  expect(css).not.toContain('.count-capsule');
  expect(css.split('\n').find(l => l.startsWith('.has-count '))).not.toContain('background');
});
