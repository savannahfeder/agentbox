// ONE PLACE IN THE SIDEBAR IS LIT AT A TIME (w-f702d60afe, 2026-11-21).
//
// A screen review of the Team page (Standup and a person's page) found Inbox
// and Team both drawn as the page you are on: the Inbox's rule left out the
// Team page.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
globalThis.React = React;

const lit = (o: Record<string, unknown>) => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceNavigation, { view: 'inbox', collapsed: false, onView() {}, onTasks() {}, onHome() {}, ...o } as never));
  return [...html.matchAll(/aria-label="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
};

describe('the sidebar', () => {
  it('lights only Team on the Team page', () => {
    expect(lit({ tasksPage: true })).toEqual(['Team']);
  });
  it('lights only Inbox on the Inbox', () => {
    expect(lit({})).toEqual(['Inbox']);
  });
});
