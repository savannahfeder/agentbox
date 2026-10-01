// THE ONE PAGE IS CALLED THREADS (w-05ff3d1438, 2026-10-01).
//
// Once Inbox and Team became one page, "Inbox" undersold it: the moment a
// teammate's face is picked, the page lists the team's work, not what waits on
// you. Asked whether the name still fit, the answer was to call it "Threads",
// the word the app already uses for New thread and Search threads. The inbox
// meaning stays where it is true, on the first tab, "Needs you".
//
// What must change: the sidebar's word, its accessible name and hover title,
// the page heading, and the way back from a teammate's card. What must NOT:
// the tab's internal name (`data-tab="inbox"`, which the walk and the keys
// look for), its number, and the "Needs you" tab.
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { INBOX_TABS } from '../renderer/src/threads/Pages';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const noop = () => {};
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop, ...extra,
}));
const tab = (html) => {
  const start = html.lastIndexOf('<button', html.indexOf('data-tab="inbox"'));
  return html.slice(start, html.indexOf('</button>', start));
};

describe('the sidebar calls the page Threads', () => {
  it('in its word and its accessible name', () => {
    const t = tab(draw());
    expect(t).toContain('<span>Threads</span>');
    expect(t).toContain('aria-label="Threads"');
    expect(t).not.toContain('Inbox');
  });
  it('in the hover title, with the count and without it, collapsed', () => {
    expect(tab(draw({ inboxCount: 3 }))).toContain('title="Threads · 3 threads waiting"');
    expect(tab(draw({ collapsed: true }))).toContain('title="Threads"');
  });
  it('keeps its internal name and its number, which the keys and the walk read', () => {
    const t = tab(draw({ inboxCount: 2 }));
    expect(t).toContain('data-tab="inbox"');
    expect(t).toContain('class="workspace-running"');
  });
});

describe('the page says Threads too', () => {
  it('in its heading', () => {
    expect(app).toContain('<h1 className="workspace-title">Threads</h1>');
    expect(app).not.toContain('<h1 className="workspace-title">Inbox</h1>');
  });
  it('on the way back from a teammate’s card, and in the heading over it', () => {
    expect(app).toContain('<span aria-hidden="true">←</span>Threads</button>');
    expect(app).toContain("openCard ? 'Threads' : 'Team'");
  });
  it('and the first tab still says Needs you, where the inbox meaning is true', () => {
    expect(INBOX_TABS[0]).toMatchObject({ view: 'inbox', label: 'Needs you' });
  });
});
