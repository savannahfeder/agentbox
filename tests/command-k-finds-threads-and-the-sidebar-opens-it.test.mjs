// ⌘K HAD NO WAY IN FROM THE SCREEN, AND IT COULD NOT FIND A THREAD (w-33611c2122).
//
// The ⌘ button in the corner went with the old sidebar on 2026-10-26, so
// nothing on screen pointed at ⌘K. And typing a thread's words into it said
// "Nothing matches": measured in the built app over the fixtures, ⌘K with
// "pricing" typed showed that line while "Pricing page: annual toggle default
// on or off?" sat in the list behind it.
//
// Now the sidebar has a Search row under Threads that opens ⌘K, and ⌘K lists
// the best five threads a query finds under the commands, then "See all N
// threads", which opens the list's own search with the query typed.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { threadRows, THREADS_SHOWN } from '../renderer/src/components/Palette';
import { glyphFor } from '../renderer/src/palette-glyphs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const nav = (props = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: true, rail: true, onView: () => {}, onSearch: () => {}, onCompose: () => {},
  onSettings: () => {}, onFeedback: () => {}, ...props,
}));
const labels = (html) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

const found = (n) => Array.from({ length: n }, (_, i) => ({ id: `thread-p-${i}`, label: `Thread ${i}`, run: () => {} }));

describe('the sidebar opens ⌘K', () => {
  it('has a Search row right under Threads, with the keys on it', () => {
    const html = nav({ onPalette: () => {} });
    expect(labels(html)).toEqual(['Threads', 'Search', 'Feedback', 'Settings']);
    expect(html).toMatch(/aria-label="Search"[^>]*title="Search · ⌘K"/);
    expect(html).toContain('<kbd>⌘</kbd><kbd>K</kbd>');
  });

  it('draws no Search row where nothing opens ⌘K', () => {
    expect(labels(nav())).toEqual(['Threads', 'Feedback', 'Settings']);
  });

  it('is wired to ⌘K itself in the app', () => {
    expect(app).toContain("onPalette={() => setModal('palette')}");
  });
});

describe('⌘K finds threads', () => {
  it('lists the threads a query finds, and the full search past five', () => {
    let searched = null;
    const rows = threadRows('  build ', () => found(THREADS_SHOWN + 1), (q) => { searched = q; });
    expect(rows.map((r) => r.label)).toEqual(['Thread 0', 'Thread 1', 'Thread 2', 'Thread 3', 'Thread 4', 'See all 6 threads']);
    rows.at(-1).run();
    expect(searched).toBe('build');
  });

  it('has no See all row when every thread found is already shown', () => {
    expect(threadRows('build', () => found(THREADS_SHOWN), () => {}).map((r) => r.id)).not.toContain('all-threads');
    expect(threadRows('build', () => found(1), () => {})).toHaveLength(1);
  });

  it('lists no threads before anything is typed, or where nothing finds them', () => {
    expect(threadRows('', () => found(3), () => {})).toEqual([]);
    expect(threadRows('   ', () => found(3), () => {})).toEqual([]);
    expect(threadRows('build', undefined, () => {})).toEqual([]);
  });

  it('marks a thread and See all apart from the commands', () => {
    expect(glyphFor({ id: 'thread-p-1', label: 'Pricing page' })).toBe('›');
    expect(glyphFor({ id: 'all-threads', label: 'See all 6 threads' })).toBe('/');
  });

  it('is handed the list search and a way to open it with words typed', () => {
    expect(app).toContain('findThreads={findThreads}');
    expect(app).toContain('onSearchFor={searchFor}');
    expect(app).toMatch(/const findThreads = useCallback\(\(q: string\) => searchThreads\(items, q, searchContext\)/);
  });
});
