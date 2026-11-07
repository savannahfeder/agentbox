// THE PHONE LAYOUT, AS PICKED (2026-10-11). Pull request #34 laid the side
// rail along the bottom of a phone: the app's logo as a "Menu" nobody could
// name, a Threads tab for the page you are already on, Feedback, and Settings
// wearing the same sliders as "View and filters" one row above it. Three
// directions were drawn on the real app; the pick, in the founder's words: "tidy wins",
// "not a fan of that bar at the bottom entirely ... all that stuff is best
// placed at the top", "big fan of the new thread button", and the open thread
// as drawn in the chips direction.
//
// Measured by reading renderer/src/phone.css: before this change the side
// rail's rule pinned it to `bottom: 0`, and no rule floated the new-thread
// button or hid Feedback.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** The text inside `@media (max-width: 700px), (max-height: 520px) { … }`, and what is outside it. */
function split(text) {
  const at = text.indexOf('@media (max-width: 700px), (max-height: 520px)');
  const open = text.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  return { inside: text.slice(open + 1, end), outside: text.slice(0, at) + text.slice(end + 1) };
}
const { inside, outside } = split(css);

/** Every `selector { declarations }` inside the phone block. */
const rules = [...inside.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
/** The declarations of every rule whose selector list carries `piece`. */
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
const hidden = (piece) => /display:\s*none/.test(bodiesFor(piece));

describe('on a phone', () => {
  it('there is no bar along the bottom: the side rail sits in the top bar', () => {
    const nav = bodiesFor('.workspace-navigation');
    expect(nav).toMatch(/top:\s*env\(safe-area-inset-top/);
    expect(nav).not.toMatch(/(^|;|\s)bottom:\s*0(px)?\s*(;|$)/);
    expect(nav).not.toMatch(/border-top:/);
  });

  it('only Settings is left of the side rail: no logo, no Threads tab, no Feedback, no Instructions', () => {
    expect(hidden('.workspace-navigation .th-team')).toBe(true);
    expect(hidden('.workspace-navigation .workspace-tabs')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Feedback"]')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Instructions"]')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Settings"]')).toBe(false);
  });

  it('Settings wears a gear, not the sliders "View and filters" wears', () => {
    expect(hidden('.workspace-navigation button[aria-label="Settings"] svg')).toBe(true);
    const gear = bodiesFor('.workspace-navigation button[aria-label="Settings"]::before');
    expect(gear).toMatch(/mask:\s*url\("data:image\/svg\+xml/);
    expect(gear).toMatch(/circle/);
  });

  it('a new thread is one round button floating under the thumb, and not orange', () => {
    const fab = bodiesFor('.topbar .th-new');
    expect(fab).toMatch(/position:\s*fixed/);
    expect(fab).toMatch(/border-radius:\s*50%/);
    // Orange was "a bit much" (2026-10-11).
    expect(fab).toMatch(/background:\s*#/);
    expect(fab).not.toMatch(/background:\s*var\(--accent\)/);
    // The last row is not left under it.
    expect(bodiesFor('.list.th-table')).toMatch(/padding-bottom:\s*calc\([^;]*\d+px\)/);
  });

  it('inside a thread, Settings and the new-thread button step aside', () => {
    expect(rules.some((r) => r.selector.includes(':has(.workspace-task-header)') && r.selector.includes('.workspace-navigation') && /display:\s*none/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes(':has(.workspace-task-header)') && r.selector.includes('.th-new') && /display:\s*none/.test(r.body))).toBe(true);
  });

  it('an open thread is titled in the reading type, with no crumb trail', () => {
    expect(hidden('.thread-crumb-from')).toBe(true);
    expect(hidden('.thread-crumb-sep')).toBe(true);
    const crumb = bodiesFor('.thread-crumb');
    expect(crumb).toMatch(/text-transform:\s*none/);
    expect(crumb).not.toMatch(/font-family:[^;]*Mono/);
  });

  // A PAGE OPENED FROM A THREAD HAD NO WAY BACK ON A PHONE (2026-10-11). The
  // desktop takes the bar to nothing over a full-screen page and shows its
  // buttons only while the pointer reaches for the corner; a thumb never
  // hovers, so the design page filled the screen with nothing to press.
  it('a page opened from a thread keeps a bar with a way back and its name', () => {
    const focus = '.workspace-layout[data-artifact-layout="focus"]:not(.workspace-settings)';
    expect(bodiesFor(`${focus} > .topbar`)).toMatch(/height:\s*var\(--phone-top\)/);
    const marks = bodiesFor(`${focus} .workspace-artifact-header .doc-marks`);
    expect(marks).toMatch(/opacity:\s*1/);
    expect(marks).toMatch(/pointer-events:\s*auto/);
    expect(marks).toMatch(/position:\s*static/);
    expect(hidden(`${focus} .workspace-artifact-header .doc-crumb`)).toBe(false);
    expect(bodiesFor(`${focus} .workspace-artifact-header .doc-crumb`)).toMatch(/display:\s*block/);
    // "Open outside Agentbox" would open the file on the Mac, not the phone.
    expect(hidden(`${focus} .workspace-artifact-header .doc-mark`)).toBe(true);
  });

  it('the desktop window\'s chrome stays off a phone: no corner marks, no keyboard underline, no tick boxes', () => {
    // No corner marks: the background is replaced outright (since 2026-10-12
    // by none, so the wall shows), never left wearing --grid-ticks.
    expect(bodiesFor('.workspace-layout::before')).toMatch(/background:\s*(none|var\(--skin-pane)/);
    expect(bodiesFor('.workspace-layout::before')).not.toMatch(/grid-ticks/);
    expect(hidden('.row .mark')).toBe(true);
    expect(bodiesFor('.row.selected .subject')).toMatch(/text-decoration:\s*none/);
  });
});

// THEN THE SUPERHUMAN PASS (2026-10-11): "look at how superhuman mail
// approaches it ... diff inboxes accessible on bottom not top ... I find their
// little icons incomprehensible", and every screen shown, the new thread and
// its pickers included. Measured at 393 by 852 on the sample inbox: the
// composer was a desktop card with Send hanging off the right edge and a ⌘↵,
// each picker a narrow box pinned to its chip, and the permission card hung off
// the left edge.
describe('on a phone, the Superhuman way', () => {
  // They were along the bottom until 2026-10-28, "super duper low"; under the
  // title they "do a lot better" (the-web-app-on-a-phone-matches-the-phone-apps-text-and-tabs).
  it('the inboxes are words under the title, on the wall itself', () => {
    const bar = bodiesFor('.list-pane > .th-bar');
    expect(bar).toMatch(/position:\s*relative/);
    // See-through: the flat colour read as "black" over the wall (w-33511040d7).
    expect(bar).toMatch(/background:\s*transparent/);
    const tab = bodiesFor('.tm-tab');
    expect(tab).toMatch(/text-transform:\s*none/);
    expect(tab).toMatch(/font-family:\s*inherit/);
  });

  it('the new-thread button and the last row sit above the inboxes, not under them', () => {
    expect(bodiesFor('.topbar .th-new')).toMatch(/bottom:\s*calc\(var\(--phone-tabs/);
    expect(bodiesFor('.list.th-table')).toMatch(/var\(--phone-tabs/);
  });

  // Its top bar's shape, a cross and the name at the left, is the fourth
  // round's: tests/the-phone-filters-match-the-page-and-send-sits-clear-of-the-corner.
  it('a new thread is a whole page: a way out, its name, Send at the top, then a row each for To, Model, Project and Priority', () => {
    expect(bodiesFor('.tc-veil::before')).toMatch(/content:/);
    expect(bodiesFor('.tc-veil > .tc-card::before')).toMatch(/content:\s*'New thread'/);
    const card = bodiesFor('.tc-veil > .tc-card');
    expect(card).toMatch(/position:\s*fixed/);
    expect(card).toMatch(/left:\s*0/);
    expect(card).toMatch(/right:\s*0/);
    expect(card).toMatch(/background:\s*var\(--bg\)/);
    expect(bodiesFor('.tc-card > .tc-bar > .tc-anchor:nth-child(1)::before')).toMatch(/content:\s*'Project'/);
    expect(bodiesFor('.tc-card > .tc-bar > .tc-anchor:nth-child(2)::before')).toMatch(/content:\s*'Priority'/);
    expect(bodiesFor('.tc-card .tc-send')).toMatch(/position:\s*fixed/);
    expect(hidden('.tc-card .tc-send-main kbd')).toBe(true);
    expect(bodiesFor('.tc-card > .tc-bar > .tc-icon::after')).toMatch(/content:\s*'Attach/);
  });

  it('every picker is a full-width sheet from the bottom', () => {
    const body = bodiesFor('.tc-menu');
    expect(body).toMatch(/bottom:\s*0/);
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/right:\s*0/);
  });

  // THE SECOND ROUND OF NOTES (2026-10-11): "the filters should come from
  // the top not bottom", "send button should be square corners", Settings'
  // search "better to just have a search icon", and the title "looks ugly".
  // Its shape inside, words beside each section's name, is the third round's:
  // tests/the-phone-filters-match-the-page-and-send-sits-clear-of-the-corner.
  it('View and filters drops down from the top bar, its section names in plain type', () => {
    const body = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith('.th-pop'))).map((r) => r.body).pop();
    expect(body).toMatch(/top:\s*calc\([^;]*var\(--phone-top/);
    expect(body).toMatch(/bottom:\s*auto/);
    expect(bodiesFor('.th-pop .lab')).toMatch(/text-transform:\s*none/);
  });

  it('Send has square corners, in the look\'s own radius', () => {
    expect(bodiesFor('.tc-card .tc-send-main')).toMatch(/border-radius:\s*var\(--radius\) 0 0 var\(--radius\)/);
    expect(bodiesFor('.tc-card .tc-send-main')).not.toMatch(/18px/);
  });

  it('Settings\' search is an icon that opens into a field only while it has the focus', () => {
    expect(bodiesFor('.settings-screen .set-search')).toMatch(/width:\s*40px/);
    expect(bodiesFor('.settings-screen .set-search input')).toMatch(/opacity:\s*0/);
    expect(bodiesFor('.settings-screen .set-search:focus-within input')).toMatch(/opacity:\s*1/);
  });

  it('the bar title is smaller and a step heavier than the desktop\'s', () => {
    const title = bodiesFor('.workspace-layout > .topbar .workspace-title');
    // 19px, times the iPhone's text size since 2026-10-28, as the phone app draws it.
    expect(title).toMatch(/font-size:\s*calc\(19px \* var\(--phone-type, 1\)\)/);
    expect(title).toMatch(/font-weight:\s*500/);
  });

  it('a permission card spans the screen above the inboxes, without keys a phone lacks', () => {
    const card = bodiesFor('.approvals');
    expect(card).toMatch(/left:\s*8px/);
    expect(card).toMatch(/right:\s*8px/);
    expect(card).toMatch(/var\(--phone-tabs/);
    expect(hidden('.approvals .approval-hint')).toBe(true);
  });

  it('Settings leaves out what is about the Mac\'s own screen', () => {
    expect(hidden('.set-group[data-find="keys"]')).toBe(true);
    expect(hidden('.set-group[data-find="corner-tag"]')).toBe(true);
    // The phone's own Settings page is not among them.
    expect(hidden('.set-group[data-find="phone"]')).toBe(false);
  });
});

describe('on the desktop', () => {
  // Outside the phone-sized block is only what the phone link needs at any
  // width, as a computer's browser opening it does (a-picture-on-its-way-holds-
  // the-columns-width-not-a-dot): every selector there names the phone door,
  // which the desktop window never carries, or it is a phone animation.
  it('none of it applies: every rule is inside the phone-sized block or scoped to the phone door', () => {
    const rest = outside.replace(/@keyframes phone-[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...rest.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    for (const s of selectors) expect(s).toMatch(/^:root(:root)*\[data-door="phone"\]\s/);
    expect(rest.replace(/([^{}]+)\{[^{}]*\}/g, '').replace(/\s+/g, '')).toBe('');
  });

  it('and the guard still catches a rule that is neither', () => {
    const { outside: leaked } = split(css + '\n.focus-scroll { overflow: hidden; }');
    const rest = leaked.replace(/@keyframes phone-[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...rest.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    expect(selectors.some((s) => !/^:root(:root)*\[data-door="phone"\]\s/.test(s))).toBe(true);
  });
});
