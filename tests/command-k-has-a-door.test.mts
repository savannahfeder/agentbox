// THE TOP BAR'S RIGHT END ON THE SIDEBAR LAYOUT, approved 2026-10-01
// (w-e731ca9376): Search, New thread and the Display button, in that order.
// The plus, the ⌘ mark and the cog are not drawn in the header at all;
// Settings lives at the foot of the sidebar and ⌘K opens the palette from
// anywhere.
//
// This file used to pin the corner and the tab row of the layout without the
// sidebar too. That layout had not been drawn since the sidebar was made
// permanent (workspaceNavigationShown returned true), and it was deleted with
// the open sidebar on 2026-10-26 (w-a1ed0e8b25).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const nav = read('renderer/src/components/WorkspaceNavigation.tsx');

const corner = app.slice(app.indexOf('<div className="topbar-right">'), app.indexOf('</header>'));

describe('the header on the sidebar layout', () => {
  const pages = read('renderer/src/threads/Pages.tsx');
  const right = pages.slice(pages.indexOf('<div className="th-right">'), pages.indexOf('</div>;', pages.indexOf('<div className="th-right">')));

  it('draws no plus, no ⌘ mark and no cog in the corner', () => {
    expect(corner).toContain('<HeaderActions');
    for (const label of ['New thread', 'Commands', 'Settings']) expect(corner).not.toContain(`aria-label="${label}"`);
    expect(corner).not.toContain('cmd-glyph');
    expect(right).not.toContain('cmd-glyph');
    expect(right).not.toContain('aria-label="Commands"');
  });

  // Search is drawn here only on the board since w-3c51d02de5 (2026-10-14);
  // on the list it is at the end of the tabs row. Where it is drawn, it is first.
  it('puts Search first, then New thread, then Display', () => {
    const search = right.indexOf('<SearchButton');
    const compose = right.indexOf('data-hint="new-task"');
    // The filters button's label carries whose threads are on the page since
    // 538593f, so it is an expression now, not the plain attribute this read.
    const display = right.indexOf("'View and filters'");
    expect(search).toBeGreaterThan(-1);
    expect(display).toBeGreaterThan(-1);
    expect(search).toBeLessThan(compose);
    expect(compose).toBeLessThan(display);
  });

  it('keeps Settings at the foot of the sidebar', () => {
    expect(nav).toMatch(/aria-label="Settings"[^>]*onClick=\{onSettings\}/);
  });

  it('still opens the palette on ⌘K', () => {
    expect(app).toMatch(/\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'[\s\S]{0,120}setModal\(\(m\) => \(m === 'palette' \? null : 'palette'\)\)/);
  });

  it('puts the tab key on the Inbox’s own tabs, not on the sidebar row', () => {
    expect(app).not.toContain('className="tab-hint');
    expect(nav).not.toMatch(/data-tab="inbox" data-hint/);
    expect(pages).toContain('data-hint="state-tab"');
  });
});
