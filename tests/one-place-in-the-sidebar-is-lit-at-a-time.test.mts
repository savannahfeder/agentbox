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

describe('the app', () => {
  it('tells the sidebar a Team page is open, so Inbox does not light beside Team', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    // A second review: Standup and a person's page still lit Inbox, because the app told the sidebar only about rooms.
    // A chat opened from Needs you is in the inbox, not on the Team page (w-1d47bc5339).
    expect(app).toContain('onGroupsPage={roomOnTeam || directOpen || chatsPlaceShown || cardFromPlace}');
  });
});

describe('the sidebar', () => {
  it('lights only Team on the Team page', () => {
    expect(lit({ tasksPage: true })).toEqual(['Team']);
  });
  it('lights only Inbox on the Inbox', () => {
    expect(lit({})).toEqual(['Inbox']);
  });
});
