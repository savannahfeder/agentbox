// THE THREAD BAR NAMES THE THREAD AND STARTS AS FAR IN AS IT ENDS (w-b01d58b7df).
//
// "When I scroll I forget what thread I'm in", and "the needs you text feels a
// bit too inward". Measured in the built renderer at 1710 by 1000, dark, on an
// opened thread: the bar said only "‹ NEEDS YOU", because the one-at-a-time
// page hid the name there (it heads the page, and scrolls away with it). The
// arrow's ink sat 44.5 in from the card's left edge while the last corner
// button ended 28 from the right, and the crumb's middle sat at y=72 against
// the buttons' 67.5, because an older rule's 18px top margin outranked the
// crumb's own `margin: 0`. They picked the always-on breadcrumb, "NEEDS YOU /
// THE NAME". After: ink 28.5 in, right gap 28, both middles 67.5.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const one = read('../renderer/src/one-thing-at-a-time.css');
const summary = read('../renderer/src/threads/summary.css');
const rooms = read('../renderer/src/team/rooms/rooms.css');
const nav = read('../renderer/src/workspace-navigation.css');

describe('the bar over a one-at-a-time thread', () => {
  it('names the thread after where it came from', () => {
    expect(one).not.toMatch(/thread-crumb-name[^{]*\{[^}]*display: none/);
    expect(one).not.toMatch(/thread-crumb-sep[^{]*\{[^}]*display: none/);
  });
});

describe('the arrow', () => {
  const plain = '.workspace-layout.gt-inset.workspace-task:not([data-artifact-layout="beside"]):not(:has(.focus-pane:is([data-summary="open"], [data-summary="over"]))) > .topbar { padding-left: 20px; }';
  it('sits 28 in, as far as the last corner button sits from the right, when nothing is under it', () => {
    expect(rooms).toContain(plain);
    // 20 of padding, 4 of the button's own, and the ink starts 4.5 into the 13px mark.
    expect(rooms).toContain('.workspace-layout.gt-inset.workspace-task > .topbar > .topbar-right { right: 28px; }');
  });
  it('keeps the 44 edge a file beside the thread or an open summary starts on', () => {
    expect(rooms).toContain('.workspace-layout.gt-inset.workspace-task > .topbar { padding-left: 36px; }');
    expect(rooms.indexOf(plain)).toBeGreaterThan(rooms.indexOf('.workspace-layout.gt-inset.workspace-task > .topbar { padding-left: 36px; }'));
  });
  it('does not move on a phone, which sets its own bar', () => {
    expect(plain).not.toContain(':root:root:root');
  });
});

describe('the crumb', () => {
  it('is centred on the corner buttons, not pushed down by the old band’s 18px', () => {
    expect(nav).toContain('.workspace-layout.workspace-task .workspace-task-header { align-self: flex-start; margin-top: 18px; }');
    // Four classes and the :has argument outrank the band's three.
    expect(summary).toContain('.workspace-layout.workspace-task .workspace-task-header:has(> .thread-crumb) { margin-top: 0; align-self: center; }');
  });
  it('leaves the phone its own right margin', () => {
    // phone.css sets `margin: 0 48px 0 0` at a lower weight; a shorthand here would wipe the 48.
    const body = summary.match(/\.workspace-layout\.workspace-task \.workspace-task-header:has\(> \.thread-crumb\) \{([^}]*)\}/)[1];
    expect(body).not.toMatch(/margin:|margin-right/);
  });
});
