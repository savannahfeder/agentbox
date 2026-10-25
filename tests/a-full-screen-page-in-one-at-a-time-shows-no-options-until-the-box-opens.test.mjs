// A FULL SCREEN PAGE OPENED FROM ONE AT A TIME SHOWS NO OPTIONS UNTIL THE BOX OPENS (w-580dce2102).
//
// "Full screen mode should no longer give the options, or at least make them
// collapsible (collapsed by default), otherwise it's not truly full screen."
// The screenshot was a page opened from a one-at-a-time thread: two options
// sat between the page and a folded "Reply…" line. Full screen already hides
// the options until the reply box opens (full-screen-is-the-page-and-a-reply-line),
// but the one-at-a-time foot drew them on `queue && stripShown` alone, and the
// dock's own full screen offer stood aside for the queue. Measured by reading
// the conditions both offers are drawn on in Focus.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const dock = focus.slice(focus.indexOf('<div className="focus-dock-inner">'));

describe('one at a time, under a full screen page', () => {
  it('draws no options at the foot', () => {
    // `page` since every thread with an agent got the one-at-a-time page (w-65bcefb857).
    expect(dock).toMatch(/\{page && stripShown && !fullScreenDoc && !closeAsk && \(\s*<div className=\{`one-choices[^`]*`\}>/);
  });
  it('brings them up with the reply box, like every other full screen page', () => {
    expect(focus).toContain('const offerInDock = stripShown && fullScreenDoc && replyOpen;');
    expect(dock).toContain('{offerInDock && (closeAsk ? null : (');
  });
});

describe('what must not change', () => {
  it('keeps the options at the foot of a one-at-a-time thread with no page full screen', () => {
    expect(dock).toMatch(/<div className=\{`one-choices[^`]*`\}>\s*<OptionsOffer[^/]{0,600}\bbare\s*\/>/);
  });
  it('keeps them out of the conversation in one at a time', () => {
    expect(focus).toContain('{offerInPane && (page || closeAsk ? null : (');
  });
});
