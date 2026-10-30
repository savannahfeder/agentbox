// THE PHONE'S TOP BAR, 2026-10-29 (w-33511040d7), from a screenshot of the
// web app on an iPhone: "the little search icon is gone", and "the bar at the
// top is black ... before it was nice when it matched the rest of the
// background texture and color".
//
// Search was pinned to the top bar from inside the tabs row, which scrolls
// sideways. An iPhone clips what sits inside a scrolling row to that row, so
// the button kept its place in the bar and was never drawn. On the phone door
// it is now the top bar's own button. And the title bar and the tabs row were
// painted the wall's flat colour, which read as black over the dotted, glowing
// wall under them; both are see-through now.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

/** The declarations of every rule whose selector list carries exactly `selector`. */
const bodyOf = (selector) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => m[1].split(',').some((s) => s.trim() === selector))
  .map((m) => m[2]).join(';');

describe('the top bar of the web app on a phone', () => {
  it('lets the wall show through the title bar, not a flat colour', () => {
    const bar = bodyOf(':root:root:root .workspace-layout > .topbar');
    expect(bar).toMatch(/background:\s*transparent/);
    expect(bar).not.toMatch(/background:\s*var\(--bg\)/);
  });

  it('lets the wall show through the tabs row too, keeping its one line', () => {
    const tabs = bodyOf(':root:root:root .list-pane > .th-bar');
    expect(tabs).toMatch(/background:\s*transparent/);
    expect(tabs).toMatch(/box-shadow:\s*inset 0 -1px var\(--line\)/);
  });

  it('still paints the band behind the clock in the wall colour', () => {
    expect(bodyOf(':root:root:root .phone-edge-top')).toMatch(/background:\s*var\(--bg\)/);
  });

  it('draws search in the top bar on a phone, not inside the sideways-scrolling tabs row', () => {
    const tabs = app.slice(app.indexOf('<StateTabs'), app.indexOf('/>', app.indexOf('<StateTabs')));
    expect(tabs).not.toMatch(/onSearch=/);
    const at = app.indexOf('<HeaderActions\n              page="inbox"');
    expect(app.slice(at, app.indexOf('/>', at))).toMatch(/onSearch=\{searchInTheList\}/);
    // And only a phone has it at all.
    expect(app).toMatch(/const searchInTheList = onPhone\(\) \? /);
  });

  it('leaves the teammates\' faces off the tabs row on a phone; they are under Everything else', () => {
    // "you shouldn't put teammates in the top bar" (2026-10-29).
    expect(app).toMatch(/corner: evOn \|\| onPhone\(\) \? null : <CornerFaces/);
  });

  it('puts search after View and filters and before the gear, and hides it while searching', () => {
    expect(bodyOf(':root:root:root .topbar .th-right > .th-search')).toMatch(/order:\s*1/);
    expect(bodyOf(':root:root:root:has(.topbar input) .topbar .th-right > .th-search')).toMatch(/display:\s*none/);
  });
});
