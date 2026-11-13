// THE WINDOW CORNER ANSWERS WHERE IT IS ASKED.
//
// The bar in the window's corner opens its own panel rather than a different
// screen. The sidebar's usage row is the exception, asked for on 2026-11-01:
// hovering shows the panel and a press opens that agent's Settings page
// (tests/the-usage-row-opens-its-agents-settings-page).
//
// None of this can be asserted by rendering, because the suite has no DOM for
// the top bar. So it is asserted against the source, which is what the rest of
// this repo does for wiring that has no pure function under it.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const pill = read('renderer/src/components/UsagePill.tsx');
const css = read('renderer/src/styles.css');

describe('the corner does not send her to Settings', () => {
  it('is handed the reading, the clock and the agent', () => {
    expect(app).toContain('usage={snap.usage ?? null}');
    expect(app).toContain('engineWord={engineWordFor({');
  });

  // Only the sidebar row takes its press to a page; the corner keeps pinning.
  it('goes to a page only from the sidebar', () => {
    expect(pill).toContain('if (!sidebar || !onOpen || !usage) { setPinned(!pinned); return; }');
  });

  // THE EXACT SHAPE THAT WAS THERE, refused by name. A guard against the
  // obvious re-addition rather than against every conceivable one.
  it('does not open Settings', () => {
    expect(app).not.toContain('onOpen={() => setSettingsOpen(true)}');
    expect(pill).not.toContain('setSettingsOpen');
  });
});

describe('the corner is a bar and not a number', () => {
  // HER SENTENCE, HELD LITERALLY: "a meter that drains is great without the
  // time limit". The corner had a percent and a countdown in it and now has
  // neither, so the two spans that drew them are gone rather than hidden.
  it('draws no text in the bar', () => {
    expect(pill).toContain('className="usage-meter"');
    expect(pill).not.toContain('usage-used');
    expect(pill).not.toContain('usage-sep');
    expect(pill).not.toContain('pillText');
  });

  // AND THE STYLES FOR THE OLD TEXT ARE GONE WITH IT. A rule with nothing left
  // to match is what the next person restores the markup to satisfy.
  it('leaves no stylesheet rule behind for the text it removed', () => {
    expect(css).not.toContain('.usage-used');
    expect(css).not.toContain('.usage-sep');
    expect(css).toContain('.usage-meter');
  });

  // THE PANEL IS ANCHORED TO THE CORNER, not floated in the window. The box has
  // to be the positioning context or the panel lands somewhere else entirely.
  it('hangs the panel off the corner it opened from', () => {
    expect(css).toMatch(/\.usage-box \{[^}]*position: relative/);
    expect(css).toMatch(/\.usage-panel \{[^}]*position: absolute/);
  });

  // BOTH GESTURES, because she asked for both by name. The hover is for the
  // glance and the press is for reading it without holding the mouse still, so
  // a press must survive the pointer leaving.
  it('opens on hover and on a press, and a press outlives the pointer', () => {
    expect(pill).toContain('onMouseEnter');
    expect(pill).toContain('onMouseLeave');
    expect(pill).toContain('const open = !folded && (pinned || hovering);');
  });

  // AND IT STILL SAYS EVERYTHING ALOUD. The bar has no words in it, so the
  // label is not a summary of the corner any more, it IS the corner for anybody
  // who cannot see it.
  it('keeps the whole sentence on the label', () => {
    expect(pill).toContain('aria-label={sentence}');
    expect(pill).toContain('usageSentence');
  });
});
